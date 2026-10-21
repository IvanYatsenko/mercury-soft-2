"""Read-only comparison of the installed program against the tested program delta."""
import hashlib
import json
from pathlib import Path
import tarfile
import re
import sys

root = Path('/opt/mercury-v2/program').resolve()
assert root == Path('/opt/mercury-v2/program')
version = sys.argv[1] if len(sys.argv) > 1 else '3.0.2'
assert re.fullmatch(r'\d+\.\d+\.\d+', version)
count = 0
with tarfile.open('/home/pi/program-' + version + '.tar.gz') as archive:
    for member in archive:
        assert member.isfile() and not Path(member.name).is_absolute() and '..' not in Path(member.name).parts
        installed = (root / member.name).resolve()
        assert root in installed.parents
        expected = archive.extractfile(member).read()
        assert hashlib.sha256(installed.read_bytes()).digest() == hashlib.sha256(expected).digest(), member.name
        count += 1
assert json.loads((root / 'package.json').read_text())['version'] == version
assert count == 39
print(json.dumps({'version': version, 'matchingInstalledFiles': count, 'controllerAccessed': False, 'status': 'PASS'}))
