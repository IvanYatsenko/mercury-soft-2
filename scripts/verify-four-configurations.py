"""Check provenance of all four response curves and preserve the published pair."""
import json
from pathlib import Path
import tarfile

root = Path(__file__).resolve().parent.parent
version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
models = {m: json.loads((root / f'packages/shared/ovens/{m}.json').read_text(encoding='utf-8')) for m in ('300', '400')}
old = {}
with tarfile.open(root / 'release/previous/3.0.1/3.0.1_linux-arm64-unpacked.tar.gz', 'r|gz') as archive:
    for member in archive:
        for model in models:
            if member.name == f'mercury-v2/program/packages/shared/ovens/{model}.json':
                old[model] = json.load(archive.extractfile(member))
        if len(old) == 2:
            break
assert models['300']['measuredResponses']['230'] == old['300']['measuredResponse']
assert models['400']['measuredResponses']['380'] == old['400']['measuredResponses']['380']
for model in models:
    current_base = {k: v for k, v in models[model].items() if k not in ('measuredResponse', 'measuredResponses')}
    old_base = {k: v for k, v in old[model].items() if k not in ('measuredResponse', 'measuredResponses')}
    assert current_base == old_base, 'Only measured response data may change'
    for voltage in ('230', '380'):
        curve = models[model]['measuredResponses'][voltage]
        assert curve['connectionVoltage'] == voltage and curve['sensor'] == 'chamber'
        assert curve['temperatureBands'] and all(b['heatingCPerSecond'] > 0 and b['coolingCPerSecond'] > 0 for b in curve['temperatureBands'])
for model, voltage in (('300', '380'), ('400', '230')):
    measured = json.loads((root / f'docs/experiments/m{model}-{voltage}-response-50-260-2026-10-21.json').read_text(encoding='utf-8'))
    assert measured['outputSequenceVerified']
    assert models[model]['measuredResponses'][voltage] == measured['measuredResponse']
ids = [models[m]['measuredResponses'][v]['runId'] for m in models for v in ('230', '380')]
assert len(set(ids)) == 4
report = {'version': version, 'configurations': 4, 'distinctMeasurements': 4,
          'published230M300And380M400Unchanged': True,
          'otherModelParametersUnchanged': True, 'newCurvesMatchUsbExports': True, 'status': 'PASS'}
(root / ('docs/test-results/four-configurations-' + version + '.json')).write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report))
