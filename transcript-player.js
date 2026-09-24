/* No remote lookup requests: definitions are an attributed JMdict subset. */
(() => {
'use strict';

const data=JSON.parse(document.getElementById('study-data').textContent);
const audio=document.getElementById('episode-audio');
const full=document.getElementById('transcript');
const focus=document.getElementById('focus-view');
const windowEl=document.getElementById('focus-window');
const follow=document.getElementById('follow-audio');
const status=document.getElementById('player-status');
let current=-1, focused=false, frame=0, lastWord=null;
const lookup=DictionaryLookup.createLookupSession();
const popup=DictionaryLookup.createPopup({document,loadDictionary:()=>data.dictionary,onOpen(){lookup.open(!audio.paused&&!audio.ended);audio.pause();},onClose(restore){const resume=lookup.close();if(restore&&resume)audio.play().catch(()=>{status.textContent='Press play to resume the audio.';});}});
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
function make(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
function sentenceAt(time){let lo=0,hi=data.sentences.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(data.sentences[mid].start<=time)lo=mid;else hi=mid-1;}return lo;}
function seek(time){if(lookup.isOpen)closeLookup(false);audio.currentTime=time;audio.play().catch(()=>{status.textContent='Press play in the audio player to begin.';});update(true);}
function renderFocus(){
 windowEl.replaceChildren();
 for(let offset=-2;offset<=2;offset++){
  const index=current+offset,s=data.sentences[index],row=make('div',undefined,'focus-row'+(offset===0?' current':''));
  if(s){
   if(offset===0)row.setAttribute('aria-current','true');
   const timestamp=make('button',`${Math.floor(s.start/60)}:${String(Math.floor(s.start)%60).padStart(2,'0')} ${offset===0?'· Now':'▶'}`,'timestamp');timestamp.type='button';timestamp.dataset.seek=s.start;timestamp.setAttribute('aria-label','Play sentence '+(index+1));row.append(timestamp);
   const p=make('p');p.innerHTML=s.html;row.append(p);
  }else{row.setAttribute('aria-hidden','true');row.classList.add('empty');}
  windowEl.append(row);
 }
 document.getElementById('sentence-position').textContent=`Sentence ${current+1} of ${data.sentences.length}`;
 document.getElementById('previous-sentence').disabled=current<=0;
 document.getElementById('next-sentence').disabled=current>=data.sentences.length-1;
}
function update(force=false){
 const next=sentenceAt(audio.currentTime);
 if(next!==current||force){
  current=next;
  document.querySelectorAll('.sentence.current').forEach(e=>e.classList.remove('current'));
  const active=full.querySelector(`[data-sentence="${current}"]`);if(active)active.classList.add('current');
  if(focused)renderFocus();
  else if(follow.checked&&!audio.paused&&!lookup.isOpen&&active)active.scrollIntoView({block:'center',behavior:reduced?'auto':'smooth'});
 }
 let id=null;
 if(!audio.paused&&!lookup.isOpen){for(const candidate of data.sentences[current].words){const t=data.tokens[candidate].timing;if(t&&audio.currentTime>=t[0]&&audio.currentTime<t[1]){id=candidate;break;}}}
 if(id!==lastWord||force){document.querySelectorAll('.word.speaking').forEach(e=>e.classList.remove('speaking'));if(id!==null)document.querySelectorAll(`[data-word="${id}"]`).forEach(e=>e.classList.add('speaking'));lastWord=id;}
}
function tick(){update();if(!audio.paused&&!audio.ended)frame=requestAnimationFrame(tick);}
function mode(value){focused=value;document.body.classList.toggle("focused-view",value);focus.hidden=!value;full.hidden=value;document.getElementById('view-full').setAttribute('aria-pressed',String(!value));document.getElementById('view-focus').setAttribute('aria-pressed',String(value));update(true);document.querySelector('.audio-tools').scrollIntoView({block:'start',behavior:'instant'});}
function openLookup(button){void popup.open(button,data.tokens[button.dataset.word]);update();}
function closeLookup(restore=true){popup.close(restore);}
document.addEventListener('click',event=>{
 const word=event.target.closest('[data-word]');if(word){openLookup(word);return;}
 const timestamp=event.target.closest('[data-start],[data-seek]');if(timestamp){seek(Number(timestamp.dataset.start??timestamp.dataset.seek));return;}
});
document.getElementById('view-full').addEventListener('click',()=>mode(false));
document.getElementById('view-focus').addEventListener('click',()=>mode(true));
document.getElementById('previous-sentence').addEventListener('click',()=>seek(data.sentences[Math.max(0,current-1)].start));
document.getElementById('next-sentence').addEventListener('click',()=>seek(data.sentences[Math.min(data.sentences.length-1,current+1)].start));
document.getElementById('playback-speed').addEventListener('change',e=>{audio.playbackRate=Number(e.target.value);});
document.getElementById('show-readings').addEventListener('change',e=>{document.body.classList.toggle('hide-readings',!e.target.checked);});
audio.addEventListener('play',()=>{if(lookup.isOpen){audio.pause();return;}cancelAnimationFrame(frame);tick();});
audio.addEventListener('pause',()=>{cancelAnimationFrame(frame);update();});
audio.addEventListener('ended',()=>{cancelAnimationFrame(frame);update();});
audio.addEventListener('timeupdate',()=>update());audio.addEventListener('seeking',()=>update());
update(true);
})();
