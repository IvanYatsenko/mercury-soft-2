"""Validate the universal release on a PC without contacting an oven."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import posixpath
import tarfile

root = Path(__file__).resolve().parent.parent
output = root / 'release/publish'
manifest = json.loads((output / 'manifest.json').read_text(encoding='utf-8'))
version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
assert manifest['version'] == version
assert manifest['archive'] == version + '_linux-arm64-unpacked.tar.gz'
archive = output / manifest['archive']
sha, md5 = hashlib.sha256(), hashlib.md5()
with archive.open('rb') as stream:
    while chunk := stream.read(1024 * 1024):
        sha.update(chunk)
        md5.update(chunk)
assert manifest['sha256'] == sha.hexdigest()
assert (output / 'version').read_text().strip() == version + ' ' + md5.hexdigest()
assert (output / 'SHA256SUMS').read_text().strip() == sha.hexdigest() + '  ' + archive.name

expected = {}
for name in ('apps/server/dist', 'apps/web/dist', 'apps/panel/dist',
             'packages/shared/dist', 'packages/shared/ovens'):
    for path in (root / name).rglob('*'):
        if path.is_file():
            expected['mercury-v2/program/' + path.relative_to(root).as_posix()] = path.read_bytes()
for name in ('package.json', 'apps/server/package.json', 'apps/panel/package.json', 'packages/shared/package.json'):
    expected['mercury-v2/program/' + name] = (root / name).read_bytes()
expected['mercury-v2/program/scripts/raspberry-poweroff.sh'] = (
    root / 'deploy/legacy/raspberry-poweroff.sh').read_bytes().replace(b'\r\n', b'\n')

seen = set()
verified = set()
arm64 = []
with tarfile.open(archive, 'r|gz') as tar:
    for member in tar:
        path = PurePosixPath(member.name)
        assert path.parts and path.parts[0] == 'mercury-v2'
        assert not path.is_absolute() and '..' not in path.parts
        assert member.name not in seen, 'Duplicate archive member: ' + member.name
        seen.add(member.name)
        assert member.isfile() or member.isdir() or member.issym() or member.islnk()
        if member.issym() or member.islnk():
            assert not posixpath.isabs(member.linkname)
            target = posixpath.normpath(posixpath.join(posixpath.dirname(member.name), member.linkname)
                if member.issym() else member.linkname)
            assert target.startswith('mercury-v2/'), target
        relative = str(path.relative_to('mercury-v2'))
        assert relative not in ('program/config.json', 'program/data', 'program/.ssh')
        assert not relative.startswith(('program/data/', 'program/.ssh/', 'program/.test-tmp/'))
        if member.name in expected:
            assert member.isfile()
            assert tar.extractfile(member).read() == expected[member.name], member.name
            verified.add(member.name)
        if member.isfile() and (member.name == 'mercury-v2/runtime/bin/node'
                               or member.name.endswith('/electron/dist/electron')):
            header = tar.extractfile(member).read(20)
            assert header[:6] == b'\x7fELF\x02\x01' and int.from_bytes(header[18:20], 'little') == 183
            assert member.mode & 0o111
            arm64.append(member.name)
        if member.name == 'mercury-v2/program/.env':
            env = tar.extractfile(member).read().decode()
            assert 'MERCURY_CONTROLLER_MODE=hardware\n' in env
            assert 'MERCURY_HARDWARE_MAX_TEMPERATURE_C=280\n' in env
            assert 'MERCURY_LOG_USB_MOUNT=/media/flash\n' in env
            assert 'OVEN_MODEL' not in env and 'CONNECTION_VOLTAGE' not in env
assert verified == set(expected), sorted(set(expected) - verified)
assert len(arm64) == 2, arm64
assert 'mercury-v2/program/.env' in seen
assert 'mercury-v2/program/release/install-update.py' in seen
assert 'mercury-v2/mercury-soft-2' in seen
report = {'version': version, 'archive': archive.name, 'bytes': archive.stat().st_size,
          'sha256': sha.hexdigest(), 'verifiedProgramFiles': len(verified),
          'runtime': 'Node and Electron ARM64', 'deviceDataIncluded': False,
          'archivePathsAndLinks': 'OK', 'status': 'PASS'}
(root / 'release' / ('verification-' + version + '.json')).write_text(
    json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report))
