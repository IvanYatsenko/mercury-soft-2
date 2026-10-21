"""Summarize stored USB exports; does not contact or control an oven."""
import json
from pathlib import Path
import sys

for name in sys.argv[1:]:
    path = Path(name)
    history = json.loads(path.read_text(encoding='utf-8'))
    profile = history['profile']
    sensor = 'boardTemperatureC' if profile['board'] else 'chamberTemperatureC'
    samples = history['samples']
    plateaus = sorted({a['temperature'] for a, b in zip(profile['points'], profile['points'][1:])
                       if a['temperature'] == b['temperature']})
    summary = {'source': path.name, 'sensor': sensor, 'samples': len(samples),
               'cyclesObserved': sorted({s['cycle'] for s in samples}), 'shelves': []}
    for cycle in summary['cyclesObserved']:
        for target in plateaus:
            shelf = [s for s in samples if s['cycle'] == cycle and
                     abs(s['targetTemperatureC'] - target) < 0.001]
            if not shelf:
                continue
            errors = [s[sensor] - target for s in shelf]
            settled = [s[sensor] - target for s in shelf
                       if s['elapsedSeconds'] >= shelf[0]['elapsedSeconds'] + 5]
            summary['shelves'].append({'cycle': cycle, 'targetC': target,
                'count': len(errors), 'meanErrorC': round(sum(errors) / len(errors), 3),
                'minErrorC': min(errors), 'maxErrorC': max(errors),
                'lastErrorC': errors[-1], 'afterFirst5Seconds': None if not settled else {
                    'meanErrorC': round(sum(settled) / len(settled), 3),
                    'minErrorC': min(settled), 'maxErrorC': max(settled)}})
    destination = path.with_name(path.stem + '-summary.json')
    destination.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(summary))
