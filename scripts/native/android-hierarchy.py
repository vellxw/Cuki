"""Fresh native accessibility snapshots, not a stale uiautomator CLI output file.

The platform CLI can print 'could not get idle state' and still exit successfully
when a one-second workout timer keeps publishing accessibility events. A previous
XML then describes a different screen. Use native UiAutomator instrumentation with
its idle wait disabled; application time and animation remain untouched.
"""
import hashlib
import json
from pathlib import Path
import time
import xml.etree.ElementTree as ET


class NativeHierarchyReader:
    def __init__(self, output, device=None):
        if device is None:
            import uiautomator2
            device = uiautomator2.connect()
        self.device = device
        self.output = Path(output)
        self.output.mkdir(parents=True, exist_ok=True)
        self.sequence = 0
        self.device.jsonrpc.setConfigurator({'waitForIdleTimeout': 0, 'waitForSelectorTimeout': 0})
        configuration = self.device.jsonrpc.getConfigurator()
        if configuration.get('waitForIdleTimeout') != 0:
            raise RuntimeError('Native driver did not apply the no-idle snapshot configuration')
        (self.output / 'native-driver.json').write_text(json.dumps({
            'driver': 'uiautomator2', 'requestedVersion': '3.7.0',
            'configuration': configuration, 'snapshotSource': 'native accessibility instrumentation',
            'appTimersModified': False,
        }, indent=2) + '\n')

    def read(self):
        self.sequence += 1
        attempt = {'sequence': self.sequence, 'requestedAt': time.time()}
        try:
            text = self.device.dump_hierarchy(compressed=False, pretty=False, max_depth=100)
            if not isinstance(text, str) or not text.strip():
                raise RuntimeError('Native driver returned an empty hierarchy')
            root = ET.fromstring(text)
            if root.tag != 'hierarchy' or not any(True for _ in root.iter('node')):
                raise RuntimeError('Native driver returned no accessible window nodes')
            attempt.update({'receivedAt': time.time(), 'sha256': hashlib.sha256(text.encode()).hexdigest()})
            return text
        except Exception as error:
            # No cached document or previous on-device path is ever used after failure.
            attempt.update({'failedAt': time.time(), 'error': str(error)})
            raise
        finally:
            with (self.output / 'hierarchy-requests.jsonl').open('a') as out:
                out.write(json.dumps(attempt) + '\n')
