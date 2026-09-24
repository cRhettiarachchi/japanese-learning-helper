const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom'),{PGlite}=require('@electric-sql/pglite');
const {VocabularyStore}=require('../vocabulary-client.js'),{createPage,swipeRating,wordWithRuby}=require('../vocabulary.js'),vocabulary=require('../server/vocabulary.cjs');
const catalog={'100':{word:'食べる',reading:'たべる',readings:['たべる'],meanings:['to eat']},'200':{word:'読む',reading:'よむ',readings:['よむ'],meanings:['to read']}};
const settle=async f=>{for(let i=0;i<250;i++){if(f())return;await new Promise(r=>setImmediate(r));}assert.ok(f(),'UI settled');};
async function fixture(fn){
 const db=new PGlite();await db.exec(fs.readFileSync('db/vocabulary.sql','utf8'));
 const dom=new JSDOM(fs.readFileSync('vocabulary.html','utf8'),{url:'http://localhost/',runScripts:'outside-only'});let account='A',drop=false,offline=false;
 const request=async(url,options={})=>{
  if(url==='/api/auth/session')return{user:{id:account},csrf:account};
  if(offline)throw Error('Offline');if(options.body&&options.csrf!==account)throw Object.assign(Error('CSRF rejected'),{status:403});
  const result=await db.transaction(tx=>vocabulary.run(tx,account,options.body||null,{now:1700000000000,catalog}));
  if(drop&&options.body){drop=false;throw Error('Response lost');}return result;
 };
 const store=new VocabularyStore({storage:dom.window.localStorage,request});await store.load();
 const q=s=>dom.window.document.querySelector(s);
 try{await fn({db,dom,store,q,drop:()=>drop=true,offline:v=>offline=v,account:v=>account=v});}finally{dom.window.close();await db.close();}
}
function swipe(dom,element,dx,dy=0){for(const [type,x,y] of [['pointerdown',200,100],['pointerup',200+dx,100+dy]]){const e=new dom.window.Event(type,{bubbles:true});Object.assign(e,{clientX:x,clientY:y,pointerId:1,isPrimary:true,button:0});element.dispatchEvent(e);}}
test('swipe direction is LEFT Good and RIGHT Again; vertical/short/slow gestures are not ratings',()=>{
 assert.equal(swipeRating(0,-120,250,320,true),'undo');assert.equal(swipeRating(0,-120,250,320,false),null);assert.equal(swipeRating(0,-40,250,320,true),null);
 assert.equal(swipeRating(-120,10,250,320),'good');assert.equal(swipeRating(120,10,250,320),'again');
 for(const args of [[30,0,200,320],[100,110,200,320],[-120,0,2000,320]])assert.equal(swipeRating(...args),null);
});
test('review gates both gestures/buttons behind reveal, supports undo and restores the due queue',()=>fixture(async({db,dom,store,q})=>{
 await store.mutate({action:'add',entryId:'100'});createPage(dom.window.document,store);await settle(()=>!store.busy);
 assert.equal(q('.vocabulary-answer').hidden,true);assert.equal(q('[data-good]').disabled,true);
 swipe(dom,q('.vocabulary-card'),-150);assert.equal(store.data.items[0].stage,0);
 q('.reveal-meaning').click();assert.equal(q('.vocabulary-answer').hidden,false);assert.equal(q('[data-good]').disabled,false);
 swipe(dom,q('.vocabulary-card'),50,140);assert.equal(store.data.items[0].revision,1);
 swipe(dom,q('.vocabulary-card'),-150);await settle(()=>!store.busy&&store.data.items[0].stage===1);assert.equal(store.data.dueCount,0);assert.match(q('.vocabulary-empty').textContent,/All done/);
 q('#undo-rating').click();await settle(()=>!store.busy&&store.data.dueCount===1);assert.equal(q('.vocabulary-answer').hidden,true);assert.equal(store.data.items[0].stage,0);
 q('.reveal-meaning').click();swipe(dom,q('.vocabulary-card'),150);await settle(()=>!store.busy&&store.data.dueCount===0);assert.equal(store.data.items[0].stage,0);assert.equal(new Date(store.data.items[0].due_at).getTime(),1700000600000);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM learner_vocabulary_ratings')).rows[0].n,2);
}));
test('large buttons match gesture meanings and double taps cannot advance twice',()=>fixture(async({dom,store,q})=>{
 await store.mutate({action:'add',entryId:'100'});await store.mutate({action:'add',entryId:'200'});createPage(dom.window.document,store);await settle(()=>!store.busy);
 q('.reveal-meaning').click();q('[data-good]').click();q('[data-good]').click();await settle(()=>!store.busy&&store.data.dueCount===1);
 assert.equal(q('.vocabulary-answer').hidden,true);q('.reveal-meaning').click();q('[data-again]').click();await settle(()=>!store.busy&&store.data.dueCount===0);
 assert.deepEqual(store.data.items.map(x=>x.stage).sort(),[0,1]);q('#show-all').click();assert.equal(q('#vocabulary-list').hidden,false);assert.equal(q('#word-list').children.length,2);
}));
test('lost rating response retries once and another account never receives pending changes or cached words',()=>fixture(async({store,drop,offline,account})=>{
 await store.mutate({action:'add',entryId:'100'});drop();assert.equal(await store.mutate({action:'rate',entryId:'100',revision:1,rating:'good'}),false);
 assert.equal(await store.load(),true);assert.equal(store.data.items[0].revision,2);assert.ok(store.lastRating);
 offline(true);assert.equal(await store.mutate({action:'add',entryId:'200'}),false);offline(false);account('B');await store.load();assert.equal(store.data.items.length,0);assert.equal(store.lastRating,null);
 account('A');await store.load();assert.equal(store.data.items.length,2);assert.equal(store.data.items.find(x=>x.entry_id==='100').revision,2);
}));
test('multi-match dictionary requires an explicit entry choice; already saved entry disables only its own button',()=>fixture(async({dom,store})=>{
 const w=dom.window,doc=w.document;w.eval(fs.readFileSync('vocabulary-client.js','utf8'));w.VocabularyReview.store=store;w.eval(fs.readFileSync('dictionary.js','utf8'));
 const trigger=doc.createElement('button');trigger.dataset.word='inflected';doc.body.append(trigger);
 const entries={'100':{forms:['食べる'],readings:['たべる'],senses:[{gloss:['to eat']}]},'200':{forms:['読む'],readings:['よむ'],senses:[{gloss:['to read']}]}};
 const popup=w.DictionaryLookup.createPopup({document:doc,loadDictionary:()=>entries});await popup.open(trigger,{surface:'食べました',entries:['100','200']});await settle(()=>!store.busy);
 assert.equal(doc.querySelectorAll('.dictionary-match').length,2);assert.equal(store.data.items.length,0);
 doc.querySelector('[data-entry-id="100"]').click();await settle(()=>!store.busy&&store.has('100'));assert.equal(store.has('200'),false);assert.equal(doc.querySelector('[data-entry-id="100"]').disabled,true);assert.match(doc.querySelector('[data-entry-id="100"]').textContent,/Added/);
 await popup.open(trigger,{surface:'食べない',entries:['100']});await settle(()=>!store.busy);assert.equal(doc.querySelector('[data-entry-id="100"]').disabled,true);assert.equal(store.data.items.length,1);popup.close();
}));

