"""Analyze completed USB exports for one explicit model/mains configuration."""
import json
from pathlib import Path
import re
import sys

for name in sys.argv[1:]:
    path = Path(name)
    match = re.fullmatch(r'm(300|400)-(230|380)-calibration(100|150|200|260)-(\d{4}-\d{2}-\d{2})-([a-f0-9-]+)\.json', path.name)
    assert match, 'Expected an explicit model/voltage calibration export'
    model, voltage, target_text, date, run_id = match.groups()
    target = int(target_text)
    history = json.loads(path.read_text(encoding='utf-8'))
    assert history['profile']['board'] is False
    assert max(p['temperature'] for p in history['profile']['points']) == target
    samples = history['samples']
    assert samples and samples[-1]['chamberTemperatureC'] <= 50
    lamp_names = ['infrared', 'infrared2'] + (['infrared3'] if model == '400' else [])
    active = [s for s in samples if s.get('heating')]
    assert active and all(s['heatOutputs']['topHeater'] and s['heatOutputs']['bottomHeater'] for s in active)
    assert all(sum(bool(s['heatOutputs'].get(k)) for k in lamp_names) ==
               (1 if voltage == '230' else len(lamp_names)) for s in active)
    assert all(any(s['heatOutputs'].get(k) for s in active) for k in lamp_names)
    first_cooling = next(i for i, s in enumerate(samples) if s.get('cooling'))
    assert all(not s['heating'] for s in samples[first_cooling:])
    peak = max(s['chamberTemperatureC'] for s in samples)
    peak_index = next(i for i, s in enumerate(samples) if s['chamberTemperatureC'] == peak)
    heating = samples[:first_cooling + 1]
    cooling = samples[peak_index:]

    def crossing(data, temperature, rising):
        for a, b in zip(data, data[1:]):
            ta, tb = a['chamberTemperatureC'], b['chamberTemperatureC']
            if ta != tb and ((ta <= temperature <= tb) if rising else (ta >= temperature >= tb)):
                return a['elapsedSeconds'] + (b['elapsedSeconds'] - a['elapsedSeconds']) * (temperature - ta) / (tb - ta)
        return None

    def rate(data, lower, upper, rising):
        a = crossing(data, lower if rising else upper, rising)
        b = crossing(data, upper if rising else lower, rising)
        assert a is not None and b is not None and b > a, (lower, upper, rising)
        return round((upper - lower) / (b - a), 4)

    overall_heat = rate(heating, 50, target, True)
    overall_cool = rate(cooling, 50, target, False)
    heat_bounds = [v for v in (50, 100, 150, 200, 250, 260) if v <= target]
    cool_bounds = [v for v in (50, 60, 75, 100, 125, 150, 175, 200, 225, 250, 260) if v <= target]
    response = {'connectionVoltage': voltage, 'runId': run_id, 'sensor': 'chamber',
        'temperatureBands': [{'fromC': a, 'toC': b,
            'heatingCPerSecond': rate(heating, a, b, True),
            'coolingCPerSecond': rate(cooling, a, b, False)} for a, b in zip(heat_bounds, heat_bounds[1:])],
        'coolingPlanning': {'runId': run_id, 'temperatureBands': [
            {'fromC': a, 'toC': b, 'heatingCPerSecond': overall_heat,
             'coolingCPerSecond': rate(cooling, a, b, False)} for a, b in zip(cool_bounds, cool_bounds[1:])]}}
    report = {'model': model, 'connectionVoltage': voltage, 'targetC': target,
        'runId': run_id, 'peakC': peak, 'samples': len(samples),
        'durationSeconds': samples[-1]['elapsedSeconds'],
        'heating50ToTargetCPerSecond': overall_heat,
        'coolingTargetTo50CPerSecond': overall_cool,
        'outputSequenceVerified': True, 'measuredResponse': response}
    destination = Path('docs/experiments') / f'm{model}-{voltage}-response-50-{target}-{date}.json'
    destination.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report), flush=True)
