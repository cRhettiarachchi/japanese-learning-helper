const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),{JSDOM}=require('jsdom');
test('account UI is profile/signout only, automatically retries, and signed-out UI offers sign-in',async()=>{
 const dom=new JSDOM('<!doctype html><header class="topbar">Study pages</header><main>Reading</main>',{url:'http://127.0.0.1:3000/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 let signedIn=true,online=true,retry;const writes=[];let rows=[];
 w.setInterval=f=>{retry=f;return 1;};
 w.fetch=async(url,o)=>{if(!online)throw Error('offline');let status=200,body={};
 if(url==='/progress-catalog.json')body={article:{story:{}},grammar:{},audio:{}};
 else if(url==='/api/auth/signout'){signedIn=false;}
 else if(!signedIn)status=401;
 else if(url==='/api/auth/session')body={user:{id:'A',name:'Learner'},csrf:'csrf'};
 else if(o.method==='PUT'){const x=JSON.parse(o.body);writes.push(x);const row={...x,revision:1};rows=[row];body={userId:'A',row};}
 else body={userId:'A',rows};
 return {ok:status===200,status,headers:{get:()=> 'application/json'},json:async()=>body};};
 w.eval(fs.readFileSync('tests/legacy-ui/progress-store.js','utf8'));await w.StudyProgress.ready;
 const menu=w.document.querySelector('details'),profile=w.document.querySelector('summary');
 assert.equal(menu.hidden,false);assert.match(profile.getAttribute('aria-label'),/Learner/);assert.equal(w.document.querySelector('.account-feedback').hidden,true);
 assert.deepEqual([...w.document.querySelectorAll('button')].map(b=>b.textContent),['Sign out']);assert.doesNotMatch(w.document.body.textContent,/Import|Refresh from account|Synced|Browser progress/);
 menu.open=true;profile.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(menu.open,false);
 online=false;w.StudyProgress.set('article','story','done',true);while(w.StudyProgress.busy)await new Promise(r=>setImmediate(r));assert.equal(w.document.querySelector('.account-feedback').hidden,false);
 online=true;retry();while(w.StudyProgress.busy)await new Promise(r=>setImmediate(r));assert.equal(writes.length,1);assert.equal(w.document.querySelector('.account-feedback').hidden,true);
 w.document.querySelector('button').click();await new Promise(r=>setImmediate(r));assert.equal(menu.hidden,true);assert.equal(w.document.querySelector('.account-menu a').hidden,false);assert.equal(w.StudyProgress.canEdit(),false);dom.window.close();
});
