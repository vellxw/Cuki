#!/usr/bin/env python3
"""Run real XCTest visual navigation and preserve unedited native attachments.
A PID, six arbitrary PNGs, or a passing build are not a passing visual capture.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'artifacts/native/visual-ios'
SCENES = ('home', 'recipes', 'recipe', 'scan', 'training', 'garden')
OUT.mkdir(parents=True, exist_ok=True)
report = {'sourceCommit': os.environ.get('GITHUB_SHA'), 'package': 'com.cuki.app.visual',
          'fixtureSeed': 1852006, 'fixtureNow': '2026-09-14T12:00:00.000Z',
          'scope': 'identified native screen captures via XCTest; NOT pixel-fidelity approval',
          'captures': [], 'passed': False}


def run(*args, timeout=120):
    return subprocess.check_output(args, text=True, timeout=timeout)


def attachment_records(value):
    """Tolerate Xcode manifest nesting without inferring screenshots by their order."""
    if isinstance(value, dict):
        if 'suggestedHumanReadableName' in value and 'exportedFileName' in value:
            yield value
        for item in value.values():
            yield from attachment_records(item)
    elif isinstance(value, list):
        for item in value:
            yield from attachment_records(item)


def verify_capture(summary, attachments, out=OUT):
    if (summary.get('result') != 'Passed' or summary.get('failedTests', 0) != 0
            or summary.get('skippedTests', 0) != 0 or summary.get('passedTests') != 6):
        raise AssertionError('All six non-skipped native visual XCTest methods must pass')
    manifest = json.loads((attachments / 'manifest.json').read_text())
    records = list(attachment_records(manifest))
    captures = []
    for index, scene in enumerate(SCENES, 1):
        prefix = f'{index:02d}-{scene}'
        files = []
        for sample in (1, 2):
            name = f'{prefix}-{sample}'
            matches = [r for r in records if str(r['suggestedHumanReadableName']).split('.')[0] == name]
            if len(matches) != 1:
                raise AssertionError(f'Expected one named framebuffer {name}, found {len(matches)}')
            src = attachments / matches[0]['exportedFileName']
            data = src.read_bytes()
            if not data.startswith(b'\x89PNG\r\n\x1a\n'):
                raise AssertionError(f'{name} is not a PNG framebuffer')
            dest = out / f'{name}.png'
            dest.write_bytes(data)  # Exact exported bytes, never altered pixels.
            files.append({'path': dest.name, 'sha256': hashlib.sha256(data).hexdigest()})
        captures.append({'scene': scene, 'framebuffers': files,
                         'nativeSceneAsserted': True, 'unobscuredByAlerts': True,
                         'inspection': 'pending comparison with the private canon'})
    # Repeated screenshots of an unchanged launch dialog must not be six scenes.
    if len({c['framebuffers'][0]['sha256'] for c in captures}) != 6:
        raise AssertionError('Distinct scenes produced identical framebuffers')
    return captures


def main():
    result = OUT / 'VisualCapture.xcresult'
    try:
        devices = json.loads(run('xcrun', 'simctl', 'list', 'devices', 'available', '-j'))
        phones = [d for group in devices['devices'].values() for d in group
                  if d.get('isAvailable') and 'iPhone' in d['name']]
        # Prefer the same 390x844 logical size as the Android visual contract.
        device = next((d for d in phones if d['name'] == 'iPhone 13'), phones[0])
        udid = device['udid']; report['device'] = device
        if device['state'] != 'Booted':
            run('xcrun', 'simctl', 'boot', udid)
        run('xcrun', 'simctl', 'bootstatus', udid, '-b', timeout=300)
        run('xcrun', 'simctl', 'ui', udid, 'appearance', 'dark')
        run('xcrun', 'simctl', 'status_bar', udid, 'override', '--time', '9:41',
            '--batteryState', 'charged', '--batteryLevel', '100')
        args = ['xcodebuild', '-workspace', 'CUKIVisual.xcworkspace', '-scheme', 'CUKIVisualCapture',
                '-configuration', 'Release', '-destination', f'platform=iOS Simulator,id={udid}',
                '-derivedDataPath', 'build', '-resultBundlePath', str(result),
                'ARCHS=arm64', 'CODE_SIGNING_ALLOWED=YES', 'CODE_SIGN_IDENTITY=-',
                'test-without-building']
        with (OUT / 'test.log').open('w') as log:
            completed = subprocess.run(args, cwd=ROOT / 'apps/mobile/ios', stdout=log,
                                       stderr=subprocess.STDOUT, timeout=1200)
        report['xcodebuildExitCode'] = completed.returncode
        if result.exists():
            summary_text = run('xcrun', 'xcresulttool', 'get', 'test-results', 'summary',
                               '--path', str(result), '--format', 'json')
            (OUT / 'test-summary.json').write_text(summary_text)
            run('xcrun', 'xcresulttool', 'export', 'attachments', '--path', str(result),
                '--output-path', str(OUT / 'attachments'), timeout=300)
        if completed.returncode != 0:
            raise AssertionError(f'Native XCTest failed, exit {completed.returncode}; see test.log/xcresult')
        report['captures'] = verify_capture(json.loads((OUT / 'test-summary.json').read_text()),
                                             OUT / 'attachments')
        report['passed'] = True
    except Exception as error:
        report['error'] = str(error)
    finally:
        (OUT / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
    if not report['passed']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
