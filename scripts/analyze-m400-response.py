import json
from pathlib import Path
import re
import sys

path=Path(sys.argv[1]) if len(sys.argv)>1 else Path('docs/experiments/m400-parallel-2026-10-19-fce6aec8-8220-4698-a556-4f1a27020db0.json')
h=json.loads(path.read_text(encoding='utf-8'))
run_id=re.search(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}',path.name).group()
target=max(p['temperature'] for p in h['profile']['points'])
s=h['samples']
assert s and any(all(x.get('heatOutputs',{}).get(k) for k in ('infrared','infrared2','infrared3','topHeater','bottomHeater')) for x in s)
assert s[-1]['chamberTemperatureC']<=50
peak=max(x['chamberTemperatureC'] for x in s)
peak_index=next(i for i,x in enumerate(s) if x['chamberTemperatureC']==peak)
first_cooling=next(i for i,x in enumerate(s) if x.get('cooling'))
# The threshold sample records outputs AFTER the heat-to-cooling transition.
heat=s[:first_cooling+1]
cool=s[peak_index:]
def crossing(data,temperature,rising):
    for a,b in zip(data,data[1:]):
        ta,tb=a['chamberTemperatureC'],b['chamberTemperatureC']
        if ((ta<=temperature<=tb) if rising else (ta>=temperature>=tb)) and ta!=tb:
            return a['elapsedSeconds']+(b['elapsedSeconds']-a['elapsedSeconds'])*(temperature-ta)/(tb-ta)
    return None
def rate(data,lower,upper,rising):
    a=crossing(data,lower if rising else upper,rising)
    b=crossing(data,upper if rising else lower,rising)
    return None if a is None or b is None or b<=a else round((upper-lower)/(b-a),4)
heating=rate(heat,50,target,True)
cooling=rate(cool,50,target,False)
assert heating and cooling
heating_bounds=[x for x in [50,100,150,200,250,260,270] if x<=target]
if heating_bounds[-1]!=target:heating_bounds.append(target)
heating_bands=list(zip(heating_bounds,heating_bounds[1:]))
cooling_bounds=[x for x in [50,60,75,100,125,150,175,200,225,250,260,270] if x<=target]
if cooling_bounds[-1]!=target:cooling_bounds.append(target)
cooling_bands=list(zip(cooling_bounds,cooling_bounds[1:]))
response={'connectionVoltage':'380','runId':run_id,'sensor':'chamber',
 'temperatureBands':[{'fromC':lo,'toC':hi,'heatingCPerSecond':rate(heat,lo,hi,True),'coolingCPerSecond':rate(cool,lo,hi,False)} for lo,hi in heating_bands],
 'coolingPlanning':{'runId':run_id,'temperatureBands':[
  {'fromC':lo,'toC':hi,'heatingCPerSecond':heating,'coolingCPerSecond':rate(cool,lo,hi,False)}
  for lo,hi in cooling_bands]}}
result={'model':'400','connectionVoltage':'380','targetC':target,'peakC':peak,'samples':len(s),'measuredResponse':response}
assert all(b['heatingCPerSecond'] and b['coolingCPerSecond'] for b in response['temperatureBands'])
assert all(b['coolingCPerSecond'] for b in response['coolingPlanning']['temperatureBands'])
trial_date=re.search(r'\d{4}-\d{2}-\d{2}',path.name).group()
dest=Path(f'docs/experiments/m400-380-response-50-{target}-{trial_date}.json')
dest.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result))
