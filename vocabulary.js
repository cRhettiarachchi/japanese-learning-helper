(function(root){
 'use strict';
 function swipeRating(dx,dy,elapsed,width,allowUndo=false){
  if(allowUndo&&elapsed<=1500&&dy<=-88&&Math.abs(dy)>Math.abs(dx)*1.8)return 'undo';
  if(elapsed>1500||Math.abs(dx)<Math.max(64,width*.22)||Math.abs(dx)<Math.abs(dy)*1.6)return null;
  return dx<0?'good':'again';
 }
 function wordWithRuby(document,word,reading){
  const label=document.createElement('span');label.lang='ja';
  if(reading&&/[\u3400-\u9fff々]/u.test(word)){
   const ruby=document.createElement('ruby'),rt=document.createElement('rt');ruby.append(document.createTextNode(word));rt.textContent=reading;ruby.append(rt);label.append(ruby);
  }else label.textContent=word;
  return label;
 }
 function createPage(document,store){
  const $=s=>document.querySelector(s),content=$('#review-content');
  let current=null,revealed=false,view='due',pointer=null;
  const make=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
  const when=value=>new Date(value).toLocaleString();
  function renderCard(item){
   content.replaceChildren();pointer=null;
   const card=make('article');card.className='vocabulary-card';card.setAttribute('aria-label','Vocabulary review card');
   card.append(make('p','What does this word mean?'));
   const word=make('h2');word.append(wordWithRuby(document,item.word,item.reading));card.append(word);
   const reveal=make('button','Reveal meaning');reveal.type='button';reveal.className='reveal-meaning';reveal.onclick=()=>{if(store.busy)return;revealed=true;renderCard(item);content.querySelector('[data-good]').focus();};
   const answer=make('div');answer.className='vocabulary-answer';answer.hidden=!revealed;
   const reading=make('p',item.readings.join(' · '));reading.lang='ja';answer.append(reading);
   const meanings=make('ul');for(const text of item.meanings)meanings.append(make('li',text));answer.append(meanings);
   const actions=make('div');actions.className='vocabulary-ratings';
   for(const [rating,label] of [['good','← Good / remembered'],['again','Again / not good →']]){
    const button=make('button',label);button.type='button';button.dataset[rating]='';button.disabled=!revealed||store.busy;button.onclick=()=>rate(rating);actions.append(button);
   }
   reveal.hidden=revealed;reveal.disabled=store.busy;card.append(reveal,answer,actions);content.append(card);
   attachGestures(card,item.entry_id);
  }
  function showNext(){
   $('#vocabulary-review').scrollIntoView?.({block:'start',behavior:'instant'});
   (content.querySelector('.reveal-meaning')||$('#undo-rating')).focus({preventScroll:true});
  }
  async function undo(){
   const last=store.lastRating;
   if(last&&!store.busy&&await store.mutate({action:'undo',ratingId:last.id,revision:last.revision})){
    current=store.data.items.find(e=>e.entry_id===last.entryId)||null;revealed=false;content.replaceChildren();render();showNext();
   }
  }
  function attachGestures(card,entryId=null){
   const pad=make('div','Swipe here: ← Good · ↑ Undo · Again →');pad.className='vocabulary-swipe-pad';pad.setAttribute('role','region');pad.setAttribute('aria-label','Swipe area. Up undoes the last rating. Horizontal ratings require revealed meanings.');card.append(pad);
   card.addEventListener('pointerdown',e=>{
    const onPad=!!e.target.closest('.vocabulary-swipe-pad');
    if((!revealed&&!onPad)||store.busy||e.isPrimary===false||(e.button!==undefined&&e.button!==0)||e.target.closest('button,a,input,summary'))return;
    pointer={id:e.pointerId,x:e.clientX,y:e.clientY,time:Date.now(),entryId,onPad};
    try{card.setPointerCapture(e.pointerId);}catch{}
   });
   card.addEventListener('pointercancel',()=>{pointer=null;});
   card.addEventListener('pointerup',e=>{
    const start=pointer;pointer=null;if(!start||start.id!==e.pointerId||store.busy)return;
    const rating=swipeRating(e.clientX-start.x,e.clientY-start.y,Date.now()-start.time,card.getBoundingClientRect().width,start.onPad);
    if(rating==='undo'){undo();return;}
    if(rating&&revealed&&start.entryId===current?.entry_id)rate(rating);
   });
  }
  async function rate(rating){
   if(!current||!revealed||store.busy)return;
   if(await store.mutate({action:'rate',entryId:current.entry_id,revision:current.revision,rating}))showNext();
  }
  function renderList(){
   const list=$('#word-list');list.replaceChildren();
   const query=$('#word-search').value.trim().toLocaleLowerCase();
   const items=(store.data?.items||[]).filter(e=>[e.word,...e.readings,...e.meanings].join(' ').toLocaleLowerCase().includes(query));
   if(!items.length){list.append(make('p',query?'No words match your search.':'Your collection is empty. Open a word in an article or transcript and choose Add to review.'));return;}
   for(const item of items){
    const row=make('details');row.className='vocabulary-list-word';const summary=make('summary');
    const word=make('span',item.word);word.lang='ja';const due=new Date(item.due_at)<=new Date(store.data.serverNow);
    const status=make('small',due?'Due now':`Due ${when(item.due_at)}`);summary.append(word,status);row.append(summary);
    const reading=make('p',item.readings.join(' · '));reading.lang='ja';row.append(reading);
    const meanings=make('ul');for(const text of item.meanings)meanings.append(make('li',text));row.append(meanings,make('p',`Schedule stage ${item.stage} of 6`));list.append(row);
   }
  }
  function render(){
   $('#vocabulary-count').textContent=store.data?`${store.data.dueCount} due · ${store.data.items.length} saved words`:store.busy?'Loading your collection…':'Your vocabulary follows your account.';
   $('#vocabulary-error').textContent=store.error;$('#vocabulary-error').hidden=!store.error;
   $('#vocabulary-signin').hidden=!!store.auth||store.busy;
   $('#vocabulary-refresh').disabled=store.busy;
   $('#undo-rating').disabled=store.busy;
   $('#vocabulary-undo').hidden=!store.lastRating;
   if(store.lastRating)$('#rating-message').textContent=store.lastRating.rating==='good'?'Remembered — the next review is scheduled.':'Again — this word will return in 10 minutes.';
   $('#vocabulary-review').hidden=view!=='due';$('#vocabulary-list').hidden=view!=='all';
   $('#show-due').setAttribute('aria-pressed',String(view==='due'));$('#show-all').setAttribute('aria-pressed',String(view==='all'));
   const due=(store.data?.items||[]).filter(e=>new Date(e.due_at)<=new Date(store.data.serverNow));
   const previous=current,next=due.find(e=>e.entry_id===current?.entry_id)||due[0]||null;
   if(!next||next.entry_id!==current?.entry_id||next.revision!==current?.revision)revealed=false;
   current=next;
   if(current){
    // Do not replace a revealed card during a background refresh; preserve focus/scroll.
    if(!previous||previous.entry_id!==current.entry_id||previous.revision!==current.revision||!content.querySelector('.vocabulary-card'))renderCard(current);
    for(const button of content.querySelectorAll('button'))button.disabled=store.busy||(!revealed&&button.matches('[data-good],[data-again]'));
   }else{
    content.replaceChildren();const box=make('div');box.className='vocabulary-empty';
    const hasWords=!!store.data?.items.length;box.append(make('h2',!store.auth?'Save words as you study':hasWords?'All done for now':'Your first word is waiting'));
    const first=store.data?.items[0];box.append(make('p',hasWords?`Next review: ${when(first.due_at)}. Come back then, or browse all your words.`:'Open a Japanese word in an article or transcript, then choose Add to review.'));
    if(!hasWords){const link=make('a','Find words in reading articles →');link.href='/index.html';box.append(link);}content.append(box);if(store.lastRating)attachGestures(box);
   }
   if(view==='all')renderList();
  }
  $('#vocabulary-refresh').onclick=()=>store.load();$('#show-due').onclick=()=>{view='due';render();};$('#show-all').onclick=()=>{view='all';render();};$('#word-search').oninput=renderList;
  $('#undo-rating').onclick=undo;
  store.subscribe(render);render();store.load();
  return {render,get current(){return current;},get revealed(){return revealed;}};
 }
 if(typeof module!=='undefined')module.exports={swipeRating,wordWithRuby,createPage};
 else{
  createPage(document,root.VocabularyReview.store);
  setInterval(()=>{if(!document.hidden)root.VocabularyReview.store.load();},30000);
  window.addEventListener('online',()=>root.VocabularyReview.store.load());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)root.VocabularyReview.store.load();});
 }
})(typeof window==='undefined'?globalThis:window);
