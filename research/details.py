import json,re,subprocess,concurrent.futures
from pathlib import Path
ROOT=Path(__file__).parent
ids=['V4simApUbuI','SjdkJhGtFlk','8-vu-qKEuaY','B4yn28Fb9co','n4VmUT4ICgo','00kDTCOr1Do','Y6OxSpzRM-o','5_woSKucmUg','hNYoDSvIvuI','-1AesYejias','LNbhvXJ7kuw','o_EuKawOZAw','8SvFK5oKl0k','zUzymwuP2oE','zaX9EX3G5Mw','Bor5hJH5TR8']
def f(id):
 r=subprocess.run(['curl','-L','-s','--max-time','30','https://www.youtube.com/watch?v='+id+'&hl=en'],capture_output=True)
 s=r.stdout.decode();m=re.search(r'var ytInitialPlayerResponse\s*=\s*',s)
 if not m:return dict(id=id,error='No player metadata')
 d=json.JSONDecoder().raw_decode(s[m.end():])[0];v=d.get('videoDetails',{})
 return dict(id=id,title=v.get('title'),description=v.get('shortDescription'),channelId=v.get('channelId'),playability=d.get('playabilityStatus',{}).get('status'),reason=d.get('playabilityStatus',{}).get('reason'))
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as p:out=list(p.map(f,ids))
(ROOT/'selected-details.json').write_text(json.dumps(out,ensure_ascii=False,indent=2))
for v in out:print(v['id'],v.get('title'),v.get('playability'),v.get('reason'),'\n', (v.get('description') or '')[:3500],'\n')
