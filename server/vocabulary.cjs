const {createHash}=require('node:crypto');const {error}=require('./http.cjs');
const DAYS=[1,3,7,14,30,30];let savedCatalog;
const catalog=()=>savedCatalog||=require('./vocabulary-catalog.json');
const uuid=s=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
function validate(x){
 if(!x||typeof x!=='object'||Array.isArray(x)||!['add','rate','undo'].includes(x.action)||!uuid(x.mutationId))throw error(400,'Invalid vocabulary request');
 const fields=['action','mutationId'];
 if(x.action!=='undo'){fields.push('entryId');if(typeof x.entryId!=='string'||!/^\d{1,12}$/.test(x.entryId))throw error(400,'Invalid dictionary entry');}
 if(x.action!=='add'){fields.push('revision');if(!Number.isInteger(x.revision)||x.revision<1)throw error(400,'Invalid revision');}
 if(x.action==='rate'){fields.push('rating');if(!['good','again'].includes(x.rating))throw error(400,'Choose Good or Again');}
 if(x.action==='undo'){fields.push('ratingId');if(!uuid(x.ratingId))throw error(400,'Invalid rating');}
 if(Object.keys(x).some(k=>!fields.includes(k)))throw error(400,'Unexpected vocabulary field');
}
function schedule(stage,rating,now){return rating==='again'?{stage:0,due:new Date(now+600000).toISOString()}:{stage:Math.min(6,stage+1),due:new Date(now+DAYS[Math.min(stage,5)]*86400000).toISOString()};}
// Caller supplies a transaction with account RLS configured.
async function run(db,userId,input=null,{now:override,catalog:allowed}={}){
 if(input)validate(input);
 await db.query('INSERT INTO learner_vocabulary_accounts(user_id) VALUES($1) ON CONFLICT DO NOTHING',[userId]);
 await db.query('SELECT user_id FROM learner_vocabulary_accounts WHERE user_id=$1 FOR UPDATE',[userId]);
 const now=override??new Date((await db.query('SELECT clock_timestamp() AS now')).rows[0].now).getTime(),time=new Date(now).toISOString();
 if(input){
  const x=input,hash=createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))))).digest('hex');
  const previous=(await db.query('SELECT payload_hash FROM learner_vocabulary_mutations WHERE user_id=$1 AND id=$2',[userId,x.mutationId])).rows[0];
  if(previous&&previous.payload_hash!==hash)throw error(409,'Request already used. Refresh before trying again.');
  if(!previous){
   if(x.action==='add'){
    const source=allowed||catalog();if(!Object.hasOwn(source,x.entryId))throw error(400,'This dictionary entry is not available for review');
    const e=source[x.entryId];
    await db.query('INSERT INTO learner_vocabulary(user_id,entry_id,word,reading,readings,meanings,due_at,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$7) ON CONFLICT(user_id,entry_id) DO NOTHING',[userId,x.entryId,e.word,e.reading||'',JSON.stringify(e.readings),JSON.stringify(e.meanings),time]);
   }else if(x.action==='rate'){
    const row=(await db.query('SELECT * FROM learner_vocabulary WHERE user_id=$1 AND entry_id=$2',[userId,x.entryId])).rows[0];
    if(!row)throw error(404,'Vocabulary entry not found');
    if(row.revision!==x.revision)throw error(409,'This word changed on another device. Refresh the review queue.');
    if(new Date(row.due_at).getTime()>now)throw error(409,'This word is not due yet. Refresh the review queue.');
    const next=schedule(row.stage,x.rating,now);
    await db.query('INSERT INTO learner_vocabulary_ratings(user_id,id,entry_id,rating,previous_stage,previous_due_at,applied_revision,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[userId,x.mutationId,x.entryId,x.rating,row.stage,row.due_at,row.revision+1,time]);
    await db.query('UPDATE learner_vocabulary SET stage=$3,due_at=$4,revision=revision+1 WHERE user_id=$1 AND entry_id=$2',[userId,x.entryId,next.stage,next.due]);
   }else{
    const event=(await db.query('SELECT * FROM learner_vocabulary_ratings WHERE user_id=$1 AND id=$2',[userId,x.ratingId])).rows[0];
    if(!event)throw error(404,'Rating not found');
    const row=(await db.query('SELECT * FROM learner_vocabulary WHERE user_id=$1 AND entry_id=$2',[userId,event.entry_id])).rows[0];
    if(event.undone_at||event.applied_revision!==x.revision||row.revision!==x.revision)throw error(409,'A newer change prevents undo. Refresh the review queue.');
    await db.query('UPDATE learner_vocabulary SET stage=$3,due_at=$4,revision=revision+1 WHERE user_id=$1 AND entry_id=$2',[userId,event.entry_id,event.previous_stage,event.previous_due_at]);
    await db.query('UPDATE learner_vocabulary_ratings SET undone_at=$3 WHERE user_id=$1 AND id=$2',[userId,x.ratingId,time]);
   }
   await db.query('INSERT INTO learner_vocabulary_mutations(user_id,id,payload_hash) VALUES($1,$2,$3)',[userId,x.mutationId,hash]);
  }
 }
 const items=(await db.query('SELECT entry_id,word,reading,readings,meanings,stage,due_at,revision,created_at FROM learner_vocabulary WHERE user_id=$1 ORDER BY due_at,created_at,entry_id',[userId])).rows;
 // Enrich older saved snapshots only when the canonical word still matches exactly.
 const source=allowed||catalog();
 for(const item of items)if(!item.reading&&source[item.entry_id]?.word===item.word)item.reading=source[item.entry_id].reading||'';
 let lastRating=null;
 if(input?.action==='rate'){
  const e=(await db.query('SELECT id,entry_id,applied_revision,rating,undone_at FROM learner_vocabulary_ratings WHERE user_id=$1 AND id=$2',[userId,input.mutationId])).rows[0];
  if(e&&!e.undone_at)lastRating={id:e.id,entryId:e.entry_id,revision:e.applied_revision,rating:e.rating};
 }
 return {userId,items,dueCount:items.filter(e=>new Date(e.due_at).getTime()<=now).length,serverNow:time,lastRating};
}
module.exports={run,validate,schedule,DAYS};
