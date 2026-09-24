const crypto=require('node:crypto');
const {getPool}=require('./db.cjs');
const h=require('./http.cjs');
const random=()=>crypto.randomBytes(32).toString('base64url');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
let jwks;
async function verifyIdentity(token,nonce,{key,clientId=process.env.VERCEL_APP_CLIENT_ID}={}){
 if(typeof clientId!=='string'||!clientId)throw h.error(503,'Account sign-in is not configured');
 const {jwtVerify,createRemoteJWKSet}=await import('jose');
 jwks ||= createRemoteJWKSet(new URL('https://vercel.com/.well-known/jwks'));
 const {payload}=await jwtVerify(token,key||jwks,{issuer:'https://vercel.com',audience:clientId,algorithms:['RS256'],requiredClaims:['sub','exp','iat','nonce'],maxTokenAge:'10m'});
 if(!h.equal(payload.nonce,nonce)||typeof payload.sub!=='string'||!payload.sub||payload.sub.length>256)throw h.error(401,'Invalid identity');
 if(payload.azp && payload.azp!==clientId)throw h.error(401,'Invalid identity');
 return {userId:'https://vercel.com|'+payload.sub,displayName:typeof payload.name==='string'?payload.name.slice(0,100):typeof payload.preferred_username==='string'?payload.preferred_username.slice(0,100):'Vercel account'};
}
async function session(req){
 const token=h.cookies(req)[h.cookieName('session')];
 if(!token||!/^[A-Za-z0-9_-]{43}$/.test(token))throw h.error(401,'Sign in to sync progress');
 const {rows}=await getPool().query('SELECT user_id,display_name,csrf FROM learner_sessions WHERE token_hash=$1 AND expires_at>now()',[hash(token)]);
 if(!rows[0])throw h.error(401,'Sign in to sync progress');
 return {...rows[0],tokenHash:hash(token)};
}
function authorizeWrite(req,s){h.sameOrigin(req);if(!h.equal(req.headers['x-csrf-token'],s.csrf))throw h.error(403,'Request token rejected');}
module.exports={random,hash,verifyIdentity,session,authorizeWrite};
