"""Apply an authorized source patch only when both input and output SHA-256 match.

This is a source transport helper, not an app test or a native build.
"""
import hashlib
import json
from pathlib import Path, PurePosixPath
import sys

root = Path.cwd().resolve()
patch_path = Path(sys.argv[1]).resolve()
assert patch_path.is_relative_to(root)
value = json.loads(patch_path.read_text(encoding='utf-8'))
assert value['format'] == 'cuki-text-edits-v1'
changes = []
seen = set()
for entry in value['files']:
    name = PurePosixPath(entry['path'])
    assert not name.is_absolute() and '..' not in name.parts
    assert name.parts[0] in ('packages', 'apps', 'scripts', 'tests', 'docs', 'package.json', 'README.md', 'PROJECT_STATE.md')
    assert str(name) not in seen
    seen.add(str(name))
    target = (root / str(name)).resolve()
    assert target.is_relative_to(root) and not target.is_symlink()
    raw = target.read_bytes() if target.is_file() else b''
    if hashlib.sha256(raw).hexdigest() == entry['newSha256']:
        continue
    if entry['oldSha256'] is None:
        assert not target.exists(), f'New path already exists: {name}'
    else:
        assert target.is_file(), f'Existing source missing: {name}'
    assert entry['oldSha256'] is None or hashlib.sha256(raw).hexdigest() == entry['oldSha256'], f'Input changed: {name}'
    text = raw.decode('utf-8')
    end = len(text)
    for start, stop, replacement in reversed(entry['edits']):
        assert isinstance(start, int) and isinstance(stop, int) and 0 <= start <= stop <= end
        assert isinstance(replacement, str)
        text = text[:start] + replacement + text[stop:]
        end = start
    result = text.encode('utf-8')
    assert hashlib.sha256(result).hexdigest() == entry['newSha256'], f'Output mismatch: {name}'
    changes.append((target, result))
# No source mutation until every result has been validated.
for target, result in changes:
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(result)
patch_path.unlink()
print(f'{len(changes)} source files updated with exact input/output checksums. App verification is separate.')
