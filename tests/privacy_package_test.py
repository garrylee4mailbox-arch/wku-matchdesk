import unittest,importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location('public_package',Path(__file__).resolve().parent.parent/'scripts/package-public.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class PublicPackagePrivacy(unittest.TestCase):
    def test_blocks_data_and_source_paths(self):
        for path in ['App/data/state.json','App/program/session.json','App/.git/config','App/docs/screenshot.png','App/tests/fixture.js','../state.json']:
            with self.subTest(path=path),self.assertRaises(ValueError):module.audit_payloads({path:b'fixture'})
    def test_rejects_private_tokens_in_text_and_binary(self):
        for encoding in ['utf-8','utf-16le']:
            with self.subTest(encoding=encoding),self.assertRaises(ValueError):module.audit_payloads({'App/program/ui/demo.js':'PRIVATE-ROSTER-NAME'.encode(encoding)},['PRIVATE-ROSTER-NAME'])
    def test_rejects_credentials(self):
        with self.assertRaises(ValueError):module.audit_payloads({'App/program/ui/config.js':b'ghp_'+b'x'*35})
        with self.assertRaises(ValueError):module.audit_payloads({'App/program/key.pem':b'fixture'})
    def test_accepts_program_only_generic_payloads(self):
        module.audit_payloads({'App/program/App.exe':b'MZprogram','App/program/ui/demo.js':'虚构选手01'.encode(),'App/使用说明.txt':b'Instructions'},['PRIVATE-ROSTER-NAME'])
if __name__=='__main__':unittest.main()
