"""Restore explicitly versioned image parts after checking each checksum.
No archive extraction, external downloads or execution of input data.
"""
import hashlib
import json
from pathlib import Path
import sys

root = Path.cwd().resolve()
manifest_path = Path(sys.argv[1]).resolve()
assert manifest_path.is_relative_to(root / '.delivery/assets')
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
assert manifest['format'] == 'cuki-owned-assets-v1'
changes = []
for item in manifest['files']:
    target = root / item['path']
    assert target.resolve().is_relative_to(root / 'apps/mobile/assets')
    assert not target.is_symlink() and target.suffix.lower() in ('.webp', '.png', '.jpg')
    chunks = []
    for part in item['parts']:
        source = root / '.delivery/assets' / part['name']
        assert source.resolve().is_relative_to(root / '.delivery/assets') and not source.is_symlink()
        data = source.read_bytes()
        assert hashlib.sha256(data).hexdigest() == part['sha256'], source.name
        chunks.append(data)
    data = b''.join(chunks)
    assert len(data) == item['bytes']
    assert hashlib.sha256(data).hexdigest() == item['sha256'], item['path']
    changes.append((target, data))
for target, data in changes:
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
for item in manifest['files']:
    for part in item['parts']:
        (root / '.delivery/assets' / part['name']).unlink()
manifest_path.unlink()
print(f'{len(changes)} original image assets restored byte-for-byte. No build or visual pass is implied.')
