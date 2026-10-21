"""Explicitly authorized USB formatting; run as pi, with sudo for device operations."""
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import subprocess
import sys
import time
import urllib.request

serial, volume_id, model, voltage, consent = sys.argv[1:]
assert consent == '--format-authorized-usb'
assert re.fullmatch(r'[0-9A-F]{8}', volume_id)
device, mount = '/dev/sda1', Path('/media/flash')
service = 'mercury-v2'


def command(*args):
    return subprocess.check_output(args, text=True, timeout=30).strip()


def api(path):
    with urllib.request.urlopen('http://127.0.0.1:3001/api/' + path, timeout=8) as response:
        return json.load(response)


def verify_device():
    devices = json.loads(command('lsblk', '-J', '-b', '-o',
        'NAME,PATH,TYPE,SIZE,TRAN,RM,SERIAL,FSTYPE,MOUNTPOINTS'))['blockdevices']
    disk = next(d for d in devices if d['path'] == '/dev/sda')
    assert disk['tran'] == 'usb' and disk['rm'] and disk['serial'] == serial
    assert disk['size'] == 31457280000
    assert len(disk.get('children', [])) == 1
    part = disk['children'][0]
    assert part['path'] == device and part['type'] == 'part'
    assert part['size'] == 31456231424
    assert all(p in (None, str(mount)) for p in part.get('mountpoints', []))
    assert command('findmnt', '-n', '-o', 'SOURCE', '/') == '/dev/mmcblk0p2'
    assert Path(device).resolve() == Path(device)
    return part


assert api('software-update')['currentVersion'] == '3.0.1'
assert api('config')['selected'] == {'ovenModel': model, 'connectionVoltage': voltage}
run, board = api('run'), api('controller/check')
assert run['state'] in ('idle', 'completed', 'stopped') and run['holdingTemperatureC'] is None
assert not api('settings/keep-heat')['enabled']
assert board['ready'] and board['telemetry']['lamps'] is False and board['telemetry']['heaters'] is False
assert max(board['telemetry'][k] for k in ('chamberTemperatureC', 'boardTemperatureC')) < 50
part = verify_device()
assert part['fstype'] == 'vfat' and part['mountpoints'] == [str(mount)]
profiles = api('profiles')
config_path = Path('/home/pi/.config/mercury-v3/config.json')
config_before = config_path.read_bytes()
mkfs = shutil.which('mkfs.vfat', path='/usr/sbin:/sbin:/usr/bin:/bin')
fsck = shutil.which('fsck.vfat', path='/usr/sbin:/sbin:/usr/bin:/bin')
assert mkfs and fsck, 'dosfstools is required; no service was stopped'
fstab = Path('/etc/fstab')
original = fstab.read_text()
assert not any(len(line.split()) > 1 and line.split()[1] == str(mount)
               for line in original.splitlines() if line.strip() and not line.lstrip().startswith('#'))
command('sudo', '-n', 'true')
subprocess.run(['systemctl', '--user', 'stop', service], check=True, timeout=20)
try:
    subprocess.run(['sudo', '-n', 'umount', str(mount)], check=True, timeout=15)
    verify_device()
    assert not subprocess.run(['findmnt', '-rn', '-S', device], capture_output=True).stdout
    subprocess.run(['sudo', '-n', mkfs, '-F', '32', '-i', volume_id,
                    '-n', 'MERCURYLOGS', device], check=True, timeout=45)
    subprocess.run(['sudo', '-n', fsck, '-n', device], check=True, timeout=30)
    # Preserve volume ID so existing references continue to identify the same USB.
    uuid = command('sudo', '-n', 'blkid', '-s', 'UUID', '-o', 'value', device)
    assert uuid.replace('-', '').upper() == volume_id
    account = pwd.getpwnam('pi')
    options = f'defaults,nofail,noatime,uid={account.pw_uid},gid={account.pw_gid},umask=0077,x-systemd.device-timeout=5s'
    updated = original.rstrip() + f'\nUUID={uuid} {mount} vfat {options} 0 0\n'
    subprocess.run(['sudo', '-n', 'cp', '-n', '/etc/fstab', '/etc/fstab.mercury-usb-backup'], check=True)
    subprocess.run(['sudo', '-n', 'tee', '/etc/fstab'], input=updated, text=True,
                   stdout=subprocess.DEVNULL, check=True)
    subprocess.run(['sudo', '-n', 'systemctl', 'daemon-reload'], check=True, timeout=15)
    subprocess.run(['sudo', '-n', 'mount', str(mount)], check=True, timeout=15)
    assert command('findmnt', '-n', '-o', 'SOURCE', '--mountpoint', str(mount)) == device
    probe = mount / 'mercury-write-check.tmp'
    with probe.open('xb') as stream:
        stream.write(b'Mercury USB write verification\n')
        stream.flush()
        os.fsync(stream.fileno())
    assert probe.read_bytes() == b'Mercury USB write verification\n'
    probe.unlink()
finally:
    subprocess.run(['systemctl', '--user', 'start', service], check=True, timeout=20)
for _ in range(40):
    time.sleep(1)
    try:
        board = api('controller/check')
        if board.get('ready'):
            break
    except Exception:
        pass
else:
    raise RuntimeError('Controller did not become ready after USB preparation')
assert profiles == api('profiles') and config_before == config_path.read_bytes()
assert api('run')['state'] == 'idle' and api('run')['holdingTemperatureC'] is None
assert board['telemetry']['lamps'] is False and board['telemetry']['heaters'] is False
assert api('history') == []
history = mount / 'mercury-logs/history.sqlite'
assert history.is_file() and history.stat().st_dev == mount.stat().st_dev
print(json.dumps({'formatted': device, 'serial': serial, 'uuid': uuid,
    'mount': str(mount), 'historyCreatedOnUsb': True, 'profilesPreserved': True,
    'configPreserved': True, 'ready': True, 'heatOff': True}), flush=True)
