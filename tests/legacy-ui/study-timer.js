/* Account study timer: only confirmed server sessions contribute to totals. */
(() => {
 'use strict';
 const host=document.querySelector('[data-timer-host]')||document.querySelector('.topbar');if(!host)return;
 const bar=document.createElement('section');bar.className='study-timer';bar.setAttribute('aria-label','Study timer');
 bar.innerHTML='<div><strong>Study time</strong> <span data-timer-total></span><small data-timer-note aria-live="polite">Loading your timer…</small></div><div class="timer-actions"><span data-timer-clock aria-label="Elapsed time"></span><button type="button" data-timer-main disabled>Start</button><button type="button" data-timer-history disabled>History</button><button type="button" data-timer-retry hidden>Retry</button></div>';
 host.append(bar);
 const dialog=document.createElement('dialog');dialog.className='timer-dialog';dialog.setAttribute('aria-labelledby','timer-dialog-title');document.body.append(dialog);
 const $=s=>bar.querySelector(s),main=$('[data-timer-main]'),note=$('[data-timer-note]');
 let auth=null,state=null,busy=false,clientId=null,errorText='',editor=null,draft=null,lastTick=performance.now(),reloadRequested=false;
 const format=seconds=>{const s=Math.max(0,Math.floor(seconds));return `${Math.floor(s/3600)}:${String(Math.floor(s/60)%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;};
 const journalKey=()=>`learner.timer.commit.${auth.user.id}.${clientId}`;
 const draftKey=()=>`learner.timer.draft.v1.${auth.user.id}`;
 try{clientId=sessionStorage.getItem('learner.timer.client')||crypto.randomUUID();sessionStorage.setItem('learner.timer.client',clientId);}catch{errorText='Browser session storage is unavailable. Enable it to start a timer.';}
 async function json(url,options={}){
  const r=await fetch(url,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(12000),...options});
  const data=await r.json();if(!r.ok)throw Object.assign(Error(data.error||'Request failed'),{status:r.status});return data;
 }
 function accept(data){
  if(data.userId!==auth?.user.id){state=null;throw Error('Your account changed. Reload to reconnect the timer.');}
  state=data;render();
 }
 function render(){
  const cur=draft;
  $('[data-timer-total]').textContent=state?`${(state.totalSeconds/3600).toFixed(2)} hours saved`:'';
  main.textContent=!auth?'Sign in':cur?.state==='active'?'Stop':cur?.state==='review'?'Review time':'Start';
  main.disabled=busy||(!clientId&&!!auth)||(draft?.state==='active'&&draft.owner_client!==clientId);
  $('[data-timer-history]').disabled=busy||!state;
  for(const button of dialog.querySelectorAll('[data-save],[data-discard]'))button.disabled=busy;
  $('[data-timer-retry]').hidden=!errorText;
  note.textContent=errorText||(!auth?'Sign in to save study time across devices.':cur?.state==='review'?(cur.recovered?'Timer paused while you were away. Review this browser’s saved draft.':'Your time is waiting for review.'):cur?.state==='active'?(cur.owner_client===clientId?'Timing here. Stop to review and save.':'Running in another tab in this browser.'):'Only Save time sends this draft to your account.');
  clock();
 }
 function clock(){
  const cur=draft;let ms=cur?.elapsed_ms||0;
  $('[data-timer-clock]').textContent=cur?format(ms/1000):'';
 }
 function closeDialog(){dialog.close();editor=null;main.focus();}
 function showReview(row){
  editor={...row};const seconds=row.state==='saved'?row.confirmed_seconds:Math.floor(row.elapsed_ms/1000);
  dialog.innerHTML='<h2 id="timer-dialog-title"></h2><p data-review-copy></p><p class="timer-duration"></p><div data-adjust hidden><label>Hours <input name="hours" type="number" min="0" max="24" step="1" inputmode="numeric"></label><label>Minutes <input name="minutes" type="number" min="0" max="59" step="1" inputmode="numeric"></label><label>Seconds <input name="seconds" type="number" min="0" max="59" step="1" inputmode="numeric"></label></div><p data-dialog-error role="alert"></p><div class="timer-dialog-actions"><button type="button" data-save>Save time</button><button type="button" data-adjust-button>Adjust time</button><button type="button" data-discard>Discard</button><button type="button" data-close>Review later</button></div>';
  dialog.querySelector('h2').textContent=row.state==='saved'?'Edit study time':'Nice work. Save this study time?';
  dialog.querySelector('[data-review-copy]').textContent=row.recovered?'The timer paused while you were away. Check this local draft and adjust it if needed.':'Only this confirmed duration will count toward your Japanese study hours.';
  dialog.querySelector('.timer-duration').textContent=format(seconds);
  for(const [name,value] of Object.entries({hours:Math.floor(seconds/3600),minutes:Math.floor(seconds/60)%60,seconds:seconds%60}))dialog.querySelector(`[name="${name}"]`).value=value;
  if(row.local)for(const input of dialog.querySelectorAll('input'))input.addEventListener('change',()=>{
   const values=['hours','minutes','seconds'].map(n=>Number(dialog.querySelector(`[name="${n}"]`).value));
   const seconds=values[0]*3600+values[1]*60+values[2];
   if(draft?.id===row.id&&values.every(v=>Number.isInteger(v)&&v>=0)&&values[1]<60&&values[2]<60&&seconds<=86400){draft.elapsed_ms=seconds*1000;persistDraft();dialog.querySelector('.timer-duration').textContent=format(seconds);clock();}
  });
  dialog.querySelector('[data-adjust-button]').onclick=()=>{dialog.querySelector('[data-adjust]').hidden=false;dialog.querySelector('[name="hours"]').focus();};
  dialog.querySelector('[data-close]').onclick=closeDialog;
  dialog.querySelector('[data-save]').onclick=async()=>{
   const values=['hours','minutes','seconds'].map(n=>Number(dialog.querySelector(`[name="${n}"]`).value));
   if(values.some(v=>!Number.isInteger(v)||v<0)||values[1]>59||values[2]>59||values[0]*3600+values[1]*60+values[2]>86400){dialog.querySelector('[data-dialog-error]').textContent='Enter a duration from 0 to 24 hours, with minutes and seconds from 0 to 59.';return;}
   if(await mutate({action:row.local?'commit':row.state==='saved'?'adjust':'save',id:row.id,...(row.local?{}:{revision:row.revision}),seconds:values[0]*3600+values[1]*60+values[2]}))closeDialog();
  };
  dialog.querySelector('[data-discard]').onclick=async()=>{
   if(row.local){if(localStorage.getItem(journalKey())){dialog.querySelector('[data-dialog-error]').textContent='Retry the pending save before discarding.';return;}draft=null;localStorage.removeItem(draftKey());render();closeDialog();}
   else if(await mutate({action:'discard',id:row.id,revision:row.revision}))closeDialog();
  };
  if(!dialog.open)dialog.showModal();
 }
 function showHistory(){
  editor=null;dialog.innerHTML='<h2 id="timer-dialog-title">Your study time</h2><p data-history-total></p><p>Latest 50 saved sessions. Edit a duration or discard an accidental entry.</p><ul class="timer-history"></ul><p class="timer-help">The active draft stays in this browser. Internal page navigation keeps timing; backgrounding or reopening pauses it for review. Save time commits the duration to your account. Other devices see saved sessions, not the draft.</p><button type="button" data-close>Close</button>';
  dialog.querySelector('[data-history-total]').textContent=`${(state.totalSeconds/3600).toFixed(2)} hours saved in total`;
  const list=dialog.querySelector('ul');
  if(!state.history.length)list.textContent='No saved sessions yet. Start with a little study today.';
  for(const row of [...(state.current?[{...state.current,state:'review'}]:[]),...state.history]){const li=document.createElement('li'),text=document.createElement('span'),button=document.createElement('button');text.textContent=`${new Date(row.started_at).toLocaleString()} · ${format(row.confirmed_seconds??Math.floor(row.elapsed_ms/1000))}`;button.textContent='Edit';button.setAttribute('aria-label',`Edit session ${new Date(row.started_at).toLocaleString()}`);button.onclick=()=>showReview(row);li.append(text,button);list.append(li);}
  dialog.querySelector('[data-close]').onclick=closeDialog;if(!dialog.open)dialog.showModal();
 }
 async function send(op){return json('/api/study-time',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':auth.csrf},body:JSON.stringify(op)});}
 async function mutate(input){
  if(busy||!auth||!clientId)return false;busy=true;errorText='';render();
  let op;
  try{
   const old=localStorage.getItem(journalKey());if(old)throw Error('A previous change needs Retry before another action.');
   op={...input,clientId,mutationId:crypto.randomUUID()};localStorage.setItem(journalKey(),JSON.stringify(op));
   accept(await send(op));localStorage.removeItem(journalKey());if(input.action==='commit'){draft=null;localStorage.removeItem(draftKey());}render();return true;
  }catch(e){
   if(op&&e.status&&e.status<500){localStorage.removeItem(journalKey());}
   errorText=e.status===409?'This session changed. Close this panel, tap Retry, then review the latest time.':e.message||'Unable to connect. Your change is kept for Retry.';
   if(dialog.open&&dialog.querySelector('[data-dialog-error]'))dialog.querySelector('[data-dialog-error]').textContent=errorText;
   return false;
  }finally{busy=false;render();if(reloadRequested){reloadRequested=false;void load();}}
 }
 function persistDraft(){
  try{if(draft)localStorage.setItem(draftKey(),JSON.stringify(draft));return true;}
  catch{errorText='Draft storage unavailable. Keep this page open and save your time.';if(draft)draft.state='review';return false;}
 }
 function pause(){
  if(draft?.state==='active'&&draft.owner_client===clientId){tick();draft.state='review';draft.recovered=true;persistDraft();render();}
 }
 function tick(){
  const now=performance.now(),delta=now-lastTick;lastTick=now;
  if(draft?.state==='active'&&draft.owner_client===clientId){
   if(delta>5000||delta<0){draft.state='review';draft.recovered=true;}
   else draft.elapsed_ms=Math.min(86400000,draft.elapsed_ms+delta);
   if(draft.elapsed_ms===86400000)draft.state='review';
   draft.updatedAt=Date.now();persistDraft();
  }
  clock();
 }
 async function load({history=false}={}){
  if(busy){reloadRequested=true;return;}busy=true;render();
  try{
   const identity=await json('/api/auth/session');
   if(auth?.user.id!==identity.user.id){
    pause();state=null;draft=null;if(dialog.open)closeDialog();auth=identity;
    const stored=JSON.parse(localStorage.getItem(draftKey())||'null');
    if(stored){draft=stored;if(draft.state==='active'&&(draft.owner_client===clientId||Date.now()-draft.updatedAt>5000)){draft.state='review';draft.recovered=true;persistDraft();}}
   }else auth=identity;
   errorText='';
   const pending=clientId&&localStorage.getItem(journalKey());
   if(pending){
    const op=JSON.parse(pending);
    try{accept(await send(op));localStorage.removeItem(journalKey());if(op.action==='commit'){draft=null;localStorage.removeItem(draftKey());}}
    catch(e){if(e.status===409){localStorage.removeItem(journalKey());}throw e;}
   }
   if(!state||history)accept(await json('/api/study-time'));
  }catch(e){if(e.status===401){pause();auth=null;state=null;draft=null;if(dialog.open)closeDialog();errorText='';}else errorText=e.message||'Cannot connect. Your draft stays in this browser.';}
  finally{busy=false;render();}
  if(reloadRequested){reloadRequested=false;await load();}
 }
 main.onclick=()=>{
  if(busy)return;
  if(!auth){location.href='/api/auth/authorize';return;}
  if(draft?.state==='review')showReview(draft);
  else if(draft?.state==='active'){if(draft.owner_client!==clientId)return;tick();draft.state='review';persistDraft();render();showReview(draft);}
  else{draft={id:crypto.randomUUID(),local:true,state:'active',owner_client:clientId,elapsed_ms:0,updatedAt:Date.now()};lastTick=performance.now();persistDraft();render();}
 };
 $('[data-timer-history]').onclick=async()=>{await load({history:true});if(state)showHistory();};$('[data-timer-retry]').onclick=()=>load({history:true});
 dialog.addEventListener('cancel',()=>{editor=null;});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();else void load();});
 window.addEventListener('pagehide',pause);
 window.addEventListener('focus',()=>void load());window.addEventListener('online',()=>void load());
 window.addEventListener('study-account-change',()=>void load());
 window.addEventListener('storage',e=>{if(auth&&e.key===draftKey()){try{draft=JSON.parse(e.newValue);render();}catch{errorText='Draft could not be read; it was not overwritten.';render();}}});
 setInterval(()=>{tick();render();},1000);load();
})();
