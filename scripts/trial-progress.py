"""Read PC checkpoints copied from USB; never controls an oven."""
import json
from pathlib import Path
state = json.loads(Path('.test-tmp/remaining-calibration.json').read_text(encoding='utf-8'))
for label, run_id in state['ids'].items():
    path = Path('.test-tmp') / (label.lower() + '-' + run_id + '-usb-checkpoint.json')
    data = json.loads(path.read_text(encoding='utf-8'))
    samples = data['samples']
    if not samples:
        continue
    worst = max(samples, key=lambda s: abs(s['chamberTemperatureC'] - s['targetTemperatureC']))
    report = {'oven': label, 'samplesOnUsb': len(samples), 'latest': samples[-1],
              'worstErrorC': round(worst['chamberTemperatureC'] - worst['targetTemperatureC'], 3),
              'worstAtSeconds': worst['elapsedSeconds'], 'shelves': {}}
    for target in (200, 260):
        flat = [s for s in samples if s['targetTemperatureC'] == target]
        if flat:
            errors = [s['chamberTemperatureC'] - target for s in flat]
            report['shelves'][target] = {'count': len(flat), 'meanC': round(sum(errors) / len(errors), 3),
                                         'minC': min(errors), 'maxC': max(errors)}
    print(json.dumps(report, ensure_ascii=True))
