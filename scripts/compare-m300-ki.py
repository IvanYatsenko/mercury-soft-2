import json
from pathlib import Path
from statistics import mean

root=Path('docs/experiments')
before=json.loads((root/'m300-ki-0002-baseline-2026-10-19.json').read_text(encoding='utf-8'))
after=json.loads((root/'m300-parallel-2026-10-19-ded9f216-837b-457c-9dba-aa9c36d92cc6.json').read_text(encoding='utf-8'))
assert before['profile']['points']==after['profile']['points']
assert before['profile']['board']==after['profile']['board']==False
def summarize(h):
    s=[x for x in h['samples'] if x.get('targetTemperatureC') is not None]
    errors=[x['chamberTemperatureC']-x['targetTemperatureC'] for x in s]
    shelves={}
    for target in (200,260):
        points=[x for x in s if x['targetTemperatureC']==target]
        # Exact shelf samples; omit the first 10 seconds for the steady portion.
        if points:
            first=points[0]['elapsedSeconds']
            settled=[x for x in points if x['elapsedSeconds']>=first+10]
            shelves[str(target)]={'samples':len(points),'minC':min(x['chamberTemperatureC'] for x in points),
              'maxC':max(x['chamberTemperatureC'] for x in points),
              'meanErrorC':round(mean(x['chamberTemperatureC']-target for x in points),3),
              'settledMeanErrorC':round(mean(x['chamberTemperatureC']-target for x in settled),3) if settled else None}
    return {'samples':len(s),'peakC':max(x['chamberTemperatureC'] for x in s),
      'maxAbsErrorC':round(max(map(abs,errors)),3),'meanAbsErrorC':round(mean(map(abs,errors)),3),
      'shelves':shelves,'finalEvents':h['events'][-5:]}
result={'beforeKi0002':summarize(before),'afterKi0003':summarize(after)}
(root/'m300-ki-comparison-2026-10-19.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result,ensure_ascii=True))
