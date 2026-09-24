const h=require('../../server/http.cjs');const {random,hash}=require('../../server/auth.cjs');const {getPool}=require('../../server/db.cjs');
module.exports=h.wrap(async(req,res)=>{
 if(req.method!=='GET')throw h.error(405,'Method not allowed');
 if(req.headers['sec-fetch-site']==='cross-site')throw h.error(403,'Open sign-in from this app');
 if(!process.env.VERCEL_APP_CLIENT_ID||!process.env.VERCEL_APP_CLIENT_SECRET)throw h.error(503,'Account sign-in is not configured');
 const state=random(),binding=random(),verifier=random(),nonce=random();
 await getPool().query('DELETE FROM learner_oauth WHERE expires_at<now()');
 await getPool().query('INSERT INTO learner_oauth(state_hash,binding_hash,verifier,nonce,expires_at) VALUES($1,$2,$3,$4,now()+interval \'10 minutes\')',[hash(state),hash(binding),verifier,nonce]);
 h.setCookie(res,'oauth',binding,600);
 const url=new URL('https://vercel.com/oauth/authorize');
 const challenge=require('node:crypto').createHash('sha256').update(verifier).digest('base64url');
 url.search=new URLSearchParams({client_id:process.env.VERCEL_APP_CLIENT_ID,response_type:'code',redirect_uri:h.origin()+'/api/auth/callback',scope:'openid profile',state,nonce,code_challenge:challenge,code_challenge_method:'S256'}).toString();
 res.statusCode=302;res.setHeader('Location',url.href);res.end();
});
