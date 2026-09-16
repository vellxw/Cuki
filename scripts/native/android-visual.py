#!/usr/bin/env python3
"""Capture real production-screen components in an isolated native visual-QA app.
Synthetic inputs are rendering fixtures only, never an end-to-end provider verdict.
No screen reconstruction, OCR or edited output pixels.
"""
import hashlib, importlib.util, json, os, pathlib, subprocess, time
import xml.etree.ElementTree as ET
PACKAGE='com.cuki.app.visual'
OUT=pathlib.Path('artifacts/native/visual-android');OUT.mkdir(parents=True,exist_ok=True)
SCENES={'home':'SC-07','recipes':'SC-23','recipe':'SC-26','scan':'SC-20','training':'SC-47','garden':'SC-79'}
def adb(*args,binary=False):
    return subprocess.check_output(['adb',*args],timeout=45,text=not binary)
def has(root,identifier):
    return any(n.get('resource-id','')==identifier or n.get('resource-id','').endswith('/'+identifier) for n in root.iter('node'))
report={'sourceCommit':os.environ.get('GITHUB_SHA'),'package':PACKAGE,'fixtureSeed':1852006,'fixtureNow':'2026-09-14T12:00:00.000Z','scope':'actual native visual-fixture capture; NOT complete functional or pixel-fidelity approval','captures':[],'passed':False}
try:
    apk=pathlib.Path('apps/mobile/android/app/build/outputs/apk/release/app-release.apk')
    report['apkSha256']=hashlib.sha256(apk.read_bytes()).hexdigest()
    adb('install','-r',str(apk));assert PACKAGE in adb('shell','pm','list','packages',PACKAGE)
    # Match one explicitly defined logical viewport; preserve full raw framebuffers.
    adb('shell','wm','size','1170x2532');adb('shell','wm','density','480')
    adb('shell','cmd','uimode','night','yes')
    report['size']=adb('shell','wm','size');report['density']=adb('shell','wm','density')
    adb('logcat','-c')
    spec=importlib.util.spec_from_file_location('fresh',pathlib.Path(__file__).with_name('android-hierarchy.py'))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    reader=module.NativeHierarchyReader(OUT)
    for index,(scene,screen) in enumerate(SCENES.items(),1):
        adb('shell','am','force-stop',PACKAGE)
        adb('shell','am','start','-W','-a','android.intent.action.VIEW','-d','cuki-visual://visual/'+scene,PACKAGE)
        end=time.monotonic()+50
        while time.monotonic()<end:
            xml=reader.read();root=ET.fromstring(xml)
            if has(root,'visual-scene-'+scene) and has(root,screen):break
            time.sleep(1)
        else:raise AssertionError('Fixture did not render actual screen '+screen)
        # Allows native first-draw or the explicit bounded procedural fallback to settle.
        time.sleep(10)
        prefix=f'{index:02d}-{scene}'
        paths=[]
        for sample in (1,2):
            path=OUT/f'{prefix}-{sample}.png';data=adb('exec-out','screencap','-p',binary=True);path.write_bytes(data)
            paths.append({'path':path.name,'sha256':hashlib.sha256(data).hexdigest()})
            time.sleep(.75)
        xml=reader.read();(OUT/f'{prefix}.xml').write_text(xml)
        assert has(ET.fromstring(xml),screen),'Screen left fixture during native drawing'
        report['captures'].append({'scene':scene,'screen':screen,'framebuffers':paths,'rendererStatus':'simplified' if 'Vista procedural simplificada' in xml else 'not-inferred-from-accessibility'})
    report['passed']=len(report['captures'])==6
except Exception as error:
    report['error']=str(error)
    try:(OUT/'failure.png').write_bytes(adb('exec-out','screencap','-p',binary=True))
    except Exception:pass
finally:
    try:(OUT/'logcat.txt').write_text(adb('logcat','-d','-v','brief'))
    except Exception:pass
    try:(OUT/'gfxinfo.txt').write_text(adb('shell','dumpsys','gfxinfo',PACKAGE))
    except Exception:pass
    (OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n')
if not report['passed']:raise SystemExit(1)
