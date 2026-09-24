const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'public');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const catalog={article:{},grammar:{},audio:JSON.parse(read('audio-catalog.json'))};
for(const set of JSON.parse(read('reading-archive.json')))for(const article of set.articles)catalog.article[article.key]={};
for(const match of read('grammar.html').matchAll(/data-lesson="([^"]+)"/g))catalog.grammar[match[1]]={};
fs.writeFileSync(path.join(root,'server/catalog.json'),JSON.stringify(catalog,null,2)+'\n');
fs.mkdirSync(out,{recursive:true});
// Explicit allowlist: credentials, server source, and research working files never enter public output.
const files=['study-timer.css','study-timer.js','revisions.css','revisions.js','index.html','grammar.html','grammar.css','grammar.js','grammar-data.json','reading.css','reading.js','reading-archive.json','sources.json','progress-store.js','audio-progress.js','dictionary.js','dictionary.css','article-lookup.js','transcript-player.js','research/catalog-audit.json'];
for(const dir of ['readings','listening','audio','revisions'])for(const file of fs.readdirSync(path.join(root,dir))){if(/\.(html|mp3|json|vtt|md)$/.test(file))files.push(dir+'/'+file);}
for(const name of files){fs.mkdirSync(path.dirname(path.join(out,name)),{recursive:true});fs.copyFileSync(path.join(root,name),path.join(out,name));}
// Apply the shared navigation at build time so regenerated reading sets retain it.
for(const name of files.filter(name=>name.endsWith('.html'))){
 const file=path.join(out,name);let html=fs.readFileSync(file,'utf8');
 html=html.replace(/<nav\b[^>]*class="(?:site-nav|study-nav)"[^>]*>[\s\S]*?<\/nav>/g,nav=>nav.includes('href="/revisions.html"')?nav:nav.replace('</nav>','<a href="/revisions.html">Revisions</a></nav>'));
 fs.writeFileSync(file,html);
}
require('./render-revisions.cjs').render(root,out);
for(const name of [...files.filter(name=>name.endsWith('.html')),'revisions.html','revisions/revision-1-test.html','revisions/revision-1-answers.html']){
 const file=path.join(out,name);const html=fs.readFileSync(file,'utf8');
 fs.writeFileSync(file,html.replace('</head>','<link rel="stylesheet" href="/study-timer.css"><script src="/study-timer.js" defer></script></head>'));
}
fs.writeFileSync(path.join(out,'progress-catalog.json'),JSON.stringify(catalog));
console.log(`Built ${files.length} public files; ${Object.keys(catalog.article).length} articles, ${Object.keys(catalog.grammar).length} lessons, ${Object.keys(catalog.audio).length} audio episodes.`);
