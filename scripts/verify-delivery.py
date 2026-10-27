"""Verify the current allowlisted public program package without touching user data."""
from pathlib import Path
import json,hashlib,zipfile,importlib.util
repo=Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('public_package',repo/'scripts/package-public.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
manifest=json.loads((repo/'delivery/manifest.json').read_text('utf-8-sig'))
if not isinstance(manifest,dict) or not manifest.get('privacyChecked'):raise ValueError('Build a privacy-checked public package first.')
artifact=repo/'delivery'/manifest['file']
if artifact.resolve().parent!=(repo/'delivery').resolve():raise ValueError('Unexpected package path')
assert artifact.stat().st_size==manifest['bytes'] and hashlib.sha256(artifact.read_bytes()).hexdigest()==manifest['sha256']
with zipfile.ZipFile(artifact) as z:
    assert z.testzip() is None
    payloads={n:z.read(n) for n in z.namelist()};module.audit_payloads(payloads,module.private_tokens(repo.parent/'data/state.json'))
    top=next(iter(payloads)).split('/')[0]
    assert payloads[top+'/program/WKU-MatchDesk.exe'][:2]==b'MZ'
    for file in (repo/'ui').rglob('*'):
        if file.is_file():assert payloads[top+'/program/ui/'+file.relative_to(repo/'ui').as_posix()]==file.read_bytes()
    expected={top+'/program/WKU-MatchDesk.exe',top+'/开始记录比赛.cmd',top+'/先看这里-使用说明.txt',top+'/本次更新.txt'}|{top+'/program/ui/'+file.relative_to(repo/'ui').as_posix() for file in (repo/'ui').rglob('*') if file.is_file()}
    assert set(payloads)==expected,'Unexpected package entry'
print(json.dumps({**manifest,'allowlistVerified':True,'sourceUiMatchesPackage':True},ensure_ascii=True))
