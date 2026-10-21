"""Explicitly start or observe the approved paired shelf trial; never auto-restart."""
import json
from pathlib import Path
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

HOSTS = {'M300': '10.10.1.167', 'M400': '10.10.1.88'}
STATE = Path('.test-tmp/shelf-parallel-run.json')

def api(model, path, data=None):
    request = urllib.request.Request(
        f'http://{HOSTS[model]}:3001/api/{path}',
        data=None if data is None else json.dumps(data).encode(),
        headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=12) as response:
        return json.load(response)

def start():
    profiles = {}
    for model in HOSTS:
        board, run = api(model, 'controller/check'), api(model, 'run')
        assert api(model, 'config')['selected'] == {
            'ovenModel': model[1:], 'connectionVoltage': '230' if model == 'M300' else '380'}
        assert board['ready'] and not board['doorOpen']
        assert not board['telemetry']['heaters'] and not board['telemetry']['lamps']
        assert max(board['telemetry'][k] for k in ('chamberTemperatureC', 'boardTemperatureC')) < 50
        assert run['state'] in ('idle', 'completed', 'stopped') and run['holdingTemperatureC'] is None
        assert not api(model, 'settings/keep-heat')['enabled']
        if model == 'M400' and sys.argv[1] == 'calibrate-m400':
            assert api(model, 'settings/thermal')['mode'] == 'combined'
            profiles[model] = {'calibrationTarget': 260}
            continue
        original = next(p for p in api(model, 'profiles')['profiles'] if p['name'] == 'Бессвинцовая паста')
        assert not original['board'] and max(p['temperature'] for p in original['points']) == 260
        copy = {**original, 'name': 'Проверка полок — 20.10.2026', 'repeat': 1}
        copy.pop('id', None)
        existing = next((p for p in api(model, 'profiles')['profiles'] if p['name'] == copy['name']), None)
        if existing:
            assert existing['points'] == copy['points'] and existing.get('repeat', 1) == 1
            profiles[model] = existing
        else:
            profiles[model] = api(model, 'profiles', copy)
    started = {}
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = {model: pool.submit(api, model,
                       'run/maximum-response-test' if 'calibrationTarget' in p else 'run/start',
                       {'targetTemperatureC': p['calibrationTarget']} if 'calibrationTarget' in p else {'profileId': p['id']})
                       for model, p in profiles.items()}
            errors = []
            for model, future in futures.items():
                try:
                    started[model] = future.result()['id']
                except Exception as error:
                    errors.append(error)
            if errors:
                raise errors[0]
    except Exception:
        for model in started:
            api(model, 'run/stop', {})
        raise
    previous = json.loads(STATE.read_text(encoding='utf-8')) if STATE.exists() else {}
    STATE.write_text(json.dumps({**previous, **started}), encoding='utf-8')
    print(json.dumps({'started': started}), flush=True)

def monitor():
    ids = json.loads(STATE.read_text(encoding='utf-8'))
    ids = {model: ids[model] for model in HOSTS if model in ids}
    done = set()
    deadline = time.monotonic() + 2100
    while len(done) < len(ids) and time.monotonic() < deadline:
        for model, run_id in ids.items():
            if model in done:
                continue
            try:
                run = api(model, 'run')
                board = api(model, 'controller/check')
                print(json.dumps({'model': model, 'state': run['state'], 'elapsed': run['elapsedSeconds'],
                    'target': run['targetTemperatureC'], 'temperature': board.get('telemetry', {}).get('chamberTemperatureC'),
                    'code': board.get('state'), 'lamps': board.get('telemetry', {}).get('lamps'),
                    'heaters': board.get('telemetry', {}).get('heaters'), 'cooling': board.get('telemetry', {}).get('fans'),
                    'error': run.get('error')}, ensure_ascii=True), flush=True)
                if run['id'] != run_id or run['state'] in ('completed', 'failed', 'stopped'):
                    history = api(model, 'history/' + run_id)
                    label = 'calibration260' if 'Максимальный нагрев' in history['profile']['name'] else 'shelf'
                    dest = Path('docs/experiments') / f'{model.lower()}-{label}-2026-10-20-{run_id}.json'
                    dest.write_text(json.dumps(history, ensure_ascii=False, indent=2), encoding='utf-8')
                    done.add(model)
            except Exception as error:
                print(json.dumps({'model': model, 'monitorError': str(error)}), flush=True)
        if len(done) < len(ids):
            time.sleep(15)
    if len(done) < len(ids):
        raise RuntimeError('Monitoring deadline reached; inspect ovens, no automatic restart was attempted')

if __name__ == '__main__':
    if len(sys.argv) > 2:
        HOSTS = {sys.argv[2]: HOSTS[sys.argv[2]]}
    {'start': start, 'calibrate-m400': start, 'monitor': monitor}[sys.argv[1]]()
