"""Explicit low-temperature acceptance actions; never retries a heat start."""
import json
from pathlib import Path
import sys
import time
import urllib.request

HOSTS = {'M300': '10.10.1.88', 'M400': '10.10.1.167'}
EXPECTED = {'M300': {'ovenModel': '300', 'connectionVoltage': '380'},
            'M400': {'ovenModel': '400', 'connectionVoltage': '230'}}
model, action = sys.argv[1:3]


def api(path, data=None):
    req = urllib.request.Request('http://' + HOSTS[model] + ':3001/api/' + path,
        data=None if data is None else json.dumps(data).encode(),
        headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=10) as response:
        return json.load(response)


def snapshot():
    return {'run': api('run'), 'board': api('controller/check')}


assert api('config')['selected'] == EXPECTED[model], 'Oven identity changed; inspect before continuing'

if action == 'start':
    state = snapshot()
    assert state['run']['state'] in ('idle', 'completed', 'stopped')
    assert state['run']['holdingTemperatureC'] is None
    board = state['board']
    assert board['ready'] and not board['doorOpen']
    assert not board['telemetry']['heaters'] and not board['telemetry']['lamps']
    assert max(board['telemetry'][k] for k in ('chamberTemperatureC', 'boardTemperatureC')) < 65
    assert not api('settings/keep-heat')['enabled']
    profile = api('profiles', {'name': 'Приёмка дверь/пауза/авария ' + str(time.time_ns()),
        'mode': 'manual', 'board': False, 'repeat': 1,
        'points': [{'second': 0, 'temperature': 50},
                   {'second': 60, 'temperature': 65},
                   {'second': 600, 'temperature': 65}],
        'shelves': [{'second': 0, 'temperature': 50},
                    {'second': 600, 'temperature': 65},
                    {'second': 0, 'temperature': 50}]})
    print(json.dumps(api('run/start', {'profileId': profile['id']})), flush=True)
elif action == 'pause-check':
    paused = api('run/pause', {})
    assert paused['paused']
    time.sleep(3)
    state = snapshot()
    assert state['run']['elapsedSeconds'] == paused['elapsedSeconds']
    assert not state['board']['telemetry']['heaters'] and not state['board']['telemetry']['lamps']
    print(json.dumps({'paused': state, 'resumed': api('run/resume', {})}), flush=True)
elif action == 'stop':
    print(json.dumps(api('run/stop', {})), flush=True)
elif action == 'emergency-heat':
    state = snapshot()
    assert state['run']['state'] in ('idle', 'completed', 'stopped')
    assert state['run']['holdingTemperatureC'] is None
    board = state['board']
    assert board['ready'] and not board['doorOpen']
    assert not board['telemetry']['heaters'] and not board['telemetry']['lamps']
    assert max(board['telemetry'][k] for k in ('chamberTemperatureC', 'boardTemperatureC')) < 65
    assert not api('settings/keep-heat')['enabled']
    profile = api('profiles', {'name': 'Приёмка дверь/пауза/авария 100 C ' + str(time.time_ns()),
        'mode': 'manual', 'board': False, 'repeat': 1,
        'points': [{'second': 0, 'temperature': 50},
                   {'second': 60, 'temperature': 100},
                   {'second': 300, 'temperature': 100}],
        'shelves': [{'second': 0, 'temperature': 50},
                    {'second': 300, 'temperature': 100},
                    {'second': 0, 'temperature': 100}]})
    print(json.dumps(api('run/start', {'profileId': profile['id']})), flush=True)
elif action == 'hold-observe':
    observations = []
    deadline = time.monotonic() + 40
    while time.monotonic() < deadline:
        state = snapshot()
        observations.append(state)
        assert state['board']['ready']
        assert state['run']['holdingTemperatureC'] == 100
        time.sleep(2)
    Path('docs/experiments/' + model.lower() + '-' + EXPECTED[model]['connectionVoltage'] + '-hold-2026-10-21.json').write_text(
        json.dumps(observations, ensure_ascii=False, indent=2), encoding='utf-8')
    temperatures = [s['board']['telemetry']['chamberTemperatureC'] for s in observations]
    print(json.dumps({'samples': len(observations), 'minC': min(temperatures),
        'maxC': max(temperatures), 'lastC': temperatures[-1]}), flush=True)
elif action == 'hold-warm-observe':
    deadline = time.monotonic() + 300
    while time.monotonic() < deadline:
        state = snapshot()
        assert state['board']['ready'] and state['run']['holdingTemperatureC'] == 100
        temperature = state['board']['telemetry']['chamberTemperatureC']
        print(json.dumps({'model': model, 'holdingC': 100, 'temperatureC': temperature}), flush=True)
        if temperature >= 99:
            break
        time.sleep(5)
    else:
        raise RuntimeError('Holding warm-up observation timed out; inspect oven')
elif action == 'snapshot':
    state = snapshot()
    Path('.test-tmp/acceptance-' + model + '-' + str(time.time_ns()) + '.json').write_text(
        json.dumps(state, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(state), flush=True)
else:
    raise ValueError(action)
