(function () {
 'use strict';
 const legacyKeys={article:'hirogaru-reading-progress-v1',grammar:'hirogaru-misa-grammar-v1',audio:'japanese-learner-audio-progress-v1'};
 const keyOf=(kind,id,field)=>JSON.stringify([kind,id,field]);
 class ProgressStore {
  constructor({storage,request,notify=()=>{},uuid=()=>crypto.randomUUID(),catalog=null}){Object.assign(this,{storage,request,notify,uuid,catalog});this.user=null;this.rows={};this.queue=[];this.csrf=null;this.busy=false;this.loading=true;this.loaded=false;this.listeners=[];this.mode='loading';}
  read(key,fallback){try{const v=JSON.parse(this.storage.getItem(key));return v===null?fallback:v;}catch{return undefined;}}
  write(key,value){try{this.storage.setItem(key,JSON.stringify(value));return true;}catch{this.notify('Browser cache unavailable. Keep this page open until saving finishes.');return false;}}
  cacheKey(){return 'japanese-learner-account-v1:'+this.user.id;}
  operationKey(op){return this.cacheKey()+':pending:'+op.mutationId;}
  saveOperation(op){this.write(this.operationKey(op),op);}
  removeOperation(op){try{this.storage.removeItem(this.operationKey(op));}catch{this.notify('Could not clear a pending save from this browser.');}}
  loadQueue(){
   const prefix=this.cacheKey()+':pending:',operations=[];
   try{for(let i=0;i<this.storage.length;i++){const k=this.storage.key(i);if(k?.startsWith(prefix)){const op=this.read(k,null);if(op&&typeof op.mutationId==='string')operations.push(op);}}}catch{this.notify('Pending saves could not be read.');}
   return operations.sort((a,b)=>(a.queuedAt||0)-(b.queuedAt||0));
  }
  persist(){if(this.user)this.write(this.cacheKey(),{rows:this.rows});}
  emit(){for(const f of this.listeners)f();}
  subscribe(f){this.listeners.push(f);return()=>this.listeners=this.listeners.filter(x=>x!==f);}
  canEdit(){return !!this.user&&this.loaded&&!this.loading;}
  get(kind,id,field='done'){
   const k=keyOf(kind,id,field),pending=this.queue.filter(x=>keyOf(x.kind,x.id,x.field)===k).at(-1);
   return pending?pending.value:this.rows[k]?.value??(field==='done'?false:null);
  }
  async refresh(){
   if(this.busy){this.refreshAgain=true;return;}
   this.busy=true;this.loading=true;this.emit();
   try{
    const response=await this.request('/api/auth/session');
    const changed=this.user?.id!==response.user.id;
    this.user=response.user;this.csrf=response.csrf;
    if(changed){this.rows={};this.queue=[];this.loaded=false;this.emit();}
    const result=await this.request('/api/progress');
    if(result.userId!==this.user.id)throw Object.assign(Error('Account changed'),{status:403});
    this.rows=Object.fromEntries(result.rows.map(r=>[keyOf(r.kind,r.id,r.field),r]));
    // Merge journals with in-memory saves (storage may be unavailable).
    this.queue=[...new Map([...this.loadQueue(),...this.queue].map(op=>[op.mutationId,op])).values()].sort((a,b)=>(a.queuedAt||0)-(b.queuedAt||0));
    this.loaded=true;this.mode='account';this.persist();this.migrateLegacy();this.notify('');
   }catch(e){
    if(e.status===401){this.user=null;this.rows={};this.queue=[];this.csrf=null;this.loaded=false;this.mode='signedout';this.notify('');}
    else{if(e.status===403){this.csrf=null;this.rows={};this.queue=[];this.loaded=false;}this.mode=this.user?'offline':'unavailable';this.notify('Unable to connect. Saving will retry automatically when connected.');}
   }finally{this.loading=false;this.busy=false;this.emit();}
   await this.flush();
   if(this.refreshAgain){this.refreshAgain=false;await this.refresh();}
  }
  set(kind,id,field,value){
   if(!this.canEdit()){this.emit();return;}
   const k=keyOf(kind,id,field),last=this.queue.filter(op=>keyOf(op.kind,op.id,op.field)===k).at(-1);
   // Playback events can repeat an unchanged position; avoid needless revisions.
   if((last||this.rows[k])&&JSON.stringify(this.get(kind,id,field))===JSON.stringify(value))return;
   const expectedRevision=last?last.expectedRevision+1:(this.rows[k]?.revision||0);
   const op={kind,id,field,value,expectedRevision,mutationId:this.uuid(),queuedAt:Date.now()};this.queue.push(op);this.saveOperation(op);this.persist();this.emit();void this.flush();
  }
  async flush(){
   if(this.busy||!this.user||!this.loaded||this.mode!=='account')return;
   this.busy=true;const owner=this.user.id;let conflict=false;
   try{
    while(this.queue.length){
     const op=this.queue[0],k=keyOf(op.kind,op.id,op.field);
     try{
      const result=await this.request('/api/progress',{method:'PUT',body:{kind:op.kind,id:op.id,field:op.field,value:op.value,mutationId:op.mutationId,expectedRevision:op.expectedRevision},csrf:this.csrf});
      if(result.userId!==owner)throw Object.assign(Error('Account changed'),{status:403});
      this.rows[k]=result.row;this.removeOperation(op);this.queue.shift();
     }catch(e){
      if(e.status!==409)throw e;
      // A stale edit must never resurrect an uncheck or overwrite newer playback.
      const result=await this.request('/api/progress');
      if(result.userId!==owner)throw Object.assign(Error('Account changed'),{status:403});
      const rejected=this.queue.filter(x=>keyOf(x.kind,x.id,x.field)===k);
      // Retain rejected intentions for recovery without leaving them in the retry queue.
      if(!this.write(this.cacheKey()+':superseded:'+op.mutationId,rejected))throw Error('Recovery cache unavailable');
      rejected.forEach(x=>this.removeOperation(x));this.queue=this.queue.filter(x=>keyOf(x.kind,x.id,x.field)!==k);
      this.rows=Object.fromEntries(result.rows.map(r=>[keyOf(r.kind,r.id,r.field),r]));conflict=true;
     }
     this.persist();this.emit();
    }
    this.notify(conflict?'A newer change from another device was kept.':'');
   }catch(e){
    this.mode='offline';
    if(e.status===401||e.status===403){this.csrf=null;this.loaded=false;this.rows={};this.queue=[];this.notify('Please sign in again. Pending saves are kept for the original account.');}
    else this.notify('Changes are waiting to save. Retrying automatically when connected.');
   }finally{this.busy=false;this.emit();}
   if(this.refreshAgain){this.refreshAgain=false;await this.refresh();}
  }
  migrateLegacy(){
   const marker=this.cacheKey()+':legacy-migrated-v2';
   // Unowned old browser data has no reliable identity or timestamps. Preserve it untouched.
   if(this.read('japanese-learner-legacy-owner-v1',null)!==this.user.id||this.read(marker,false)||!this.catalog)return;
   for(const kind of Object.keys(legacyKeys)){
    const data=this.read(legacyKeys[kind],{});if(!data||typeof data!=='object'||Array.isArray(data))continue;
    for(const [id,item]of Object.entries(data)){
     if(!Object.hasOwn(this.catalog[kind]||{},id))continue;
     const fields=kind==='audio'?{done:item?.done===true,position:item&&Number.isFinite(item.position)&&Number.isFinite(item.duration)&&item.position>=0&&item.position<=item.duration&&Math.abs(item.duration-this.catalog.audio[id].duration)<=2?{seconds:item.position,duration:item.duration,ended:item.ended===true}:null}:{done:item===true};
     for(const [field,value]of Object.entries(fields)){
      const k=keyOf(kind,id,field);
      if(value===null||value===false||this.rows[k]||this.queue.some(op=>keyOf(op.kind,op.id,op.field)===k))continue;
      const op={kind,id,field,value,expectedRevision:0,mutationId:this.uuid(),queuedAt:Date.now()};
      if(!this.write(this.operationKey(op),op))return;
      this.queue.push(op);
     }
    }
   }
   this.write(marker,true);
  }
 }
 if(typeof module!=='undefined')module.exports={ProgressStore,keyOf,legacyKeys};
 if(typeof document==='undefined')return;
 let storage;try{storage=localStorage;}catch{storage={getItem:()=>null,setItem:()=>{throw Error();},removeItem:()=>{throw Error();},key:()=>null,length:0};}
 const panel=document.createElement('div');panel.className='account-menu';
 const login=document.createElement('a');login.href='/api/auth/authorize';login.textContent='Sign in';
 const menu=document.createElement('details'),profile=document.createElement('summary');
 profile.setAttribute('aria-label','Profile');profile.title='Profile';
 profile.innerHTML='<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/></svg>';
 const options=document.createElement('div'),logout=document.createElement('button');logout.textContent='Sign out';logout.type='button';options.append(logout);menu.append(profile,options);
 const message=document.createElement('p');message.className='account-feedback';message.setAttribute('role','status');message.hidden=true;
 login.hidden=true;menu.hidden=true;panel.append(login,menu);
 const style=document.createElement('style');style.textContent='.account-menu{display:flex;justify-content:flex-end;align-items:center;margin:.4rem 1rem;min-height:44px}.account-menu [hidden],.account-feedback[hidden]{display:none}.account-menu details{position:relative}.account-menu summary{list-style:none;cursor:pointer;display:grid;place-items:center;min-width:44px;min-height:44px;border-radius:50%;border:1px solid #9aa8b3}.account-menu summary::-webkit-details-marker{display:none}.account-menu details>div{position:absolute;right:0;top:100%;z-index:30;background:#fff;color:#142c40;border:1px solid #9aa8b3;border-radius:8px;padding:.4rem;box-shadow:0 4px 14px #0002}.account-menu button,.account-menu a{min-height:44px;min-width:88px;padding:.5rem .8rem;white-space:nowrap}.account-menu summary:focus-visible{outline:3px solid #287ba1;outline-offset:3px}.account-feedback{margin:.4rem 1rem;padding:.6rem;color:#70340b;background:#fff3df;border-radius:6px}';document.head.append(style);
 const header=document.querySelector('.topbar');if(header)header.after(panel,message);else document.body.prepend(panel,message);
 async function request(url,options={}){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
  try{
   const r=await fetch(url,{signal:controller.signal,method:options.method||'GET',credentials:'same-origin',cache:'no-store',headers:options.body?{'Content-Type':'application/json','X-CSRF-Token':options.csrf}:undefined,body:options.body?JSON.stringify(options.body):undefined});
   if(!r.ok)throw Object.assign(Error('Request failed'),{status:r.status});
   if(!r.headers.get('content-type')?.includes('application/json'))throw Error('Sign in required');
   return await r.json();
  }finally{clearTimeout(timeout);}
 }
 if(window.parent!==window)panel.remove();
 const store=new ProgressStore({storage,request,notify:s=>{message.textContent=s;message.hidden=!s;}});
 let reportedIdentity;
 store.subscribe(()=>{
  const identity=store.user?.id||null;if(!store.loading&&reportedIdentity!==identity){reportedIdentity=identity;if(window.parent!==window)window.parent.postMessage({type:'study-identity'},location.origin);}
  login.hidden=!!store.user&&!!store.csrf;menu.hidden=!store.user;logout.disabled=store.busy;
  profile.setAttribute('aria-label',store.user?`Profile: ${store.user.name}`:'Profile');
 });
 document.addEventListener('click',event=>{if(!menu.contains(event.target))menu.open=false;});
 menu.addEventListener('keydown',event=>{if(event.key==='Escape'){menu.open=false;profile.focus();}});
 logout.onclick=async()=>{logout.disabled=true;try{await request('/api/auth/signout',{method:'POST',body:{},csrf:store.csrf});menu.open=false;await store.refresh();}catch{message.textContent='Could not sign out. Please try again.';message.hidden=false;}finally{logout.disabled=false;}};
 window.StudyProgress=store;store.ready=(async()=>{try{store.catalog=await request('/progress-catalog.json');}catch{}await store.refresh();})();
 const refresh=()=>{if(!document.hidden)void store.refresh();};
 window.addEventListener('online',refresh);window.addEventListener('focus',refresh);
 window.addEventListener('storage',event=>{if(event.key===null||event.key?.includes(':pending:'))refresh();});
 document.addEventListener('visibilitychange',refresh);
 // Background retry and cross-device refresh require no user-operated sync control.
 setInterval(refresh,15000);
})();
