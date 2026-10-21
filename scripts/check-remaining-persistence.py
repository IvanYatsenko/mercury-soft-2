"""Record and compare configuration/profile/USB identities across a physical restart."""
import hashlib
import json
from pathlib import Path
import sys
import urllib.request

model, action = sys.argv[1:3]
host, voltage = {'M300': ('10.10.1.88', '380'), 'M400': ('10.10.1.167', '230')}[model]

def api(path):
    return json.load(urllib.request.urlopen('http://' + host + ':3001/api/' + path, timeout=8))

selected = api('config')['selected']
assert selected == {'ovenModel': model[1:], 'connectionVoltage': voltage}
profiles = api('profiles')
profile_hash = hashlib.sha256(json.dumps(profiles, sort_keys=True, ensure_ascii=True).encode()).hexdigest()
state = {'selected': selected, 'profilesSha256': profile_hash,
         'profileCount': len(profiles['profiles']), 'thermal': api('settings/thermal'),
         'keepHeat': api('settings/keep-heat'),
         'historyIds': sorted(row['id'] for row in api('history'))}
baseline = Path('.test-tmp/' + model.lower() + '-' + voltage + '-restart-baseline.json')
if action == 'before':
    assert not state['keepHeat']['enabled']
    baseline.write_text(json.dumps(state, indent=2), encoding='utf-8')
elif action == 'after':
    previous = json.loads(baseline.read_text(encoding='utf-8'))
    assert state == previous, 'Configuration, profiles or USB history changed across restart'
    board, run = api('controller/check'), api('run')
    assert board['ready'] and not board['telemetry']['lamps'] and not board['telemetry']['heaters']
    assert run['state'] == 'idle' and run['holdingTemperatureC'] is None
    result = {'model': model, 'host': host, 'preserved': state, 'board': board, 'run': run}
    Path('docs/experiments/' + model.lower() + '-' + voltage + '-restart-2026-10-21.json').write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
else:
    raise ValueError(action)
print(json.dumps({'model': model, 'action': action, 'profiles': state['profileCount'],
                  'usbRuns': len(state['historyIds']), 'status': 'PASS'}))
