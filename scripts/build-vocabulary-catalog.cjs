const fs=require('node:fs');const path=require('node:path');
function build(root){
 const entries={...JSON.parse(fs.readFileSync(path.join(root,'listening/dictionary.json'),'utf8')).entries};
 // Transcripts have their own attributed snapshot. Include any IDs not yet in the shared subset.
 for(const name of fs.readdirSync(path.join(root,'listening')).filter(n=>n.endsWith('.html'))){
  const html=fs.readFileSync(path.join(root,'listening',name),'utf8');
  const match=html.match(/<script[^>]*id="study-data"[^>]*>([\s\S]*?)<\/script>/);
  if(match)for(const [id,entry] of Object.entries(JSON.parse(match[1]).dictionary))if(!entries[id])entries[id]=entry;
 }
 const readings=JSON.parse(fs.readFileSync(path.join(root,'vocabulary-readings.json'),'utf8')).entries;
 const catalog={};
 for(const [id,e] of Object.entries(entries)){
  const meanings=[...new Set(e.senses.flatMap(s=>s.gloss||[]).filter(x=>typeof x==='string'&&x.trim()).map(x=>x.trim()))];
  const word=e.forms?.[0]||e.readings?.[0];
  if(word&&meanings.length)catalog[id]={word,reading:readings[id]?.word===word?readings[id].reading:'',readings:e.readings||[],meanings};
 }
 fs.writeFileSync(path.join(root,'server/vocabulary-catalog.json'),JSON.stringify(catalog)+'\n');
}
module.exports={build};
