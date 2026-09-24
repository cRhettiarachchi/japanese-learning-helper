import json,re,subprocess
from pathlib import Path
ROOT=Path(__file__).parent
s=Path('/tmp/misa-channel.html').read_text()
d=json.load(open('/tmp/misa-channel.json'))
m=re.search(r'"INNERTUBE_CONTEXT":',s)
context=json.JSONDecoder().raw_decode(s[m.end():])[0]
context['client']['hl']='en';context['client']['gl']='US'
def walk(x):
 if isinstance(x,dict):
  yield x
  for v in x.values():yield from walk(v)
 elif isinstance(x,list):
  for v in x:yield from walk(v)
def vids(data):
 out=[]
 for x in walk(data):
  if 'lockupViewModel' in x:
   v=x['lockupViewModel'];id=v.get('contentId')
   if not id or not re.fullmatch(r'[\w-]{11}',id):continue
   title=v['metadata']['lockupMetadataViewModel']['title']['content']
   badges=[y['thumbnailBadgeViewModel'].get('text','') for y in walk(v.get('contentImage')) if 'thumbnailBadgeViewModel' in y]
   out.append(dict(id=id,title=title,duration=badges[0] if badges else '',url='https://www.youtube.com/watch?v='+id))
  if 'videoRenderer' in x:
   v=x['videoRenderer'];out.append(dict(id=v['videoId'],title=''.join(y['text'] for y in v['title']['runs']),duration=v.get('lengthText',{}).get('simpleText',''),url='https://www.youtube.com/watch?v='+v['videoId']))
 return out
allv={}
for n in range(25):
 for v in vids(d):allv[v['id']]=v
 print('page',n+1,'videos',len(allv),flush=True)
 tokens=[]
 for x in walk(d):
  if 'continuationItemRenderer' in x:
   for y in walk(x['continuationItemRenderer']):
    if 'continuationCommand' in y:tokens.append(y['continuationCommand']['token'])
 if not tokens:break
 payload=ROOT/'request.json';payload.write_text(json.dumps(dict(context=context,continuation=tokens[0])))
 result=subprocess.run(['curl','-L','--fail','-s','--max-time','30','https://www.youtube.com/youtubei/v1/browse','-H','Content-Type: application/json','--data-binary','@'+str(payload)],capture_output=True,check=True)
 d=json.loads(result.stdout)
else:raise RuntimeError('page cap')
(ROOT/'channel-videos.json').write_text(json.dumps(list(allv.values()),ensure_ascii=False,indent=2))
(ROOT/'catalog-scope.json').write_text(json.dumps(dict(checked='2026-09-13',source='https://www.youtube.com/@JapaneseAmmowithMisa/videos',count=len(allv),pagination_exhausted=not tokens),indent=2))
print('DONE')
