"""Retain the tested upper-ramp copy without altering the original profile."""
import json
from pathlib import Path
import urllib.request

base = 'http://10.10.1.167:3001/api/'
def api(path, data=None, method=None):
    req = urllib.request.Request(base + path,
        data=None if data is None else json.dumps(data).encode(),
        headers={'Content-Type': 'application/json'}, method=method)
    return json.load(urllib.request.urlopen(req, timeout=8))

assert api('config')['selected'] == {'ovenModel': '400', 'connectionVoltage': '230'}
assert api('run')['state'] == 'completed'
run_id = '09385618-1e29-4d98-8801-081887a2f662'
assert api('run')['id'] == run_id
history = api('history/' + run_id)
profiles = api('profiles')
original = next(p for p in profiles['profiles'] if p['name'] == '\u0411\u0435\u0441\u0441\u0432\u0438\u043d\u0446\u043e\u0432\u0430\u044f \u043f\u0430\u0441\u0442\u0430')
copy = next(p for p in profiles['profiles'] if p['id'] == history['profile']['id'])
assert copy['points'][3]['second'] == 100 and original['points'][3]['second'] == 75
retained = api('profiles/' + copy['id'], {**copy,
    'name': '\u0411\u0435\u0441\u0441\u0432\u0438\u043d\u0446\u043e\u0432\u0430\u044f \u043f\u0430\u0441\u0442\u0430 \u2014 \u041c400/230 \u0412'}, 'PUT')
assert retained['points'] == copy['points']
assert next(p for p in api('profiles')['profiles'] if p['id'] == original['id']) == original
Path('docs/experiments/m400-230-retained-profile-2026-10-21.json').write_text(
    json.dumps({'runId': run_id, 'retained': retained, 'originalUnchanged': True,
                'selectionUnchanged': api('profiles')['selectedId'] == profiles['selectedId']},
               ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'retainedId': retained['id'], 'originalUnchanged': True}))
