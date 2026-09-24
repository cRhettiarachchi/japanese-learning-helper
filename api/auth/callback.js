const h=require('../../server/http.cjs');const {random,hash,verifyIdentity}=require('../../server/auth.cjs');const {getPool}=require('../../server/db.cjs');
module.exports=h.wrap(async(req,res)=>{
 if(req.method!=='GET')throw h.error(405,'Method not allowed');
 const url=new URL(req.url,h.origin()),state=url.searchParams.get('state'),code=url.searchParams.get('code');
 const binding=h.cookies(req)[h.cookieName('oauth')];
 if(!state||!code||!binding||!/^[A-Za-z0-9_-]{43}$/.test(state)||!/^[A-Za-z0-9_-]{43}$/.test(binding)||code.length>4096)throw h.error(400,'Sign-in was cancelled or expired');
 const {rows}=await getPool().query('DELETE FROM learner_oauth WHERE state_hash=$1 AND binding_hash=$2 AND expires_at>now() RETURNING verifier,nonce',[hash(state),hash(binding)]);
 if(!rows[0])throw h.error(401,'Sign-in expired. Please try again.');
 const response=await fetch('https://api.vercel.com/login/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Authorization:'Basic '+Buffer.from(process.env.VERCEL_APP_CLIENT_ID+':'+process.env.VERCEL_APP_CLIENT_SECRET).toString('base64')},body:new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:h.origin()+'/api/auth/callback',code_verifier:rows[0].verifier}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw h.error(401,'Sign-in could not be completed');
 const tokens=await response.json();const identity=await verifyIdentity(tokens.id_token,rows[0].nonce);
 const token=random(),csrf=random();
 await getPool().query('DELETE FROM learner_sessions WHERE expires_at<now()');
 await getPool().query('INSERT INTO learner_sessions(token_hash,user_id,display_name,csrf,expires_at) VALUES($1,$2,$3,$4,now()+interval \'24 hours\')',[hash(token),identity.userId,identity.displayName,csrf]);
 h.setCookie(res,'session',token,86400);h.setCookie(res,'oauth','',0);
 res.setHeader('Referrer-Policy','no-referrer');res.statusCode=303;res.setHeader('Location','/');res.end();
});
