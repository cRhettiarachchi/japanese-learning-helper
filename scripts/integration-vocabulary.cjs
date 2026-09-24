const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{random,hash}=require('../server/auth.cjs'),{getPool,withUser}=require('../server/db.cjs');
(async()=>{
 if(process.env.APP_ORIGIN!=='http://127.0.0.1:8765')throw Error('Local Development required');
 const pool=getPool(),prefix='vocabulary-test-'+randomUUID(),users=[prefix+'A',prefix+'B'],tokens=[random(),random()],csrf=[random(),random()],entryId=Object.keys(require('../server/vocabulary-catalog.json'))[0];
 const op=(action,x={})=>({action,mutationId:randomUUID(),...x});
 const req=(i=0,input,headers={})=>fetch(process.env.APP_ORIGIN+'/api/vocabulary',{method:input?'POST':'GET',headers:{Cookie:'learner_session='+tokens[i],...(input?{Origin:process.env.APP_ORIGIN,'Content-Type':'application/json','X-CSRF-Token':csrf[i]}:{}),...headers},...(input?{body:JSON.stringify(input)}:{})});
 const data=async(i,input)=>{const r=await req(i,input);assert.equal(r.status,200);return r.json();};
 try{
  for(let i=0;i<2;i++)await pool.query("INSERT INTO learner_sessions(token_hash,user_id,display_name,csrf,expires_at) VALUES($1,$2,'Vocabulary test',$3,now()+interval '5 minutes')",[hash(tokens[i]),users[i],csrf[i]]);
  assert.equal((await fetch(process.env.APP_ORIGIN+'/api/vocabulary')).status,401);assert.equal((await req(0,op('add',{entryId}),{'X-CSRF-Token':'wrong'})).status,403);
  const additions=await Promise.all([data(0,op('add',{entryId})),data(0,op('add',{entryId}))]);assert.ok(additions.every(s=>s.items.length===1));assert.equal((await data(1)).items.length,0);
  assert.equal((await req(1,op('rate',{entryId,rating:'good',revision:1}))).status,404);
  const rate=op('rate',{entryId,rating:'good',revision:1});const responses=await Promise.all([data(0,rate),data(0,rate)]);assert.ok(responses.every(s=>s.items[0].revision===2&&s.items[0].stage===1));
  const undo=op('undo',{ratingId:rate.mutationId,revision:2});await data(0,undo);await data(0,undo);assert.equal((await data(0)).items[0].revision,3);
  const competing=await Promise.all([req(0,op('rate',{entryId,rating:'good',revision:3})),req(0,op('rate',{entryId,rating:'again',revision:3}))]);assert.deepEqual(competing.map(r=>r.status).sort(),[200,409]);
  assert.equal((await data(0)).items[0].revision,4);assert.equal((await data(1)).items.length,0);
  console.log('Development vocabulary integration passed: authentication/CSRF, concurrent deduplication, cross-account isolation, duplicate rating/undo and stale-device conflict.');
 }finally{
  for(const user of users)await withUser(user,async c=>{for(const table of ['learner_vocabulary_mutations','learner_vocabulary_ratings','learner_vocabulary','learner_vocabulary_accounts'])await c.query(`DELETE FROM ${table} WHERE user_id=$1`,[user]);});
  await pool.query('DELETE FROM learner_sessions WHERE user_id=ANY($1::text[])',[users]);await pool.end();
 }
})().catch(e=>{console.error('Vocabulary integration failed:',e.message);process.exitCode=1;});
