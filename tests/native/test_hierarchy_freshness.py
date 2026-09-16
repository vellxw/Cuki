import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock

spec = importlib.util.spec_from_file_location('fresh', Path(__file__).resolve().parents[2] / 'scripts/native/android-hierarchy.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class FreshnessTests(unittest.TestCase):
    def driver(self, output):
        device = Mock()
        device.jsonrpc.getConfigurator.return_value = {'waitForIdleTimeout': 0, 'waitForSelectorTimeout': 0}
        return device, module.NativeHierarchyReader(output, device=device)

    def test_timer_updates_do_not_require_a_quiescent_screen(self):
        with tempfile.TemporaryDirectory() as directory:
            device, reader = self.driver(directory)
            device.dump_hierarchy.side_effect = ['<hierarchy><node text="00:01"/></hierarchy>', '<hierarchy><node text="00:02"/></hierarchy>']
            self.assertIn('00:01', reader.read())
            self.assertIn('00:02', reader.read())
            device.jsonrpc.setConfigurator.assert_called_once_with({'waitForIdleTimeout': 0, 'waitForSelectorTimeout': 0})
            self.assertEqual(device.dump_hierarchy.call_count, 2)

    def test_failed_snapshot_never_returns_the_previous_screen(self):
        with tempfile.TemporaryDirectory() as directory:
            device, reader = self.driver(directory)
            device.dump_hierarchy.side_effect = ['<hierarchy><node text="Training home"/></hierarchy>', RuntimeError('Native snapshot failed')]
            reader.read()
            with self.assertRaisesRegex(RuntimeError, 'Native snapshot failed'):
                reader.read()
            records = [json.loads(line) for line in (Path(directory) / 'hierarchy-requests.jsonl').read_text().splitlines()]
            self.assertEqual([row['sequence'] for row in records], [1, 2])
            self.assertNotIn('sha256', records[1])
            self.assertIn('failedAt', records[1])

    def test_empty_invalid_or_non_hierarchy_payloads_fail(self):
        for payload in ('', '<hierarchy/>', 'ERROR: could not get idle state.', '<html><node/></html>'):
            with self.subTest(payload=payload), tempfile.TemporaryDirectory() as directory:
                device, reader = self.driver(directory)
                device.dump_hierarchy.return_value = payload
                with self.assertRaises(Exception):
                    reader.read()

    def test_ignored_configurator_change_is_not_silently_accepted(self):
        with tempfile.TemporaryDirectory() as directory:
            device = Mock()
            device.jsonrpc.getConfigurator.return_value = {'waitForIdleTimeout': 10000}
            with self.assertRaisesRegex(RuntimeError, 'did not apply'):
                module.NativeHierarchyReader(directory, device=device)


if __name__ == '__main__':
    unittest.main()
