#!/usr/bin/env python3
"""Native UI / process-restart smoke checks on a dedicated ephemeral test APK.
No web renderer, database injection, fixed coordinates or production data.
"""
import hashlib, json, os, pathlib, re, subprocess, time, importlib.util
import xml.etree.ElementTree as ET

PACKAGE = 'com.cuki.app.test'
OUTPUT = pathlib.Path('artifacts/native/android')
OUTPUT.mkdir(parents=True, exist_ok=True)
_spec = importlib.util.spec_from_file_location('dialogs', pathlib.Path(__file__).with_name('android-dialogs.py'))
_dialogs = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_dialogs)
infra_events = []


def recover_launcher_dialog(xml):
    close = _dialogs.classify_dialog(xml)
    if close is None:
        return False
    if infra_events:
        raise RuntimeError('Launcher ANR repeated; emulator infrastructure is not stable')
    (OUTPUT / 'infrastructure-launcher-anr.xml').write_text(xml)
    (OUTPUT / 'infrastructure-launcher-anr.png').write_bytes(adb('exec-out', 'screencap', '-p', binary=True))
    values = [int(x) for x in re.findall(r'\d+', close.get('bounds', ''))]
    assert len(values) == 4
    x1, y1, x2, y2 = values
    adb('shell', 'input', 'tap', str((x1+x2)//2), str((y1+y2)//2))
    infra_events.append({'event': 'external_launcher_anr_closed', 'at': time.time(), 'title': "Quickstep isn't responding"})
    # This closes the external launcher dialog only, never resets app data or hides a CUKI crash.
    time.sleep(4)
    return True



def adb(*args, binary=False):
    return subprocess.check_output(['adb', *args], timeout=45, text=not binary)


def hierarchy():
    adb('shell', 'uiautomator', 'dump', '/sdcard/cuki-test-window.xml')
    return adb('shell', 'cat', '/sdcard/cuki-test-window.xml')


def matches(node, identifier):
    return any(value == identifier or (key == 'resource-id' and value.endswith('/' + identifier))
               for key, value in node.attrib.items() if key in ('resource-id', 'content-desc', 'text'))


def wait_node(identifier, timeout=45):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        try:
            text = hierarchy()
            if recover_launcher_dialog(text):
                continue
            for node in ET.fromstring(text).iter('node'):
                if matches(node, identifier):
                    (OUTPUT / 'last-hierarchy.xml').write_text(text)
                    return node
        except (subprocess.CalledProcessError, ET.ParseError):
            pass
        time.sleep(1)
    raise AssertionError('Native element did not appear: ' + identifier)


def tap(identifier):
    node = wait_node(identifier)
    numbers = [int(v) for v in re.findall(r'\d+', node.attrib['bounds'])]
    assert len(numbers) == 4, 'Invalid native bounds: ' + identifier
    x1, y1, x2, y2 = numbers
    assert x2 > x1 and y2 > y1, 'Hidden native target: ' + identifier
    adb('shell', 'input', 'tap', str((x1 + x2) // 2), str((y1 + y2) // 2))


def capture(name):
    time.sleep(2)
    (OUTPUT / (name + '.png')).write_bytes(adb('exec-out', 'screencap', '-p', binary=True))
    (OUTPUT / (name + '.xml')).write_text(hierarchy())


def launch():
    adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'cuki://', PACKAGE)


def scroll_to(identifier, limit=7):
    for _ in range(limit):
        try:
            return wait_node(identifier, timeout=3)
        except AssertionError:
            width, height = [int(v) for v in re.findall(r'(\d+)x(\d+)', adb('shell', 'wm', 'size'))[-1]]
            adb('shell', 'input', 'swipe', str(width // 2), str(int(height * .70)), str(width // 2), str(int(height * .32)), '350')
    return wait_node(identifier)


report = {'package': PACKAGE, 'sourceCommit': os.environ.get('GITHUB_SHA'), 'checks': [],
          'startedAt': time.time(), 'infrastructureEvents': infra_events, 'scope': 'native guest navigation and food persistence; not visual-fidelity or provider approval'}
try:
    apk = pathlib.Path('apps/mobile/android/app/build/outputs/apk/release/app-release.apk')
    if not apk.is_file():
        raise FileNotFoundError(apk)
    report['apkSha256'] = hashlib.sha256(apk.read_bytes()).hexdigest()
    report['device'] = adb('shell', 'getprop', 'ro.product.model').strip()
    report['androidVersion'] = adb('shell', 'getprop', 'ro.build.version.release').strip()
    adb('install', '-r', str(apk))
    assert PACKAGE in adb('shell', 'pm', 'list', 'packages', PACKAGE)
    adb('shell', 'pm', 'clear', PACKAGE)
    adb('logcat', '-c')
    launch()
    scroll_to('welcome-explore'); tap('welcome-explore')
    wait_node('SC-07'); wait_node('Nutrición de hoy'); capture('01-home-empty')
    report['checks'].append('welcome-to-home-content')
    tap('nav-recipes'); wait_node('SC-23'); wait_node('Buscar recetas e ingredientes'); capture('02-recipes')
    tap('nav-register'); wait_node('SC-09'); wait_node('Buscar alimento'); capture('03-register')
    tap('Cerrar'); wait_node('SC-23'); wait_node('Buscar recetas e ingredientes')
    report['checks'].append('contextual-register-returns-to-recipes-content')
    tap('nav-train'); wait_node('SC-42'); capture('04-training')
    tap('nav-progress'); wait_node('SC-57'); capture('05-progress')
    report['checks'].append('four-distinct-destination-screen-roots')
    tap('nav-home'); wait_node('SC-07'); tap('home-register'); wait_node('SC-09')
    tap('Buscar alimento'); wait_node('SC-10')
    tap('Alimento o ingrediente'); adb('shell', 'input', 'text', 'Pechuga')
    adb('shell', 'input', 'keyevent', 'KEYCODE_BACK')
    name = 'Pechuga de pollo asada'
    # Read the actual editorial item label instead of assuming its punctuation.
    candidates = [n for n in ET.fromstring(hierarchy()).iter('node')
                  if 'Pechuga' in n.get('content-desc', '') and n.get('clickable') == 'true']
    assert len(candidates) == 1, 'Expected one selected editorial chicken source'
    name = candidates[0].get('content-desc')
    tap(name); wait_node('SC-11'); scroll_to('food-portion'); tap('food-portion')
    wait_node('SC-12'); assert wait_node('portion-amount').get('text') == '100'
    scroll_to('portion-save'); tap('portion-save'); wait_node('SC-07')
    tap('Abrir diario de nutrición'); wait_node('SC-08'); scroll_to(name); capture('06-food-saved')
    report['checks'].append('food-source-to-100g-durable-diary')
    # Metro is not started by this workflow. Disable connectivity and kill the process.
    adb('shell', 'svc', 'wifi', 'disable'); adb('shell', 'svc', 'data', 'disable')
    adb('shell', 'am', 'force-stop', PACKAGE); launch()
    wait_node('SC-07'); tap('Abrir diario de nutrición'); wait_node('SC-08'); scroll_to(name)
    capture('07-diary-after-offline-process-restart')
    report['checks'].append('saved-food-survives-process-restart-without-network-or-metro')
    report['passed'] = True
except Exception as error:
    report['passed'] = False; report['error'] = str(error)
    try:
        capture('failure')
    except Exception:
        pass
finally:
    report['finishedAt'] = time.time()
    try:
        (OUTPUT / 'logcat.txt').write_text(adb('logcat', '-d', '-v', 'brief'))
        (OUTPUT / 'gfxinfo.txt').write_text(adb('shell', 'dumpsys', 'gfxinfo', PACKAGE))
    except Exception:
        pass
    (OUTPUT / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
if not report['passed']:
    raise SystemExit(1)
