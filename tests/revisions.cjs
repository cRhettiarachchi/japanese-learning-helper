const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const {JSDOM}=require('jsdom');const {render}=require('../scripts/render-revisions.cjs');
test('revision preserves all questions, answer guidance and all 37 lesson links without answer leakage',()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'revisions-'));
 try{
 render(path.resolve(__dirname,'..'),out);
 const read=name=>new JSDOM(fs.readFileSync(path.join(out,name),'utf8')).window.document;
 const testPage=read('revisions/revision-1-test.html');const key=read('revisions/revision-1-answers.html');
 const numbers=[...testPage.querySelectorAll('article p > strong:first-child')].map(e=>e.textContent.match(/^(\d+)\./)?.[1]).filter(Boolean);
 assert.deepEqual(numbers,Array.from({length:44},(_,i)=>String(i+1)));
 assert.equal(key.querySelectorAll('tbody tr').length,37);
 assert.equal(key.querySelectorAll('td a[href^="/grammar.html#"]').length,37);
 assert.match(key.body.textContent,/77\/90/);assert.match(key.body.textContent,/R8/);
 assert.doesNotMatch(testPage.body.textContent,/わたしは学生です|Delayed retest answers/);
 assert.equal(testPage.querySelectorAll('[data-print]').length,1);
 for(const doc of [testPage,key])for(const a of doc.querySelectorAll('a[href^="#"]'))assert.ok(doc.getElementById(a.hash.slice(1)));
 assert.equal(read('revisions.html').querySelectorAll('a[href="/revisions/revision-1-test.html"]').length,1);
 }finally{fs.rmSync(out,{recursive:true,force:true});}
});
