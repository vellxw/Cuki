"""Parser tests use tiny genuine PNGs in temporary directories, never evidence assets."""
import importlib.util
import json
from pathlib import Path
import struct
import tempfile
import unittest
import uuid
import zlib

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('cuki_visual_driver', ROOT / 'scripts/native/ios-visual.py')
driver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(driver)
from capture_evidence import png_dimensions, attachment_bytes, SCREENS, TESTS


def png(color=1, width=3, height=6):
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress((b'\0' + bytes([color, 2, 3]) * width) * height))
            + chunk(b'IEND', b''))


class VisualCaptureEvidence(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.attach = self.root / 'attachments'; self.attach.mkdir()
        self.out = self.root / 'out'
        self.summary = {'result': 'Passed', 'passedTests': 6, 'failedTests': 0, 'skippedTests': 0}
        self.groups, self.records = [], []
        for index, (scene, screen) in enumerate(SCREENS.items(), 1):
            prefix = f'{index:02d}-{scene}'
            items = []
            proof = dict(scene=scene, screen=screen, fixtureSeed=1852006,
                         identifiedNativeScreen=True, noApplicationAlert=True, noSystemAlert=True,
                         frame={'width': 1, 'height': 2})
            for name, ext, data in [(prefix + '-proof', 'json', json.dumps(proof).encode()),
                                    (prefix + '-accessibility', 'txt',
                                     f"identifier: 'visual-scene-{scene}' identifier: '{screen}'".encode()),
                                    (prefix + '-1', 'png', png(index)), (prefix + '-2', 'png', png(index))]:
                exported = str(uuid.uuid4()).upper() + '.' + ext
                item = {'suggestedHumanReadableName': name + '.' + ext, 'exportedFileName': exported,
                        'deviceId': 'test-device-only', 'isAssociatedWithFailure': False}
                (self.attach / exported).write_bytes(data)
                items.append(item); self.records.append(item)
            self.groups.append({'testIdentifier': f'CUKIVisualTests/{TESTS[scene]}()', 'attachments': items})
        self.manifest()

    def manifest(self):
        (self.attach / 'manifest.json').write_text(json.dumps(self.groups))

    def verify(self):
        return driver.verify_capture(self.summary, self.attach, self.out)

    def test_keeps_exact_named_bytes(self):
        self.assertEqual(len(self.verify()), 6)
        for item in self.records:
            if item['suggestedHumanReadableName'].endswith('.png'):
                self.assertEqual((self.attach / item['exportedFileName']).read_bytes(),
                                 (self.out / item['suggestedHumanReadableName']).read_bytes())

    def test_accepts_actual_xcresult_index_uuid_suffix_but_not_arbitrary_prefix(self):
        for record in self.records:
            base, ext = record['suggestedHumanReadableName'].rsplit('.', 1)
            record['suggestedHumanReadableName'] = f'{base}_0_{str(uuid.uuid4()).upper()}.{ext}'
        self.manifest(); self.assertEqual(len(self.verify()), 6)
        self.records[2]['suggestedHumanReadableName'] = '01-home-1_was-the-wrong-window.png'
        self.manifest()
        with self.assertRaisesRegex(AssertionError, 'Expected one named'): self.verify()

    def test_cannot_pass_skipped_failed_or_unreported_tests(self):
        for field, value in [('skippedTests', 1), ('failedTests', 1), ('passedTests', 5),
                             ('result', 'Failed'), ('passedTests', 7), ('skippedTests', None)]:
            self.summary = dict(result='Passed', passedTests=6, failedTests=0, skippedTests=0)
            self.summary[field] = value
            with self.assertRaises(AssertionError): self.verify()

    def test_missing_frame_is_not_replaced_by_unrelated_screenshot(self):
        self.groups[-1]['attachments'].pop(); self.manifest()
        with self.assertRaisesRegex(AssertionError, 'Expected one named'): self.verify()
        self.assertFalse(self.out.exists())

    def test_duplicate_name_cannot_be_accepted_arbitrarily(self):
        self.groups[0]['attachments'].append(dict(self.records[2])); self.manifest()
        with self.assertRaisesRegex(AssertionError, 'Expected one named'): self.verify()

    def test_wrong_test_or_failure_attachment_is_rejected(self):
        self.groups[0]['testIdentifier'] = 'OtherTests/test01Home()'; self.manifest()
        with self.assertRaisesRegex(AssertionError, 'wrong or failed test'): self.verify()
        self.groups[0]['testIdentifier'] = 'CUKIVisualTests/test01Home()'
        self.records[2]['isAssociatedWithFailure'] = True; self.manifest()
        with self.assertRaisesRegex(AssertionError, 'wrong or failed test'): self.verify()

    def test_missing_or_false_native_scene_proof_fails(self):
        path = self.attach / self.records[0]['exportedFileName']; original = path.read_bytes()
        for key, value in [('scene', 'garden'), ('fixtureSeed', 0), ('identifiedNativeScreen', 'true'),
                           ('noApplicationAlert', False), ('noSystemAlert', None)]:
            proof = json.loads(original); proof[key] = value; path.write_text(json.dumps(proof))
            with self.assertRaisesRegex(AssertionError, 'obscured native scene'): self.verify()

    def test_tree_and_device_must_agree_with_scene(self):
        tree = self.attach / self.records[1]['exportedFileName']; saved = tree.read_bytes()
        tree.write_text("identifier: 'SC-07'")
        with self.assertRaisesRegex(AssertionError, 'accessibility tree'): self.verify()
        tree.write_bytes(saved)
        self.records[2]['deviceId'] = 'different-device'; self.manifest()
        with self.assertRaisesRegex(AssertionError, 'one native device'): self.verify()

    def test_repeated_dialog_is_not_six_distinct_scenes(self):
        for item in self.records:
            if item['exportedFileName'].endswith('.png'):
                (self.attach / item['exportedFileName']).write_bytes(png())
        with self.assertRaisesRegex(AssertionError, 'identical framebuffers'): self.verify()

    def test_wrong_viewport_fails(self):
        (self.attach / self.records[2]['exportedFileName']).write_bytes(png(1, 3, 7))
        with self.assertRaisesRegex(AssertionError, 'asserted viewport'): self.verify()

    def test_path_traversal_absolute_and_symlink_are_rejected(self):
        for name in ('../other.png', '/etc/passwd', 'a\\b.png', '.', ''):
            with self.assertRaises(AssertionError): attachment_bytes(self.attach, {'exportedFileName': name})
        link = self.attach / 'link.png'; link.symlink_to(self.attach / self.records[2]['exportedFileName'])
        with self.assertRaises(AssertionError): attachment_bytes(self.attach, {'exportedFileName': 'link.png'})

    def test_empty_truncated_crc_corrupt_or_incomplete_png_fails(self):
        good = png(); bad_crc = bytearray(good); bad_crc[20] ^= 1
        for data in (b'', b'\x89PNG\r\n\x1a\n', good[:-12], good + b'extra', bytes(bad_crc)):
            with self.assertRaises((AssertionError, zlib.error)): png_dimensions(data)
        self.assertEqual(png_dimensions(good), (3, 6))

    def test_deflate_bomb_or_non_image_payload_does_not_pass_header_check(self):
        for data in (b'not an image', b'\x89PNG\r\n\x1a\nDIALOG'):
            with self.assertRaises(AssertionError): png_dimensions(data)


if __name__ == '__main__': unittest.main()
