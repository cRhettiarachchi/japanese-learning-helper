const fs=require('node:fs');const {getPool}=require('../server/db.cjs');
(async()=>{const pool=getPool();try{await pool.query(fs.readFileSync('db/schema.sql','utf8'));console.log('Progress schema ready.');}finally{await pool.end();}})().catch(()=>{console.error('Migration failed. Check database access and schema permissions.');process.exitCode=1;});
