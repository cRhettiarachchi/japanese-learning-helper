const {Pool} = require('pg');
let pool;
function getPool() {
 if (!process.env.DATABASE_URL) throw Object.assign(Error('Account storage is not configured'), {status:503});
 const url=new URL(process.env.DATABASE_URL);if(['prefer','require','verify-ca'].includes(url.searchParams.get('sslmode')))url.searchParams.set('sslmode','verify-full');
 return pool ||= new Pool({connectionString:url.href,max:2,idleTimeoutMillis:10000,connectionTimeoutMillis:10000});
}
async function withUser(userId, action) {
 const client = await getPool().connect();
 try {
  await client.query('BEGIN');
  await client.query("SELECT set_config('app.user_id',$1,true)",[userId]);
  const result = await action(client); await client.query('COMMIT'); return result;
 } catch(e) { await client.query('ROLLBACK'); throw e; }
 finally { client.release(); }
}
module.exports={getPool,withUser};
