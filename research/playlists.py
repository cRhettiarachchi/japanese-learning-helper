from pathlib import Path
import re,json,subprocess,concurrent.futures
ROOT=Path(__file__).parent

def walk(x):
 if isinstance(x,dict):
  yield x
  for v in x.values():yield from walk(v)
 elif isinstance(x,list):
  for v in x:yield from walk(v)
items=[]
for x in walk(json.load(open('/tmp/misa-playlists.json'))):
 if 'lockupViewModel' not in x:continue
 v=x['lockupViewModel'];name=v.get('metadata',{}).get('lockupMetadataViewModel',{}).get('title',{}).get('content','')
 if any(t in name for t in ['Grammar','JLPT','Beginner','Common Mistakes','Differences','Work/Business']):items.append((v['contentId'],name))
def fetch(item):
 pid,name=item;u='https://www.youtube.com/playlist?list='+pid+'&hl=en'
 r=subprocess.run(['curl','-L','--fail','-s','--max-time','30',u],capture_output=True,check=True)
 s=r.stdout.decode();m=re.search(r'var ytInitialData = (.*?);</script>',s)
 d=json.loads(m[1]);vs=[];more=False
 for x in walk(d):
  if 'lockupViewModel' in x:
   v=x['lockupViewModel'];vid=v.get('contentId','')
   if re.fullmatch(r'[\w-]{11}',vid):
    vs.append(dict(id=vid,title=v['metadata']['lockupMetadataViewModel']['title']['content'],url='https://www.youtube.com/watch?v='+vid,owner='Channel-owned playlist; verify oEmbed'))
  if 'playlistVideoRenderer' in x:
   v=x['playlistVideoRenderer'];vs.append(dict(id=v['videoId'],title=''.join(y['text'] for y in v.get('title',{}).get('runs',[])),duration=v.get('lengthText',{}).get('simpleText',''),url='https://www.youtube.com/watch?v='+v['videoId'],owner=''.join(y['text'] for y in v.get('shortBylineText',{}).get('runs',[]))))
  if 'continuationItemRenderer' in x:more=True
 return dict(id=pid,name=name,url=u,videos=vs,has_continuation=more)
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(fetch,items))
(ROOT/'playlists.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
known={x['id'] for x in json.load(open(ROOT/'channel-videos.json'))}
for p in results:
 print(p['name'],len(p['videos']),'continuation',p['has_continuation'])
 for v in p['videos']:
  if v['id'] not in known:print('EXTRA',v)
