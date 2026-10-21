import json
import urllib.request

hosts = {'M300': '10.10.1.167', 'M400': '10.10.1.88'}
def api(model, path, data=None):
    req=urllib.request.Request('http://'+hosts[model]+':3001/api/'+path,
        data=None if data is None else json.dumps(data).encode(),headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=15) as r:return json.load(r)

for model in hosts:
    b=api(model,'controller/check');r=api(model,'run');c=api(model,'config')['selected']
    assert c == {'ovenModel':model[1:],'connectionVoltage':'230' if model=='M300' else '380'}
    assert b['ready'] and not b['doorOpen'] and not b['telemetry']['lamps'] and not b['telemetry']['heaters']
    assert max(b['telemetry'][k] for k in ('chamberTemperatureC','boardTemperatureC'))<50
    assert r['state'] in ('idle','completed','stopped','failed') and r['holdingTemperatureC'] is None
    assert not api(model,'settings/keep-heat')['enabled']
    thermal=api(model,'settings/thermal')
    assert thermal['mode']=='combined' and thermal['ki']==0.0003
    print(json.dumps({'preflight':model,'board':b}),flush=True)
p=next(p for p in api('M300','profiles')['profiles'] if p['name']=='Бессвинцовая паста')
assert max(point['temperature'] for point in p['points'])==260
assert p['board'] is False
name='Бессвинцовая паста — Ki 0,0003, один цикл'
test=next((x for x in api('M300','profiles')['profiles'] if x['name']==name),None)
if test is None:
    p.pop('id',None);p['repeat']=1;p['name']=name
    test=api('M300','profiles',p)
assert test.get('repeat',1)==1 and not test['board']
first=api('M300','run/start',{'profileId':test['id']})
print(json.dumps({'started':'M300','run':first}),flush=True)
try:
    second=api('M400','run/maximum-response-test',{'targetTemperatureC':100})
    print(json.dumps({'started':'M400','run':second}),flush=True)
except Exception:
    api('M300','run/stop',{})
    raise
