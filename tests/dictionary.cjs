const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {JSDOM}=require('jsdom');const {meanings,createPopup,createLookupSession}=require('../dictionary.js');
const fixture=()=>{const dom=new JSDOM('<button class="word" data-word="a">日本</button><button class="word" data-word="b">川</button>');return {dom,document:dom.window.document,buttons:[...dom.window.document.querySelectorAll('button')]};};
const dictionary={a:{forms:['日本'],readings:['にほん'],senses:[{gloss:['Japan','Japan'],forms:[]},{gloss:['land of the rising sun'],forms:['alternate form']}]},b:{senses:[{gloss:['river','stream']}]}};
test('all English senses are shown without pronunciation, POS, sense filtering or duplicate glosses',()=>{
 assert.deepEqual(meanings({entries:['a','b','missing']},dictionary),['Japan','land of the rising sun','river','stream']);
});
test('popup renders safe plain meanings, closes with Escape, restores focus and clears selection',async()=>{
 const {dom,document,buttons}=fixture();let opened=0,closed=0;const popup=createPopup({document,loadDictionary:()=>dictionary,onOpen:()=>opened++,onClose:()=>closed++});
 await popup.open(buttons[0],{entries:['a'],reading:'にほん'});
 const panel=document.querySelector('[role="dialog"]');assert.equal(panel.hidden,false);assert.equal(document.activeElement.id,'dictionary-close');assert.equal(document.querySelectorAll('.word.selected').length,1);
 assert.deepEqual([...panel.querySelectorAll('li')].map(e=>e.textContent),['Japan','land of the rising sun']);assert.doesNotMatch(panel.textContent,/にほん|Dictionary meaning|Choose the sense|Dictionary form/);
 await popup.open(buttons[1],{entries:['b']});assert.equal(opened,1);assert.match(panel.textContent,/stream/);
 document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(panel.hidden,true);assert.equal(document.activeElement,buttons[1]);assert.equal(closed,1);assert.equal(document.querySelectorAll('.word.selected').length,0);
 const x=createPopup({document,loadDictionary:()=>({x:{senses:[{gloss:['<img src=x onerror=alert(1)>']}]}})});await x.open(buttons[0],{entries:['x']});assert.equal(document.querySelectorAll('img').length,0);
});
test('late dictionary responses cannot replace a newer word or reopen a closed panel',async()=>{
 const {document,buttons}=fixture();const resolvers=[];const popup=createPopup({document,loadDictionary:()=>new Promise(r=>resolvers.push(r))});
 const first=popup.open(buttons[0],{entries:['a']});const second=popup.open(buttons[1],{entries:['b']});resolvers[1](dictionary);await second;resolvers[0](dictionary);await first;
 assert.match(document.querySelector('#dictionary-results').textContent,/river/);assert.doesNotMatch(document.querySelector('#dictionary-results').textContent,/Japan/);
 const third=popup.open(buttons[0],{entries:['a']});popup.close();resolvers[2](dictionary);await third;assert.equal(document.querySelector('#dictionary-panel').hidden,true);
});
test('no-result and failed-load states remain usable and Retry succeeds',async()=>{
 const {document,buttons}=fixture();let failure=true;const popup=createPopup({document,loadDictionary:()=>{if(failure)throw Error('offline');return dictionary;}});
 await popup.open(buttons[0],{entries:['a']});assert.match(document.querySelector('#dictionary-results').textContent,/could not be loaded/);failure=false;document.querySelector('#dictionary-results button').click();await new Promise(r=>setImmediate(r));assert.match(document.querySelector('#dictionary-results').textContent,/Japan/);
 await popup.open(buttons[0],{entries:[]});assert.equal(document.querySelector('#dictionary-results').textContent,'No English meaning found.');popup.close();assert.equal(popup.isOpen,false);
});
test('audio lookup remembers only the initial playback state and never starts previously paused audio',()=>{
 const playing=createLookupSession();playing.open(true);playing.open(false);assert.equal(playing.close(),true);assert.equal(playing.close(),false);
 const paused=createLookupSession();paused.open(false);paused.open(true);assert.equal(paused.close(),false);
});
test('all existing articles and transcripts preserve text, ruby, links, completion IDs and audio data',()=>{
 const baseline=require('./fixtures/article-integrity.json'),hash=s=>crypto.createHash('sha256').update(s).digest('hex');
 const dict=JSON.parse(fs.readFileSync('listening/dictionary.json')).entries;
 for(const [file,expected] of Object.entries(baseline)){
  const doc=new JSDOM(fs.readFileSync(file,'utf8')).window.document;
  assert.equal(hash([...doc.querySelectorAll('article')].map(e=>e.textContent).join('\n')),expected.articleText,file+' text');
  assert.equal(hash([...doc.querySelectorAll('ruby')].map(e=>e.outerHTML).join('\n')),expected.ruby,file+' ruby');
  assert.deepEqual([...doc.querySelectorAll('article a')].map(e=>e.getAttribute('href')),expected.links,file+' links');
  assert.deepEqual([...doc.querySelectorAll('[data-reading-key]')].map(e=>e.dataset.readingKey),expected.completion,file+' completion');
  if(expected.studyData){assert.equal(hash(doc.querySelector('#study-data').textContent),expected.studyData,file+' timing/data');continue;}
  const tokens=JSON.parse(doc.querySelector('#article-lookup-data').textContent),buttons=[...doc.querySelectorAll('[data-article-word]')];assert.ok(buttons.length>100,file);
  assert.equal(buttons.length,Object.keys(tokens).length);assert.equal(doc.querySelectorAll('.article-word a,.article-word button,.article-word input,a .article-word').length,0);
  for(const button of buttons){const copy=button.cloneNode(true);copy.querySelectorAll('rt,rp').forEach(e=>e.remove());const token=tokens[button.dataset.word];assert.equal(copy.textContent,token.surface,file+' natural word span');for(const id of token.entries)assert.ok(dict[id],file+' dictionary entry');}
  for(const article of doc.querySelectorAll('article'))assert.ok(article.querySelector('.prose [data-article-word]'),file+' every article');
 }
});
test('article lookup opens from ruby taps without intercepting completion controls or links',async()=>{
 const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{runScripts:'outside-only',url:'http://127.0.0.1:8765/'}),{window}=dom,doc=window.document;
 const dict=JSON.parse(fs.readFileSync('listening/dictionary.json','utf8'));let requests=0;window.fetch=async()=>{requests++;return {ok:true,json:async()=>dict};};
 window.eval(fs.readFileSync('dictionary.js','utf8'));window.eval(fs.readFileSync('article-lookup.js','utf8'));
 const tokenMap=JSON.parse(doc.querySelector('#article-lookup-data').textContent);const ruby=[...doc.querySelectorAll('.prose .article-word')].find(e=>e.querySelector('rt')&&tokenMap[e.dataset.word].entries.length).querySelector('rt');ruby.dispatchEvent(new window.MouseEvent('click',{bubbles:true}));await new Promise(r=>setImmediate(r));assert.equal(doc.querySelector('#dictionary-panel').hidden,false);assert.ok(doc.querySelector('#dictionary-results li'));assert.equal(requests,1);
 doc.querySelector('#dictionary-close').click();const checkbox=doc.querySelector('[data-reading-key]');checkbox.click();assert.equal(checkbox.checked,true);assert.equal(doc.querySelector('#dictionary-panel').hidden,true);
 const link=doc.querySelector('.article-footer a');link.addEventListener('click',e=>e.preventDefault());link.click();assert.equal(doc.querySelector('#dictionary-panel').hidden,true);
 doc.querySelectorAll('.article-word')[1].click();await new Promise(r=>setImmediate(r));assert.equal(requests,1);
});
test('shared transcript player pauses lookup, resumes only previous playback, and seeks without double resume',async()=>{
 const dom=new JSDOM(fs.readFileSync('listening/teppei-1587.html','utf8'),{runScripts:'outside-only',url:'http://127.0.0.1:8765/listening/teppei-1587.html'}),{window}=dom,doc=window.document,audio=doc.querySelector('audio');let paused=true,plays=0;
 Object.defineProperty(audio,'paused',{get:()=>paused});audio.play=()=>{plays++;paused=false;audio.dispatchEvent(new window.Event('play'));return Promise.resolve();};audio.pause=()=>{paused=true;audio.dispatchEvent(new window.Event('pause'));};
 window.matchMedia=()=>({matches:true});window.requestAnimationFrame=()=>1;window.cancelAnimationFrame=()=>{};window.HTMLElement.prototype.scrollIntoView=()=>{};
 window.eval(fs.readFileSync('dictionary.js','utf8'));window.eval(fs.readFileSync('transcript-player.js','utf8'));
 const words=doc.querySelectorAll('#transcript [data-word]');words[0].click();doc.querySelector('#dictionary-close').click();assert.equal(plays,0);
 await audio.play();words[0].click();assert.equal(paused,true);words[1].click();doc.querySelector('#dictionary-close').click();assert.equal(plays,2);assert.equal(paused,false);
 words[0].click();doc.querySelector('[data-start]').click();assert.equal(plays,3);assert.equal(doc.querySelector('#dictionary-panel').hidden,true);
 doc.querySelector('#view-focus').click();doc.querySelector('#focus-view [data-word]').click();assert.equal(paused,true);assert.equal(doc.querySelector('#dictionary-panel').hidden,false);
 dom.window.close();
});
