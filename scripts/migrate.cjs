const fs = require("node:fs");
const path = require("node:path");
const { getPool } = require("../server/db.cjs");
(async () => {
  const name = process.argv[2] || "schema";
  if (process.argv.length > 3 || !["schema", "listening"].includes(name))
    throw Error("Choose schema or listening.");
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      fs.readFileSync(path.join(__dirname, "..", "db", name + ".sql"), "utf8"),
    );
    await client.query("COMMIT");
    console.log(
      name === "listening"
        ? "Personal listening storage ready."
        : "Progress schema ready.",
    );
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
})().catch(() => {
  console.error(
    "Migration failed. Check database access, schema permissions, and the migration name (schema or listening).",
  );
  process.exitCode = 1;
});
