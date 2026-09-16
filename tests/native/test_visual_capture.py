"""Parser unit tests, not simulator evidence: fabricated attachments stay in tmpdirs."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('cuki_visual_driver', ROOT / 'scripts/native/ios-visual.py')
driver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(driver)

class VisualCaptureEvidence(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.attach = self.root / 'attachments'; self.attach.mkdir()
        self.out = self.root / 'out'; self.out.mkdir()
        self.summary = {'result': 'Passed', 'passedTests': 6, 'failedTests': 0, 'skippedTests': 0}
        self.records = []
        for index, scene in enumerate(driver.SCENES, 1):
            for sample in (1, 2):
                name = f'{index:02d}-{scene}-{sample}'
                file = name + '.png'
                (self.attach / file).write_bytes(b'\x89PNG\r\n\x1a\n' + name.encode())
                self.records.append({'suggestedHumanReadableName': file, 'exportedFileName': file})
        self.manifest()
    def manifest(self):
        (self.attach / 'manifest.json').write_text(json.dumps([{'attachments': self.records}]))
    def verify(self):
        return driver.verify_capture(self.summary, self.attach, self.out)
    def test_keeps_exact_named_export_bytes(self):
        result = self.verify()
        self.assertEqual(len(result), 6)
        for frame in self.records:
            self.assertEqual((self.attach / frame['exportedFileName']).read_bytes(),
                             (self.out / frame['suggestedHumanReadableName']).read_bytes())
    def test_cannot_pass_a_skipped_or_failed_suite(self):
        for changes in [{'skippedTests': 1}, {'failedTests': 1}, {'passedTests': 5}, {'result': 'Failed'}, {'passedTests': 7}]:
            self.summary = dict(result='Passed', passedTests=6, failedTests=0, skippedTests=0, **{})
            self.summary.update(changes)
            with self.assertRaises(AssertionError): self.verify()
    def test_missing_named_frame_is_not_replaced_by_an_unrelated_screenshot(self):
        self.records.pop(); self.manifest()
        with self.assertRaisesRegex(AssertionError, 'Expected one named framebuffer'): self.verify()
    def test_duplicate_name_cannot_be_accepted_arbitrarily(self):
        self.records.append(dict(self.records[0])); self.manifest()
        with self.assertRaisesRegex(AssertionError, 'Expected one named framebuffer'): self.verify()
    def test_repeated_launch_dialog_is_not_six_distinct_scenes(self):
        for r in self.records: (self.attach / r['exportedFileName']).write_bytes(b'\x89PNG\r\n\x1a\nDIALOG')
        with self.assertRaisesRegex(AssertionError, 'identical framebuffers'): self.verify()
    def test_non_png_attachment_is_rejected(self):
        (self.attach / self.records[0]['exportedFileName']).write_text('not an image')
        with self.assertRaisesRegex(AssertionError, 'not a PNG'): self.verify()

if __name__ == '__main__': unittest.main()
