const {error}=require('./http.cjs');
const fs=require('node:fs');const path=require('node:path');
let catalog;
function getCatalog(){return catalog ||= JSON.parse(fs.readFileSync(path.join(__dirname,'catalog.json'),'utf8'));}
function validate(input, allowed=getCatalog()){
 if(!input||Array.isArray(input)||typeof input!=='object')throw error(400,'Invalid update');
 if(Object.keys(input).some(k=>!['kind','id','field','value','expectedRevision','mutationId'].includes(k)))throw error(400,'Unexpected update field');
 const {kind,id,field,value,expectedRevision,mutationId}=input;
 if(!Object.hasOwn(allowed,kind)||!Object.hasOwn(allowed[kind],id))throw error(400,'Unknown study item');
 if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0||!/^[a-zA-Z0-9-]{16,80}$/.test(mutationId||''))throw error(400,'Invalid revision');
 if(field==='done'){if(typeof value!=='boolean')throw error(400,'Completion must be true or false');}
 else if(field==='position'&&kind==='audio'){
  if(!value||Object.keys(value).sort().join(',')!=='duration,ended,seconds'||typeof value.ended!=='boolean'||!Number.isFinite(value.seconds)||!Number.isFinite(value.duration)||value.seconds<0||value.duration<=0||value.seconds>value.duration||Math.abs(value.duration-allowed.audio[id].duration)>2)throw error(400,'Invalid playback position');
 }else throw error(400,'Invalid progress field');
 return input;
}
async function list(client,userId){return (await client.query('SELECT kind,content_id AS id,field,value,revision FROM learner_progress WHERE user_id=$1',[userId])).rows;}
async function update(client,userId,input,allowed){
 const x=validate(input,allowed);
 const existing=(await client.query('SELECT kind,content_id AS id,field,value,revision,mutation_id FROM learner_progress WHERE user_id=$1 AND kind=$2 AND content_id=$3 AND field=$4',[userId,x.kind,x.id,x.field])).rows[0];
 if(existing?.mutation_id===x.mutationId){delete existing.mutation_id;return existing;}
 let result;
 if(x.expectedRevision===0) result=await client.query('INSERT INTO learner_progress(user_id,kind,content_id,field,value,mutation_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING kind,content_id AS id,field,value,revision',[userId,x.kind,x.id,x.field,JSON.stringify(x.value),x.mutationId]);
 else result=await client.query('UPDATE learner_progress SET value=$5,revision=revision+1,mutation_id=$6,updated_at=now() WHERE user_id=$1 AND kind=$2 AND content_id=$3 AND field=$4 AND revision=$7 RETURNING kind,content_id AS id,field,value,revision',[userId,x.kind,x.id,x.field,JSON.stringify(x.value),x.mutationId,x.expectedRevision]);
 if(!result.rows[0])throw error(409,'Another device changed this item. Refresh and retry.');
 return result.rows[0];
}
module.exports={validate,list,update};
