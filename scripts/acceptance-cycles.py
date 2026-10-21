"""Explicit acceptance cycles on the two already commissioned connections."""
import json
from pathlib import Path
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

HOSTS = {'M300': '10.10.1.167', 'M400': '10.10.1.88'}
STATE = Path('.test-tmp/acceptance-cycles.json')


def api(model, path, data=None, method=None):
    request = urllib.request.Request('http://' + HOSTS[model] + ':3001/api/' + path,
        data=None if data is None else json.dumps(data).encode(),
        headers={'Content-Type': 'application/json'}, method=method)
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.load(response)


def start():
    trial_date = datetime.now(timezone(timedelta(hours=7))).date().isoformat()
    profiles = {}
    for model in HOSTS:
        board, run = api(model, 'controller/check'), api(model, 'run')
        assert board['ready'] and not board['doorOpen']
        assert not board['telemetry']['lamps'] and not board['telemetry']['heaters']
        assert max(board['telemetry'][k] for k in ('chamberTemperatureC', 'boardTemperatureC')) < 65
        assert run['state'] in ('idle', 'completed', 'stopped')
        assert run['holdingTemperatureC'] is None
        assert not api(model, 'settings/keep-heat')['enabled']
        if model == 'M300':
            p = {'name': 'Приёмка повторы 100 C ' + str(time.time_ns()),
                 'mode': 'manual', 'board': False, 'repeat': 2,
                 'points': [{'second': 0, 'temperature': 50},
                            {'second': 90, 'temperature': 100},
                            {'second': 20, 'temperature': 100},
                            {'second': 250, 'temperature': 50}],
                 'shelves': [{'second': 20, 'temperature': 100},
                             {'second': 0, 'temperature': 100},
                             {'second': 0, 'temperature': 50}]}
        else:
            original = next(p for p in api(model, 'profiles')['profiles']
                            if p['name'] == 'Бессвинцовая паста')
            assert not original['board'] and max(p['temperature'] for p in original['points']) == 260
            p = {**original, 'name': 'Приёмка М400 260 C ' + str(time.time_ns()), 'repeat': 1}
            p.pop('id', None)
        profiles[model] = api(model, 'profiles', p)
    started = {}
    with ThreadPoolExecutor(max_workers=2) as pool:
        tasks = {m: pool.submit(api, m, 'run/start', {'profileId': p['id']}) for m, p in profiles.items()}
        errors = []
        for m, task in tasks.items():
            try:
                started[m] = task.result()['id']
            except Exception as error:
                errors.append(error)
        if errors:
            for m in started:
                api(m, 'run/stop', {})
            raise errors[0]
    STATE.write_text(json.dumps({'ids': started, 'profiles': profiles, 'date': trial_date}), encoding='utf-8')
    # During a running profile this changes only the persisted post-run preference.
    assert api('M300', 'run')['state'] in ('preparing', 'running')
    api('M300', 'settings/keep-heat', {'enabled': True}, 'PUT')
    print(json.dumps(started), flush=True)


def monitor():
    saved = json.loads(STATE.read_text(encoding='utf-8'))
    ids = saved['ids']
    trial_date = saved.get('date', '2026-10-20')
    done = set()
    deadline = time.monotonic() + 2100
    while len(done) < len(ids) and time.monotonic() < deadline:
        for model, run_id in ids.items():
            if model in done:
                continue
            run, board = api(model, 'run'), api(model, 'controller/check')
            print(json.dumps({'model': model, 'state': run['state'], 'cycle': run['cycle'],
                'elapsed': run['elapsedSeconds'], 'target': run['targetTemperatureC'],
                'temperature': board.get('telemetry', {}).get('chamberTemperatureC'),
                'code': board.get('state'), 'pendingReady': run.get('pendingReady'),
                'error': run.get('error')}), flush=True)
            assert run['id'] == run_id, 'Run changed externally; inspect before continuing'
            if run['state'] in ('completed', 'stopped', 'failed'):
                history = api(model, 'history/' + run_id)
                Path('docs/experiments/' + model.lower() + '-acceptance-cycles-' + trial_date + '-' + run_id + '.json').write_text(
                    json.dumps(history, ensure_ascii=False, indent=2), encoding='utf-8')
                done.add(model)
        if len(done) < len(ids):
            time.sleep(15)
    assert len(done) == len(ids), 'Monitoring timed out; no automatic restart'


{'start': start, 'monitor': monitor}[sys.argv[1]]()
