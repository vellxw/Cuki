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


# The helper also permits verifying preserved native attachments on Linux.
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from capture_evidence import verify_capture as _verify_capture

def verify_capture(summary, attachments, out=OUT):
    return _verify_capture(summary, attachments, out)


def main():
    result = OUT / 'VisualCapture.xcresult'
    try:
        from ios_simulator import prepare
        device = prepare(OUT)
        udid = device['udid']; report['device'] = device
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
