"""Selection tests only; these are not simulated evidence of an iOS boot."""
import importlib.util
from pathlib import Path
import unittest

P=Path(__file__).resolve().parents[2]/'scripts/native/ios_simulator.py'
spec=importlib.util.spec_from_file_location('ios_simulator',P)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)


def runtime(version,available=True,platform='iOS'):
    return {'version':version,'isAvailable':available,'platform':platform,
            'identifier':'com.apple.CoreSimulator.SimRuntime.'+platform+'-'+version.replace('.','-')}


class CanonicalSimulator(unittest.TestCase):
    def test_numeric_latest_available_ios_not_list_order(self):
        values=[runtime('18.5'),runtime('26.10'),runtime('26.9'),runtime('27',False),runtime('99',platform='tvOS')]
        self.assertEqual(m.select_runtime(values,{})['version'],'26.10')
    def test_device_runtime_bounds_are_respected(self):
        self.assertEqual(m.select_runtime([runtime('18.0'),runtime('26.0')],
            {'minRuntimeVersion':18<<16,'maxRuntimeVersion':19<<16})['version'],'18.0')
    def test_missing_compatible_runtime_fails_not_arbitrary_phone(self):
        with self.assertRaisesRegex(RuntimeError,'supports the canonical'):
            m.select_runtime([runtime('18.0')],{'minRuntimeVersion':26<<16})
    def test_unavailable_and_malformed_are_not_usable(self):
        with self.assertRaises(RuntimeError):
            m.select_runtime([runtime('26.5',False),runtime('bad')],{})
    def test_canonical_device_is_not_a_name_match_to_a_larger_phone(self):
        self.assertEqual(m.DEVICE_TYPE,'com.apple.CoreSimulator.SimDeviceType.iPhone-13')

if __name__=='__main__':unittest.main()
