#!/usr/bin/env python3
"""Own the emulator process so a disappearing device has a recorded exit reason.

Runs only a fresh CI AVD. Does not reconnect a failed guest, alter the APK, clear
production packages or substitute UI evidence. Graphics mode is a recorded test
configuration, not an app fallback or an assumption about physical phones.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
import time

ROOT = Path(__file__).resolve().parents[2]
ALLOWED_DRIVERS = {'android-render-isolation.py', 'android-observed.py', 'android-visual.py'}


def command(args, timeout=10):
    try:
        p = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
        return {'code': p.returncode, 'out': p.stdout.decode('utf-8', 'replace')[-6000:],
                'error': p.stderr.decode('utf-8', 'replace')[-1500:]}
    except (OSError, subprocess.TimeoutExpired) as error:
        return {'code': None, 'error': str(error)}


def process_memory(pid):
    """Read only counters for our process and aggregate host memory, not command lines."""
    result = {}
    for name, path, keys in [
        ('process', Path('/proc') / str(pid) / 'status', {'VmRSS', 'VmHWM', 'VmSize', 'Threads', 'State'}),
        ('host', Path('/proc/meminfo'), {'MemAvailable', 'MemTotal', 'SwapFree', 'SwapTotal'})]:
        try:
            result[name] = {key: value.strip() for line in path.read_text().splitlines()
                            if ':' in line for key, value in [line.split(':', 1)] if key in keys}
        except OSError:
            result[name] = None
    for key in ('memory.current', 'memory.peak', 'memory.max', 'memory.events'):
        path = Path('/sys/fs/cgroup') / key
        if path.is_file():
            result[key] = path.read_text().strip()
    return result


def emulator_args(binary, avd, gpu):
    if not avd or not avd.replace('-', '').replace('_', '').isalnum():
        raise ValueError('Use an explicitly named CI AVD')
    if gpu not in {'software', 'lavapipe', 'swangle', 'swiftshader'}:
        raise ValueError('Unsupported diagnostic graphics backend')
    return [str(binary), '-avd', avd, '-port', '5554', '-no-window', '-gpu', gpu,
            '-no-snapshot', '-noaudio', '-no-boot-anim', '-no-metrics']


def terminate(child):
    if child and child.poll() is None:
        child.terminate()
        try:
            child.wait(timeout=10)
        except subprocess.TimeoutExpired:
            child.kill(); child.wait(timeout=5)


def run(args):
    out = ROOT / 'artifacts/native/emulator-process'
    out.mkdir(parents=True, exist_ok=True)
    binary = Path(os.environ['ANDROID_HOME']) / 'emulator/emulator'
    report = {'sourceCommit': os.environ.get('GITHUB_SHA'), 'graphicsMode': args.gpu,
              'avd': args.avd, 'driver': args.driver, 'passed': False,
              'scope': 'CI emulator process and unchanged native suite; not physical-device QA',
              'emulatorVersion': command([str(binary), '-version'])}
    write = lambda: (out / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
    write()
    child = suite = None
    watcher = None
    stop = threading.Event()
    environment = {**os.environ, 'ANDROID_SERIAL': 'emulator-5554'}
    try:
        with (out / 'emulator-console.log').open('wb') as log:
            child = subprocess.Popen(emulator_args(binary, args.avd, args.gpu),
                                     stdout=log, stderr=subprocess.STDOUT, env=environment)
            report['emulatorPid'] = child.pid; write()
            def observe():
                with (out / 'memory.jsonl').open('w') as records:
                    while not stop.is_set():
                        records.write(json.dumps({'time': time.time(), 'exitCode': child.poll(),
                                                  **process_memory(child.pid)}) + '\n')
                        records.flush()
                        if child.poll() is not None:
                            break
                        stop.wait(1)
            watcher = threading.Thread(target=observe, daemon=True); watcher.start()
            until = time.monotonic() + 300
            while True:
                if child.poll() is not None:
                    raise RuntimeError(f'Emulator exited before boot: {child.returncode}')
                boot = command(['adb', '-s', 'emulator-5554', 'shell', 'getprop', 'sys.boot_completed'])
                if boot.get('out', '').strip() == '1':
                    break
                if time.monotonic() >= until:
                    raise TimeoutError('Fresh CI AVD did not boot within 300 seconds')
                time.sleep(2)
            command(['adb', '-s', 'emulator-5554', 'shell', 'input', 'keyevent', '82'])
            time.sleep(10)
            # Preserve the actual screen before CUKI. It is not a passing app frame.
            baseline = subprocess.run(['adb', '-s', 'emulator-5554', 'exec-out', 'screencap', '-p'],
                                      stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=15)
            from capture_evidence import png_dimensions
            report['preAppFrame'] = {'dimensions': png_dimensions(baseline.stdout), 'exitCode': baseline.returncode}
            (out / 'before-app.png').write_bytes(baseline.stdout)
            if baseline.returncode:
                raise RuntimeError('Native screenshot failed before app startup')
            with (out / 'suite-console.log').open('wb') as suite_log:
                suite = subprocess.Popen([sys.executable, str(ROOT / 'scripts/native' / args.driver)],
                                         stdout=suite_log, stderr=subprocess.STDOUT, env=environment)
                deadline = time.monotonic() + 720
                while suite.poll() is None:
                    if child.poll() is not None:
                        raise RuntimeError(f'Emulator process exited during native suite: {child.returncode}')
                    if time.monotonic() > deadline:
                        raise TimeoutError('Native suite exceeded its 720 second budget')
                    time.sleep(1)
                report['suiteExitCode'] = suite.returncode
                report['emulatorExitDuringTest'] = child.poll()
                report['passed'] = suite.returncode == 0 and child.poll() is None
    except Exception as error:
        report['error'] = str(error)
    finally:
        report['emulatorExitBeforeCleanup'] = child.poll() if child else None
        report['finalMemory'] = process_memory(child.pid) if child else None
        terminate(suite); stop.set()
        if watcher:
            watcher.join(timeout=5)
        terminate(child)
        write()
    return 0 if report['passed'] else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--avd', required=True)
    parser.add_argument('--gpu', choices=['software', 'lavapipe', 'swangle', 'swiftshader'], required=True)
    parser.add_argument('--driver', choices=sorted(ALLOWED_DRIVERS), default='android-render-isolation.py')
    args = parser.parse_args()
    return run(args)


if __name__ == '__main__':
    raise SystemExit(main())
