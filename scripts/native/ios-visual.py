#!/usr/bin/env python3
"""Unedited simulator framebuffers, to be visually inspected against private canon.
This capture job does not claim passing interactive XCTest or pixel-fidelity metrics.
"""
import hashlib,json,os,pathlib,subprocess,time
OUT=pathlib.Path('artifacts/native/visual-ios');OUT.mkdir(parents=True,exist_ok=True)
PACKAGE='com.cuki.app.visual'
def run(*args):return subprocess.check_output(args,text=True,timeout=120)
report={'sourceCommit':os.environ.get('GITHUB_SHA'),'package':PACKAGE,'fixtureSeed':1852006,'fixtureNow':'2026-09-14T12:00:00.000Z','scope':'real native visual-frame capture; interactive functional tests are separate','captures':[],'passed':False}
try:
 devices=json.loads(run('xcrun','simctl','list','devices','available','-j'))
 device=next(d for group in devices['devices'].values() for d in group if d.get('isAvailable') and 'iPhone' in d['name'])
 udid=device['udid'];report['device']=device
 if device['state']!='Booted':run('xcrun','simctl','boot',udid)
 run('xcrun','simctl','bootstatus',udid,'-b');run('xcrun','simctl','ui',udid,'appearance','dark')
 app='apps/mobile/ios/build/Build/Products/Release-iphonesimulator/CUKIVisual.app'
 run('xcrun','simctl','install',udid,app)
 for index,scene in enumerate(['home','recipes','recipe','scan','training','garden'],1):
  subprocess.run(['xcrun','simctl','terminate',udid,PACKAGE],capture_output=True)
  launch=run('xcrun','simctl','launch',udid,PACKAGE)
  run('xcrun','simctl','openurl',udid,'cuki-visual://visual/'+scene);time.sleep(15)
  files=[]
  for sample in (1,2):
   path=OUT/f'{index:02d}-{scene}-{sample}.png'
   run('xcrun','simctl','io',udid,'screenshot',str(path));files.append({'path':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()});time.sleep(1)
  report['captures'].append({'scene':scene,'launch':launch.strip(),'framebuffers':files,'inspection':'pending direct visual review'})
 report['passed']=len(report['captures'])==6
except Exception as error:report['error']=str(error)
finally:(OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n')
if not report['passed']:raise SystemExit(1)
