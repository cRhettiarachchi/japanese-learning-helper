const h=require('../server/http.cjs');
const {session,authorizeWrite}=require('../server/auth.cjs');
const {withUser}=require('../server/db.cjs');
const timer=require('../server/study-time.cjs');
module.exports=h.wrap(async(req,res)=>{
 const s=await session(req);let input=null;
 if(req.method==='POST'){authorizeWrite(req,s);input=await h.body(req);timer.validate(input);}
 else if(req.method!=='GET')throw h.error(405,'Method not allowed');
 h.json(res,200,await withUser(s.user_id,c=>timer.run(c,s.user_id,input)));
});
