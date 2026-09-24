const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {JSDOM}=require('jsdom');const {PGlite}=require('@electric-sql/pglite');const timer=require('../server/study-time.cjs');
const flush=async predicate=>{for(let i=0;i<200;i++){if(predicate())return;await new Promise(resolve=>setImmediate(resolve));}assert.ok(predicate(),'UI settled');};
async function setup(){
 const db=new PGlite();await db.exec(fs.readFileSync('db/study-time.sql','utf8'));
 const dom=new JSDOM('<header class="topbar"><a href="/grammar.html">Grammar</a></header>',{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;let now=1700000000000,drop=false;const intervals=[];
 w.setInterval=fn=>{intervals.push(fn);return intervals.length;};w.AbortSignal.timeout=()=>undefined;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.fetch=async(url,options={})=>{
  if(url==='/api/auth/session')return{ok:true,json:async()=>({user:{id:'A'},csrf:'test'})};
  let data;
  try{data=await db.transaction(tx=>timer.run(tx,'A',options.body?JSON.parse(options.body):null,now));}
  catch(e){return {ok:false,status:e.status||500,json:async()=>({error:e.message})};}
  if(drop&&options.body){drop=false;throw Error('Network interrupted');}
  return{ok:true,json:async()=>data};
 };
 w.eval(fs.readFileSync('study-timer.js','utf8'));
 const q=s=>w.document.querySelector(s);
 await flush(()=>q('[data-timer-total]').textContent.includes('0.00'));
 return{db,w,q,intervals,advance:ms=>now+=ms,drop:()=>drop=true,close:async()=>{w.close();await db.close();}};
}
test('mobile review flow supports adjust/save, history correction/discard and guards duplicate taps',async()=>{
 const f=await setup();const {q}=f;
 try{
 q('[data-timer-main]').click();q('[data-timer-main]').click();await flush(()=>q('[data-timer-main]').textContent==='Stop'&&!q('[data-timer-main]').disabled);
 f.advance(20000);q('[data-timer-main]').click();await flush(()=>q('dialog').open);
 assert.match(q('.timer-duration').textContent,/0:00:20/);
 q('[data-adjust-button]').click();assert.equal(q('[data-adjust]').hidden,false);
 q('[name="minutes"]').value='2';q('[name="seconds"]').value='0';q('[data-save]').click();q('[data-save]').click();
 await flush(()=>!q('dialog').open);assert.match(q('[data-timer-total]').textContent,/0.03/);
 q('[data-timer-history]').click();assert.equal(q('.timer-history').children.length,1);
 q('.timer-history button').click();q('[data-adjust-button]').click();q('[name="minutes"]').value='1';q('[data-save]').click();await flush(()=>!q('dialog').open);
 q('[data-timer-history]').click();q('.timer-history button').click();q('[data-discard]').click();await flush(()=>!q('dialog').open);
 assert.match(q('[data-timer-total]').textContent,/0.00/);
 }finally{await f.close();}
});
test('lost save responses replay safely, and internal navigation does not stop a timer',async()=>{
 const f=await setup();const {q,w}=f;
 try{
 q('[data-timer-main]').click();await flush(()=>q('[data-timer-main]').textContent==='Stop'&&!q('[data-timer-main]').disabled);
 // Capture the actual navigation intent, then suppress jsdom navigation itself.
 q('a').addEventListener('click',e=>e.preventDefault());q('a').click();w.dispatchEvent(new w.Event('pagehide'));
 assert.equal((await f.db.query("SELECT state FROM learner_study_sessions WHERE user_id='A'")).rows[0].state,'active');
 f.advance(12000);q('[data-timer-main]').click();await flush(()=>q('dialog').open);
 f.drop();q('[data-save]').click();await flush(()=>q('[data-timer-retry]').hidden===false&&!q('[data-timer-main]').disabled);
 assert.equal((await f.db.query("SELECT SUM(confirmed_seconds) AS total FROM learner_study_sessions WHERE state='saved'")).rows[0].total,12);
 q('[data-close]').click();q('[data-timer-retry]').click();await flush(()=>q('[data-timer-retry]').hidden&&!q('[data-timer-main]').disabled);
 assert.equal((await f.db.query("SELECT COUNT(*)::int AS n FROM learner_study_sessions WHERE state='saved'")).rows[0].n,1);
 assert.equal(w.localStorage.length,0);
 }finally{await f.close();}
});
