from pathlib import Path
from urllib.parse import urlencode
import json,re,subprocess,concurrent.futures
ROOT=Path(__file__).parent
vs={v['id']:v for v in json.load(open(ROOT/'channel-videos.json'))}
for p in json.load(open(ROOT/'playlists.json')):
 for v in p['videos']:vs.setdefault(v['id'],v)
s=Path('/tmp/misa-shorts.html').read_text();d=json.loads(re.search(r'var ytInitialData = (.*?);</script>',s)[1])
def walk(x):
 if isinstance(x,dict):
  yield x
  for v in x.values():yield from walk(v)
 elif isinstance(x,list):
  for v in x:yield from walk(v)
shorts=[]
for x in walk(d):
 if 'shortsLockupViewModel' in x:
  v=x['shortsLockupViewModel'];vid=v['onTap']['innertubeCommand']['reelWatchEndpoint']['videoId'];shorts.append(vid)
  vs.setdefault(vid,dict(id=vid,title=v.get('accessibilityText',''),url='https://www.youtube.com/watch?v='+vid,format='Short'))
# These exact IDs are linked by Misa's official grammar articles.
for id,title in [('zUzymwuP2oE','#33 Have to (official article link)'),('zaX9EX3G5Mw','#34 Go to do (official article link)')]:vs.setdefault(id,dict(id=id,title=title,url='https://www.youtube.com/watch?v='+id))
def verify(v):
 u='https://www.youtube.com/oembed?'+urlencode(dict(url=v['url'],format='json'))
 r=subprocess.run(['curl','-L','-s','--max-time','20','-w','\n%{http_code}',u],capture_output=True)
 b,_,code=r.stdout.rpartition(b'\n');v['oembed_http_status']=code.decode();v['checked']='2026-09-13'
 try:
  data=json.loads(b);v['verified_title']=data['title'];v['author']=data['author_name'];v['author_url']=data['author_url'];v['verified']=data['author_name']=='Japanese Ammo with Misa'
 except Exception:v['verified']=False
 return v
out=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
 for i,v in enumerate(pool.map(verify,vs.values()),1):
  out.append(v)
  if i%40==0:print('Verified metadata',i,flush=True)
(ROOT/'verified-catalog.json').write_text(json.dumps(out,ensure_ascii=False,indent=2))
(ROOT/'shorts-ids.json').write_text(json.dumps(shorts))
print('TOTAL',len(out),'verified',sum(v['verified'] for v in out))
for v in out:
 if not v['verified']:print('UNVERIFIED',v['id'],v['title'],v['oembed_http_status'])
(ROOT/'request.json').unlink(missing_ok=True)
