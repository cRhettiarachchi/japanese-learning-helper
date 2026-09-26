const fs=require('node:fs');const {getPool}=require('../server/db.cjs');
(async()=>{
 if(process.env.APP_ORIGIN!=='http://127.0.0.1:3000')throw Error('This helper is restricted to the local Development environment. See STUDY-TIMER.md for production rollout.');
 const pool=getPool();try{await pool.query(fs.readFileSync('db/study-time.sql','utf8'));console.log('Development study timer schema ready.');}finally{await pool.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
