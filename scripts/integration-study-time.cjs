// Temporary accounts only; requires the local Development API and database.
const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');const {random,hash}=require('../server/auth.cjs');const {getPool,withUser}=require('../server/db.cjs');
(async()=>{
 if(process.env.APP_ORIGIN!=='http://127.0.0.1:8765')throw Error('Local Development required');
 const pool=getPool(),prefix='timer-test-'+randomUUID(),users=[prefix+'A',prefix+'B'],tokens=[random(),random()],csrf=[random(),random()];
 const clientId=randomUUID();const op=(action,extra={})=>({action,clientId,mutationId:randomUUID(),...extra});
 const req=(i=0,input,headers={})=>fetch(process.env.APP_ORIGIN+'/api/study-time',{method:input?'POST':'GET',headers:{Cookie:'learner_session='+tokens[i],...(input?{Origin:process.env.APP_ORIGIN,'Content-Type':'application/json','X-CSRF-Token':csrf[i]}:{}),...headers},...(input?{body:JSON.stringify(input)}:{})});
 const data=async(i,input)=>{const r=await req(i,input);assert.equal(r.status,200);return r.json();};
 try{
  for(let i=0;i<2;i++)await pool.query("INSERT INTO learner_sessions(token_hash,user_id,display_name,csrf,expires_at) VALUES($1,$2,'Timer test',$3,now()+interval '5 minutes')",[hash(tokens[i]),users[i],csrf[i]]);
  assert.equal((await fetch(process.env.APP_ORIGIN+'/api/study-time')).status,401);
  assert.equal((await req(0,op('start'),{'X-CSRF-Token':'wrong'})).status,403);
  const started=await Promise.all([data(0,op('start')),data(0,op('start',{clientId:randomUUID()}))]);
  assert.equal(started[0].current.id,started[1].current.id);const id=started[0].current.id;
  assert.equal((await data(1)).current,null);assert.equal((await req(1,op('stop',{id}))).status,404);
  const stopped=await data(0,op('stop',{id}));assert.equal(stopped.current.state,'review');
  const save=op('save',{id,revision:stopped.current.revision,seconds:900});
  const saved=await Promise.all([data(0,save),data(0,save)]);assert.ok(saved.every(s=>s.totalSeconds===900));
  const revision=saved[0].history[0].revision;
  const edits=await Promise.all([req(0,op('adjust',{id,revision,seconds:600})),req(0,op('adjust',{id,revision,seconds:1200}))]);
  assert.deepEqual(edits.map(r=>r.status).sort(),[200,409]);
  const after=await data(0);assert.ok([600,1200].includes(after.totalSeconds));
  await data(0,op('discard',{id,revision:after.history[0].revision}));assert.equal((await data(0)).totalSeconds,0);
  // Stale expiry on real SQL is based on the last checkpoint, not wall time away.
  const fresh=await data(0,op('start'));
  await withUser(users[0],c=>c.query("UPDATE learner_study_sessions SET elapsed_ms=12000,checkpoint_at=now()-interval '3 days' WHERE user_id=$1 AND id=$2",[users[0],fresh.current.id]));
  const recovered=await data(0);assert.equal(recovered.current.state,'review');assert.equal(recovered.current.elapsed_ms,12000);
  console.log('Development timer integration passed: auth, CSRF, account isolation, concurrent start, duplicate save, conflicting edits, discard, persistence and stale recovery.');
 }finally{
  for(const user of users)await withUser(user,async c=>{for(const table of ['learner_timer_mutations','learner_study_sessions','learner_timer_accounts'])await c.query(`DELETE FROM ${table} WHERE user_id=$1`,[user]);});
  await pool.query('DELETE FROM learner_sessions WHERE user_id=ANY($1::text[])',[users]);await pool.end();
 }
})().catch(e=>{console.error('Timer integration failed:',e.message);process.exitCode=1;});
