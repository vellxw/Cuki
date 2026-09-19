#!/usr/bin/env python3
"""Run the unmodified native suite while retaining evidence if the guest disappears.

This observer never retries an app action or converts a failed suite into success.
It is intended only for ephemeral CI guest accounts, not production diagnostics.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'artifacts/native/runtime-observed'


def capture(args, timeout=8):
    try:
        p=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout)
        return {'code':p.returncode,'out':p.stdout.decode('utf-8','replace')[-10000:],
                'error':p.stderr.decode('utf-8','replace')[-1000:]}
    except Exception as e:
        return {'error':str(e)}


def observation_screenshot(path):
    try:
        with path.open('wb') as f:
            result=subprocess.run(['adb','exec-out','screencap','-p'],stdout=f,stderr=subprocess.PIPE,timeout=15)
        return {'file':path.name,'exitCode':result.returncode,'scope':'observation, not a passing scene assertion'}
    except Exception as error:
        # A failed observer operation must not terminate or restart the actual suite.
        return {'file':path.name,'error':str(error),'scope':'failed observation'}


def main():
    OUT.mkdir(parents=True,exist_ok=True)
    records=[]
    report={'suite':'scripts/native/android-smoke.py','observerCommit':os.environ.get('GITHUB_SHA'),
            'binaryCommit':os.environ.get('CUKI_BINARY_SOURCE_SHA'),
            'scope':'observation only; suite result is not changed','finished':False}
    log=None;suite=None
    with (OUT/'live-logcat.txt').open('wb') as stream,(OUT/'suite-console.txt').open('wb') as output:
        try:
            log=subprocess.Popen(['adb','logcat','-v','threadtime'],stdout=stream,stderr=subprocess.STDOUT)
            # Screenshot before CUKI launches is explicitly preparation evidence.
            report['preparationScreenshot']=observation_screenshot(OUT/'00-before-suite.png')
            suite=subprocess.Popen([sys.executable,str(ROOT/'scripts/native/android-smoke.py')],cwd=ROOT,stdout=output,stderr=subprocess.STDOUT)
            started=time.monotonic();sample=0
            while suite.poll() is None:
                item={'elapsed':round(time.monotonic()-started,2),
                      'host':capture(['ps','-eo','pid,ppid,stat,rss,args']),
                      'device':capture(['adb','get-state'])}
                # Only emulator processes, not every process/argument of the host.
                item['host']['out']='\n'.join(x for x in item['host'].get('out','').splitlines() if 'qemu-system' in x or '/emulator/emulator ' in x)
                if item['device'].get('out','').strip()=='device' and sample in (0,1,2,4,8):
                    dest=OUT/f'observation-{sample:02d}.png'
                    item['screenshot']=observation_screenshot(dest)
                records.append(item);(OUT/'observation.json').write_text(json.dumps(records,indent=2)+'\n')
                if time.monotonic()-started>600:
                    suite.terminate()
                    try:suite.wait(timeout=15)
                    except subprocess.TimeoutExpired:suite.kill();suite.wait()
                    report['error']='Suite exceeded 600 seconds'
                    break
                sample+=1;time.sleep(5)
            report['suiteExitCode']=suite.returncode
            report['finished']=True
        finally:
            for child in (suite,log):
                if child and child.poll() is None:
                    child.terminate()
                    try:child.wait(timeout=5)
                    except subprocess.TimeoutExpired:child.kill();child.wait()
            (OUT/'observer.json').write_text(json.dumps(report,indent=2)+'\n')
    if report.get('suiteExitCode')!=0 or report.get('error'):
        raise SystemExit(1)


if __name__=='__main__':main()
