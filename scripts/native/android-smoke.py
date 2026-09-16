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


def wait_node(identifier, timeout=45, predicate=lambda node: True):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        try:
            text = hierarchy()
            if recover_launcher_dialog(text):
                continue
            for node in ET.fromstring(text).iter('node'):
                if matches(node, identifier) and predicate(node):
                    (OUTPUT / 'last-hierarchy.xml').write_text(text)
                    return node
        except (subprocess.CalledProcessError, ET.ParseError):
            pass
        time.sleep(1)
    raise AssertionError('Native element did not appear: ' + identifier)


def tap_node(node, identifier):
    numbers = [int(v) for v in re.findall(r'\d+', node.attrib['bounds'])]
    assert len(numbers) == 4, 'Invalid native bounds: ' + identifier
    x1, y1, x2, y2 = numbers
    assert x2 > x1 and y2 > y1, 'Hidden native target: ' + identifier
    adb('shell', 'input', 'tap', str((x1 + x2) // 2), str((y1 + y2) // 2))


def tap(identifier):
    # The entered search string can equal a result title. Never confuse its editable
    # TextInput with the button selecting that result.
    node = wait_node(identifier, predicate=lambda item: item.get('clickable') == 'true'
                     and item.get('enabled') != 'false' and item.get('class') != 'android.widget.EditText')
    tap_node(node, identifier)


def capture(name):
    time.sleep(2)
    (OUTPUT / (name + '.png')).write_bytes(adb('exec-out', 'screencap', '-p', binary=True))
    (OUTPUT / (name + '.xml')).write_text(hierarchy())


def launch():
    adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'cuki://', PACKAGE)


def scroll_to(identifier, limit=7):
    # Return targets already visible; otherwise scan both directions. A retained
    # recipe/plan scroll offset can legitimately put an earlier field above us.
    for direction in ('down', 'up'):
        previous = None
        for _ in range(limit):
            try:
                return wait_node(identifier, timeout=1)
            except AssertionError:
                xml = hierarchy()
                signature = [(n.get('resource-id'), n.get('content-desc'), n.get('bounds'))
                             for n in ET.fromstring(xml).iter('node')]
                if signature == previous:
                    break
                previous = signature
                width, height = [int(v) for v in re.findall(r'(\d+)x(\d+)', adb('shell', 'wm', 'size'))[-1]]
                start, end = (.70, .32) if direction == 'down' else (.32, .70)
                adb('shell', 'input', 'swipe', str(width // 2), str(int(height * start)), str(width // 2), str(int(height * end)), '350')
    return wait_node(identifier, timeout=3)


def fill(identifier, text):
    """Use the actual accessible input; clear its existing characters, not the screen stack."""
    scroll_to(identifier)
    tap_node(wait_node(identifier, predicate=lambda n: n.get('class') == 'android.widget.EditText'), identifier)
    node = wait_node(identifier, predicate=lambda n: n.get('class') == 'android.widget.EditText' and n.get('focused') == 'true')
    current = node.get('text', '')
    # These test fields contain short ASCII names or decimal values.
    assert len(current) < 100 and text.isascii()
    adb('shell', 'input', 'keyevent', 'KEYCODE_MOVE_END')
    if current:
        adb('shell', 'input', 'keyevent', *(['KEYCODE_DEL'] * len(current)))
    adb('shell', 'input', 'text', text.replace(' ', '%s'))
    wait_node(identifier, predicate=lambda n: n.get('class') == 'android.widget.EditText' and n.get('text') == text)
    # Back is only safe when an on-screen IME is actually shown. Hardware keyboards
    # leave it hidden; blindly pressing Back would navigate away and invalidate this test.
    ime = adb('shell', 'dumpsys', 'input_method')
    if re.search(r'(?:mInputShown|isInputViewShown)=true\b', ime):
        adb('shell', 'input', 'keyevent', 'KEYCODE_BACK')


def tap_scrolled(identifier):
    scroll_to(identifier)
    tap(identifier)


def run_guest_suite():
    report = {'package': PACKAGE, 'sourceCommit': os.environ.get('CUKI_BINARY_SOURCE_SHA') or os.environ.get('GITHUB_SHA'),
              'harnessCommit': os.environ.get('GITHUB_SHA'), 'checks': [],
              'startedAt': time.time(), 'infrastructureEvents': infra_events, 'scope': 'native guest navigation, food persistence and superset workout recovery; not visual-fidelity or provider approval'}
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
        fill('Alimento o ingrediente', 'Pechuga')
        # Select the result directly, as a person does. An unconditional Back pops the
        # screen when a hardware keyboard means no software IME was opened.
        wait_node('Pechuga de pollo asada', predicate=lambda n: n.get('clickable') == 'true')
        capture('05b-food-search')
        name = 'Pechuga de pollo asada'
        # Multiple cooking methods are distinct valid foods. Select the exact reviewed
        # source instead of asserting that a broad search returns only one candidate.
        wait_node(name, predicate=lambda n: n.get('clickable') == 'true')
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
        # Create a real two-exercise superset through the UI. No database seed or API
        # test endpoint injects a workout into the native application.
        tap('Volver'); wait_node('SC-07'); tap('nav-train'); wait_node('SC-42')
        tap_scrolled('Crear rutina'); wait_node('SC-44')
        fill('Nombre del plan', 'Rutina QA nativa')
        tap_scrolled('Añadir ejercicio al día'); wait_node('SC-45')
        fill('Buscar ejercicio o equipo', 'Press inclinado'); tap('Press inclinado'); wait_node('SC-44')
        fill('Series, ejercicio 1', '1')
        fill('Grupo de superserie o circuito, ejercicio 1', 'A')
        tap_scrolled('Añadir ejercicio al día'); wait_node('SC-45')
        fill('Buscar ejercicio o equipo', 'Remo sentado'); tap('Remo sentado'); wait_node('SC-44')
        fill('Series, ejercicio 2', '1')
        fill('Grupo de superserie o circuito, ejercicio 2', 'A')
        tap_scrolled('Guardar plan'); wait_node('SC-42'); tap_scrolled('Iniciar Día A'); wait_node('SC-47')
        wait_node('Press inclinado'); fill('Carga kg', '20'); fill('Repeticiones', '8')
        tap_scrolled('Completar serie'); wait_node('SC-48'); capture('08-rest-after-first-superset-set')
        report['checks'].append('create-plan-with-two-exercise-superset-and-complete-first-set')
        adb('shell', 'am', 'force-stop', PACKAGE); launch(); wait_node('SC-07')
        tap('nav-train'); wait_node('SC-42'); tap_scrolled('Reanudar sesión'); wait_node('SC-48')
        tap_scrolled('Continuar entrenamiento'); wait_node('SC-47'); wait_node('Remo sentado')
        fill('Carga kg', '25'); fill('Repeticiones', '8')
        tap_scrolled('Completar serie'); wait_node('SC-48'); tap_scrolled('Finalizar sesión'); wait_node('SC-51')
        fill('Cómo fue la sesión, opcional', 'Persistencia QA sin red')
        tap_scrolled('Guardar y finalizar sesión'); wait_node('SC-52')
        wait_node('2 series de trabajo / actividades válidas')
        wait_node('Persistencia QA sin red'); capture('09-durable-workout-summary')
        report['checks'].append('superset-rest-survives-offline-process-death-and-completes-two-real-sets')
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
        raise AssertionError(report.get('error', 'Native guest suite failed'))
    return report


if __name__ == '__main__':
    run_guest_suite()
