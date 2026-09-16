import importlib.util
from pathlib import Path
import unittest
spec = importlib.util.spec_from_file_location('dialogs', Path(__file__).resolve().parents[2] / 'scripts/native/android-dialogs.py')
dialogs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dialogs)


def window(title, package='android'):
    return f'''<hierarchy><node package="{package}" resource-id="android:id/alertTitle" text="{title}"/>
        <node package="android" resource-id="android:id/aerr_close" clickable="true" bounds="[1,2][3,4]"/></hierarchy>'''


class SystemDialogTests(unittest.TestCase):
    def test_only_explicit_external_launcher_may_be_recovered(self):
        self.assertEqual(dialogs.classify_dialog(window("Quickstep isn't responding")).get('resource-id'), 'android:id/aerr_close')

    def test_cuki_anr_remains_failure(self):
        with self.assertRaisesRegex(RuntimeError, 'CUKI'):
            dialogs.classify_dialog(window("CUKI Test isn't responding"))

    def test_unknown_system_failure_is_not_hidden(self):
        with self.assertRaisesRegex(RuntimeError, 'System UI'):
            dialogs.classify_dialog(window('System UI keeps stopping'))

    def test_application_content_cannot_fake_a_system_dialog(self):
        self.assertIsNone(dialogs.classify_dialog(window("Quickstep isn't responding", 'com.cuki.app.test')))

    def test_normal_window_needs_no_intervention(self):
        self.assertIsNone(dialogs.classify_dialog('<hierarchy><node text="CUKI"/></hierarchy>'))

if __name__ == '__main__':
    unittest.main()
