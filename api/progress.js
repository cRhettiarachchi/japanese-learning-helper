const h=require('../server/http.cjs');const {session,authorizeWrite}=require('../server/auth.cjs');const {withUser}=require('../server/db.cjs');const progress=require('../server/progress.cjs');
module.exports=h.wrap(async(req,res)=>{
 const s=await session(req);
 if(req.method==='GET')return h.json(res,200,{userId:s.user_id,rows:await withUser(s.user_id,c=>progress.list(c,s.user_id))});
 if(req.method!=='PUT')throw h.error(405,'Method not allowed');
 authorizeWrite(req,s);const input=await h.body(req);progress.validate(input);
 h.json(res,200,{userId:s.user_id,row:await withUser(s.user_id,c=>progress.update(c,s.user_id,input))});
});
