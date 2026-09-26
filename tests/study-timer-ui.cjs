const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {JSDOM}=require('jsdom');const {PGlite}=require('@electric-sql/pglite');const timer=require('../server/study-time.cjs');
const flush=async predicate=>{for(let i=0;i<200;i++){if(predicate())return;await new Promise(resolve=>setImmediate(resolve));}assert.ok(predicate(),'UI settled');};
async function setup(){
 const db=new PGlite();await db.exec(fs.readFileSync('db/study-time.sql','utf8'));
 const dom=new JSDOM('<header class="topbar"><a href="/grammar.html">Grammar</a></header>',{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;let now=1700000000000,drop=false,user='A';const intervals=[],requests=[];Object.defineProperty(w.performance,'now',{value:()=>now-1700000000000});
 w.setInterval=fn=>{intervals.push(fn);return intervals.length;};w.AbortSignal.timeout=()=>undefined;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.fetch=async(url,options={})=>{requests.push({url,body:options.body&&JSON.parse(options.body)});
  if(url==='/api/auth/session')return{ok:true,json:async()=>({user:{id:user},csrf:'test'})};
  let data;
  try{data=await db.transaction(tx=>timer.run(tx,user,options.body?JSON.parse(options.body):null,now));}
  catch(e){return {ok:false,status:e.status||500,json:async()=>({error:e.message})};}
  if(drop&&options.body){drop=false;throw Error('Network interrupted');}
  return{ok:true,json:async()=>data};
 };
 w.eval(fs.readFileSync('tests/legacy-ui/study-timer.js','utf8'));
 const q=s=>w.document.querySelector(s);
 await flush(()=>q('[data-timer-total]').textContent.includes('0.00'));
 return{db,w,q,intervals,requests,setUser:value=>user=value,advance:ms=>now+=ms,drop:()=>drop=true,close:async()=>{w.close();await db.close();}};
}
test('mobile review flow supports adjust/save, history correction/discard and guards duplicate taps',async()=>{
 const f=await setup();const {q}=f;
 try{
 q('[data-timer-main]').click();await flush(()=>q('[data-timer-main]').textContent==='Stop'&&!q('[data-timer-main]').disabled);
 for(let i=0;i<20;i++){f.advance(1000);f.intervals[0]();}q('[data-timer-main]').click();await flush(()=>q('dialog').open);
 assert.match(q('.timer-duration').textContent,/0:00:20/);
 q('[data-adjust-button]').click();assert.equal(q('[data-adjust]').hidden,false);
 q('[name="minutes"]').value='2';q('[name="seconds"]').value='0';q('[data-save]').click();q('[data-save]').click();
 await flush(()=>!q('dialog').open);assert.match(q('[data-timer-total]').textContent,/0.03/);
 q('[data-timer-history]').click();await flush(()=>!!q('.timer-history'));assert.equal(q('.timer-history').children.length,1);
 q('.timer-history button').click();q('[data-adjust-button]').click();q('[name="minutes"]').value='1';q('[data-save]').click();await flush(()=>!q('dialog').open);
 q('[data-timer-history]').click();await flush(()=>!!q('.timer-history'));q('.timer-history button').click();q('[data-discard]').click();await flush(()=>!q('dialog').open);
 assert.match(q('[data-timer-total]').textContent,/0.00/);
 }finally{await f.close();}
});
test('local start/ticks/stop never write server; lost explicit save retries once',async()=>{
 const f=await setup();const {q,w}=f;
 try{
 const before=f.requests.length;q('[data-timer-main]').click();
 for(let i=0;i<12;i++){f.advance(1000);f.intervals[0]();}
 assert.equal(f.requests.length,before);assert.equal((await f.db.query("SELECT COUNT(*)::int AS n FROM learner_study_sessions")).rows[0].n,0);
 q('[data-timer-main]').click();assert.equal(q('dialog').open,true);assert.equal(f.requests.length,before);
 f.drop();q('[data-save]').click();await flush(()=>q('[data-timer-retry]').hidden===false&&!q('[data-timer-main]').disabled);
 assert.equal((await f.db.query("SELECT SUM(confirmed_seconds) AS total FROM learner_study_sessions WHERE state='saved'")).rows[0].total,12);
 q('[data-close]').click();q('[data-timer-retry]').click();await flush(()=>q('[data-timer-retry]').hidden&&!q('[data-timer-main]').disabled);
 assert.equal((await f.db.query("SELECT COUNT(*)::int AS n FROM learner_study_sessions WHERE state='saved'")).rows[0].n,1);
 assert.equal(w.localStorage.length,0);
 }finally{await f.close();}
});
test('background/pagehide preserves paused local draft without server writes or accruing idle days',async()=>{
 const f=await setup();try{f.q('[data-timer-main]').click();f.advance(1000);f.intervals[0]();const before=f.requests.length;f.w.dispatchEvent(new f.w.Event('pagehide'));f.advance(864000000);f.intervals[0]();assert.equal(f.requests.length,before);assert.equal(f.q('[data-timer-main]').textContent,'Review time');const draft=JSON.parse(f.w.localStorage.getItem('learner.timer.draft.v1.A'));assert.equal(draft.elapsed_ms,1000);assert.equal(draft.state,'review');}finally{await f.close();}
});

test('local drafts remain account-scoped when sign-in changes',async()=>{
 const f=await setup();try{f.q('[data-timer-main]').click();f.advance(1000);f.intervals[0]();f.setUser('B');f.w.dispatchEvent(new f.w.Event('study-account-change'));await flush(()=>f.q('[data-timer-main]').textContent==='Start'&&!f.q('[data-timer-main]').disabled);assert.ok(f.w.localStorage.getItem('learner.timer.draft.v1.A'));assert.equal(f.w.localStorage.getItem('learner.timer.draft.v1.B'),null);assert.equal(f.requests.filter(r=>r.body).length,0);f.setUser('A');f.w.dispatchEvent(new f.w.Event('study-account-change'));await flush(()=>f.q('[data-timer-main]').textContent==='Review time');assert.equal(JSON.parse(f.w.localStorage.getItem('learner.timer.draft.v1.A')).elapsed_ms,1000);}finally{await f.close();}
});
