"""Restore an explicitly requested UTF-8 checkpoint after validating every byte.
No downloads, code execution from payload, guessed bytes or silent overwrites.
"""
import base64, hashlib, json, pathlib, re, shutil, zlib
root = pathlib.Path.cwd().resolve()
folder = root / '.delivery/restore'
manifest = json.loads((folder / 'manifest.json').read_text())
assert manifest['format'] == 'zlib-json-utf8-base64'
assert 0 < len(manifest['parts']) < 100
parts = []
for item in manifest['parts']:
    assert re.fullmatch(r'\d{3}[ab]?\.b64', item['path'])
    data = (folder / item['path']).read_bytes()
    assert hashlib.sha256(data).hexdigest() == item['sha256'], f'Part mismatch: {item["path"]}'
    parts.append(data)
encoded = b''.join(parts)
assert len(encoded) < 2_000_000
compressed = base64.b64decode(encoded, validate=True)
decoder = zlib.decompressobj()
raw = decoder.decompress(compressed, 4_000_001)
assert len(raw) <= 4_000_000 and decoder.eof and not decoder.unused_data
assert hashlib.sha256(raw).hexdigest() == manifest['sha256'], 'Decoded source mismatch'
files = json.loads(raw)
assert len(files) == manifest['files']
assert set(files) == set(manifest['before']), 'Every destination needs a precondition'
receipt = {'source_sha256': manifest['sha256'], 'files': {}}
changes = []
for name, text in files.items():
    path = pathlib.PurePosixPath(name)
    assert isinstance(text, str) and not path.is_absolute() and '..' not in path.parts
    assert path.parts[0] not in ('.git', '.github', '.delivery', 'node_modules', 'private', 'private-references')
    assert not any(part in ('.git', 'node_modules', '.expo') for part in path.parts)
    assert not (path.name.startswith('.env') and path.name != '.env.example')
    assert path.suffix not in ('.pem', '.p12', '.jks', '.keystore', '.db', '.mobileprovision')
    dest = root / path
    assert dest.resolve().is_relative_to(root) and not dest.is_symlink()
    original = hashlib.sha256(dest.read_bytes()).hexdigest() if dest.exists() else None
    data = text.encode('utf-8')
    expected = hashlib.sha256(data).hexdigest()
    assert original in (manifest['before'][name], expected), f'Concurrent edit: {name}'
    changes.append((dest, data))
    receipt['files'][name] = expected
# Check everything before making any change. Concurrent edits cause an explicit failure.
for dest, data in changes:
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
(root / 'artifacts').mkdir(exist_ok=True)
(root / 'artifacts/source-restoration.json').write_text(json.dumps(receipt, indent=2) + '\n')
shutil.rmtree(folder)
print(f'Restored {len(files)} exact source files. App and native verification are separate.')
