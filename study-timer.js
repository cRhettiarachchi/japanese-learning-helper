/* Account study timer: only confirmed server sessions contribute to totals. */
(() => {
 'use strict';
 const host=document.querySelector('.topbar');if(!host)return;
 const bar=document.createElement('section');bar.className='study-timer';bar.setAttribute('aria-label','Study timer');
 bar.innerHTML='<div><strong>Study time</strong> <span data-timer-total></span><small data-timer-note aria-live="polite">Loading your timer…</small></div><div class="timer-actions"><span data-timer-clock aria-label="Elapsed time"></span><button type="button" data-timer-main disabled>Start</button><button type="button" data-timer-history disabled>History</button><button type="button" data-timer-retry hidden>Retry</button></div>';
 host.append(bar);
 const dialog=document.createElement('dialog');dialog.className='timer-dialog';dialog.setAttribute('aria-labelledby','timer-dialog-title');document.body.append(dialog);
 const $=s=>bar.querySelector(s),main=$('[data-timer-main]'),note=$('[data-timer-note]');
 let auth=null,state=null,busy=false,clientId=null,errorText='',internalNavigation=false,editor=null,receivedAt=0;
 const format=seconds=>{const s=Math.max(0,Math.floor(seconds));return `${Math.floor(s/3600)}:${String(Math.floor(s/60)%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;};
 const journalKey=()=>`learner.timer.pending.${auth.user.id}.${clientId}`;
 try{clientId=sessionStorage.getItem('learner.timer.client')||crypto.randomUUID();sessionStorage.setItem('learner.timer.client',clientId);}catch{errorText='Browser session storage is unavailable. Enable it to start a timer.';}
 async function json(url,options={}){
  const r=await fetch(url,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(12000),...options});
  const data=await r.json();if(!r.ok)throw Object.assign(Error(data.error||'Request failed'),{status:r.status});return data;
 }
 function accept(data){
  if(data.userId!==auth?.user.id){state=null;throw Error('Your account changed. Reload to reconnect the timer.');}
  state=data;receivedAt=performance.now();render();
 }
 function render(){
  const cur=state?.current;
  $('[data-timer-total]').textContent=state?`${(state.totalSeconds/3600).toFixed(2)} hours saved`:'';
  main.textContent=!auth?'Sign in':cur?.state==='active'?'Stop':cur?.state==='review'?'Review time':'Start';
  main.disabled=busy||(!clientId&&!!auth);
  $('[data-timer-history]').disabled=busy||!state;
  for(const button of dialog.querySelectorAll('[data-save],[data-discard]'))button.disabled=busy;
  $('[data-timer-retry]').hidden=!errorText;
  note.textContent=errorText||(!auth?'Sign in to save study time across devices.':cur?.state==='review'?(cur.recovered?'Timer paused while you were away. Review the last checkpoint.':'Your time is waiting for review.'):cur?.state==='active'?(cur.owner_client===clientId?'Timing here. Stop to review and save.':'Running in another tab or device. You can stop it here.'):'Only time you confirm is added.');
  clock();
 }
 function clock(){
  const cur=state?.current;let ms=cur?.elapsed_ms||0;
  // Never display an unbounded running clock if server checkpoints stop arriving.
  if(cur?.state==='active')ms+=Math.min(Math.max(0,performance.now()-receivedAt),state.leaseMs);
  $('[data-timer-clock]').textContent=cur?format(ms/1000):'';
 }
 function closeDialog(){dialog.close();editor=null;main.focus();}
 function showReview(row){
  editor={...row};const seconds=row.state==='saved'?row.confirmed_seconds:Math.floor(row.elapsed_ms/1000);
  dialog.innerHTML='<h2 id="timer-dialog-title"></h2><p data-review-copy></p><p class="timer-duration"></p><div data-adjust hidden><label>Hours <input name="hours" type="number" min="0" max="24" step="1" inputmode="numeric"></label><label>Minutes <input name="minutes" type="number" min="0" max="59" step="1" inputmode="numeric"></label><label>Seconds <input name="seconds" type="number" min="0" max="59" step="1" inputmode="numeric"></label></div><p data-dialog-error role="alert"></p><div class="timer-dialog-actions"><button type="button" data-save>Save time</button><button type="button" data-adjust-button>Adjust time</button><button type="button" data-discard>Discard</button><button type="button" data-close>Review later</button></div>';
  dialog.querySelector('h2').textContent=row.state==='saved'?'Edit study time':'Nice work. Save this study time?';
  dialog.querySelector('[data-review-copy]').textContent=row.recovered?'The timer lost contact while you were away. Check this duration and adjust it if needed.':'Only this confirmed duration will count toward your Japanese study hours.';
  dialog.querySelector('.timer-duration').textContent=format(seconds);
  for(const [name,value] of Object.entries({hours:Math.floor(seconds/3600),minutes:Math.floor(seconds/60)%60,seconds:seconds%60}))dialog.querySelector(`[name="${name}"]`).value=value;
  dialog.querySelector('[data-adjust-button]').onclick=()=>{dialog.querySelector('[data-adjust]').hidden=false;dialog.querySelector('[name="hours"]').focus();};
  dialog.querySelector('[data-close]').onclick=closeDialog;
  dialog.querySelector('[data-save]').onclick=async()=>{
   const values=['hours','minutes','seconds'].map(n=>Number(dialog.querySelector(`[name="${n}"]`).value));
   if(values.some(v=>!Number.isInteger(v)||v<0)||values[1]>59||values[2]>59||values[0]*3600+values[1]*60+values[2]>86400){dialog.querySelector('[data-dialog-error]').textContent='Enter a duration from 0 to 24 hours, with minutes and seconds from 0 to 59.';return;}
   if(await mutate({action:row.state==='saved'?'adjust':'save',id:row.id,revision:row.revision,seconds:values[0]*3600+values[1]*60+values[2]}))closeDialog();
  };
  dialog.querySelector('[data-discard]').onclick=async()=>{
   if(await mutate({action:'discard',id:row.id,revision:row.revision}))closeDialog();
  };
  if(!dialog.open)dialog.showModal();
 }
 function showHistory(){
  editor=null;dialog.innerHTML='<h2 id="timer-dialog-title">Your study time</h2><p data-history-total></p><p>Latest 50 saved sessions. Edit a duration or discard an accidental entry.</p><ul class="timer-history"></ul><p class="timer-help">Timing needs this tab open and connected. Leaving the app stops it; if the browser closes unexpectedly, the last checkpoint is kept for review. Background audio may continue without the timer. You can adjust the duration before saving.</p><button type="button" data-close>Close</button>';
  dialog.querySelector('[data-history-total]').textContent=`${(state.totalSeconds/3600).toFixed(2)} hours saved in total`;
  const list=dialog.querySelector('ul');
  if(!state.history.length)list.textContent='No saved sessions yet. Start with a little study today.';
  for(const row of state.history){const li=document.createElement('li'),text=document.createElement('span'),button=document.createElement('button');text.textContent=`${new Date(row.started_at).toLocaleString()} · ${format(row.confirmed_seconds)}`;button.textContent='Edit';button.setAttribute('aria-label',`Edit session ${new Date(row.started_at).toLocaleString()}`);button.onclick=()=>showReview(row);li.append(text,button);list.append(li);}
  dialog.querySelector('[data-close]').onclick=closeDialog;if(!dialog.open)dialog.showModal();
 }
 async function send(op){return json('/api/study-time',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':auth.csrf},body:JSON.stringify(op)});}
 async function mutate(input){
  if(busy||!auth||!clientId)return false;busy=true;errorText='';render();
  let op;
  try{
   const old=localStorage.getItem(journalKey());if(old)throw Error('A previous change needs Retry before another action.');
   op={...input,clientId,mutationId:crypto.randomUUID()};localStorage.setItem(journalKey(),JSON.stringify(op));
   accept(await send(op));localStorage.removeItem(journalKey());return true;
  }catch(e){
   if(op&&e.status&&e.status<500){localStorage.removeItem(journalKey());}
   errorText=e.status===409?'This session changed. Close this panel, tap Retry, then review the latest time.':e.message||'Unable to connect. Your change is kept for Retry.';
   if(dialog.open&&dialog.querySelector('[data-dialog-error]'))dialog.querySelector('[data-dialog-error]').textContent=errorText;
   return false;
  }finally{busy=false;render();}
 }
 async function load(){
  if(busy)return;busy=true;render();
  try{
   const identity=await json('/api/auth/session');
   if(auth&&auth.user.id!==identity.user.id){state=null;if(dialog.open)closeDialog();}
   auth=identity;errorText='';
   const pending=clientId&&localStorage.getItem(journalKey());
   if(pending){
    try{accept(await send(JSON.parse(pending)));localStorage.removeItem(journalKey());}
    catch(e){if(e.status&&e.status<500)localStorage.removeItem(journalKey());throw e;}
   }
   accept(await json('/api/study-time'));
  }catch(e){if(e.status===401){auth=null;state=null;if(dialog.open)closeDialog();errorText='';}else errorText=e.message||'Cannot connect. Try again when online.';}
  finally{busy=false;render();}
 }
 main.onclick=async()=>{
  if(!auth){location.href='/api/auth/authorize';return;}
  const cur=state?.current;
  if(cur?.state==='review')showReview(cur);
  else if(cur?.state==='active'){if(await mutate({action:'stop',id:cur.id}))if(state.current?.state==='review')showReview(state.current);}
  else await mutate({action:'start'});
 };
 $('[data-timer-history]').onclick=showHistory;$('[data-timer-retry]').onclick=load;
 dialog.addEventListener('cancel',()=>{editor=null;});
 async function tick(){
  if(busy||document.visibilityState==='hidden'||!auth)return;
  if(errorText){await load();return;}
  busy=true;render();
  try{
   const cur=state?.current;
   if(cur?.state==='active'&&cur.owner_client===clientId)accept(await send({action:'heartbeat',id:cur.id,clientId,mutationId:crypto.randomUUID()}));
   else accept(await json('/api/study-time'));
  }catch(e){errorText='Timer cannot connect. Last checkpoint is safe; use Retry.';}
  finally{busy=false;render();}
 }
 // Best effort only: expiry on the server is the fallback when unload never runs.
 function leave(){
  const cur=state?.current;
  if(internalNavigation||!auth||!cur||cur.state!=='active'||cur.owner_client!==clientId)return;
  const op={action:'stop',id:cur.id,clientId,mutationId:crypto.randomUUID()};
  try{
   if(localStorage.getItem(journalKey()))return;
   localStorage.setItem(journalKey(),JSON.stringify(op));
   fetch('/api/study-time',{method:'POST',credentials:'same-origin',keepalive:true,headers:{'Content-Type':'application/json','X-CSRF-Token':auth.csrf},body:JSON.stringify(op)}).then(async r=>{if(r.ok){const data=await r.json();localStorage.removeItem(journalKey());if(data.userId===auth?.user.id)accept(data);}}).catch(()=>{});
  }catch{/* Server retains the previous checkpoint. */}
 }
 document.addEventListener('click',e=>{
  const link=e.target.closest?.('a[href]');if(!link||link.hasAttribute('download')||link.target==='_blank'||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.button!==0)return;
  const url=new URL(link.href,location.href);
  if(url.origin===location.origin&&url.pathname!==location.pathname&&!url.pathname.startsWith('/api/')){internalNavigation=true;setTimeout(()=>{internalNavigation=false;},2000);}
 },true);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')leave();else{internalNavigation=false;load();}});
 window.addEventListener('pagehide',leave);window.addEventListener('pageshow',()=>{internalNavigation=false;});window.addEventListener('online',load);
 setInterval(clock,1000);setInterval(tick,15000);load();
})();
