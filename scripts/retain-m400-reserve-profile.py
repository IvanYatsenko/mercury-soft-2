"""Retain only the completed, USB-backed 110-second M400 acceptance copy."""
import json
from pathlib import Path
import urllib.request

BASE = 'http://10.10.1.167:3001/api/'
RUN_ID = 'e247a5fe-c57e-442b-b8b3-25aeac2851ba'

def api(path, data=None, method=None):
    request = urllib.request.Request(BASE + path, data=None if data is None else json.dumps(data).encode(),
        headers={'Content-Type': 'application/json'}, method=method)
    return json.load(urllib.request.urlopen(request, timeout=8))

assert api('config')['selected'] == {'ovenModel': '400', 'connectionVoltage': '230'}
run, board = api('run'), api('controller/check')
assert run['id'] == RUN_ID and run['state'] == 'completed' and run['error'] is None
assert board['ready'] and not board['telemetry']['lamps'] and not board['telemetry']['heaters']
assert run['holdingTemperatureC'] is None and not api('settings/keep-heat')['enabled']
history = api('history/' + RUN_ID)
assert history['samples'] and max(abs(s['chamberTemperatureC'] - s['targetTemperatureC']) for s in history['samples']) <= 4
before = api('profiles')
copy = next(p for p in before['profiles'] if p['id'] == history['profile']['id'])
assert copy['name'].startswith('Acceptance ') and copy['points'][3]['second'] == 110
name = 'Бессвинцовая паста — М400/230 В (110 с)'
assert not any(p['name'] == name for p in before['profiles'])
retained = api('profiles/' + copy['id'], {**copy, 'name': name}, 'PUT')
after = api('profiles')
assert after['selectedId'] == before['selectedId']
assert [p for p in after['profiles'] if p['id'] != copy['id']] == [p for p in before['profiles'] if p['id'] != copy['id']]
assert retained['points'] == copy['points']
report = {'runId': RUN_ID, 'retained': retained, 'originalProfilesUnchanged': True, 'selectionUnchanged': True}
Path('docs/experiments/m400-230-retained-reserve-profile-2026-10-21.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'retainedId': retained['id'], 'originalProfilesUnchanged': True, 'selectionUnchanged': True}))
