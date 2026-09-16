import importlib.util, pathlib, unittest
spec=importlib.util.spec_from_file_location('apk_retest',pathlib.Path(__file__).resolve().parents[2]/'scripts/native/prepare-apk-retest.py')
module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)

class ProvenanceTests(unittest.TestCase):
    def test_runtime_changes_are_never_allowed_for_binary_reuse(self):
        for path in ['apps/mobile/app.config.ts','apps/mobile/src/screens/Home.tsx','packages/core/state.ts','package-lock.json','.npmrc','tsconfig.json','modules/Cuki.kt']:
            self.assertFalse(module.allowed_change(path), path)
    def test_only_known_qa_documentation_paths_are_allowed(self):
        for path in ['scripts/native/android-smoke.py','tests/native/test_apk_retest.py','docs/ADR.md','ci/android-retest.json']:
            self.assertTrue(module.allowed_change(path), path)
    def test_spec_requires_immutable_source_and_observed_binary_hash(self):
        valid={'runId':12,'sourceCommit':'a'*40,'apkSha256':'b'*64}
        self.assertEqual(module.validate_spec(valid),valid)
        for patch in [{'runId':True},{'runId':-1},{'sourceCommit':'main'},{'apkSha256':'unchecked'}]:
            with self.assertRaises(ValueError):module.validate_spec({**valid,**patch})
if __name__=='__main__':unittest.main()
