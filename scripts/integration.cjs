// Opt-in integration test uses uniquely named temporary accounts in the Development database.
const assert=require('node:assert/strict');const {random,hash}=require('../server/auth.cjs');const {getPool,withUser}=require('../server/db.cjs');const catalog=require('../server/catalog.json');
(async()=>{
 if(process.env.APP_ORIGIN!=='http://127.0.0.1:3000')throw Error('Local Development origin required');
 const pool=getPool(),prefix='integration-'+random(),users=[prefix+'-A',prefix+'-B'],tokens=[random(),random()],csrf=[random(),random()];
 const request=(path,index=0,options={})=>fetch(process.env.APP_ORIGIN+path,{...options,headers:{Cookie:'learner_session='+tokens[index],...(options.method?{Origin:process.env.APP_ORIGIN,'Content-Type':'application/json','X-CSRF-Token':csrf[index]}:{}),...options.headers}});
 try{
  for(let i=0;i<2;i++)await pool.query("INSERT INTO learner_sessions(token_hash,user_id,display_name,csrf,expires_at) VALUES($1,$2,$3,$4,now()+interval '5 minutes')",[hash(tokens[i]),users[i],'Integration fixture',csrf[i]]);
  const anonymous=await fetch(process.env.APP_ORIGIN+'/api/progress');assert.equal(anonymous.status,401);assert.equal(anonymous.headers.get('cache-control'),'no-store');
  let r=await request('/api/auth/session');assert.equal((await r.json()).user.id,users[0]);
  const update={kind:'article',id:Object.keys(catalog.article)[0],field:'done',value:true,expectedRevision:0,mutationId:random()};
  // mutation IDs are UUID-compatible; random base64 may contain underscores, so use UUID explicitly.
  update.mutationId=require('node:crypto').randomUUID();
  r=await request('/api/progress',0,{method:'PUT',body:JSON.stringify(update)});assert.equal(r.status,200);assert.equal((await r.json()).row.value,true);
  r=await request('/api/progress',1);assert.deepEqual((await r.json()).rows,[]);
  r=await request('/api/progress',1,{method:'PUT',body:JSON.stringify(update),headers:{'X-CSRF-Token':csrf[0]}});assert.equal(r.status,403);
  r=await request('/api/progress',0,{method:'PUT',body:JSON.stringify({...update,user_id:users[1]})});assert.equal(r.status,400);
  r=await request('/api/progress',0,{method:'PUT',body:JSON.stringify({...update,expectedRevision:1,value:false,mutationId:require('node:crypto').randomUUID()})});assert.equal(r.status,200);assert.equal((await r.json()).row.value,false);
  r=await request('/api/auth/signout',0,{method:'POST',body:'{}'});assert.equal(r.status,200);r=await request('/api/progress');assert.equal(r.status,401);
  for(const path of ['/.env.local','/server/catalog.json','/db/schema.sql','/.git/config'])assert.equal((await fetch(process.env.APP_ORIGIN+path)).status,404);
  const range=await fetch(process.env.APP_ORIGIN+'/audio/teppei-1587.mp3',{headers:{Range:'bytes=0-127'}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,128);
  console.log('Development integration passed: real Postgres sessions, API A/B isolation, CSRF, uncheck, logout, private-file exclusion and audio ranges.');
 }finally{
  for(const id of users)await withUser(id,c=>c.query('DELETE FROM learner_progress WHERE user_id=$1',[id]));
  await pool.query('DELETE FROM learner_sessions WHERE user_id=ANY($1::text[])',[users]);await pool.end();
 }
})().catch(e=>{console.error('Integration test failed:',e.message);process.exitCode=1;});
