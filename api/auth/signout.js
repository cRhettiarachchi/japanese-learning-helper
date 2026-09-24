const h=require('../../server/http.cjs');const {session,authorizeWrite}=require('../../server/auth.cjs');const {getPool}=require('../../server/db.cjs');
module.exports=h.wrap(async(req,res)=>{
 if(req.method!=='POST')throw h.error(405,'Method not allowed');
 const s=await session(req);authorizeWrite(req,s);
 await getPool().query('DELETE FROM learner_sessions WHERE token_hash=$1',[s.tokenHash]);
 h.setCookie(res,'session','',0);h.json(res,200,{ok:true});
});
