import json
from pathlib import Path
import time
import urllib.request
import sys

hosts={'M300':'10.10.1.167','M400':'10.10.1.88'}
ids={'M300':'ded9f216-837b-457c-9dba-aa9c36d92cc6','M400':'fce6aec8-8220-4698-a556-4f1a27020db0'}
if len(sys.argv)>1:
    hosts={'M400':hosts['M400']}
    ids={'M400':sys.argv[1]}
last={};done=set();started=time.monotonic()
def api(model,path):
    with urllib.request.urlopen('http://'+hosts[model]+':3001/api/'+path,timeout=8) as r:return json.load(r)
while len(done)<len(hosts) and time.monotonic()-started<1400:
    for model in hosts:
        if model in done:continue
        try:
            r=api(model,'run');b=api(model,'controller/check');t=b.get('telemetry',{})
            key=(r['state'],r['stage'],r.get('error'))
            now=time.monotonic()
            if key!=last.get(model,{}).get('key') or now-last.get(model,{}).get('time',0)>=30:
                history=api(model,'history/'+ids[model]);sample=history['samples'][-1] if history['samples'] else {}
                print(json.dumps({'model':model,'state':r['state'],'stage':r['stage'],
                    'elapsed':r['elapsedSeconds'],'target':r['targetTemperatureC'],
                    'temperature':t.get('chamberTemperatureC'),'boardTemperature':t.get('boardTemperatureC'),
                    'ready':b.get('ready'),'code':b.get('state'),'lamps':t.get('lamps'),
                    'heaters':t.get('heaters'),'cooling':t.get('fans'),'channels':sample.get('heatOutputs'),
                    'error':r.get('error')},ensure_ascii=False),flush=True)
                last[model]={'key':key,'time':now}
            if r['id']!=ids[model] or r['state'] in ('completed','failed','stopped'):
                history=api(model,'history/'+ids[model])
                dest=Path('docs/experiments')/f'{model.lower()}-parallel-2026-10-19-{ids[model]}.json'
                dest.parent.mkdir(exist_ok=True)
                dest.write_text(json.dumps(history,ensure_ascii=False,indent=2),encoding='utf-8')
                print(json.dumps({'finished':model,'file':str(dest),'events':history['events'][-6:]},ensure_ascii=False),flush=True)
                done.add(model)
        except Exception as e:print(json.dumps({'model':model,'monitorError':str(e)}),flush=True)
    time.sleep(5)
