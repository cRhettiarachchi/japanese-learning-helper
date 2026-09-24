const fs=require('fs'),path=require('path');
exports.build=(root,out,pages)=>{
 const routes=pages.map(p=>'/'+p),escape=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
 for(const name of ['app-shell.js','app-shell.css','account-profile.js'])fs.copyFileSync(path.join(root,name),path.join(out,name));
 for(const page of pages){
  const file=path.join(out,page),html=fs.readFileSync(file,'utf8'),title=html.match(/<title>(.*?)<\/title>/)?.[1]||'Japanese learner';
  const inner=html.replace('<head>','<head><base href="/'+escape(page)+'">').replace('<script src="/study-timer.js" defer></script>','');
  fs.mkdirSync(path.dirname(path.join(out,'_pages',page)),{recursive:true});fs.writeFileSync(path.join(out,'_pages',page),inner);
  fs.writeFileSync(file,`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><link rel="stylesheet" href="/study-timer.css"><link rel="stylesheet" href="/app-shell.css"><script src="/study-timer.js" defer></script><script src="/account-profile.js" defer></script><script src="/app-shell.js" defer></script></head><body><a class="shell-skip" href="#study-page">Skip to study page</a><header class="app-header"><div data-timer-host></div><div data-profile-host></div></header><iframe id="study-page" title="${escape(title)}"></iframe><script type="application/json" id="study-routes">${JSON.stringify(routes)}</script><noscript><p>Enable JavaScript for the study app, or <a href="/_pages/${escape(page)}">read this page</a>.</p></noscript></body></html>`);
 }
};
