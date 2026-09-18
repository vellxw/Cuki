"""Create a dedicated, measurable visual-QA simulator before any app test runs.

Never silently substitute a different viewport or reset a device after a test
has started. A failure here is preparation failure, not a passing UI test.
"""
from __future__ import annotations
import json
from pathlib import Path
import subprocess
import time
from typing import Callable

DEVICE_TYPE = 'com.apple.CoreSimulator.SimDeviceType.iPhone-13'


def select_runtime(runtimes: list[dict], device_type: dict) -> dict:
    minimum = int(device_type.get('minRuntimeVersion', 0))
    maximum = int(device_type.get('maxRuntimeVersion', 2**32-1))
    candidates = []
    for runtime in runtimes:
        if not runtime.get('isAvailable') or runtime.get('platform', 'iOS') != 'iOS':
            continue
        if '.iOS-' not in runtime.get('identifier', ''):
            continue
        try:
            parts = [int(v) for v in runtime['version'].split('.')]
        except (ValueError, KeyError):
            continue
        parts = (parts + [0, 0])[:3]
        number = (parts[0] << 16) | (parts[1] << 8) | parts[2]
        if minimum <= number <= maximum:
            candidates.append((tuple(parts), runtime))
    if not candidates:
        raise RuntimeError('No available iOS runtime supports the canonical iPhone 13')
    return max(candidates, key=lambda item: item[0])[1]


def checked(*args: str, timeout: int = 120) -> str:
    result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError(f'{args[:3]} exited {result.returncode}: {result.stderr[-2000:]}')
    return result.stdout


def prepare(output: Path, *, run: Callable = checked) -> dict:
    output.mkdir(parents=True, exist_ok=True)
    events: list[dict] = []
    def command(*args: str, timeout: int = 120) -> str:
        item = {'command': list(args), 'startedAt': time.time(), 'stage': 'before-app-tests'}
        events.append(item)
        try:
            value = run(*args, timeout=timeout)
            item['success'] = True
            return value
        except Exception as error:
            item['success'] = False
            item['error'] = str(error)
            raise
        finally:
            item['finishedAt'] = time.time()
            (output/'simulator-preparation.json').write_text(json.dumps(events, indent=2)+'\n')
    types = json.loads(command('xcrun','simctl','list','devicetypes','-j'))['devicetypes']
    type_info = next((t for t in types if t['identifier'] == DEVICE_TYPE), None)
    if type_info is None:
        raise RuntimeError('Canonical iPhone 13 type is not installed; no viewport substitution allowed')
    runtimes = json.loads(command('xcrun','simctl','list','runtimes','-j'))['runtimes']
    runtime = select_runtime(runtimes, type_info)
    # simctl always creates a fresh UUID. No unrelated simulator is erased/shut down.
    udid = command('xcrun','simctl','create','CUKI-Visual-Canonical',DEVICE_TYPE,runtime['identifier']).strip()
    command('xcrun','simctl','boot',udid)
    command('xcrun','simctl','bootstatus',udid,'-b',timeout=360)
    command('xcrun','simctl','ui',udid,'appearance','dark',timeout=180)
    command('xcrun','simctl','status_bar',udid,'override','--time','9:41',
            '--batteryState','charged','--batteryLevel','100',timeout=60)
    shot = output/'00-simulator-before-app.png'
    command('xcrun','simctl','io',udid,'screenshot','--type=png',str(shot),timeout=60)
    from capture_evidence import png_dimensions
    width,height = png_dimensions(shot.read_bytes())
    if (width,height) != (1170,2532):
        raise RuntimeError(f'Unexpected canonical simulator viewport {width}x{height}')
    descriptor = {'udid':udid, 'name':'iPhone 13', 'deviceTypeIdentifier':DEVICE_TYPE,
                  'runtimeIdentifier':runtime['identifier'], 'runtimeVersion':runtime['version'],
                  'pixelWidth':width,'pixelHeight':height,'scale':3,'logicalWidth':390,'logicalHeight':844,
                  'stage':'prepared-before-app-tests'}
    (output/'simulator.json').write_text(json.dumps(descriptor,indent=2)+'\n')
    return descriptor
