"""Strict, dependency-free validation of native capture artifacts; never edits pixels."""
import hashlib
import json
import math
from pathlib import Path
import re
import struct
import zlib

SCREENS = {'home': 'SC-07', 'recipes': 'SC-23', 'recipe': 'SC-26',
           'scan': 'SC-20', 'training': 'SC-47', 'garden': 'SC-79'}
TESTS = dict(zip(SCREENS, ('test01Home', 'test02Recipes', 'test03Recipe',
                          'test04Scan', 'test05Training', 'test06Garden')))
MAX_FILE = 64 * 1024 * 1024


def png_dimensions(data):
    """Validate CRCs, deflate payload, dimensions and scanlines of an 8-bit RGB(A) capture.

    Screenshot formats outside this contract fail explicitly rather than passing on
    their signature alone. Bound every allocation, including decompressed payload.
    """
    if not data.startswith(b'\x89PNG\r\n\x1a\n') or len(data) > MAX_FILE:
        raise AssertionError('Invalid PNG signature or oversized framebuffer')
    offset, chunks, payload = 8, [], bytearray()
    width = height = channels = None
    while offset < len(data):
        if offset + 12 > len(data):
            raise AssertionError('Truncated PNG chunk')
        length, kind = struct.unpack('>I4s', data[offset:offset + 8])
        if length > MAX_FILE or offset + 12 + length > len(data):
            raise AssertionError('Truncated or oversized PNG payload')
        body = data[offset + 8:offset + 8 + length]
        expected = struct.unpack('>I', data[offset + 8 + length:offset + 12 + length])[0]
        if zlib.crc32(kind + body) & 0xffffffff != expected:
            raise AssertionError('PNG CRC mismatch')
        offset += 12 + length
        if kind == b'IHDR':
            if chunks or length != 13:
                raise AssertionError('Invalid PNG header order')
            width, height, depth, color, compression, filtering, interlace = struct.unpack('>IIBBBBB', body)
            if not (1 <= width <= 8192 and 1 <= height <= 8192):
                raise AssertionError('PNG dimensions outside capture contract')
            if depth != 8 or color not in (2, 6) or (compression, filtering, interlace) != (0, 0, 0):
                raise AssertionError('Unsupported screenshot PNG format; inspect the capture')
            channels = 3 if color == 2 else 4
        elif not chunks:
            raise AssertionError('PNG is missing IHDR')
        elif kind == b'IDAT':
            if b'IDAT' in chunks and chunks[-1] != b'IDAT':
                raise AssertionError('Non-contiguous PNG image payload')
            payload.extend(body)
        elif kind == b'IEND':
            if length or offset != len(data) or not payload:
                raise AssertionError('Invalid PNG end or missing image payload')
            chunks.append(kind)
            break
        chunks.append(kind)
    if not chunks or chunks[-1] != b'IEND':
        raise AssertionError('PNG did not finish')
    stride = width * channels + 1
    size = stride * height
    if size > 128 * 1024 * 1024:
        raise AssertionError('PNG decoded size exceeds capture budget')
    decoder = zlib.decompressobj()
    raw = decoder.decompress(payload, size + 1)
    if not decoder.eof or decoder.unused_data or decoder.unconsumed_tail or len(raw) != size:
        raise AssertionError('PNG compressed scanlines are corrupt or have unexpected length')
    if any(raw[y * stride] > 4 for y in range(height)):
        raise AssertionError('PNG scanline filter is invalid')
    return width, height


def attachment_records(value, test=None):
    if isinstance(value, dict):
        test = value.get('testIdentifier', test)
        if 'suggestedHumanReadableName' in value and 'exportedFileName' in value:
            yield {**value, '_test': test}
        for child in value.values():
            yield from attachment_records(child, test)
    elif isinstance(value, list):
        for child in value:
            yield from attachment_records(child, test)


def named_attachment(records, logical_name, extension, test):
    # xcresulttool may append its sample index and UUID, e.g. home-1_0_UUID.png.
    # Matching arbitrary prefixes or file order could select another scene/failure.
    uuid = r'[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}'
    pattern = re.compile(re.escape(logical_name) + r'(?:_\d+_' + uuid + r')?\.' + re.escape(extension))
    matches = [r for r in records if pattern.fullmatch(str(r['suggestedHumanReadableName']))]
    if len(matches) != 1:
        raise AssertionError(f'Expected one named attachment {logical_name}, found {len(matches)}')
    item = matches[0]
    if item['_test'] != f'CUKIVisualTests/{test}()' or item.get('isAssociatedWithFailure', False):
        raise AssertionError(f'Attachment {logical_name} belongs to the wrong or failed test')
    return item


