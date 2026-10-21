import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import time
import urllib.request

root = Path(sys.argv[1]).resolve()
service = sys.argv[2]
assert (str(root),service) in (('/home/pi/mercury-v3','mercury-v3'),('/opt/mercury-v2/program','mercury-v2'))
def api(path):
    with urllib.request.urlopen('http://127.0.0.1:3001/api/'+path,timeout=8) as r:return json.load(r)
run=api('run'); board=api('controller/check')
assert run['state'] in ('idle','stopped','completed','failed') and run['holdingTemperatureC'] is None
assert board['ready'] and not board['telemetry']['lamps'] and not board['telemetry']['heaters']
assert max(board['telemetry'][k] for k in ('chamberTemperatureC','boardTemperatureC'))<55
assert not api('settings/keep-heat')['enabled']
config = Path('/home/pi/.config/mercury-v3/config.json') if service=='mercury-v2' else root/'config.json'
before = config.read_bytes()
settings=api('settings/thermal')
backup=Path('/media/flash/mercury-logs')/time.strftime('before-usb-%Y%m%dT%H%M%SZ',time.gmtime())
if not Path('/media/flash').is_mount():
    assert '--program-backup-without-usb' in sys.argv[4:]
    # Only program source/compiled files are backed up here, never history/logs.
    backup=root/'.program-backups'/time.strftime('%Y%m%dT%H%M%SZ',time.gmtime())
backup.mkdir(parents=True,exist_ok=False)
archive=Path(sys.argv[3]) if len(sys.argv)>3 else Path('/home/pi/calibration-voltage.tar.gz')
with tarfile.open(archive) as tar:
    members=tar.getmembers()
    assert all(m.isfile() and not Path(m.name).is_absolute() and '..' not in Path(m.name).parts for m in members)
    for m in members:
        dest=backup/m.name;dest.parent.mkdir(parents=True,exist_ok=True)
        if (root/m.name).exists():shutil.copy2(root/m.name,dest)
    subprocess.run(['systemctl','--user','stop',service],check=True)
    try:
        for m in members:
            destination=root/m.name
            destination.parent.mkdir(parents=True,exist_ok=True)
            destination.write_bytes(tar.extractfile(m).read())
    finally:subprocess.run(['systemctl','--user','start',service],check=True)
for _ in range(25):
    time.sleep(1)
    try:
        board=api('controller/check')
        if board.get('ready'):break
    except Exception:pass
else:raise RuntimeError('Controller not ready after restart')
assert before==config.read_bytes() and settings==api('settings/thermal')
assert api('run')['state']=='idle'
assert not board['telemetry']['lamps'] and not board['telemetry']['heaters']
print(json.dumps({'backup':str(backup),'board':board,'settings':settings}),flush=True)
