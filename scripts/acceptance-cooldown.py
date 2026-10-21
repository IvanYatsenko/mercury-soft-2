"""Observe cooling only; never sends control commands."""
import json
from pathlib import Path
import time
import urllib.request

hosts = {'M300': '10.10.1.167', 'M400': '10.10.1.88'}
deadline = time.monotonic() + 600
while time.monotonic() < deadline:
    states = {}
    for model, host in hosts.items():
        def api(path):
            with urllib.request.urlopen('http://' + host + ':3001/api/' + path, timeout=6) as response:
                return json.load(response)
        run, board, keep_heat = api('run'), api('controller/check'), api('settings/keep-heat')
        telemetry = board['telemetry']
        assert board['ready'] and not telemetry['lamps'] and not telemetry['heaters']
        assert run['holdingTemperatureC'] is None and not keep_heat['enabled']
        states[model] = {'chamberC': telemetry['chamberTemperatureC'],
                         'boardC': telemetry['boardTemperatureC'], 'cooling': telemetry['fans']}
    print(json.dumps(states), flush=True)
    if all(max(v['chamberC'], v['boardC']) <= 50 for v in states.values()):
        Path('docs/experiments/cooled-2026-10-21.json').write_text(
            json.dumps(states, indent=2), encoding='utf-8')
        break
    time.sleep(15)
else:
    raise RuntimeError('Cooling observation deadline reached; inspect ovens')