def attachment_bytes(directory, record):
    name = record['exportedFileName']
    if not isinstance(name, str) or name in ('', '.', '..') or '/' in name or '\\' in name:
        raise AssertionError('Unsafe exported attachment filename')
    path = Path(directory) / name
    if path.is_symlink() or not path.is_file() or path.stat().st_size > MAX_FILE:
        raise AssertionError('Missing, linked or oversized attachment')
    return path.read_bytes()


def verify_capture(summary, attachments, out):
    if (summary.get('result') != 'Passed' or summary.get('failedTests') != 0
            or summary.get('skippedTests') != 0 or summary.get('passedTests') != 6):
        raise AssertionError('All six non-skipped native visual XCTest methods must pass')
    attachments, out = Path(attachments), Path(out)
    records = list(attachment_records(json.loads((attachments / 'manifest.json').read_text())))
    pending, captures, all_devices = [], [], set()
    for index, (scene, screen) in enumerate(SCREENS.items(), 1):
        prefix = f'{index:02d}-{scene}'
        proof_record = named_attachment(records, prefix + '-proof', 'json', TESTS[scene])
        proof_bytes = attachment_bytes(attachments, proof_record)
        proof = json.loads(proof_bytes)
        if (proof.get('scene') != scene or proof.get('screen') != screen
                or proof.get('fixtureSeed') != 1852006
                or any(proof.get(k) is not True for k in
                       ('identifiedNativeScreen', 'noApplicationAlert', 'noSystemAlert'))):
            raise AssertionError(f'Unidentified or obscured native scene: {scene}')
        dims = [proof.get('frame', {}).get(k) for k in ('width', 'height')]
        if any(type(d) not in (int, float) or not math.isfinite(d) or not 1 <= d <= 2048 for d in dims):
            raise AssertionError('Invalid logical viewport in native proof')
        tree_record = named_attachment(records, prefix + '-accessibility', 'txt', TESTS[scene])
        tree_bytes = attachment_bytes(attachments, tree_record)
        tree = tree_bytes.decode('utf-8')
        if f"identifier: 'visual-scene-{scene}'" not in tree or f"identifier: '{screen}'" not in tree:
            raise AssertionError(f'Native accessibility tree does not identify {scene}')
        scene_records, frames = [proof_record, tree_record], []
        for sample in (1, 2):
            name = f'{prefix}-{sample}'
            item = named_attachment(records, name, 'png', TESTS[scene])
            data = attachment_bytes(attachments, item)
            width, height = png_dimensions(data)
            scale = width / dims[0]
            if scale not in (1, 2, 3, 4) or abs(height / dims[1] - scale) > .001:
                raise AssertionError('Framebuffer does not match the asserted viewport')
            frames.append({'path': name + '.png', 'sha256': hashlib.sha256(data).hexdigest(),
                           'width': width, 'height': height, 'scale': scale})
            pending.append((name + '.png', data)); scene_records.append(item)
        devices = {r.get('deviceId') for r in scene_records}
        if len(devices) != 1 or not next(iter(devices)):
            raise AssertionError('Attachments do not identify one native device')
        all_devices.update(devices)
        pending.extend([(prefix + '-proof.json', proof_bytes), (prefix + '.txt', tree_bytes)])
        captures.append({'scene': scene, 'screen': screen, 'framebuffers': frames,
                         'nativeSceneAsserted': True, 'unobscuredByAlerts': True,
                         'proofSha256': hashlib.sha256(proof_bytes).hexdigest(),
                         'inspection': 'not a pixel-fidelity verdict'})
    if len(all_devices) != 1 or len({c['framebuffers'][0]['sha256'] for c in captures}) != 6:
        raise AssertionError('Scenes mix devices or produced identical framebuffers')
    # Publish validated copies only once the whole capture set has passed.
    out.mkdir(parents=True, exist_ok=True)
    for name, data in pending:
        (out / name).write_bytes(data)
    return captures
