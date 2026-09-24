(function(root){
 'use strict';
 function meanings(token,dictionary){
  const seen=new Set(),result=[];
  for(const id of token?.entries||[])for(const sense of dictionary[id]?.senses||[])for(const gloss of sense.gloss||[]){
   if(typeof gloss!=='string')continue;
   const text=gloss.trim();if(text&&!seen.has(text)){seen.add(text);result.push(text);}
  }
  return result;
 }
 function createLookupSession(){return {isOpen:false,shouldResume:false,open(wasPlaying){if(!this.isOpen){this.shouldResume=wasPlaying;this.isOpen=true;}},close(){const resume=this.isOpen&&this.shouldResume;this.isOpen=false;this.shouldResume=false;return resume;}};}
 function createPopup({document,loadDictionary,onOpen=()=>{},onClose=()=>{}}){
  const make=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
  const panel=make('aside');panel.id='dictionary-panel';panel.className='dictionary-panel';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','false');panel.setAttribute('aria-label','English meanings');panel.lang='en';
  const head=make('div');head.className='dictionary-head';
  const closeButton=make('button','Close ×');closeButton.type='button';closeButton.id='dictionary-close';closeButton.setAttribute('aria-label','Close dictionary');head.append(closeButton);
  const results=make('div');results.id='dictionary-results';results.setAttribute('aria-live','polite');
  const credit=make('p');credit.className='dictionary-credit';
  const source=make('a','JMdict');source.href='https://www.edrdg.org/wiki/JMdict-EDICT_Dictionary_Project.html';source.target='_blank';source.rel='noopener';
  const license=make('a','CC BY-SA 4.0');license.href='https://creativecommons.org/licenses/by-sa/4.0/';license.target='_blank';license.rel='noopener';credit.append(source,' · ',license);
  panel.append(head,results,credit);document.body.append(panel);
  let opened=false,trigger=null,token=null,generation=0,clearSave=()=>{};
  function select(button){
   for(const word of document.querySelectorAll('.word.selected'))word.classList.remove('selected');
   for(const word of document.querySelectorAll('[data-word]'))if(word.dataset.word===button.dataset.word)word.classList.add('selected');
  }
  async function open(button,value){
   if(!opened){opened=true;onOpen();}
   trigger=button;token=value;const request=++generation;panel.hidden=false;select(button);
   clearSave();clearSave=()=>{};results.replaceChildren(make('p','Loading…'));closeButton.focus({preventScroll:true});
   try{
    const dictionary=await loadDictionary();if(!opened||generation!==request)return;
    const values=meanings(value,dictionary);results.replaceChildren();
    if(!values.length)results.append(make('p','No English meaning found.'));
    else {
     const review=document.defaultView?.VocabularyReview;
     const ids=[...new Set(value.entries||[])].filter(id=>dictionary[id]&&meanings({entries:[id]},dictionary).length);
     const targets=[];
     if(review&&ids.length>1){
      results.append(make('p','Several dictionary matches. Choose the entry you want to review.'));
      for(const [index,id] of ids.entries()){
       const entry=dictionary[id],section=make('section');section.className='dictionary-match';
       const heading=make('h3',`${index+1}. ${entry.forms?.[0]||entry.readings?.[0]||value.lemma||value.surface}`);heading.lang='ja';section.append(heading);
       const list=make('ul');for(const text of meanings({entries:[id]},dictionary))list.append(make('li',text));section.append(list);results.append(section);targets.push({id,target:section});
      }
     }else{
      const list=make('ul');for(const text of values)list.append(make('li',text));results.append(list);
      if(ids.length===1)targets.push({id:ids[0],target:results});
     }
     if(review&&targets.length)clearSave=review.attachSaveControls(results,targets);
    }
    panel.scrollTop=0;
   }catch{
    if(!opened||generation!==request)return;
    const retry=make('button','Retry');retry.type='button';retry.onclick=()=>open(trigger,token);
    results.replaceChildren(make('p','Dictionary could not be loaded.'),retry);
   }
  }
  function close(restore=true){
   if(!opened)return;opened=false;generation++;clearSave();clearSave=()=>{};panel.hidden=true;
   for(const word of document.querySelectorAll('.word.selected'))word.classList.remove('selected');
   if(restore&&trigger?.isConnected)trigger.focus({preventScroll:true});onClose(restore);
  }
  closeButton.addEventListener('click',()=>close());
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&opened){event.preventDefault();close();}});
  return {open,close,get isOpen(){return opened;}};
 }
 const api={meanings,createLookupSession,createPopup};
 if(typeof module!=='undefined')module.exports=api;else root.DictionaryLookup=api;
})(typeof window==='undefined'?globalThis:window);
