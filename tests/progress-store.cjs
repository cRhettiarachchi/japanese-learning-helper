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
test('legacy migration is explicit, catalog validated, keeps server false, and belongs to one account',async()=>{
 const api=service(),storage=memory();storage.setItem(legacyKeys.article,JSON.stringify({story:true,second:true,unknown:true}));
 const s=create(api,storage);await s.refresh();assert.equal(api.writes.length,0);
 s.set('article','story','done',false);await settle(s);await s.importLegacy();assert.equal(s.get('article','story'),false);assert.equal(s.get('article','second'),true);assert.equal(api.writes.length,2);
 api.setUser('B');await s.refresh();await s.importLegacy();assert.equal(api.writes.length,2);assert.equal(s.get('article','second'),false);
 assert.ok(storage.getItem(legacyKeys.article));
});
test('offline pending updates survive reload and never upload into another account',async()=>{
 const api=service(),storage=memory(),a=create(api,storage);await a.refresh();api.setOnline(false);a.set('article','story','done',true);await settle(a);assert.equal(a.mode,'offline');
 api.setOnline(true);api.setUser('B');const b=create(api,storage);await b.refresh();assert.equal(b.get('article','story'),false);assert.equal(api.writes.length,0);
 api.setUser('A');await b.refresh();assert.equal(api.writes.length,1);assert.equal(api.writes[0].owner,'A');
});
test('simultaneous conflicting edits preserve server value until explicitly resolved',async()=>{
 const api=service(),a=create(api),b=create(api);await a.refresh();await b.refresh();
 a.set('article','story','done',false);await settle(a);b.set('article','story','done',true);await settle(b);assert.equal(b.mode,'conflict');assert.equal(b.queue.length,1);
 await b.discardPending();assert.equal(b.get('article','story'),false);assert.equal(b.queue.length,0);
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
 api.setOnline(true);b.set('article','story','done',false);await settle(b);await a.refresh();assert.equal(a.mode,'conflict');assert.equal(api.writes.length,1);assert.equal(api.writes[0].value,false);
});
