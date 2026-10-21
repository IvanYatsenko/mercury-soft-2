"""Run on Raspberry after uploading usb-logs-update.zip; never starts heating."""
import datetime
import json
import shutil
import sqlite3
import subprocess
import time
import urllib.request
import zipfile
from pathlib import Path

root = Path('/home/pi/mercury-v3')
usb = Path('/media/flash')
base = 'http://127.0.0.1:3001/api/'

def api(path):
    with urllib.request.urlopen(base + path, timeout=8) as response:
        return json.load(response)

run = api('run')
board = api('controller/check')
assert run['state'] in ('idle', 'stopped', 'completed') and run['holdingTemperatureC'] is None
assert board['ready'] and max(board['telemetry'][key] for key in ('chamberTemperatureC', 'boardTemperatureC')) < 50
assert not board['telemetry']['lamps'] and not board['telemetry']['heaters']
before_profiles = api('profiles')
before_settings = api('settings/thermal')
assert subprocess.check_output(['findmnt', '-n', '-o', 'TARGET', '--target', str(usb)], text=True).strip() == str(usb)
device = subprocess.check_output(['findmnt', '-n', '-o', 'MAJ:MIN', '--target', str(usb)], text=True).strip()
assert any(part.startswith('usb') for part in Path('/sys/dev/block', device).resolve().parts)
logs = usb / 'mercury-logs'
logs.mkdir(exist_ok=True)
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
backup = logs / ('before-usb-' + stamp)
backup.mkdir()
archive = Path('/home/pi/usb-logs-update.zip')
with zipfile.ZipFile(archive) as z:
    names = z.namelist()
    assert all(name.startswith(('apps/server/src/', 'apps/server/dist/')) and '..' not in Path(name).parts for name in names)
    for name in names:
        destination = backup / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        if (root / name).exists():
            shutil.copy2(root / name, destination)
subprocess.run(['systemctl', '--user', 'stop', 'mercury-v3'], check=True)
try:
    old_path = root / 'data/mercury.sqlite'
    original = sqlite3.connect(old_path)
    saved = sqlite3.connect(backup / 'mercury.sqlite')
    original.backup(saved)
    saved.close()
    old_tables = {row[0] for row in original.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    target = sqlite3.connect(logs / 'history.sqlite')
    assert target.execute('PRAGMA quick_check').fetchone()[0] == 'ok'
    counts = {}
    for table in ('runs', 'samples', 'events'):
        if table not in old_tables:
            continue
        sql = original.execute('SELECT sql FROM sqlite_master WHERE name=?', (table,)).fetchone()[0]
        target.execute(sql.replace('CREATE TABLE ', 'CREATE TABLE IF NOT EXISTS ', 1))
        rows = original.execute('SELECT * FROM ' + table).fetchall()
        if rows:
            target.executemany('INSERT OR IGNORE INTO ' + table + ' VALUES(' + ','.join('?' for _ in rows[0]) + ')', rows)
        target.commit()
        for row in rows:
            keys = ('id',) if table != 'samples' else ('run_id', 'second')
            query = 'SELECT * FROM ' + table + ' WHERE ' + ' AND '.join(key + '=?' for key in keys)
            assert target.execute(query, row[:len(keys)]).fetchone() == row
        counts[table] = len(rows)
    # Reclaim completed history pages on each cleanup commit without copying
    # the entire database while the oven is running.
    if target.execute('PRAGMA auto_vacuum').fetchone()[0] != 1:
        target.execute('PRAGMA auto_vacuum=FULL')
        target.execute('VACUUM')
    target.close()
    # The verified USB backup contains the old full database before removing local history.
    original.execute('PRAGMA foreign_keys=OFF')
    for table in ('samples', 'events', 'runs'):
        original.execute('DROP TABLE IF EXISTS ' + table)
    original.commit()
    original.execute('PRAGMA wal_checkpoint(TRUNCATE)')
    original.execute('VACUUM')
    original.close()
    with (backup / 'previous-service.log').open('w') as output:
        subprocess.run(['journalctl', '--user', '-u', 'mercury-v3', '--no-pager'], stdout=output, check=True)
    shutil.copy2(root / '.env', backup / '.env')
    env = root / '.env'
    lines = [line for line in env.read_text().splitlines() if not line.startswith('MERCURY_LOG_USB_MOUNT=')]
    env.write_text('\n'.join(lines + ['MERCURY_LOG_USB_MOUNT=/media/flash']) + '\n')
    with zipfile.ZipFile(archive) as z:
        for name in names:
            (root / name).write_bytes(z.read(name))
    dropin = Path.home() / '.config/systemd/user/mercury-v3.service.d/usb-logs.conf'
    dropin.parent.mkdir(parents=True, exist_ok=True)
    dropin.write_text('[Service]\nStandardOutput=null\nStandardError=null\n')
    subprocess.run(['systemctl', '--user', 'daemon-reload'], check=True)
finally:
    subprocess.run(['systemctl', '--user', 'start', 'mercury-v3'], check=True)

for attempt in range(25):
    time.sleep(1)
    try:
        board = api('controller/check')
        if board.get('ready'):
            break
    except Exception:
        pass
else:
    raise RuntimeError('Service did not become ready; backup at ' + str(backup))
assert api('profiles') == before_profiles
assert api('settings/thermal') == before_settings
assert api('run')['state'] == 'idle'
assert not board['telemetry']['lamps'] and not board['telemetry']['heaters']
print(json.dumps({'backup': str(backup), 'migrated': counts, 'historyCount': len(api('history')), 'board': board}))
