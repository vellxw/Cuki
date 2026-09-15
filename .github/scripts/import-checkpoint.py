"""Materialize source checkpoints transported through a text-only connector.
A SHA-256 match is mandatory, including after a possible single-character transport correction.
This utility is not a build/test certification and is never shipped in the mobile app.
"""
import base64
import binascii
import gzip
import hashlib
import io
import json
import pathlib
import subprocess
import tarfile


def decode_checked(text, expected):
    def match(s):
        try:
            raw = base64.b64decode(s, validate=True)
            return raw if hashlib.sha256(raw).hexdigest() == expected else None
        except (ValueError, binascii.Error):
            return None
    exact = match(text)
    if exact is not None:
        return exact, False
    # Connector transcription can duplicate one character. Never relax the hash.
    if len(text) > 30000:
        raise ValueError('Transport checksum mismatch; resend the payload')
    if len(text) % 4 == 1:
        for i in range(len(text)):
            raw = match(text[:i] + text[i+1:])
            if raw is not None:
                return raw, True
    raise ValueError('Transport checksum mismatch; source was NOT imported')


root = pathlib.Path('.').resolve()
receipts = root / 'artifacts/import-receipts'
receipts.mkdir(parents=True, exist_ok=True)
for file in sorted((root / '.github/imports').glob('*.json')):
    receipt = receipts / (file.stem + '.json')
    if receipt.exists():
        continue
    payload = json.loads(file.read_text())
    raw, corrected = decode_checked(payload['gzip_base64'], payload['sha256'])
    assert len(raw) < 20000000
    data = gzip.decompress(raw)
    assert len(data) < 100000000
    hashes = {}
    with tarfile.open(fileobj=io.BytesIO(data), mode='r:') as archive:
        entries = archive.getmembers()
        for entry in entries:
            path = pathlib.PurePosixPath(entry.name)
            assert entry.isfile() and not path.is_absolute() and '..' not in path.parts
            assert path.parts[0] not in ('.git', '.github', 'node_modules')
            assert not any(part in ('node_modules', '.env', 'private') for part in path.parts)
            assert not (path.name.startswith('.env') and path.name != '.env.example')
            assert not entry.name.endswith(('.pem', '.key', '.keystore', '.p12'))
            assert entry.size < 20000000 and (root / entry.name).resolve().is_relative_to(root)
        for entry in entries:
            destination = root / entry.name
            destination.parent.mkdir(parents=True, exist_ok=True)
            content = archive.extractfile(entry).read()
            destination.write_bytes(content)
            hashes[entry.name] = hashlib.sha256(content).hexdigest()
            subprocess.run(['git', 'add', '-f', '--', entry.name], check=True)
    receipt.write_text(json.dumps({'payload_sha256': payload['sha256'], 'transport_corrected': corrected,
                                  'files': hashes, 'status': 'source preserved; not a build certification'}, indent=2))
    subprocess.run(['git', 'add', '--', str(receipt.relative_to(root))], check=True)
