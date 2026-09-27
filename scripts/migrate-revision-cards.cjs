// Explicit operator action only. Never imported by the application.
const fs = require("node:fs");
const { getPool } = require("../server/db.cjs");
(async () => {
  const pool = getPool();
  try {
    await pool.query(
      fs.readFileSync(
        require("node:path").join(__dirname, "../db/revision-cards.sql"),
        "utf8",
      ),
    );
    console.log("Revision-card schema ready.");
  } finally {
    await pool.end();
  }
})().catch(() => {
  console.error(
    "Revision-card migration failed. Check database access and permissions.",
  );
  process.exitCode = 1;
});
