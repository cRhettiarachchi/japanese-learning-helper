const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {randomUUID}=require('node:crypto');const {PGlite}=require('@electric-sql/pglite');const timer=require('../server/study-time.cjs');
const clientId=randomUUID();const op=(action,extra={})=>({action,clientId,mutationId:randomUUID(),...extra});
async function fixture(fn){const db=new PGlite();await db.exec(fs.readFileSync('db/study-time.sql','utf8'));const run=(user,input,time=0)=>db.transaction(tx=>timer.run(tx,user,input,1700000000000+time));try{await fn(db,run);}finally{await db.close();}}
test('timer persists checkpoints and review; only confirmed durations count, idempotent retries never count twice',()=>fixture(async(db,run)=>{
 const start=op('start');let s=await run('A',start);const id=s.current.id;
 assert.equal((await run('A',start,1000)).current.id,id);
 s=await run('A',op('heartbeat',{id}),15000);assert.equal(s.current.elapsed_ms,15000);assert.equal(s.totalSeconds,0);
 s=await run('A',op('stop',{id}),21000);assert.equal(s.current.state,'review');assert.equal(s.current.elapsed_ms,21000);
 assert.equal((await run('A',null,40000)).current.state,'review');
 const save=op('save',{id,revision:s.current.revision,seconds:120});
 s=await run('A',save,41000);assert.equal(s.totalSeconds,120);assert.equal(s.current,null);
 assert.equal((await run('A',save,42000)).totalSeconds,120);
 // Delayed retry of the original start cannot reopen a session after saving.
 assert.equal((await run('A',start,43000)).current,null);
 await assert.rejects(run('A',op('save',{id,revision:2,seconds:200}),44000),{status:409});
 s=await run('A',op('adjust',{id,revision:3,seconds:60}),45000);assert.equal(s.totalSeconds,60);
 await assert.rejects(run('A',op('adjust',{id,revision:3,seconds:600}),46000),{status:409});
 s=await run('A',op('discard',{id,revision:4}),47000);assert.equal(s.totalSeconds,0);assert.equal(s.history.length,0);
}));
test('stale sessions stop at the last checkpoint even after days; another device cannot extend owner lease',()=>fixture(async(db,run)=>{
 let s=await run('A',op('start'));const id=s.current.id;
 await assert.rejects(run('A',op('heartbeat',{id,clientId:randomUUID()}),1000),{status:409});
 s=await run('A',op('heartbeat',{id}),15000);
 s=await run('A',op('heartbeat',{id}),864000000);assert.equal(s.current.state,'review');assert.equal(s.current.elapsed_ms,15000);assert.equal(s.current.recovered,true);assert.equal(s.totalSeconds,0);
 assert.equal((await run('A',op('start'),864000001)).current.id,id);
}));
test('account isolation, one-open constraint, CSRF-compatible validation, and RLS protect every timer table',()=>fixture(async(db,run)=>{
 const a=await run('A',op('start'));const b=await run('B',op('start'));
 assert.notEqual(a.current.id,b.current.id);assert.equal((await run('A',op('start',{clientId:randomUUID()}),1000)).current.id,a.current.id);
 await assert.rejects(run('B',op('stop',{id:a.current.id}),2000),{status:404});
 await assert.rejects(db.query("INSERT INTO learner_study_sessions(id,user_id,owner_client,state,started_at,checkpoint_at) VALUES($1,'A',$2,'active',now(),now())",[randomUUID(),clientId]),/unique/);
 await db.exec('CREATE ROLE timer_runtime; GRANT USAGE ON SCHEMA public TO timer_runtime; GRANT SELECT,INSERT,UPDATE,DELETE ON learner_timer_accounts,learner_study_sessions,learner_timer_mutations TO timer_runtime; SET ROLE timer_runtime;');
 await db.query("SELECT set_config('app.user_id','A',false)");
 for(const name of ['learner_timer_accounts','learner_study_sessions','learner_timer_mutations'])assert.ok((await db.query(`SELECT user_id FROM ${name}`)).rows.every(row=>row.user_id==='A'));
 assert.equal((await db.query("UPDATE learner_study_sessions SET elapsed_ms=999 WHERE user_id='B' RETURNING *")).rows.length,0);
 await assert.rejects(db.query("INSERT INTO learner_timer_accounts(user_id) VALUES('C')"),/row-level security/);
}));
test('timer rejects owner injection, out-of-range durations, malformed IDs, and reused operation payloads',async()=>{
 for(const x of [op('start',{user_id:'victim'}),op('save',{id:randomUUID(),revision:1,seconds:-1}),op('save',{id:randomUUID(),revision:1,seconds:86401}),op('save',{id:randomUUID(),revision:1,seconds:NaN}),op('stop',{id:'bad'}),op('discard',{id:randomUUID(),revision:0})])assert.throws(()=>timer.validate(x),{status:400});
 await fixture(async(db,run)=>{const x=op('start');await run('A',x);await assert.rejects(run('A',{...x,clientId:randomUUID()}),{status:409});});
});
