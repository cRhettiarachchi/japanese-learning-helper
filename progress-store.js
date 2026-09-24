(function () {
 'use strict';
 const legacyKeys={article:'hirogaru-reading-progress-v1',grammar:'hirogaru-misa-grammar-v1',audio:'japanese-learner-audio-progress-v1'};
 const keyOf=(kind,id,field)=>JSON.stringify([kind,id,field]);
 class ProgressStore {
  constructor({storage,request,notify=()=>{},uuid=()=>crypto.randomUUID(),catalog=null}){this.catalog=catalog;this.storage=storage;this.request=request;this.notify=notify;this.uuid=uuid;this.user=null;this.rows={};this.queue=[];this.csrf=null;this.busy=false;this.listeners=[];this.mode='loading';this.epoch=0;}
  read(key,fallback){try{const v=JSON.parse(this.storage.getItem(key));return v===null?fallback:v;}catch{return undefined;}}
  write(key,value){try{this.storage.setItem(key,JSON.stringify(value));return true;}catch{this.notify('Browser cache unavailable. Keep this tab open until changes sync.');return false;}}
  cacheKey(){return 'japanese-learner-account-v1:'+this.user.id;}
  operationKey(op){return this.cacheKey()+':pending:'+op.mutationId;}
  saveOperation(op){this.write(this.operationKey(op),op);}
  removeOperation(op){try{this.storage.removeItem(this.operationKey(op));}catch{this.notify('Could not clear the local pending cache.');}}
  loadQueue(){
   const prefix=this.cacheKey()+':pending:',operations=[];
   try{for(let i=0;i<this.storage.length;i++){const k=this.storage.key(i);if(k?.startsWith(prefix)){const op=this.read(k,null);if(op&&typeof op.mutationId==='string')operations.push(op);}}}catch{this.notify('Pending browser changes could not be read.');}
   return operations.sort((a,b)=>(a.queuedAt||0)-(b.queuedAt||0));
  }
  persist(){if(this.user)this.write(this.cacheKey(),{rows:this.rows});}
  emit(){for(const f of this.listeners)f();}
  subscribe(f){this.listeners.push(f);return()=>this.listeners=this.listeners.filter(x=>x!==f);}
  legacy(kind,id,field){
   const data=this.read(legacyKeys[kind],{});const item=data&&typeof data==='object'?data[id]:undefined;
   if(kind!=='audio')return item===true;
   if(field==='done')return item?.done===true;
   return item&&Number.isFinite(item.position)?{seconds:item.position,duration:item.duration,ended:item.ended===true}:null;
  }
  get(kind,id,field='done'){
   if(this.mode==='local')return this.legacy(kind,id,field);
   const k=keyOf(kind,id,field),pending=this.queue.filter(x=>keyOf(x.kind,x.id,x.field)===k).at(-1);
   return pending?pending.value:this.rows[k]?.value??(field==='done'?false:null);
  }
  async refresh(){
   if(this.busy)return;
   const epoch=++this.epoch;
   try{
    const response=await this.request('/api/auth/session');
    if(epoch!==this.epoch)return;
    const changed=this.user?.id!==response.user.id;
    this.user=response.user;this.csrf=response.csrf;this.mode='account';
    if(changed){const cache=this.read(this.cacheKey(),{})||{};this.rows=cache.rows||{};this.queue=this.loadQueue();}
    if(!changed&&!this.queue.length)this.queue=this.loadQueue();
    const result=await this.request('/api/progress');if(epoch!==this.epoch)return;if(result.userId!==this.user.id)throw Object.assign(Error('Account changed'),{status:403});
    this.rows=Object.fromEntries(result.rows.map(r=>[keyOf(r.kind,r.id,r.field),r]));this.persist();this.emit();await this.flush();
   }catch(e){
    if(epoch!==this.epoch)return;
    if(e.status===401){this.user=null;this.rows={};this.queue=[];this.csrf=null;this.mode='local';this.notify('Sign in with Vercel to sync across devices.');}
    else{this.mode=this.user?'offline':'unavailable';this.notify('Account sync is unavailable. No account data will be uploaded until sign-in is verified.');}
    this.emit();
   }
  }
  set(kind,id,field,value){
   if(this.mode==='local'){
    const all=this.read(legacyKeys[kind],{});if(!all||typeof all!=='object'||Array.isArray(all)){this.notify('Existing browser data could not be read; it was not overwritten.');return;}
    if(kind==='audio')all[id]={...all[id],...(field==='done'?{done:value}:{position:value.seconds,duration:value.duration,ended:value.ended})};
    else if(value)all[id]=true;else delete all[id];
    this.write(legacyKeys[kind],all);this.emit();return;
   }
   if(!this.user){this.notify('Progress is not saved while sign-in status is unavailable. Retry connection first.');return;}
   if(this.mode==='conflict'){this.notify('Resolve the pending conflict before making more changes.');this.emit();return;}
   const last=this.queue.filter(op=>keyOf(op.kind,op.id,op.field)===keyOf(kind,id,field)).at(-1);
   const expectedRevision=last?last.expectedRevision+1:(this.rows[keyOf(kind,id,field)]?.revision||0);
   const op={kind,id,field,value,expectedRevision,mutationId:this.uuid(),queuedAt:Date.now()};this.queue.push(op);this.saveOperation(op);this.persist();this.notify('Saving progress…');this.emit();void this.flush();
  }
  async flush(){
   if(this.busy||!this.user||this.mode==='conflict'||this.mode==='offline')return;
   this.busy=true;const owner=this.user.id,epoch=this.epoch;
   try{
    while(this.queue.length){
     const op=this.queue[0],k=keyOf(op.kind,op.id,op.field);
     op.expectedRevision??=this.rows[k]?.revision||0;this.saveOperation(op);this.persist();
     const result=await this.request('/api/progress',{method:'PUT',body:{kind:op.kind,id:op.id,field:op.field,value:op.value,mutationId:op.mutationId,expectedRevision:op.expectedRevision},csrf:this.csrf});
     if(this.user?.id!==owner||epoch!==this.epoch)return;if(result.userId!==owner)throw Object.assign(Error('Account changed'),{status:403});
     this.rows[k]=result.row;this.removeOperation(op);this.queue.shift();this.persist();this.emit();
    }
    this.mode='account';this.notify('Progress synced to your Vercel account.');
   }catch(e){
    if(e.status===409){this.mode='conflict';this.notify('Another device changed progress. Pending changes are kept; choose Refresh from account to discard them and use the server version.');}
    else if(e.status===401||e.status===403){this.mode='offline';this.csrf=null;this.notify('Sign-in changed or expired. Pending changes remain bound to the original account; reconnect to sync.');}
    else{this.mode='offline';this.notify('Not synced yet. Pending changes are saved for this account in this browser.');}
   }finally{this.busy=false;this.emit();}
  }
  async discardPending(){if(this.busy)return;for(const op of this.queue)this.removeOperation(op);this.queue=[];this.mode='account';this.persist();await this.refresh();}
  async importLegacy(){
   if(!this.user||this.mode!=='account'||this.queue.length||this.busy)return;
   const claim=this.read('japanese-learner-legacy-owner-v1',null);
   if(claim===undefined){this.notify('The old progress import record is unreadable; nothing was imported.');return;}
   if(!this.catalog){this.notify('Study catalog unavailable; retry before importing old progress.');return;}
   if(claim&&claim!==this.user.id){this.notify('This browser’s old progress was already assigned to another account.');return;}
   // Claim before queuing prevents a second account adopting the same legacy data after a partial upload.
   if(!this.write('japanese-learner-legacy-owner-v1',this.user.id))return;
   const operations=[];
   for(const kind of Object.keys(legacyKeys)){
    const data=this.read(legacyKeys[kind],{});if(!data||typeof data!=='object'||Array.isArray(data))continue;
    for(const [id,item]of Object.entries(data)){
     if(!Object.hasOwn(this.catalog[kind]||{},id))continue;
     const fields=kind==='audio'?{done:item?.done===true,position:item&&Number.isFinite(item.position)&&Number.isFinite(item.duration)&&item.position>=0&&item.position<=item.duration&&Math.abs(item.duration-this.catalog.audio[id].duration)<=2?{seconds:item.position,duration:item.duration,ended:item.ended===true}:null}:{done:item===true};
     for(const [field,value]of Object.entries(fields))if(value!==null&&value!==false&&!this.rows[keyOf(kind,id,field)])operations.push({kind,id,field,value,expectedRevision:0,mutationId:this.uuid()});
    }
   }
   operations.forEach(op=>{op.queuedAt=Date.now();this.saveOperation(op);});this.queue.push(...operations);this.persist();this.emit();await this.flush();
  }
 }
 if(typeof module!=='undefined')module.exports={ProgressStore,keyOf,legacyKeys};
 if(typeof document==='undefined')return;
 let storage;try{storage=localStorage;}catch{storage={getItem:()=>null,setItem:()=>{throw Error();},removeItem:()=>{throw Error();},key:()=>null,length:0};}
 const panel=document.createElement('section');panel.className='account-progress';panel.style.cssText='padding:.7rem 1rem;background:#e4f0f3;color:#142c40;display:flex;gap:.7rem;align-items:center;flex-wrap:wrap';
 panel.setAttribute('aria-label','Account progress');const label=document.createElement('strong'),message=document.createElement('span');message.setAttribute('role','status');
 const login=document.createElement('a');login.href='/api/auth/authorize';login.textContent='Sign in with Vercel';
 const logout=document.createElement('button');logout.textContent='Sign out';
 const retry=document.createElement('button');retry.textContent='Reconnect';
 const importButton=document.createElement('button');importButton.textContent='Import this browser’s old progress';
 const discard=document.createElement('button');discard.textContent='Refresh from account';
 label.textContent='Loading progress…';for(const button of [login,logout,retry,importButton,discard])button.hidden=true;panel.append(label,message,login,logout,retry,importButton,discard);const header=document.querySelector('.topbar');if(header)header.after(panel);else document.body.prepend(panel);
 async function request(url,options={}){
  const r=await fetch(url,{method:options.method||'GET',credentials:'same-origin',cache:'no-store',headers:options.body?{'Content-Type':'application/json','X-CSRF-Token':options.csrf}:undefined,body:options.body?JSON.stringify(options.body):undefined});
  if(!r.ok)throw Object.assign(Error('Request failed'),{status:r.status});
  if(!r.headers.get('content-type')?.includes('application/json'))throw Error('Sign in required');
  return r.json();
 }
 const store=new ProgressStore({storage,request,notify:s=>{message.textContent=s;}});
 store.subscribe(()=>{
  label.textContent=store.user?`${store.user.name} · ${store.mode==='account'&&!store.queue.length?'Synced':'Not synced'}`:'Browser progress';
  login.hidden=!!store.user&&!!store.csrf;logout.hidden=!store.user;retry.hidden=!['unavailable','offline'].includes(store.mode);
  importButton.hidden=!store.user||store.mode!=='account'||!!store.queue.length;discard.hidden=store.mode!=='conflict';
 });
 retry.onclick=()=>store.refresh();
 importButton.onclick=()=>{if(confirm(`Import old progress from this browser into ${store.user.name}? Existing account entries will be kept.`))void store.importLegacy();};
 discard.onclick=()=>{if(confirm('Discard pending browser changes and load account progress?'))void store.discardPending();};
 logout.onclick=async()=>{try{await request('/api/auth/signout',{method:'POST',body:{},csrf:store.csrf});await store.refresh();}catch{message.textContent='Could not sign out. Reconnect and try again.';}};
 window.StudyProgress=store;store.ready=(async()=>{try{store.catalog=await request('/progress-catalog.json');}catch{}await store.refresh();})();
 window.addEventListener('online',()=>store.refresh());window.addEventListener('focus',()=>store.refresh());
 window.addEventListener('storage',()=>{if(store.mode==='local')store.emit();else if(!store.busy&&!store.queue.length)void store.refresh();});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void store.refresh();});
})();
