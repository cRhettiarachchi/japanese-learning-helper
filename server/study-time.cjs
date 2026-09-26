const {randomUUID,createHash}=require('node:crypto');
const {error}=require('./http.cjs');
const LEASE_MS=45000,MAX_MS=86400000;
const uuid=s=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
function validate(x){
 const actions=['start','heartbeat','stop','save','adjust','discard','commit'];
 if(!x||typeof x!=='object'||Array.isArray(x)||!actions.includes(x.action)||!uuid(x.mutationId)||!uuid(x.clientId))throw error(400,'Invalid timer request');
 const allowed=['action','mutationId','clientId'];
 if(x.action!=='start')allowed.push('id');
 if(['save','adjust','discard'].includes(x.action))allowed.push('revision');
 if(['save','adjust','commit'].includes(x.action))allowed.push('seconds');
 if(Object.keys(x).some(k=>!allowed.includes(k))||(x.action!=='start'&&!uuid(x.id)))throw error(400,'Invalid timer request');
 if(allowed.includes('revision')&&(!Number.isInteger(x.revision)||x.revision<1))throw error(400,'Invalid revision');
 if(allowed.includes('seconds')&&(!Number.isInteger(x.seconds)||x.seconds<0||x.seconds>86400))throw error(400,'Choose a duration between 0 and 24 hours');
}
// Must run inside withUser's transaction. A single per-account lock serializes all devices.
async function run(db,userId,input=null,testNow){
 if(input)validate(input);
 await db.query('INSERT INTO learner_timer_accounts(user_id) VALUES($1) ON CONFLICT DO NOTHING',[userId]);
 await db.query('SELECT user_id FROM learner_timer_accounts WHERE user_id=$1 FOR UPDATE',[userId]);
 const now=testNow===undefined?new Date((await db.query('SELECT clock_timestamp() AS now')).rows[0].now).getTime():testNow;
 const time=new Date(now).toISOString();
 let open=(await db.query("SELECT * FROM learner_study_sessions WHERE user_id=$1 AND state IN ('active','review')",[userId])).rows[0];
 // Expired browsers never accrue the unobserved interval, even if it lasted days.
 if(open?.state==='active'&&now-new Date(open.checkpoint_at).getTime()>LEASE_MS){
  await db.query("UPDATE learner_study_sessions SET state='review',stopped_at=checkpoint_at,recovered=true,revision=revision+1 WHERE user_id=$1 AND id=$2",[userId,open.id]);
  open={...open,state:'review'};
 }
 if(input){
  const x=input,hash=createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))))).digest('hex');
  const prior=x.action==='heartbeat'?null:(await db.query('SELECT payload_hash FROM learner_timer_mutations WHERE user_id=$1 AND id=$2',[userId,x.mutationId])).rows[0];
  if(prior&&prior.payload_hash!==hash)throw error(409,'This request was already used. Refresh and try again.');
  if(!prior){
   if(x.action==='commit'){
    // Explicit local-draft commit: no prior server start/checkpoints are required.
    const inserted=await db.query("INSERT INTO learner_study_sessions(id,user_id,owner_client,state,elapsed_ms,confirmed_seconds,started_at,checkpoint_at,stopped_at,saved_at) VALUES($1,$2,$3,'saved',$4,$5,$6,$7,$7,$7) ON CONFLICT DO NOTHING RETURNING id",[x.id,userId,x.clientId,x.seconds*1000,x.seconds,new Date(now-x.seconds*1000).toISOString(),time]);
    if(!inserted.rows.length)throw error(409,'This draft has already been committed. Refresh saved history.');
   }else if(x.action==='start'){
    if(!open)await db.query("INSERT INTO learner_study_sessions(id,user_id,owner_client,state,started_at,checkpoint_at) VALUES($1,$2,$3,'active',$4,$4)",[randomUUID(),userId,x.clientId,time]);
   }else{
    let row=(await db.query('SELECT * FROM learner_study_sessions WHERE user_id=$1 AND id=$2',[userId,x.id])).rows[0];
    if(!row)throw error(404,'Study session not found');
    if(['heartbeat','stop'].includes(x.action)&&row.state==='active'){
     if(x.action==='heartbeat'&&row.owner_client!==x.clientId)throw error(409,'Timer is running in another tab or device');
     const delta=Math.max(0,now-new Date(row.checkpoint_at).getTime());
     const elapsed=Math.min(MAX_MS,row.elapsed_ms+delta);
     const stop=x.action==='stop'||elapsed===MAX_MS;
     await db.query("UPDATE learner_study_sessions SET elapsed_ms=$3,checkpoint_at=$4,state=$5,stopped_at=$6,revision=revision+$7 WHERE user_id=$1 AND id=$2",[userId,row.id,elapsed,time,stop?'review':'active',stop?time:null,stop?1:0]);
    }else if(['save','adjust','discard'].includes(x.action)){
     if(row.revision!==x.revision)throw error(409,'This session changed on another device. Refresh before editing.');
     if(x.action==='save'&&row.state!=='review'||x.action==='adjust'&&row.state!=='saved'||x.action==='discard'&&!['review','saved'].includes(row.state))throw error(409,'Refresh to see this session’s current state');
     const state=x.action==='discard'?'discarded':'saved';
     await db.query('UPDATE learner_study_sessions SET state=$3,confirmed_seconds=$4,saved_at=$5,revision=revision+1 WHERE user_id=$1 AND id=$2',[userId,row.id,state,state==='saved'?x.seconds:null,time]);
    }
   }
   if(x.action!=='heartbeat')await db.query('INSERT INTO learner_timer_mutations(user_id,id,payload_hash) VALUES($1,$2,$3)',[userId,x.mutationId,hash]);
  }
 }
 const current=(await db.query("SELECT * FROM learner_study_sessions WHERE user_id=$1 AND state IN ('active','review')",[userId])).rows[0]||null;
 const history=(await db.query("SELECT * FROM learner_study_sessions WHERE user_id=$1 AND state='saved' ORDER BY started_at DESC LIMIT 50",[userId])).rows;
 const total=Number((await db.query("SELECT COALESCE(SUM(confirmed_seconds),0) AS total FROM learner_study_sessions WHERE user_id=$1 AND state='saved'",[userId])).rows[0].total);
 return {userId,current,history,totalSeconds:total,serverNow:time,leaseMs:LEASE_MS};
}
module.exports={run,validate,LEASE_MS};

// Read-only rendering path: no account insert, locks, or legacy timer recovery writes.
async function snapshot(db, userId, now = Date.now()) {
  const current =
    (
      await db.query(
        "SELECT * FROM learner_study_sessions WHERE user_id=$1 AND state IN ('active','review')",
        [userId],
      )
    ).rows[0] || null;
  const history = (
    await db.query(
      "SELECT * FROM learner_study_sessions WHERE user_id=$1 AND state='saved' ORDER BY started_at DESC LIMIT 50",
      [userId],
    )
  ).rows;
  const totalSeconds = Number(
    (
      await db.query(
        "SELECT COALESCE(SUM(confirmed_seconds),0) AS total FROM learner_study_sessions WHERE user_id=$1 AND state='saved'",
        [userId],
      )
    ).rows[0].total,
  );
  return {
    userId,
    current,
    history,
    totalSeconds,
    serverNow: new Date(now).toISOString(),
    leaseMs: LEASE_MS,
  };
}
module.exports.snapshot = snapshot;
