#!/usr/bin/env python3
"""Re-test the exact built APK when only QA/docs changed. Never relabel an old binary.
All runtime-producing files must be byte-identical to the source commit being tested.
"""
import hashlib, json, os, pathlib, re, shutil, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parents[2]


def allowed_change(path):
    return (path.startswith(('scripts/native/', 'tests/', 'docs/', '.delivery/', 'ci/', '.github/workflows/'))
            or path in ('PROJECT_STATE.md', 'README.md'))


def validate_spec(spec):
    if not isinstance(spec.get('runId'), int) or isinstance(spec['runId'], bool) or spec['runId'] <= 0:
        raise ValueError('A positive source workflow run ID is required')
    if not re.fullmatch(r'[0-9a-f]{40}', spec.get('sourceCommit', '')):
        raise ValueError('An exact source SHA is required')
    if not re.fullmatch(r'[0-9a-f]{64}', spec.get('apkSha256', '')):
        raise ValueError('The previously observed APK SHA-256 is required')
    return spec


def prepare():
    spec = validate_spec(json.loads((ROOT / 'ci/android-retest.json').read_text()))
    source = spec['sourceCommit']
    subprocess.run(['git', 'merge-base', '--is-ancestor', source, 'HEAD'], cwd=ROOT, check=True)
    changed = subprocess.check_output(['git', 'diff', '--name-only', source, 'HEAD'], cwd=ROOT, text=True).splitlines()
    forbidden = [p for p in changed if not allowed_change(p)]
    if forbidden:
        raise ValueError('Runtime/config changed: compile a NEW APK instead of reusing it: ' + ', '.join(forbidden))
    run = json.loads(subprocess.check_output(['gh', 'api', f"repos/vellxw/Cuki/actions/runs/{spec['runId']}"], text=True))
    if run['head_sha'] != source or run['head_branch'] != 'implementation/cuki-verified':
        raise ValueError('Source run does not match the requested source')
    jobs = json.loads(subprocess.check_output(['gh', 'api', f"repos/vellxw/Cuki/actions/runs/{spec['runId']}/jobs"], text=True))
    android = [job for job in jobs['jobs'] if job['name'] == 'android' and job['status'] == 'completed']
    if len(android) != 1 or not any(step['name'] == 'Compile standalone test APK for emulator and arm64 phones'
                                  and step['conclusion'] == 'success' for step in android[0]['steps']):
        raise ValueError('Require a completed Android job with a successful binary compilation')
    # A previous UI assertion may have failed. Re-testing preserves that history;
    # successful compilation is not called a successful native flow.
    artifact = 'cuki-android-binary-' + source
    with open(os.environ['GITHUB_OUTPUT'], 'a') as out:
        out.write(f"run={spec['runId']}\nsource={source}\nartifact={artifact}\n")
    print('Runtime source identical; QA harness is tracked separately. Allowed changed paths:', changed)


def install_artifact():
    spec = validate_spec(json.loads((ROOT / 'ci/android-retest.json').read_text()))
    archive_root = ROOT / 'artifacts/retest-input'
    apks = list(archive_root.rglob('*.apk'))
    if len(apks) != 1:
        raise ValueError('Expected exactly one original APK')
    data = apks[0].read_bytes()
    actual = hashlib.sha256(data).hexdigest()
    if actual != spec['apkSha256']:
        raise ValueError('Original APK checksum does not match observed source artifact')
    dest = ROOT / 'apps/mobile/android/app/build/outputs/apk/release/app-release.apk'
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(apks[0], dest)
    provenance = {**spec, 'harnessCommit': os.environ['GITHUB_SHA'], 'binaryRebuilt': False,
                  'runtimeSourceCheckedIdentical': True, 'apkSha256': actual}
    evidence = ROOT / 'artifacts/native/android'
    evidence.mkdir(parents=True, exist_ok=True)
    (evidence / 'binary-provenance.json').write_text(json.dumps(provenance, indent=2) + '\n')


if __name__ == '__main__':
    {'prepare': prepare, 'install': install_artifact}[sys.argv[1]]()
