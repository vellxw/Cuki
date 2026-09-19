"""Tests of the diagnostic, not Android app or renderer verification."""
import ast
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]

def load(name):
    spec=importlib.util.spec_from_file_location(name.replace('-','_'),ROOT/'scripts/native'/name)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module

class StartupDiagnostic(unittest.TestCase):
    def test_own_screens_only(self):
        driver=load('android-render-isolation.py')
        xml='<hierarchy><node package="com.cuki.app.test" resource-id="SC-04"/></hierarchy>'
        self.assertTrue(driver.identified(xml,'SC-04'))
        self.assertFalse(driver.identified(xml,'SC-01'))
        self.assertFalse(driver.identified(xml.replace('com.cuki.app.test','com.other.app'),'SC-04'))
        self.assertFalse(driver.identified(xml.replace('SC-04','SC-04-old'),'SC-04'))
    def test_all_native_python_files_parse(self):
        for source in (ROOT/'scripts/native').rglob('*.py'):
            ast.parse(source.read_text(),filename=str(source))
    def test_native_screen_observer_is_bounded_and_does_not_claim_success_on_timeout(self):
        observer=load('android-observed.py')
        with tempfile.TemporaryDirectory() as temp,patch.object(observer.subprocess,'run',side_effect=subprocess.TimeoutExpired('adb',15)):
            outcome=observer.observation_screenshot(Path(temp)/'screen.png')
            self.assertIn('error',outcome)
            self.assertNotIn('passed',outcome)
    def test_emulator_has_no_shell_interpolation_and_records_the_selected_mode(self):
        driver=load('owned-emulator.py')
        args=driver.emulator_args(Path('/sdk/emulator/emulator'),'cuki-proof','lavapipe')
        self.assertIn('-no-snapshot',args)
        self.assertEqual(args[args.index('-gpu')+1],'lavapipe')
        for value in ['../test','$(echo bad)','test name','']:
            with self.assertRaises(ValueError):driver.emulator_args('/sdk/emulator',value,'software')
        with self.assertRaises(ValueError):driver.emulator_args('/sdk/emulator','test','invented')
    def test_unavailable_process_memory_does_not_invent_zero_usage(self):
        driver=load('owned-emulator.py')
        result=driver.process_memory(999999999)
        self.assertIsNone(result['process'])
    def test_transport_error_is_explicit(self):
        driver=load('owned-emulator.py')
        with patch.object(driver.subprocess,'run',side_effect=subprocess.TimeoutExpired('adb',10)):
            result=driver.command(['adb','get-state'])
            self.assertIsNone(result['code']);self.assertIn('error',result)

if __name__=='__main__':unittest.main()
