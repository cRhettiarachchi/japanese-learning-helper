const fs = require("node:fs");
const { getPool } = require("../server/db.cjs");
(async () => {
  const p = getPool(),
    c = await p.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL lock_timeout='5s'");
    await c.query(fs.readFileSync("db/grammar-practice.sql", "utf8"));
    await c.query("COMMIT");
    console.log("Grammar practice schema ready.");
  } catch (e) {
    await c.query("ROLLBACK");
    console.error(
      "Grammar practice migration failed:",
      e.code || "database error",
    );
    process.exitCode = 1;
  } finally {
    c.release();
    await p.end();
  }
})();
