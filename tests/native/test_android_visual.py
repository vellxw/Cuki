"""No emulator mocked test can certify a native scene; these only test the driver guard."""
import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/native'))
spec = importlib.util.spec_from_file_location('android_visual', ROOT / 'scripts/native/android-visual.py')
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)

class AndroidVisualGuards(unittest.TestCase):
    def test_screen_and_scene_are_both_required_not_just_a_text_label(self):
        self.assertFalse(module.identified_scene('<hierarchy><node text="SC-07"/></hierarchy>', 'home', 'SC-07'))
        self.assertFalse(module.identified_scene('<hierarchy><node resource-id="SC-07"/></hierarchy>', 'home', 'SC-07'))
        self.assertTrue(module.identified_scene('<hierarchy><node resource-id="visual-scene-home"/><node resource-id="com.cuki.app.visual:id/SC-07"/></hierarchy>', 'home', 'SC-07'))
    def test_empty_adb_frame_is_not_created_as_successful_artifact(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(module, 'adb', return_value=b''):
            path = Path(tmp) / 'frame.png'
            with self.assertRaises(AssertionError): module.frame(path)
            self.assertFalse(path.exists())
    def test_unexpected_viewport_is_not_normalized_to_hide_the_difference(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(module, 'adb', return_value=b'original'), patch.object(module, 'png_dimensions', return_value=(1080, 2400)):
            path = Path(tmp) / 'frame.png'
            with self.assertRaisesRegex(AssertionError, 'Unexpected native viewport'): module.frame(path)
            self.assertFalse(path.exists())
if __name__ == '__main__': unittest.main()
