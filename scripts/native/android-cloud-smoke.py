#!/usr/bin/env python3
"""Native client -> real local authentication/API -> SQL -> native garden verification.

Only dedicated CI: the ordinary application performs every write through its UI.
A second authenticated HTTP client observes persisted data; it never seeds app state
or alters reward time. Development mailbox codes are not published as credentials.
"""
import importlib.util
import json
import os
from pathlib import Path
import time
import urllib.error
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[2]
if os.environ.get('CUKI_NATIVE_CLOUD_QA') != '1' or os.environ.get('CI') != '1':
    raise SystemExit('This test is restricted to an explicitly configured ephemeral CI instance.')
if os.environ.get('PUBLIC_ORIGIN') != 'http://10.0.2.2:3000' or os.environ.get('AUTH_MODE') != 'local':
    raise SystemExit('Refusing to exercise a different backend or real identity provider.')

spec = importlib.util.spec_from_file_location('native_guest', Path(__file__).with_name('android-smoke.py'))
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)
native.OUTPUT = ROOT / 'artifacts/native/android-cloud'
native.OUTPUT.mkdir(parents=True, exist_ok=True)
OUTPUT = native.OUTPUT
ORIGIN = 'http://127.0.0.1:3000'


def request(path, body=None, token=None, key=None, method=None):
    headers = {'Content-Type': 'application/json', 'apikey': 'local-development-not-a-secret'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    if key:
        headers['Idempotency-Key'] = key
    req = urllib.request.Request(ORIGIN + path, data=None if body is None else json.dumps(body).encode(),
                                 headers=headers, method=method or ('POST' if body is not None else 'GET'))
    with urllib.request.urlopen(req, timeout=20) as response:
        return json.load(response)


def mailbox(email):
    end = time.monotonic() + 25
    while time.monotonic() < end:
        for path in sorted((ROOT / '.local/mail').glob('*.json'), key=lambda p: p.stat().st_mtime, reverse=True):
            try:
                mail = json.loads(path.read_text())
                if mail.get('to') == email and mail.get('purpose') == 'email':
                    assert mail.get('developmentOnly') is True
                    return mail['token']
            except (OSError, json.JSONDecodeError):
                continue
        time.sleep(.5)
    raise AssertionError('The local identity service did not send the expected verification code.')


def observer_account(email):
    request('/auth/v1/otp', {'email': email, 'create_user': True})
    session = request('/auth/v1/verify', {'email': email, 'token': mailbox(email), 'type': 'email'})
    assert session['user']['email_confirmed_at']
    return session


def latest_entities(token):
    cursor = '0'
    result = {}
    for _ in range(20):
        page = request('/v1/sync/pull?cursor=' + cursor, token=token)
        for change in page['changes']:
            entity_key = (change['entityType'], change['entityId'])
            if change['deleted']:
                result.pop(entity_key, None)
            else:
                result[entity_key] = change['payload']
        if not page['more']:
            return result
        assert int(page['cursor']) > int(cursor)
        cursor = page['cursor']
    raise AssertionError('Unexpected pagination volume in isolated native QA account.')


def wait_server(description, predicate, timeout=60):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        value = predicate()
        if value:
            return value
        time.sleep(1)
    raise AssertionError('Native action not reflected by authenticated server read: ' + description)


def open_home():
    native.adb('shell', 'am', 'force-stop', native.PACKAGE)
    native.launch()
    native.wait_node('SC-07')


def ui_second_workout():
    native.tap('nav-train'); native.wait_node('SC-42')
    native.tap_scrolled('Iniciar Día A'); native.wait_node('SC-47')
    native.wait_node('Press inclinado')
    native.fill('Carga kg', '22'); native.fill('Repeticiones', '8')
    native.tap_scrolled('Completar serie'); native.wait_node('SC-48')
    native.tap_scrolled('Continuar entrenamiento'); native.wait_node('SC-47')
    native.wait_node('Remo sentado')
    native.fill('Carga kg', '27'); native.fill('Repeticiones', '8')
    native.tap_scrolled('Completar serie'); native.wait_node('SC-48')
    native.tap_scrolled('Finalizar sesión'); native.wait_node('SC-51')
    native.fill('Cómo fue la sesión, opcional', 'Sesion nativa al servidor')
    native.tap_scrolled('Guardar y finalizar sesión'); native.wait_node('SC-52')
    native.wait_node('2 series de trabajo / actividades válidas')
    native.capture('cloud-04-saved-session')


report = {'sourceCommit': os.environ.get('GITHUB_SHA'), 'startedAt': time.time(), 'checks': [],
          'environment': 'ephemeral CI local identity + listening HTTP API + embedded PostgreSQL',
          'scope': 'native guest merge, account persistence, SQL synchronization, enrollment and current-week garden credit',
          'publicBackendDeployed': False, 'externalProvidersVerified': False}
try:
    assert request('/health')['environment'] == 'test'
    # All guest data originates through native input, including offline process-death recovery.
    guest_report = native.run_guest_suite()
    report['guestChecks'] = guest_report['checks']
    report['apkSha256'] = guest_report['apkSha256']
    native.adb('shell', 'svc', 'wifi', 'enable'); native.adb('shell', 'svc', 'data', 'enable')
    open_home()
    native.tap('Abrir perfil y ajustes'); native.wait_node('SC-68')
    native.tap_scrolled('Continuar con una cuenta'); native.wait_node('SC-03')
    native.tap('Código por correo')
    email = 'native-' + uuid.uuid4().hex[:16] + '@cuki-qa.invalid'
    native.fill('Correo electrónico', email)
    native.tap_scrolled('Enviar código')
    native.wait_node('Revisá tu correo. El código se verifica con el servicio de cuenta.')
    native.fill('Código del correo', mailbox(email))
    native.tap_scrolled('Sincronizar mis registros de invitado al ingresar')
    native.tap_scrolled('Verificar código')
    native.wait_node('SC-68'); native.wait_node(email)
    native.capture('cloud-01-native-authenticated')
    report['checks'].append('native-otp-verification-and-explicit-guest-merge')

    observer = observer_account(email)
    token = observer['access_token']
    def merged():
        entities = latest_entities(token)
        meals = [p for (kind, _), p in entities.items() if kind == 'diary']
        workouts = [p for (kind, _), p in entities.items() if kind == 'session' and p['status'] == 'completed']
        sets = [p for (kind, _), p in entities.items() if kind == 'set' and p.get('completedAt')]
        goals = [p for (kind, _), p in entities.items() if kind == 'goal']
        if len(meals) != 2 or len(goals) != 2 or len(workouts) != 1 or len(sets) != 2:
            return False
        food = next(m for m in meals if m['name'] == 'Pechuga de pollo asada')
        recipe = next(m for m in meals if m['name'] == 'Bowl de pollo, arroz y palta')
        assert food['amount'] == 100 and food['nutrition']['energy'] == 165
        assert recipe['amount'] == .75 and recipe['unit'] == 'serving' and recipe['snapshot']['recipe']
        active_goal = max(goals, key=lambda g: (g['effectiveFrom'], g.get('updatedAt', ''), g['version'], g['id']))
        assert active_goal['energy'] == 2250
        assert len({m['id'] for m in meals}) == 2
        assert workouts[0]['note'] == 'Persistencia QA sin red'
        return entities
    wait_server('guest food, edited recipe, latest targets and workout merge once', merged)
    report['checks'].append('native-sqlite-outbox-to-real-http-and-sql-without-duplicate-merge')
    assert request('/v1/garden', token=token) is None

    open_home(); native.tap('Ver tu jardín'); native.wait_node('SC-79')
    native.tap_scrolled('Plantar mi primer ciclo'); native.wait_node('SC-80')
    native.tap_scrolled('Entendí y acepto la regla del ciclo')
    native.tap_scrolled('Confirmar y plantar'); native.wait_node('SC-79')
    native.wait_node('0 de 52 semanas')
    garden = request('/v1/garden', token=token)
    assert garden['state'] == 'active' and garden['creditedWeeks'] == 0
    assert len(garden['boundaries']) == 53
    assert request('/v1/rewards/wallet', token=token) == []
    native.capture('cloud-02-enrolled-no-retroactive-credit')
    report['checks'].append('native-garden-enrollment-does-not-credit-pre-enrollment-workouts')

    open_home(); ui_second_workout()
    wait_server('second native workout and current-week credit',
                lambda: request('/v1/garden', token=token)['creditedWeeks'] == 1)
    entities = latest_entities(token)
    assert len([p for (kind, _), p in entities.items() if kind == 'session' and p['status'] == 'completed']) == 2
    assert len([p for (kind, _), p in entities.items() if kind == 'set' and p.get('completedAt')]) == 4
    assert request('/v1/rewards/wallet', token=token) == []
    open_home(); native.tap('Ver tu jardín'); native.wait_node('SC-79'); native.wait_node('1 de 52 semanas')
    native.capture('cloud-05-server-credit-read-back-in-native-ui')
    report['checks'].append('second-native-session-reaches-sql-and-server-credit-returns-to-native-garden')

    unrelated = observer_account('stranger-' + uuid.uuid4().hex[:16] + '@cuki-qa.invalid')
    assert latest_entities(unrelated['access_token']) == {}
    assert request('/v1/garden', token=unrelated['access_token']) is None
    assert request('/v1/rewards/wallet', token=unrelated['access_token']) == []
    report['checks'].append('second-authenticated-account-cannot-read-native-user-data-or-garden')
    open_home(); native.tap('Abrir perfil y ajustes'); native.wait_node('SC-68'); native.wait_node(email)
    report['checks'].append('secure-account-session-survives-process-restart')
    report['passed'] = True
except Exception as error:
    report['passed'] = False; report['error'] = str(error)
    try: native.capture('cloud-failure')
    except Exception: pass
finally:
    report['finishedAt'] = time.time()
    (OUTPUT / 'cloud-report.json').write_text(json.dumps(report, indent=2) + '\n')
    try: (OUTPUT / 'cloud-logcat.txt').write_text(native.adb('logcat', '-d', '-v', 'brief'))
    except Exception: pass
if not report['passed']:
    raise SystemExit(1)
