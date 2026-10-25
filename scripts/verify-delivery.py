"""Validate release archives without extracting or changing user data."""
import hashlib
import json
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parent.parent
delivery = root / 'delivery'
results = []
for kind in ('Windows', 'Source'):
    artifact = delivery / f'WKU-MatchDesk-{kind}-v1.0.0.zip'
    with zipfile.ZipFile(artifact) as archive:
        names = [name.replace('\\', '/') for name in archive.namelist()]
        assert not any('/test-output/' in '/' + n or '/node_modules/' in '/' + n for n in names), names
        assert not any(n.rsplit('/', 1)[-1] in ('state.json', 'session.json', '.env') for n in names), names
        assert archive.testzip() is None
        if kind == 'Windows':
            exe = next(n for n in names if n.endswith('/WKU-MatchDesk.exe'))
            assert archive.read(exe)[:2] == b'MZ'
            for suffix in ('ui/index.html', 'ui/app.js', 'ui/core/tournament.js', 'README.md', 'docs/VALIDATION.md'):
                assert any(n.endswith('/' + suffix) for n in names), suffix
        else:
            for suffix in ('native/Program.cs', 'ui/app.js', 'scripts/build.ps1', 'tests/domain.test.mjs', 'package-lock.json'):
                assert any(n.endswith(suffix) for n in names), suffix
    results.append({'file': artifact.name, 'bytes': artifact.stat().st_size, 'sha256': hashlib.sha256(artifact.read_bytes()).hexdigest(), 'entries': len(names)})
(delivery / 'manifest.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
print(json.dumps(results, indent=2))
