"""Approved paired hot entry up to 150 C. Never retries a heat start."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import time
import urllib.request

OVENS = {'M400-230': ('10.10.1.167', '400', '230'),
         'M300-380': ('10.10.1.88', '300', '380')}

def api(label, path, data=None, method=None):
    req = urllib.request.Request('http://' + OVENS[label][0] + ':3001/api/' + path,
        data=None if data is None else json.dumps(data).encode(),
        headers={'Content-Type': 'application/json'}, method=method)
    return json.load(urllib.request.urlopen(req, timeout=8))

def checked(label, holding=False):
    run, board = api(label, 'run'), api(label, 'controller/check')
    assert board['ready'] and not board['doorOpen']
    assert run['holdingTemperatureC'] == (100 if holding else None)
    assert max(board['telemetry'][k] for k in ('chamberTemperatureC', 'boardTemperatureC')) < (110 if holding else 105)
    return board['telemetry']['chamberTemperatureC']

try:
    for label, (_, model, voltage) in OVENS.items():
        assert api(label, 'software-update')['currentVersion'] == '3.0.3'
        assert api(label, 'config')['selected'] == {'ovenModel': model, 'connectionVoltage': voltage}
        checked(label)
        assert api(label, 'run')['state'] in ('idle', 'completed', 'stopped')
        assert not api(label, 'settings/keep-heat')['enabled']
        assert isinstance(api(label, 'history'), list)
    for label in OVENS:
        api(label, 'settings/keep-heat', {'enabled': True}, 'PUT')
    deadline = time.monotonic() + 300
    while time.monotonic() < deadline:
        temperatures = {label: checked(label, True) for label in OVENS}
        print(json.dumps({'warmup': temperatures}), flush=True)
        if min(temperatures.values()) >= 99:
            break
        time.sleep(5)
    else:
        raise RuntimeError('Warm-up timeout')
    for label in OVENS:
        api(label, 'settings/keep-heat', {'enabled': False}, 'PUT')
    # Reproduce an idle oven with cold actuators rather than an uninterrupted ramp.
    for _ in range(9):
        for label in OVENS:
            checked(label)
        time.sleep(5)
    profiles = {}
    for label in OVENS:
        board = api(label, 'controller/check')
        assert board['ready'] and not board['doorOpen']
        assert not board['telemetry']['lamps'] and not board['telemetry']['heaters']
        assert 50 < checked(label) < 145
        profiles[label] = api(label, 'profiles', {
            'name': 'Acceptance warm start ' + label + ' ' + str(time.time_ns()),
            'mode': 'manual', 'board': False, 'repeat': 1,
            'points': [{'second': 0, 'temperature': 50},
                       {'second': 125, 'temperature': 150},
                       {'second': 30, 'temperature': 150}],
            'shelves': [{'second': 0, 'temperature': 50},
                        {'second': 30, 'temperature': 150},
                        {'second': 0, 'temperature': 150}]})
    ids, errors = {}, []
    with ThreadPoolExecutor(max_workers=2) as pool:
        jobs = {label: pool.submit(api, label, 'run/start', {'profileId': p['id']})
                for label, p in profiles.items()}
        for label, job in jobs.items():
            try:
                ids[label] = job.result()['id']
            except Exception as error:
                errors.append(error)
    if errors:
        raise errors[0]
    state = {'ids': ids, 'targetC': 150, 'kind': 'warm-entry',
             'date': datetime.now(timezone(timedelta(hours=7))).date().isoformat(),
             'observationLimitC': 155}
    Path('.test-tmp/remaining-calibration.json').write_text(json.dumps(state), encoding='utf-8')
    for label, run_id in ids.items():
        assert 'samples' in api(label, 'history/' + run_id)
    print(json.dumps({'started': state}), flush=True)
except Exception:
    for label in OVENS:
        for path, data, method in [('settings/keep-heat', {'enabled': False}, 'PUT'),
                                   ('run/stop', {}, 'POST')]:
            try:
                api(label, path, data, method)
            except Exception:
                pass
    raise
