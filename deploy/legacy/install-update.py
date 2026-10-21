"""Detached installer for the universal /opt/mercury-v2 package."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import pwd
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.request

archive = Path(sys.argv[1]).resolve()
account = pwd.getpwnam('pi')
assert os.getuid() == 0
assert archive.parent == Path('/home/pi/.cache/mercury-update')
def record_result(phase, error=None):
    fd, temporary = tempfile.mkstemp(prefix='install-result-', dir=archive.parent)
    os.fchown(fd, account.pw_uid, account.pw_gid)
    with os.fdopen(fd, 'w') as stream:
        json.dump({'phase': phase, 'error': error}, stream)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, archive.parent / 'install-result.json')

sys.excepthook = lambda kind, error, traceback: record_result('error', str(error))
expected = Path(str(archive) + '.sha256').read_text().strip()
h = hashlib.sha256()
with archive.open('rb') as stream:
    while chunk := stream.read(1024 * 1024):
        h.update(chunk)
assert h.hexdigest() == expected

def api(path):
    with urllib.request.urlopen('http://127.0.0.1:3001/api/' + path, timeout=5) as r:
        return json.load(r)

run = api('run')
board = api('controller/check')
assert run['state'] in ('idle', 'completed', 'stopped', 'failed') and run['holdingTemperatureC'] is None
assert not board.get('telemetry', {}).get('lamps', True) and not board.get('telemetry', {}).get('heaters', True)
assert max(board['telemetry'][k] for k in ('chamberTemperatureC', 'boardTemperatureC')) < 50
target = Path('/opt/mercury-v2')
stage = Path(tempfile.mkdtemp(prefix='.mercury-update-', dir='/opt'))
with tarfile.open(archive) as tar:
    members = tar.getmembers()
    for m in members:
        path = PurePosixPath(m.name)
        assert path.parts and path.parts[0] == 'mercury-v2' and not path.is_absolute() and '..' not in path.parts
        assert m.isfile() or m.isdir() or m.issym() or m.islnk()
        if m.issym() or m.islnk():
            link = PurePosixPath(m.linkname)
            assert not link.is_absolute()
            resolved = (stage / m.name).parent.joinpath(m.linkname).resolve() if m.issym() else (stage / m.linkname).resolve()
            assert resolved.is_relative_to(stage / 'mercury-v2')
    for m in members:
        m.uid, m.gid = account.pw_uid, account.pw_gid
        m.uname = m.gname = 'pi'
    # All paths and links were checked before extraction.
    tar.extractall(stage, members=members)
assert (stage / 'mercury-v2/mercury-soft-2').is_file()
command = ['runuser', '-u', 'pi', '--', 'env', 'XDG_RUNTIME_DIR=/run/user/' + str(account.pw_uid), 'systemctl', '--user']
subprocess.run(command + ['stop', 'mercury-v2'], check=True)
backup = Path('/opt/mercury-v2-before-' + str(int(time.time())))
target.rename(backup)
(stage / 'mercury-v2').rename(target)
try:
    subprocess.run(command + ['start', 'mercury-v2'], check=True)
    for _ in range(30):
        time.sleep(1)
        try:
            if api('health'):
                break
        except Exception:
            pass
    else:
        raise RuntimeError('New API did not start')
except Exception:
    subprocess.run(command + ['stop', 'mercury-v2'], check=True)
    target.rename(stage / 'failed-package')
    backup.rename(target)
    subprocess.run(command + ['start', 'mercury-v2'], check=True)
    raise RuntimeError('Update failed; previous program restored')
record_result('idle')
