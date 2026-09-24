const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');const {validate,update,list}=require('../server/progress.cjs');
const catalog={article:{story:{}},grammar:{lesson:{}},audio:{episode:{duration:100}}};
let counter=0;const op=(overrides={})=>({kind:'article',id:'story',field:'done',value:true,expectedRevision:0,mutationId:'mutation-00000000-'+(++counter),...overrides});
test('progress schema and SQL isolate accounts, preserve unchecks, and reject stale revisions',async()=>{
 const db=new PGlite();await db.exec(fs.readFileSync('db/schema.sql','utf8'));
 const a=op();assert.equal((await update(db,'A',a,catalog)).revision,1);
 assert.equal((await update(db,'A',a,catalog)).revision,1); // retry cannot double-apply
 assert.deepEqual(await list(db,'B'),[]);
 const undone=op({value:false,expectedRevision:1});assert.equal((await update(db,'A',undone,catalog)).value,false);
 await assert.rejects(update(db,'A',op({expectedRevision:1}),catalog),{status:409});
 await update(db,'B',op(),catalog);assert.equal((await list(db,'A'))[0].value,false);assert.equal((await list(db,'B'))[0].value,true);
 await update(db,'A',op({kind:'audio',id:'episode',field:'position',value:{seconds:43,duration:100,ended:false}}),catalog);
 await update(db,'A',op({kind:'audio',id:'episode'}),catalog);
 assert.equal((await list(db,'A')).find(r=>r.field==='position').value.seconds,43);
 // A real non-owner database role proves the RLS policy, independent of app predicates.
 await db.exec('CREATE ROLE study_runtime; GRANT USAGE ON SCHEMA public TO study_runtime; GRANT SELECT,INSERT,UPDATE,DELETE ON learner_progress TO study_runtime; SET ROLE study_runtime;');
 await db.query("SELECT set_config('app.user_id',$1,false)",['A']);
 assert.ok((await db.query('SELECT user_id FROM learner_progress')).rows.every(r=>r.user_id==='A'));
 assert.equal((await db.query("UPDATE learner_progress SET value='false' WHERE user_id='B' RETURNING *")).rows.length,0);
 await assert.rejects(db.query("INSERT INTO learner_progress(user_id,kind,content_id,field,value,mutation_id) VALUES('B','article','injected','done','true','test')"),/row-level security/);
 await db.close();
});
test('untrusted content IDs, owner injection, and invalid playback values are rejected',()=>{
 for(const item of [op({user_id:'victim'}),op({id:'unknown'}),op({kind:'__proto__'}),op({value:'true'}),op({expectedRevision:-1}),op({kind:'audio',id:'episode',field:'position',value:{seconds:101,duration:100,ended:false}}),op({kind:'audio',id:'episode',field:'position',value:{seconds:12,duration:999,ended:false}})])assert.throws(()=>validate(item,catalog),{status:400});
});
