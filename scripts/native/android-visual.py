#!/usr/bin/env python3
"""Actual isolated native visual captures. Abort on offline transport or corrupt frames.

Force-stopping between scenes is fixture setup, not a persistence/E2E test. No
account data is cleared, and an app crash is never dismissed as an emulator issue.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import time
import xml.etree.ElementTree as ET
from capture_evidence import png_dimensions, SCREENS

PACKAGE = 'com.cuki.app.visual'
OUT = Path('artifacts/native/visual-android')


def adb(*args, binary=False, timeout=45):
    return subprocess.check_output(['adb', *args], timeout=timeout, text=not binary)


def has(root, identifier):
    return any(n.get('resource-id', '') == identifier or
               n.get('resource-id', '').endswith('/' + identifier) for n in root.iter('node'))


def identified_scene(xml, scene, screen):
    root = ET.fromstring(xml)
    return has(root, 'visual-scene-' + scene) and has(root, screen)


def frame(path):
    data = adb('exec-out', 'screencap', '-p', binary=True)
    width, height = png_dimensions(data)
    if (width, height) != (1170, 2532):
        raise AssertionError(f'Unexpected native viewport: {width}x{height}')
    path.write_bytes(data)
    return {'path': path.name, 'sha256': hashlib.sha256(data).hexdigest(),
            'width': width, 'height': height, 'scale': 3}


def host_diagnostics():
    # Do not dump environment variables, account data, or credentials into artifacts.
    for name, args in [('adb-devices.txt', ['adb', 'devices', '-l']),
                       ('host-memory.txt', ['free', '-m']),
                       ('emulator-version.txt', [os.path.join(os.environ.get('ANDROID_HOME', ''), 'emulator/emulator'), '-version'])]:
        try:
            result = subprocess.run(args, capture_output=True, text=True, timeout=10)
            (OUT / name).write_text(result.stdout + result.stderr)
        except Exception as error:
            (OUT / name).write_text(str(error))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    report = {'sourceCommit': os.environ.get('GITHUB_SHA'), 'package': PACKAGE,
              'fixtureSeed': 1852006, 'fixtureNow': '2026-09-14T12:00:00.000Z',
              'scope': 'identified native fixture capture, not complete functional or visual approval',
              'captures': [], 'passed': False}
    logcat = None
    log = (OUT / 'logcat-stream.txt').open('wb')
    try:
        host_diagnostics()
        report['initialAdbState'] = adb('get-state').strip()
        if report['initialAdbState'] != 'device':
            raise AssertionError('Android transport unavailable before application setup')
        apk = Path('apps/mobile/android/app/build/outputs/apk/release/app-release.apk')
        report['apkSha256'] = hashlib.sha256(apk.read_bytes()).hexdigest()
        adb('install', '-r', str(apk))
        assert PACKAGE in adb('shell', 'pm', 'list', 'packages', PACKAGE)
        adb('shell', 'wm', 'size', '1170x2532'); adb('shell', 'wm', 'density', '480')
        adb('shell', 'settings', 'put', 'system', 'font_scale', '1.0')
        adb('shell', 'cmd', 'uimode', 'night', 'yes')
        report['size'] = adb('shell', 'wm', 'size'); report['density'] = adb('shell', 'wm', 'density')
        report['osVersion'] = adb('shell', 'getprop', 'ro.build.version.release').strip()
        report['gpuModeRequested'] = os.environ.get('CUKI_EMULATOR_GPU', 'not-recorded')
        adb('logcat', '-c')
        logcat = subprocess.Popen(['adb', 'logcat', '-v', 'threadtime'], stdout=log, stderr=subprocess.STDOUT)
        # Capture the pre-app emulator window too; preserve even if later transport fails.
        time.sleep(3)
        frame(OUT / '00-emulator-before-app.png')
        spec = importlib.util.spec_from_file_location('fresh', Path(__file__).with_name('android-hierarchy.py'))
        module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
        reader = module.NativeHierarchyReader(OUT)
        for index, (scene, screen) in enumerate(SCREENS.items(), 1):
            report['currentScene'] = scene
            adb('shell', 'am', 'force-stop', PACKAGE)
            adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'cuki-visual://visual/' + scene, PACKAGE)
            end = time.monotonic() + 50
            while time.monotonic() < end:
                xml = reader.read()
                if identified_scene(xml, scene, screen):
                    break
                time.sleep(1)
            else:
                raise AssertionError('Fixture did not render actual screen ' + screen)
            time.sleep(10)  # Native first draw or explicitly labelled bounded procedural fallback.
            prefix, frames = f'{index:02d}-{scene}', []
            for sample in (1, 2):
                xml = reader.read()
                (OUT / f'{prefix}-{sample}.xml').write_text(xml)
                if not identified_scene(xml, scene, screen):
                    raise AssertionError('Native scene changed before framebuffer capture')
                frames.append(frame(OUT / f'{prefix}-{sample}.png'))
                time.sleep(.75)
            if not identified_scene(reader.read(), scene, screen):
                raise AssertionError('Native scene left fixture during drawing')
            report['captures'].append({'scene': scene, 'screen': screen, 'framebuffers': frames,
                                       'nativeSceneAsserted': True,
                                       'rendererStatus': 'simplified' if 'Vista procedural simplificada' in xml else 'not-inferred'})
        if len(report['captures']) != 6 or len({c['framebuffers'][0]['sha256'] for c in report['captures']}) != 6:
            raise AssertionError('Expected six distinct identified native scenes')
        report['passed'] = True
    except Exception as error:
        report['error'] = str(error)
        # No reconnect/relaunch or cleared state can turn this failed capture into a pass.
        try:
            report['failureAdbState'] = adb('get-state', timeout=8).strip()
            frame(OUT / 'failure.png')
        except Exception as diagnostic:
            report['failureCaptureError'] = str(diagnostic)
    finally:
        if logcat:
            logcat.terminate()
            try: logcat.wait(timeout=5)
            except subprocess.TimeoutExpired: logcat.kill(); logcat.wait()
        log.close()
        host_diagnostics()
        try: (OUT / 'gfxinfo.txt').write_text(adb('shell', 'dumpsys', 'gfxinfo', PACKAGE, timeout=8))
        except Exception: pass
        (OUT / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
    if not report['passed']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
