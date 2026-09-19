#!/usr/bin/env python3
"""Compare native startup routes in the same immutable test APK.

This diagnostic uses real screens, not injected app data. It never clears or
accesses the ordinary com.cuki.app package. A passing diagnostic is not E2E or
pixel-fidelity approval. Screenshots and transport failures are both retained.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import time
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'artifacts/native/render-isolation'
PACKAGE = 'com.cuki.app.test'
ROUTES = [('no-gl-goals', 'cuki://screen/SC-04', 'SC-04'),
          ('botanical-welcome', 'cuki://screen/SC-01', 'SC-01')]


def identified(xml, screen):
    root = ET.fromstring(xml)
    nodes = list(root.iter('node'))
    return (any(n.get('package') == PACKAGE for n in nodes)
            and any(n.get('resource-id') in (screen, PACKAGE + ':id/' + screen)
                    for n in nodes))


def adb(*args, timeout=45, binary=False):
    return subprocess.check_output(['adb', *args], timeout=timeout, text=not binary)


def write_report(report):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'report.json').write_text(json.dumps(report, indent=2) + '\n')


def observe(name, report):
    try:
        from capture_evidence import png_dimensions
        data = adb('exec-out', 'screencap', '-p', binary=True, timeout=15)
        dimensions = png_dimensions(data)
        (OUT / name).write_bytes(data)
        record = {'file': name, 'sha256': hashlib.sha256(data).hexdigest(),
                  'pixels': dimensions, 'kind': 'unmodified native framebuffer'}
    except Exception as error:
        record = {'file': name, 'error': str(error), 'kind': 'failed observation'}
    report.setdefault('observations', []).append(record)
    write_report(report)
    return record


def main():
    report = {'binarySource': os.environ.get('CUKI_BINARY_SOURCE_SHA'),
              'harnessSource': os.environ.get('GITHUB_SHA'), 'package': PACKAGE,
              'scope': 'native route/renderer isolation, not full app acceptance',
              'stages': [], 'passed': False}
    write_report(report)
    stream = (OUT / 'live-logcat.txt').open('wb')
    log = None
    try:
        apk = ROOT / 'apps/mobile/android/app/build/outputs/apk/release/app-release.apk'
        report['apkSha256'] = hashlib.sha256(apk.read_bytes()).hexdigest()
        log = subprocess.Popen(['adb', 'logcat', '-v', 'threadtime'],
                               stdout=stream, stderr=subprocess.STDOUT)
        start = time.monotonic()
        adb('install', '-r', str(apk), timeout=180)
        report['installationSeconds'] = round(time.monotonic() - start, 3)
        if PACKAGE not in adb('shell', 'pm', 'list', 'packages', PACKAGE):
            raise AssertionError('Expected isolated test package was not installed')
        adb('shell', 'pm', 'clear', PACKAGE)
        spec = importlib.util.spec_from_file_location('fresh_hierarchy',
            ROOT / 'scripts/native/android-hierarchy.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        reader = module.NativeHierarchyReader(OUT)
        for name, uri, screen in ROUTES:
            item = {'name': name, 'uri': uri, 'screen': screen,
                    'startedAt': time.time(), 'identified': False}
            report['stages'].append(item)
            write_report(report)
            adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW',
                '-d', uri, PACKAGE)
            time.sleep(8)
            observe(name + '-before-hierarchy.png', report)
            end = time.monotonic() + 45
            while time.monotonic() < end:
                xml = reader.read()
                (OUT / (name + '.xml')).write_text(xml)
                if identified(xml, screen):
                    item['identified'] = True
                    break
                time.sleep(1)
            if not item['identified']:
                raise AssertionError('Native route not identified: ' + name)
            frame = observe(name + '.png', report)
            if 'error' in frame:
                raise AssertionError('Identified route has no valid framebuffer: ' + name)
            item['finishedAt'] = time.time()
            write_report(report)
        report['passed'] = True
    except Exception as error:
        report['error'] = str(error)
        observe('failure.png', report)
    finally:
        if log is not None and log.poll() is None:
            log.terminate()
            try:
                log.wait(timeout=5)
            except subprocess.TimeoutExpired:
                log.kill(); log.wait()
        stream.close()
        write_report(report)
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
