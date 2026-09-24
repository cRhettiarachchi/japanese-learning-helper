const h=require('../../server/http.cjs');const {session}=require('../../server/auth.cjs');
module.exports=h.wrap(async(req,res)=>{
 if(req.method!=='GET')throw h.error(405,'Method not allowed');
 const s=await session(req);h.json(res,200,{user:{id:s.user_id,name:s.display_name},csrf:s.csrf});
});
