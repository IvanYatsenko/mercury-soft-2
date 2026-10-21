"""Explicit calibration stages for M400/230 V and M300/380 V; no automatic retries."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sys
import time
import urllib.error
import urllib.request

OVENS = {'M400-230': ('10.10.1.167', '400', '230'),
         'M300-380': ('10.10.1.88', '300', '380')}
STATE = Path('.test-tmp/remaining-calibration.json')


def api(label, path, data=None):
    host = OVENS[label][0]
    request = urllib.request.Request('http://' + host + ':3001/api/' + path,
        data=None if data is None else json.dumps(data).encode(),
        headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.load(response)


def start(target, working=False, repeats=False, adjusted=False, reserve=False):
    assert target in (100, 150, 200, 260)
    for label, (_, model, voltage) in OVENS.items():
        board, run = api(label, 'controller/check'), api(label, 'run')
        assert api(label, 'software-update')['currentVersion'] == json.loads(Path('package.json').read_text(encoding='utf-8'))['version']
        assert api(label, 'config')['selected'] == {'ovenModel': model, 'connectionVoltage': voltage}
        assert board['ready'] and not board['doorOpen']
        assert board['telemetry']['lamps'] is False and board['telemetry']['heaters'] is False
        assert max(board['telemetry'][k] for k in ('chamberTemperatureC', 'boardTemperatureC')) < (110 if working or repeats else 50)
        assert run['state'] in ('idle', 'completed', 'stopped', 'failed') and run['holdingTemperatureC'] is None
        if run['state'] == 'failed':
            assert repeats and run['error'] == '\u0422\u0435\u043c\u043f\u0435\u0440\u0430\u0442\u0443\u0440\u0430 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0435\u043d\u043d\u043e \u043f\u0440\u0435\u0432\u044b\u0448\u0430\u0435\u0442 \u0437\u0430\u0434\u0430\u043d\u043d\u0443\u044e.'
        assert not api(label, 'settings/keep-heat')['enabled']
        thermal = api(label, 'settings/thermal')
        assert thermal['mode'] == 'combined'
        assert thermal['powersW']['topHeater'] == thermal['powersW']['bottomHeater'] == 1200
        assert thermal['powersW']['infrared'] == (3600 if model == '400' else 2600)
        assert isinstance(api(label, 'history'), list)
    if reserve:
        assert list(OVENS) == ['M400-230'], 'Reserve trial is authorized only for M400'
    payloads = {}
    for label in OVENS:
        if repeats:
            profile = api(label, 'profiles', {
                'name': 'Acceptance repeats ' + label + ' ' + str(time.time_ns()),
                'mode': 'manual', 'board': False, 'repeat': 2,
                'points': [{'second': 0, 'temperature': 50},
                           {'second': 60, 'temperature': 100},
                           {'second': 15, 'temperature': 100}],
                'shelves': [{'second': 15, 'temperature': 100},
                            {'second': 0, 'temperature': 100},
                            {'second': 0, 'temperature': 100}]})
            payloads[label] = {'profileId': profile['id']}
        elif working:
            original = next(p for p in api(label, 'profiles')['profiles'] if p['name'] == '\u0411\u0435\u0441\u0441\u0432\u0438\u043d\u0446\u043e\u0432\u0430\u044f \u043f\u0430\u0441\u0442\u0430')
            assert not original['board'] and max(p['temperature'] for p in original['points']) == 260
            copy = {**original, 'name': 'Acceptance ' + label + ' ' + str(time.time_ns()), 'repeat': 1}
            if adjusted and label == 'M400-230':
                assert label == 'M400-230'
                copy['name'] += ' upper ramp ' + ('110s' if reserve else '100s')
                copy['points'] = [dict(p) for p in original['points']]
                changed = 0
                for previous, point in zip(copy['points'], copy['points'][1:]):
                    if previous['temperature'] == 200 and point['temperature'] == 260:
                        assert point['second'] == 75
                        point['second'] = 110 if reserve else 100
                        changed += 1
                assert changed == 1
            copy.pop('id', None)
            profile = api(label, 'profiles', copy)
            payloads[label] = {'profileId': profile['id']}
        else:
            payloads[label] = {'targetTemperatureC': target}
    ids, errors = {}, []
    with ThreadPoolExecutor(max_workers=2) as pool:
        tasks = {label: pool.submit(api, label,
                 'run/start' if working or repeats else 'run/maximum-response-test', payloads[label]) for label in OVENS}
        for label, task in tasks.items():
            try:
                ids[label] = task.result()['id']
            except Exception as error:
                errors.append(error)
    if errors:
        for label in ids:
            api(label, 'run/stop', {})
        raise errors[0]
    date = datetime.now(timezone(timedelta(hours=7))).date().isoformat()
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps({'ids': ids, 'targetC': target, 'date': date,
                                'kind': 'repeats' if repeats else 'working-reserve' if reserve else 'working-adjusted' if adjusted else 'working' if working else 'calibration'}), encoding='utf-8')
    # Read through the USB worker to ensure both runs actually have persisted records.
    try:
        for label, run_id in ids.items():
            assert 'samples' in api(label, 'history/' + run_id)
    except Exception:
        for label in ids:
            api(label, 'run/stop', {})
        raise
    if repeats:
        for label in ids:
            request = urllib.request.Request('http://' + OVENS[label][0] + ':3001/api/settings/keep-heat',
                data=json.dumps({'enabled': True}).encode(),
                headers={'Content-Type': 'application/json'}, method='PUT')
            with urllib.request.urlopen(request, timeout=10) as response:
                assert json.load(response)['enabled']
    print(json.dumps({'started': ids, 'targetC': target}), flush=True)


def monitor():
    state = json.loads(STATE.read_text(encoding='utf-8'))
    done = set()
    deadline = time.monotonic() + 2100
    while len(done) < len(state['ids']) and time.monotonic() < deadline:
        for label, run_id in state['ids'].items():
            if label in done:
                continue
            try:
                run, board = api(label, 'run'), api(label, 'controller/check')
            except (urllib.error.URLError, TimeoutError, OSError) as error:
                print(json.dumps({'oven': label, 'networkError': str(error),
                                  'action': 'observe again; never restart heat'}), flush=True)
                continue
            assert run['id'] == run_id, 'Run changed; no automatic restart'
            if state.get('observationLimitC') is not None and max(
                board['telemetry'][k] for k in ('chamberTemperatureC', 'boardTemperatureC')
            ) >= state['observationLimitC']:
                for active_label in state['ids']:
                    api(active_label, 'run/stop', {})
                raise RuntimeError('Observation temperature ceiling reached; heat stopped')
            history, history_error = None, None
            try:
                history = api(label, 'history/' + run_id)
                # PC backup of records already read from USB, never a Pi fallback.
                Path('.test-tmp/' + label.lower() + '-' + run_id + '-usb-checkpoint.json').write_text(
                    json.dumps(history, ensure_ascii=False), encoding='utf-8')
            except Exception as error:
                # USB failure must not end observation of the live controller.
                # No replacement history is created on the Raspberry.
                history_error = str(error)
            sample = history['samples'][-1] if history and history['samples'] else {}
            print(json.dumps({'oven': label, 'state': run['state'],
                'elapsed': run['elapsedSeconds'], 'temperatureC': board['telemetry']['chamberTemperatureC'],
                'boardTemperatureC': board['telemetry']['boardTemperatureC'], 'code': board['state'],
                'outputs': sample.get('heatOutputs'), 'cooling': board['telemetry']['fans'],
                'samplesOnUsb': len(history['samples']) if history else None,
                'historyError': history_error, 'error': run.get('error')}), flush=True)
            if run['state'] in ('completed', 'stopped', 'failed'):
                dest = Path('docs/experiments') / (
                    label.lower() + '-' + state.get('kind', 'calibration') + str(state['targetC']) + '-' + state['date'] + '-' + run_id + '.json')
                if history is not None:
                    dest.write_text(json.dumps(history, ensure_ascii=False, indent=2), encoding='utf-8')
                done.add(label)
        if len(done) < len(state['ids']):
            time.sleep(15)
    assert len(done) == len(state['ids']), 'Observation timed out; inspect ovens'


if sys.argv[1] in ('start', 'working', 'working-adjusted', 'working-reserve', 'repeats'):
    if len(sys.argv) > 3:
        OVENS = {sys.argv[3]: OVENS[sys.argv[3]]}
    start(int(sys.argv[2]), working=sys.argv[1] in ('working', 'working-adjusted', 'working-reserve'),
          repeats=sys.argv[1] == 'repeats', adjusted=sys.argv[1] in ('working-adjusted', 'working-reserve'),
          reserve=sys.argv[1] == 'working-reserve')
elif sys.argv[1] == 'monitor':
    monitor()
else:
    raise ValueError(sys.argv[1])
