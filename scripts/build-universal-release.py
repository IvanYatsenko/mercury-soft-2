"""Assemble on a PC using a cached ARM64 runtime; never includes device config."""
import hashlib
import io
import json
from pathlib import Path
import tarfile

root = Path(__file__).resolve().parent.parent
output = root / 'release/publish'
output.mkdir(parents=True, exist_ok=True)
runtime = root / 'release/arm64-runtime.tar.gz'
assert runtime.is_file(), 'ARM64 runtime cache is required: release/arm64-runtime.tar.gz'
version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
archive = output / f'{version}_linux-arm64-unpacked.tar.gz'
env = '''MERCURY_CONTROLLER_MODE=hardware
MERCURY_SERIAL_PORT=/dev/serial0
MERCURY_HARDWARE_MAX_TEMPERATURE_C=280
MERCURY_API_HOST=0.0.0.0
MERCURY_API_PORT=3001
MERCURY_WEB_PORT=5173
MERCURY_PANEL_FULLSCREEN=true
MERCURY_PANEL_SOFTWARE_RENDERING=true
MERCURY_LOG_USB_MOUNT=/media/flash
MERCURY_UPDATE_URL=https://www.nsc-com.com/soft/mercury
MERCURY_CONFIG_PATH=/home/pi/.config/mercury-v3/config.json
MERCURY_DATABASE_PATH=/home/pi/.config/mercury-v3/profiles.sqlite
'''

def normalize(info):
    info.uid = info.gid = 1000
    info.uname = info.gname = 'pi'
    return info

with tarfile.open(archive, 'w:gz', compresslevel=3) as tar:
    with tarfile.open(runtime) as source:
        for info in source:
            name = info.name
            assert not Path(name).is_absolute() and '..' not in Path(name).parts
            if name == 'bin/node':
                info.name = 'mercury-v2/runtime/bin/node'
                info.mode = 0o755
            elif name == 'LICENSE':
                info.name = 'mercury-v2/runtime/LICENSE'
            elif name.startswith(('node_modules', 'apps/server/node_modules', 'apps/panel/node_modules')):
                info.name = 'mercury-v2/program/' + name
            else:
                raise ValueError('Unexpected runtime member: ' + name)
            if info.islnk():
                assert info.linkname.startswith(('node_modules/', 'apps/server/node_modules/', 'apps/panel/node_modules/'))
                info.linkname = 'mercury-v2/program/' + info.linkname
            tar.addfile(normalize(info), source.extractfile(info) if info.isfile() else None)
    for name in ('apps/server/dist', 'apps/server/package.json', 'apps/web/dist', 'apps/panel/dist', 'apps/panel/package.json',
                 'packages/shared/dist', 'packages/shared/ovens', 'packages/shared/package.json', 'package.json'):
        tar.add(root / name, arcname='mercury-v2/program/' + name, filter=normalize)
    mapping = {
        'mercury-soft-2': 'mercury-v2/mercury-soft-2',
        'launch.mjs': 'mercury-v2/program/release/launch.mjs',
        'migrate-v2.mjs': 'mercury-v2/program/release/migrate-v2.mjs',
        'install-update.py': 'mercury-v2/program/release/install-update.py',
        'raspberry-poweroff.sh': 'mercury-v2/program/scripts/raspberry-poweroff.sh',
    }
    for name, target in mapping.items():
        data = (root / 'deploy/legacy' / name).read_bytes().replace(b'\r\n', b'\n')
        info = tarfile.TarInfo(target)
        info.size = len(data)
        info.mode = 0o755 if name in ('mercury-soft-2', 'raspberry-poweroff.sh') else 0o644
        tar.addfile(normalize(info), io.BytesIO(data))
    data = env.encode()
    info = tarfile.TarInfo('mercury-v2/program/.env')
    info.size, info.mode = len(data), 0o600
    tar.addfile(normalize(info), io.BytesIO(data))
md5, sha = hashlib.md5(), hashlib.sha256()
with archive.open('rb') as stream:
    while chunk := stream.read(1024 * 1024):
        md5.update(chunk)
        sha.update(chunk)
(output / 'version').write_text(f'{version} {md5.hexdigest()}\n', encoding='ascii')
(output / 'manifest.json').write_text(json.dumps({'version': version, 'archive': archive.name, 'sha256': sha.hexdigest()}, indent=2) + '\n')
(output / 'SHA256SUMS').write_text(sha.hexdigest() + '  ' + archive.name + '\n')
print(json.dumps({'archive': str(archive), 'bytes': archive.stat().st_size, 'sha256': sha.hexdigest()}))
