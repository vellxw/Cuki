#!/usr/bin/env python3
"""Smoke-test a dedicated CUKI test APK on an ephemeral Android emulator.
Uses Android accessibility hierarchy and framebuffer, never a web approximation.
"""
import json, os, pathlib, re, subprocess, time, xml.etree.ElementTree as ET

PACKAGE = 'com.cuki.app.test'
OUTPUT = pathlib.Path('artifacts/native/android')
OUTPUT.mkdir(parents=True, exist_ok=True)

def adb(*args, binary=False):
    return subprocess.check_output(['adb', *args], timeout=45, text=not binary)

def hierarchy():
    adb('shell', 'uiautomator', 'dump', '/sdcard/cuki-test-window.xml')
    return adb('shell', 'cat', '/sdcard/cuki-test-window.xml')

def wait_node(identifier, timeout=40):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        try:
            text = hierarchy()
            for node in ET.fromstring(text).iter('node'):
                if identifier in (node.get('resource-id'), node.get('content-desc'), node.get('text')):
                    (OUTPUT/'last-hierarchy.xml').write_text(text)
                    return node
        except (subprocess.CalledProcessError, ET.ParseError):
            pass
        time.sleep(1)
    raise AssertionError('Native element did not appear: '+identifier)

def tap(identifier):
    node = wait_node(identifier)
    numbers = [int(v) for v in re.findall(r'\d+', node.attrib['bounds'])]
    if len(numbers) != 4:
        raise AssertionError('Invalid native bounds: '+identifier)
    x1, y1, x2, y2 = numbers
    adb('shell', 'input', 'tap', str((x1+x2)//2), str((y1+y2)//2))

def capture(name):
    time.sleep(2)
    (OUTPUT/(name+'.png')).write_bytes(adb('exec-out', 'screencap', '-p', binary=True))
    (OUTPUT/(name+'.xml')).write_text(hierarchy())

report={'package':PACKAGE, 'sourceCommit':os.environ.get('GITHUB_SHA'), 'checks':[], 'startedAt':time.time(), 'scope':'native launch/navigation/persistence smoke only; not pixel-fidelity approval'}
try:
    apk = pathlib.Path('apps/mobile/android/app/build/outputs/apk/release/app-release.apk')
    if not apk.is_file():
        raise FileNotFoundError(apk)
    adb('install', '-r', str(apk))
    assert PACKAGE in adb('shell','pm','list','packages',PACKAGE), 'Dedicated test package not installed'
    adb('shell','pm','clear',PACKAGE)
    adb('logcat','-c')
    adb('shell','am','start','-W','-a','android.intent.action.VIEW','-d','cuki://',PACKAGE)
    tap('welcome-explore'); wait_node('nav-register'); capture('01-home-empty')
    report['checks'].append('welcome-to-home')
    tap('nav-recipes'); wait_node('nav-recipes'); capture('02-recipes')
    tap('nav-register'); wait_node('Buscar alimento'); capture('03-register')
    tap('Cerrar'); wait_node('nav-recipes')
    report['checks'].append('contextual-register-returns-to-navigation')
    tap('nav-train'); wait_node('nav-train'); capture('04-training')
    tap('nav-progress'); wait_node('nav-progress'); capture('05-progress')
    report['checks'].append('all-four-tab-destinations')
    adb('shell','am','force-stop',PACKAGE)
    adb('shell','am','start','-W','-a','android.intent.action.VIEW','-d','cuki://',PACKAGE)
    wait_node('nav-register'); capture('06-reopened')
    report['checks'].append('onboarding-persists-after-process-death')
    report['passed']=True
except Exception as error:
    report['passed']=False; report['error']=str(error)
    try: capture('failure')
    except Exception: pass
finally:
    report['finishedAt']=time.time()
    try: (OUTPUT/'logcat.txt').write_text(adb('logcat','-d','-v','brief'))
    except Exception: pass
    (OUTPUT/'report.json').write_text(json.dumps(report,indent=2)+'\n')
if not report['passed']:
    raise SystemExit(1)
