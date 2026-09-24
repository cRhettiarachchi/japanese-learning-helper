/* Persistent timer/profile chrome; study documents retain their own scripts and scroll. */
(()=>{
 const frame=document.querySelector('#study-page'),routes=new Set(JSON.parse(document.querySelector('#study-routes').textContent));
 let current=location.pathname==='/'?'/index.html':location.pathname,loading=false;
 const embedded=url=>'/_pages'+url.pathname+url.search+url.hash;
 function navigate(value,{replace=false,pop=false}={}){
  const url=new URL(value,location.href);if(url.pathname==='/')url.pathname='/index.html';if(url.origin!==location.origin||!routes.has(url.pathname))return false;
  if(!pop)history[replace?'replaceState':'pushState']({},'',url.pathname+url.search+url.hash);
  if(url.pathname===current&&!loading&&frame.contentDocument?.body){
   if(url.hash){try{frame.contentDocument.getElementById(decodeURIComponent(url.hash.slice(1)))?.scrollIntoView();}catch{}}
   else frame.contentWindow.scrollTo(0,0);
  }else{current=url.pathname;loading=true;frame.setAttribute('aria-busy','true');frame.contentWindow.location.replace(embedded(url));}
  return true;
 }
 frame.addEventListener('load',()=>{
  loading=false;frame.removeAttribute('aria-busy');const doc=frame.contentDocument;if(!doc)return;
  document.title=doc.title;frame.title=doc.title;
  doc.addEventListener('click',e=>{
   const link=e.target.closest?.('a[href]');if(!link||e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||link.hasAttribute('download')||link.target==='_blank')return;
   const url=new URL(link.getAttribute('href'),doc.baseURI);
   if(url.pathname==='/')url.pathname='/index.html';
   if(routes.has(url.pathname)&&url.origin===location.origin){e.preventDefault();navigate(url.href);}
   else if(url.origin!==location.origin||url.pathname.startsWith('/api/')){e.preventDefault();location.href=url.href;}
  });
  const selector=doc.querySelector('#reading-date');if(selector)selector.addEventListener('change',e=>{e.stopImmediatePropagation();navigate(selector.value);},true);
  frame.contentWindow.addEventListener('hashchange',()=>{const hash=frame.contentWindow.location.hash;if(hash!==location.hash)history.pushState({},'',current+hash);});
  // Restore deep links after deferred page scripts have initialized.
  if(location.hash){try{doc.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();}catch{}}
 });
 window.addEventListener('popstate',()=>navigate(location.href,{pop:true}));
 // Frame scripts report session identity changes without passing credentials.
 window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==frame.contentWindow)return;if(e.data?.type==='study-identity')window.dispatchEvent(new Event('study-account-change'));if(e.data?.type==='study-navigate'&&typeof e.data.href==='string')navigate(e.data.href);});
 loading=true;frame.src=embedded(new URL(current+location.search+location.hash,location.origin));
})();
