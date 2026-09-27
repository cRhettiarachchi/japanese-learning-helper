// Explicit operator action; uses only the DATABASE_URL supplied by the operator.
const fs = require("node:fs"),
  path = require("node:path");
const { getPool } = require("../server/db.cjs");
(async () => {
  const pool = getPool();
  try {
    await pool.query(
      fs.readFileSync(path.join(__dirname, "../db/video-notes.sql"), "utf8"),
    );
    console.log("Video-note schema ready.");
  } finally {
    await pool.end();
  }
})().catch(() => {
  console.error(
    "Video-note migration failed. Check database access and permissions.",
  );
  process.exitCode = 1;
});
