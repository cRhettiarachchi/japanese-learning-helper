const {timingSafeEqual} = require('node:crypto');
function error(status,message) { return Object.assign(Error(message),{status}); }
function origin() {
 const value=process.env.APP_ORIGIN;
 if(!value) throw error(503,'Account sign-in is not configured');
 const u=new URL(value);
 if(u.origin!==value || (u.protocol!=='https:' && !(['127.0.0.1','localhost'].includes(u.hostname)&&u.protocol==='http:'))) throw error(503,'Invalid app origin');
 return value;
}
function secure(){return origin().startsWith('https:');}
function cookieName(kind){return (secure()?'__Host-':'')+'learner_'+kind;}
function cookies(req){return Object.fromEntries((req.headers.cookie||'').split(';').map(s=>s.trim().split(/=(.*)/s).slice(0,2)).filter(a=>a.length===2));}
function setCookie(res,kind,value,maxAge){const entry=`${cookieName(kind)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure()?'; Secure':''}`;const previous=res.getHeader('Set-Cookie');res.setHeader('Set-Cookie',[...(previous?(Array.isArray(previous)?previous:[previous]):[]),entry]);}
function equal(a,b){if(typeof a!=='string'||typeof b!=='string')return false;const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&timingSafeEqual(aa,bb);}
function sameOrigin(req){if(req.headers.origin!==origin())throw error(403,'Request origin rejected');}
function json(res,status,value){res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));}
function wrap(handler){return async(req,res)=>{res.setHeader('Cache-Control','no-store');try {await handler(req,res);}catch(e){json(res,e.status||500,{error:e.status?e.message:'Request failed. Please retry.'});}};}
async function body(req){
 if(!String(req.headers['content-type']||'').startsWith('application/json'))throw error(415,'JSON required');
 if(req.body!==undefined){let b;try{b=typeof req.body==='string'?JSON.parse(req.body):req.body;}catch{throw error(400,'Invalid JSON');}if(JSON.stringify(b).length>65536)throw error(413,'Request too large');return b;}
 let text='';for await(const chunk of req){text+=chunk;if(text.length>65536)throw error(413,'Request too large');}
 try{return JSON.parse(text);}catch{throw error(400,'Invalid JSON');}
}
module.exports={error,origin,secure,cookieName,cookies,setCookie,equal,sameOrigin,json,wrap,body};
