const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process'),{JSDOM}=require('jsdom');
test('new listening entry retains source captions and original seek timestamps',()=>{
 const base='research/listening/yuyu-fluent-japanese/',raw=JSON.parse(fs.readFileSync(base+'captions.ja.json3')),transcript=JSON.parse(fs.readFileSync(base+'transcript.json'));
 const expected=raw.events.filter(e=>(e.segs||[]).some(s=>s.utf8?.trim())).map(e=>({start:e.tStartMs/1000,end:(e.tStartMs+e.dDurationMs)/1000,text:e.segs.map(s=>s.utf8||'').join('')}));assert.deepEqual(transcript,expected);
 const doc=new JSDOM(fs.readFileSync('listening/yuyu-fluent-japanese.html','utf8')).window.document,data=JSON.parse(doc.querySelector('#study-data').textContent),sections=[...doc.querySelectorAll('.transcript-segment')];assert.equal(sections.length,774);
 sections.forEach((s,i)=>{const p=s.querySelector('p').cloneNode(true);p.querySelectorAll('rt,rp').forEach(n=>n.remove());assert.equal(p.textContent,expected[i].text);assert.equal(+s.querySelector('[data-start]').dataset.start,expected[i].start);assert.equal(data.sentences[i].start,expected[i].start);assert.equal(data.sentences[i].end,expected[i].end);});
 for(const t of Object.values(data.tokens))assert.equal(t.timing,null);
 for(const r of doc.querySelectorAll('rt'))assert.match(r.textContent,/^[ぁ-ゖー]+$/u);
 for(const p of doc.querySelectorAll('.prose p')){const w=doc.createTreeWalker(p,4);while(w.nextNode())if(/[一-龯々]/u.test(w.currentNode.textContent))assert.ok(w.currentNode.parentElement.closest('ruby'));}
 assert.match(doc.querySelector('.note').textContent,/auto-generated/);assert.ok(doc.querySelector('a[href="https://www.youtube.com/watch?v=KJblreFQ2R8"]'));
 for(const f of ['teppei-1586','teppei-1587','yuyu-get-better-slowly']){const before=new JSDOM(execFileSync('git',['show','HEAD:listening/'+f+'.html'],{encoding:'utf8',maxBuffer:20e6})).window.document,after=new JSDOM(fs.readFileSync('listening/'+f+'.html','utf8')).window.document;assert.equal(after.querySelector('article').outerHTML,before.querySelector('article').outerHTML);assert.equal(after.querySelector('#study-data').textContent,before.querySelector('#study-data').textContent);assert.equal(after.querySelectorAll('a[href="/listening/yuyu-fluent-japanese.html"]').length,1);}
});
