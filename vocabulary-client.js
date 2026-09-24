(function(root){
 'use strict';
 class VocabularyStore {
  constructor({request,storage,uuid=()=>crypto.randomUUID()}){this.request=request;this.storage=storage;this.uuid=uuid;this.auth=null;this.data=null;this.busy=false;this.error='';this.lastRating=null;this.listeners=[];}
  subscribe(fn){this.listeners.push(fn);return()=>this.listeners=this.listeners.filter(x=>x!==fn);}
  emit(){for(const fn of this.listeners)fn();}
  prefix(){return 'learner.vocabulary.pending.'+this.auth.user.id+':';}
  pending(){const result=[];const prefix=this.prefix();for(let i=0;i<this.storage.length;i++){const key=this.storage.key(i);if(key?.startsWith(prefix))result.push({key,...JSON.parse(this.storage.getItem(key))});}return result.sort((a,b)=>a.at-b.at);}
  accept(data){if(data.userId!==this.auth?.user.id){this.data=null;this.lastRating=null;throw Error('Account changed. Refresh to reconnect.');}this.data=data;if(data.lastRating)this.lastRating=data.lastRating;if(this.lastRating&&data.items.find(e=>e.entry_id===this.lastRating.entryId)?.revision!==this.lastRating.revision)this.lastRating=null;this.emit();}
  async send(body){return this.request('/api/vocabulary',{method:'POST',csrf:this.auth.csrf,body});}
  async load(){
   if(this.busy)return false;this.busy=true;this.error='';this.emit();
   try{
    const auth=await this.request('/api/auth/session');
    if(auth.user.id!==this.auth?.user.id){this.data=null;this.lastRating=null;}
    this.auth=auth;
    for(const pending of this.pending()){
     try{this.accept(await this.send(pending.body));this.storage.removeItem(pending.key);}
     catch(e){if(e.status&&e.status<500)this.storage.removeItem(pending.key);throw e;}
    }
    this.accept(await this.request('/api/vocabulary'));return true;
   }catch(e){this.fail(e);return false;}finally{this.busy=false;this.emit();}
  }
  fail(e){if(e.status===401){this.auth=null;this.data=null;this.lastRating=null;this.error='Sign in to save and review vocabulary.';}else this.error=e.status===409?'This word changed on another device. Refresh before rating it again.':e.message||'Cannot connect. Your pending change is kept for Retry.';}
  async mutate(input){
   if(this.busy||!this.auth)return false;this.busy=true;this.error='';this.emit();let key;
   try{
    if(this.pending().length)throw Error('A previous change needs Retry before another action.');
    const body={...input,mutationId:this.uuid()};key=this.prefix()+body.mutationId;
    this.storage.setItem(key,JSON.stringify({body,at:Date.now()}));
    this.accept(await this.send(body));this.storage.removeItem(key);
    if(input.action==='undo')this.lastRating=null;
    return true;
   }catch(e){if(key&&e.status&&e.status<500)this.storage.removeItem(key);this.fail(e);return false;}finally{this.busy=false;this.emit();}
  }
  has(id){return !!this.data?.items.some(item=>item.entry_id===id);}
 }
 async function request(url,{method,csrf,body}={}){
  const response=await fetch(url,{method:method||'GET',credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(12000),headers:body?{'Content-Type':'application/json','X-CSRF-Token':csrf}:undefined,body:body?JSON.stringify(body):undefined});
  const data=await response.json();if(!response.ok)throw Object.assign(Error(data.error||'Request failed'),{status:response.status});return data;
 }
 function attachSaveControls(container,entries){
  const store=root.VocabularyReview.store,doc=container.ownerDocument;
  const make=(tag,text)=>{const e=doc.createElement(tag);e.textContent=text;return e;};
  const status=make('p','');status.className='vocabulary-save-status';status.setAttribute('role','status');
  const buttons=[];
  for(const {id,target} of entries){
   const button=make('button','Add to review');button.type='button';button.className='add-to-review';button.dataset.entryId=id;
   button.onclick=()=>store.mutate({action:'add',entryId:id});target.append(button);buttons.push({id,button});
  }
  const login=make('a','Sign in to save vocabulary');login.href='/api/auth/authorize';
  const retry=make('button','Retry');retry.type='button';retry.onclick=()=>store.load();
  container.append(status,login,retry);
  function render(){
   for(const {id,button} of buttons){const added=store.has(id);button.textContent=added?'Added ✓':'Add to review';button.disabled=added||store.busy||!store.auth||!store.data;}
   status.textContent=store.error||(store.busy?'Checking your vocabulary…':'');login.hidden=!!store.auth;retry.hidden=!store.error||!store.auth;
  }
  const unsubscribe=store.subscribe(render);render();store.load();return unsubscribe;
 }
 const api={VocabularyStore,attachSaveControls};
 if(typeof module!=='undefined')module.exports=api;
 else{
  let storage;try{storage=localStorage;}catch{storage={length:0,key:()=>null,getItem:()=>null,setItem:()=>{throw Error('Enable browser storage to safely save vocabulary.');},removeItem:()=>{}};}
  api.store=new VocabularyStore({request,storage});root.VocabularyReview=api;
 }
})(typeof window==='undefined'?globalThis:window);
