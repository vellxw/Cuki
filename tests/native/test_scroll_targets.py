"""The driver must scroll an editable input, not stop at its visible label."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET

spec = importlib.util.spec_from_file_location('scroll_smoke', Path(__file__).resolve().parents[2] / 'scripts/native/android-smoke.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class ScrollTargetTests(unittest.TestCase):
    def test_label_at_bottom_does_not_stop_scroll_before_the_editable_input(self):
        state={'scrolls':0}
        label=ET.fromstring('<node class="android.widget.TextView" bounds="[40,2200][900,2320]"/>')
        field=ET.fromstring('<node class="android.widget.EditText" bounds="[40,1100][900,1240]"/>')
        def adb(*args,**kwargs):
            if args == ('shell','wm','size'):return 'Physical size: 1080x2400'
            if 'swipe' in args:state['scrolls']+=1
            return ''
        def wait(identifier,timeout,predicate):
            node=field if state['scrolls'] else label
            if not predicate(node):raise AssertionError('Correct native target not visible')
            return node
        with patch.object(module,'adb',side_effect=adb), patch.object(module,'wait_node',side_effect=wait), patch.object(module,'hierarchy',return_value='<hierarchy><node/></hierarchy>'):
            result=module.scroll_to('Group',predicate=lambda n:n.get('class')=='android.widget.EditText')
        self.assertIs(result,field)
        self.assertEqual(state['scrolls'],1)

    def test_input_obscured_by_system_bar_requires_another_scroll(self):
        state={'scrolls':0}
        hidden=ET.fromstring('<node class="android.widget.EditText" bounds="[40,2300][900,2390]"/>')
        field=ET.fromstring('<node class="android.widget.EditText" bounds="[40,1700][900,1850]"/>')
        def adb(*args,**kwargs):
            if args == ('shell','wm','size'):return 'Physical size: 1080x2400'
            if 'swipe' in args:state['scrolls']+=1
            return ''
        def wait(identifier,timeout,predicate):
            node=field if state['scrolls'] else hidden
            if not predicate(node):raise AssertionError('Target not fully visible')
            return node
        with patch.object(module,'adb',side_effect=adb), patch.object(module,'wait_node',side_effect=wait), patch.object(module,'hierarchy',return_value='<hierarchy><node/></hierarchy>'):
            result=module.scroll_to('Amount',predicate=lambda n:n.get('class')=='android.widget.EditText')
        self.assertIs(result,field)
        self.assertEqual(state['scrolls'],1)

if __name__=='__main__':unittest.main()
