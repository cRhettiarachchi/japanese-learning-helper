const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto'),{PGlite}=require('@electric-sql/pglite');const vocabulary=require('../server/vocabulary.cjs');
const catalog={'100':{word:'食べる',readings:['たべる'],meanings:['to eat']},'200':{word:'読む',readings:['よむ'],meanings:['to read']}};
const op=(action,x={})=>({action,mutationId:randomUUID(),...x});
async function fixture(fn){const db=new PGlite();await db.exec(fs.readFileSync('db/vocabulary.sql','utf8'));const run=(user,input,now=0)=>db.transaction(tx=>vocabulary.run(tx,user,input,{now:1700000000000+now,catalog}));try{await fn(db,run);}finally{await db.close();}}
test('canonical vocabulary deduplication preserves existing schedule across additions and isolates accounts',()=>fixture(async(db,run)=>{
 const add=op('add',{entryId:'100'});let a=await run('A',add);assert.equal(a.items.length,1);assert.equal(a.items[0].word,'食べる');assert.equal(a.dueCount,1);
 assert.equal((await run('A',add)).items.length,1);assert.equal((await run('A',op('add',{entryId:'100'}))).items.length,1);
 assert.equal((await run('B')).items.length,0);await run('B',op('add',{entryId:'100'}));
 const rated=await run('A',op('rate',{entryId:'100',rating:'good',revision:1}));
 a=await run('A',op('add',{entryId:'100'}),2000);assert.equal(a.items[0].due_at.toISOString(),rated.items[0].due_at.toISOString());assert.equal(a.items[0].stage,1);
 assert.equal((await run('B')).items[0].stage,0);
 await assert.rejects(run('A',op('add',{entryId:'999'})),{status:400});
}));
test('fixed schedule follows 1,3,7,14,30,30 days, Again resets to 10 minutes; premature/stale ratings fail',()=>fixture(async(db,run)=>{
 let s=await run('A',op('add',{entryId:'100'})),now=0;
 for(const [index,days] of [1,3,7,14,30,30,30].entries()){
  const revision=s.items[0].revision;s=await run('A',op('rate',{entryId:'100',rating:'good',revision}),now);
  assert.equal(s.items[0].stage,Math.min(index+1,6));assert.equal(new Date(s.items[0].due_at).getTime(),1700000000000+now+days*86400000);
  await assert.rejects(run('A',op('rate',{entryId:'100',rating:'good',revision}),now),{status:409});
  await assert.rejects(run('A',op('rate',{entryId:'100',rating:'good',revision:s.items[0].revision}),now),{status:409});
  now+=days*86400000;
 }
 s=await run('A',op('rate',{entryId:'100',rating:'again',revision:s.items[0].revision}),now);assert.equal(s.items[0].stage,0);assert.equal(s.dueCount,0);assert.equal(new Date(s.items[0].due_at).getTime(),1700000000000+now+600000);
 assert.equal((await run('A',null,now+600000)).dueCount,1);
}));
test('rating and undo retries are idempotent; undo restores schedule with monotonic revision and blocks stale devices',()=>fixture(async(db,run)=>{
 const added=await run('A',op('add',{entryId:'100'}));const rate=op('rate',{entryId:'100',rating:'good',revision:1});
 let s=await run('A',rate);assert.equal(s.lastRating.id,rate.mutationId);s=await run('A',rate);assert.equal(s.items[0].revision,2);
 const undo=op('undo',{ratingId:rate.mutationId,revision:2});s=await run('A',undo);assert.equal(s.items[0].stage,0);assert.equal(s.items[0].revision,3);assert.equal(s.items[0].due_at.toISOString(),added.items[0].due_at.toISOString());assert.equal(s.dueCount,1);
 assert.equal((await run('A',undo)).items[0].revision,3);
 await assert.rejects(run('A',op('undo',{ratingId:rate.mutationId,revision:2})),{status:409});
 await assert.rejects(run('B',op('undo',{ratingId:rate.mutationId,revision:2})),{status:404});
 const next=op('rate',{entryId:'100',rating:'again',revision:3});await run('A',next);
 await run('A',op('rate',{entryId:'100',rating:'good',revision:4}),600000);
 await assert.rejects(run('A',op('undo',{ratingId:next.mutationId,revision:4}),600000),{status:409});
 await assert.rejects(run('A',{...rate,rating:'again'}),{status:409});
}));
test('forced RLS protects vocabulary, ratings and receipts even without app query predicates',()=>fixture(async(db,run)=>{
 await run('A',op('add',{entryId:'100'}));await run('B',op('add',{entryId:'100'}));await run('A',op('rate',{entryId:'100',rating:'good',revision:1}));await run('B',op('rate',{entryId:'100',rating:'again',revision:1}));
 const tables=['learner_vocabulary_accounts','learner_vocabulary','learner_vocabulary_ratings','learner_vocabulary_mutations'];
 await db.exec(`CREATE ROLE vocabulary_runtime; GRANT USAGE ON SCHEMA public TO vocabulary_runtime; GRANT SELECT,INSERT,UPDATE,DELETE ON ${tables.join(',')} TO vocabulary_runtime; SET ROLE vocabulary_runtime;`);
 await db.query("SELECT set_config('app.user_id','A',false)");for(const table of tables)assert.ok((await db.query(`SELECT user_id FROM ${table}`)).rows.every(r=>r.user_id==='A'));
 assert.equal((await db.query("UPDATE learner_vocabulary SET stage=5 WHERE user_id='B' RETURNING *")).rows.length,0);
 await assert.rejects(db.query("INSERT INTO learner_vocabulary_accounts(user_id) VALUES('C')"),/row-level security/);
}));
test('client cannot inject ownership, dictionary text, schedules, unknown actions or invalid revisions',()=>{
 for(const x of [op('add',{entryId:'100',userId:'B'}),op('add',{entryId:'100',word:'fake'}),op('rate',{entryId:'100',rating:'easy',revision:1}),op('rate',{entryId:'100',rating:'good',revision:0}),op('rate',{entryId:'100',rating:'good',revision:1,due_at:'tomorrow'}),op('add',{entryId:'__proto__'}),op('delete',{entryId:'100'}),op('undo',{ratingId:'x',revision:1})])assert.throws(()=>vocabulary.validate(x),{status:400});
});