test('front-side ruby uses verified reading, omits ruby for kana/missing readings, and never reveals English early',()=>fixture(async({dom,store,q})=>{
 await store.mutate({action:'add',entryId:'100'});createPage(dom.window.document,store);await settle(()=>!store.busy);
 assert.equal(q('.vocabulary-card ruby rt').textContent,'たべる');assert.equal(q('.vocabulary-answer').hidden,true);
 assert.equal(wordWithRuby(dom.window.document,'ありがとう','ありがとう').querySelector('ruby'),null);
 assert.equal(wordWithRuby(dom.window.document,'未知','').querySelector('ruby'),null);
}));
test('upward undo works only in the marked pad, including all-done state; ordinary vertical scroll and no-history swipes are harmless',()=>fixture(async({dom,store,q})=>{
 await store.mutate({action:'add',entryId:'100'});createPage(dom.window.document,store);await settle(()=>!store.busy);
 swipe(dom,q('.vocabulary-swipe-pad'),0,-120);assert.equal(store.data.items[0].revision,1);
 q('.reveal-meaning').click();q('[data-good]').click();await settle(()=>!store.busy&&store.data.dueCount===0);
 swipe(dom,q('.vocabulary-empty'),0,-140);assert.equal(store.data.dueCount,0);
 swipe(dom,q('.vocabulary-swipe-pad'),0,-120);await settle(()=>!store.busy&&store.data.dueCount===1);
 assert.equal(store.data.items[0].revision,3);assert.equal(q('.vocabulary-answer').hidden,true);assert.equal(store.lastRating,null);
}));

test('undo returns immediately to the accidentally rated word when more cards remain',()=>fixture(async({dom,store,q})=>{
 await store.mutate({action:'add',entryId:'100'});await store.mutate({action:'add',entryId:'200'});const page=createPage(dom.window.document,store);await settle(()=>!store.busy);
 q('.reveal-meaning').click();q('[data-good]').click();await settle(()=>!store.busy&&page.current.entry_id==='200');
 q('#undo-rating').click();await settle(()=>!store.busy&&page.current.entry_id==='100');assert.equal(page.revealed,false);
}));
