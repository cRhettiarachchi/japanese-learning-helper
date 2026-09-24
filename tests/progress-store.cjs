const test=require('node:test'),assert=require('node:assert/strict');const {ProgressStore,keyOf,legacyKeys}=require('../progress-store.js');
function memory(){const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k),key:i=>[...data.keys()][i],get length(){return data.size;}};}
const catalog={article:{story:{},second:{}},grammar:{lesson:{}},audio:{episode:{duration:100}}};
function service(){let user='A',online=true;const rows=new Map(),writes=[];return {rows,writes,setUser:u=>user=u,setOnline:o=>online=o,request:async(url,o={})=>{
 if(!online)throw Error('offline');if(!user)throw Object.assign(Error(),{status:401});
 if(url==='/api/auth/session')return {user:{id:user,name:user},csrf:user+'-csrf'};
 if(o.method!=='PUT')return {userId:user,rows:[...rows.entries()].filter(([k])=>k.startsWith(user+'|')).map(([,v])=>v)};
 if(o.csrf!==user+'-csrf')throw Object.assign(Error(),{status:403});
 const x=o.body,k=user+'|'+keyOf(x.kind,x.id,x.field),old=rows.get(k);if(old?.mutationId===x.mutationId)return {userId:user,row:old};
 if((old?.revision||0)!==x.expectedRevision)throw Object.assign(Error(),{status:409});
 const row={...x,revision:(old?.revision||0)+1};rows.set(k,row);writes.push({owner:user,...x});return {userId:user,row};
 }};}
let uuid=0;const create=(api,storage=memory())=>new ProgressStore({storage,request:api.request,catalog,uuid:()=>`mutation-00000000-${++uuid}`});
async function settle(s){while(s.busy)await new Promise(r=>setImmediate(r));}
test('two devices sync checks, unchecks, grammar and independent audio position/completion',async()=>{
 const api=service(),a=create(api),b=create(api);await a.refresh();await b.refresh();
 a.set('article','story','done',true);await settle(a);await b.refresh();assert.equal(b.get('article','story'),true);
 b.set('article','story','done',false);await settle(b);await a.refresh();assert.equal(a.get('article','story'),false);
 a.set('grammar','lesson','done',true);a.set('audio','episode','position',{seconds:12,duration:100,ended:false});a.set('audio','episode','done',true);await settle(a);await b.refresh();
 assert.equal(b.get('grammar','lesson'),true);assert.equal(b.get('audio','episode','position').seconds,12);assert.equal(b.get('audio','episode'),true);
});
test('attributed legacy migrates automatically, keeps server false, filters IDs and cannot switch owners',async()=>{
 const api=service(),storage=memory();storage.setItem(legacyKeys.article,JSON.stringify({story:true,second:true,unknown:true}));storage.setItem('japanese-learner-legacy-owner-v1',JSON.stringify('A'));
 api.rows.set('A|'+keyOf('article','story','done'),{kind:'article',id:'story',field:'done',value:false,revision:1});
 const s=create(api,storage);await s.refresh();assert.equal(s.get('article','story'),false);assert.equal(s.get('article','second'),true);assert.equal(api.writes.length,1);
 api.setUser('B');await s.refresh();assert.equal(api.writes.length,1);assert.equal(s.get('article','second'),false);assert.ok(storage.getItem(legacyKeys.article));
});
test('unowned legacy and another account cache are preserved without automatic adoption',async()=>{
 const api=service(),storage=memory(),legacy=JSON.stringify({story:true});storage.setItem(legacyKeys.article,legacy);storage.setItem('japanese-learner-account-v1:B',JSON.stringify({rows:{[keyOf('article','story','done')]:{value:true}}}));
 const s=create(api,storage);await s.refresh();assert.equal(s.get('article','story'),false);assert.equal(api.writes.length,0);assert.equal(storage.getItem(legacyKeys.article),legacy);
});
test('offline pending updates survive reload and never upload into another account',async()=>{
 const api=service(),storage=memory(),a=create(api,storage);await a.refresh();api.setOnline(false);a.set('article','story','done',true);await settle(a);assert.equal(a.mode,'offline');
 api.setOnline(true);api.setUser('B');const b=create(api,storage);await b.refresh();assert.equal(b.get('article','story'),false);assert.equal(api.writes.length,0);
 api.setUser('A');await b.refresh();assert.equal(api.writes.length,1);assert.equal(api.writes[0].owner,'A');
});
test('stale edits resolve automatically to server values, retain recovery copy, and continue unrelated saves',async()=>{
 const api=service(),storage=memory(),a=create(api),b=create(api,storage);await a.refresh();await b.refresh();
 a.set('article','story','done',false);await settle(a);b.set('article','story','done',true);b.set('grammar','lesson','done',true);await settle(b);
 assert.equal(b.mode,'account');assert.equal(b.queue.length,0);assert.equal(b.get('article','story'),false);assert.equal(b.get('grammar','lesson'),true);
 assert.ok([...Array(storage.length)].some((_,i)=>storage.key(i).includes(':superseded:')));
});
test('malformed browser data is never overwritten by a local edit',async()=>{
 const api=service(),storage=memory();api.setUser(null);storage.setItem(legacyKeys.article,'broken');const s=create(api,storage);await s.refresh();s.set('article','story','done',true);assert.equal(storage.getItem(legacyKeys.article),'broken');
});
test('account changes between session and progress fetch cannot poison another account cache',async()=>{
 const s=new ProgressStore({storage:memory(),request:async url=>url.includes('/session')?{user:{id:'A'},csrf:'A'}:{userId:'B',rows:[{kind:'article',id:'story',field:'done',value:true}]}});await s.refresh();assert.equal(s.mode,'offline');assert.equal(s.get('article','story'),false);
});
test('offline tabs keep separate pending journals without overwriting each other',async()=>{
 const api=service(),storage=memory(),a=create(api,storage),b=create(api,storage);await a.refresh();await b.refresh();api.setOnline(false);
 a.set('article','story','done',true);b.set('grammar','lesson','done',true);await settle(a);await settle(b);
 api.setOnline(true);const fresh=create(api,storage);await fresh.refresh();assert.equal(fresh.get('article','story'),true);assert.equal(fresh.get('grammar','lesson'),true);assert.equal(api.writes.length,2);
});
test('edits queued while already offline cannot overwrite a newer device revision on reconnect',async()=>{
 const api=service(),a=create(api),b=create(api);await a.refresh();await b.refresh();api.setOnline(false);await a.refresh();
 a.set('article','story','done',true);assert.equal(a.queue[0].expectedRevision,0);
 api.setOnline(true);b.set('article','story','done',false);await settle(b);await a.refresh();assert.equal(a.mode,'account');assert.equal(a.get('article','story'),false);assert.equal(api.writes.length,1);assert.equal(api.writes[0].value,false);
});

