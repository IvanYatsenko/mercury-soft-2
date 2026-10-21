"""Remove only our exported acceptance copies; retain originals and all USB history."""
import json
from pathlib import Path
import sys
import time
import urllib.request

model = sys.argv[1]
host, voltage = {'M300': ('10.10.1.88', '380'), 'M400': ('10.10.1.167', '230')}[model]

def api(path, method=None):
    request = urllib.request.Request('http://' + host + ':3001/api/' + path, method=method)
    with urllib.request.urlopen(request, timeout=8) as response:
        return None if response.status == 204 else json.load(response)

assert api('config')['selected'] == {'ovenModel': model[1:], 'connectionVoltage': voltage}
assert api('run')['state'] in ('idle', 'completed', 'stopped', 'failed')
assert api('run')['holdingTemperatureC'] is None
board = api('controller/check')
assert board['ready'] and not board['telemetry']['heaters'] and not board['telemetry']['lamps']
assert not api('settings/keep-heat')['enabled']
own = {}
for export in Path('docs/experiments').glob(model.lower() + '-' + voltage + '-*2026-10-21*.json'):
    data = json.loads(export.read_text(encoding='utf-8'))
    if not isinstance(data, dict):
        continue
    profile = data.get('profile', {})
    if profile.get('id') and profile.get('name', '').startswith(('Acceptance ', '\u041f\u0440\u0438\u0451\u043c\u043a\u0430 \u0434\u0432\u0435\u0440\u044c/\u043f\u0430\u0443\u0437\u0430/\u0430\u0432\u0430\u0440\u0438\u044f ')):
        own[profile['id']] = profile
before = api('profiles')
history_ids = sorted(r['id'] for r in api('history'))
remove = []
for profile in before['profiles']:
    saved = own.get(profile['id'])
    if saved and profile['id'] != before['selectedId']:
        # A renamed/edited copy may have been retained intentionally by the user.
        if any(profile.get(k) != saved.get(k) for k in ('name', 'mode', 'board', 'repeat', 'points')):
            continue
        remove.append(profile)
backup = Path('docs/experiments/' + model.lower() + '-' + voltage + '-removed-test-profiles-2026-10-21.json')
if backup.exists():
    backup = backup.with_name(backup.stem + '-' + str(time.time_ns()) + '.json')
backup.write_text(json.dumps({'removed': remove, 'selectedId': before['selectedId']}, ensure_ascii=False, indent=2), encoding='utf-8')
for profile in remove:
    api('profiles/' + profile['id'], 'DELETE')
after = api('profiles')
assert before['selectedId'] == after['selectedId']
assert [p for p in before['profiles'] if p not in remove] == after['profiles']
assert sorted(r['id'] for r in api('history')) == history_ids
print(json.dumps({'model': model, 'removedTestCopies': len(remove),
                  'remainingProfiles': len(after['profiles']), 'usbHistoryPreserved': True}))
