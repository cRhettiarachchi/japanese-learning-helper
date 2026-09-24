const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),os=require('os'),{JSDOM}=require('jsdom');
test('build creates persistent timer/profile above navigation and preserves study document scripts/deep-link bases',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'study-shell-')),out=path.join(root,'public');fs.mkdirSync(out);fs.mkdirSync(path.join(out,'listening'));
 try{
 for(const name of ['app-shell.js','app-shell.css','account-profile.js'])fs.copyFileSync(name,path.join(root,name));
 const page='<html><head><title>Lesson</title><script src="/progress-store.js" defer></script><script src="/study-timer.js" defer></script></head><body><nav><a href="/index.html">Reading</a></nav><audio src="/audio/episode.mp3"></audio><script src="/audio-progress.js"></script></body></html>';
 fs.writeFileSync(path.join(out,'index.html'),page);fs.writeFileSync(path.join(out,'listening','lesson.html'),page);
 require('../scripts/build-shell.cjs').build(root,out,['index.html','listening/lesson.html']);
 const outer=new JSDOM(fs.readFileSync(path.join(out,'listening/lesson.html'),'utf8')),inner=new JSDOM(fs.readFileSync(path.join(out,'_pages/listening/lesson.html'),'utf8'));
 assert.ok(outer.window.document.querySelector('.app-header [data-timer-host]'));assert.ok(outer.window.document.querySelector('.app-header [data-profile-host]'));assert.equal(outer.window.document.querySelectorAll('iframe').length,1);
 assert.equal(inner.window.document.querySelector('base').getAttribute('href'),'/listening/lesson.html');assert.equal(inner.window.document.querySelectorAll('script[src="/study-timer.js"]').length,0);assert.ok(inner.window.document.querySelector('script[src="/audio-progress.js"]'));assert.ok(inner.window.document.querySelector('script[src="/progress-store.js"]'));assert.equal(inner.window.document.querySelector('audio').getAttribute('src'),'/audio/episode.mp3');outer.window.close();inner.window.close();
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