test('edits during initial loading are disabled and cannot overwrite account progress',async()=>{
 const api=service();let release;const gate=new Promise(r=>release=r);const s=new ProgressStore({storage:memory(),catalog,request:async(...args)=>{if(args[0]==='/api/progress')await gate;return api.request(...args);}});
 const loading=s.refresh();await new Promise(r=>setImmediate(r));assert.equal(s.canEdit(),false);s.set('article','story','done',true);release();await loading;assert.equal(api.writes.length,0);assert.equal(s.canEdit(),true);
});
test('signout clears account values and prevents signed-out saves without touching legacy data',async()=>{
 const api=service(),storage=memory(),s=create(api,storage);await s.refresh();s.set('article','story','done',true);await settle(s);api.setUser(null);await s.refresh();assert.equal(s.get('article','story'),false);assert.equal(s.canEdit(),false);s.set('grammar','lesson','done',true);assert.equal(api.writes.length,1);assert.equal(storage.getItem(legacyKeys.grammar),null);
});
test('refresh requested during an in-flight save rechecks session before another account is shown',async()=>{
 const api=service();let release,started;const gate=new Promise(r=>release=r),began=new Promise(r=>started=r);
 const s=new ProgressStore({storage:memory(),catalog,uuid:()=>`mutation-00000000-${++uuid}`,request:async(u,o)=>{const r=await api.request(u,o);if(o?.method==='PUT'){started();await gate;}return r;}});
 await s.refresh();s.set('article','story','done',true);await began;api.setUser('B');await s.refresh();release();await settle(s);assert.equal(s.user.id,'B');assert.equal(s.get('article','story'),false);assert.equal(api.writes[0].owner,'A');
});
test('legacy migration races keep newer server unchecks',async()=>{
 const api=service(),storage=memory();storage.setItem('japanese-learner-legacy-owner-v1',JSON.stringify('A'));storage.setItem(legacyKeys.article,JSON.stringify({story:true}));
 let injected=false;const s=new ProgressStore({storage,catalog,uuid:()=>`mutation-00000000-${++uuid}`,request:async(u,o)=>{if(o?.method==='PUT'&&!injected){injected=true;api.rows.set('A|'+keyOf('article','story','done'),{kind:'article',id:'story',field:'done',value:false,revision:1});}return api.request(u,o);}});
 await s.refresh();assert.equal(s.get('article','story'),false);assert.equal(s.queue.length,0);assert.equal(api.writes.length,0);
});
