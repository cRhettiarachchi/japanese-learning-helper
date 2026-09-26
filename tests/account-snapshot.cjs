const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");
const timer = require("../server/study-time.cjs"),
  vocabulary = require("../server/vocabulary.cjs");
const { randomUUID } = require("node:crypto");
test("SSR timer and vocabulary snapshots issue reads only, preserve legacy revisions, and isolate data", async () => {
  const db = new PGlite();
  try {
    await db.exec(fs.readFileSync("db/study-time.sql", "utf8"));
    await db.exec(fs.readFileSync("db/vocabulary.sql", "utf8"));
    const id = randomUUID();
    await db.query(
      "INSERT INTO learner_study_sessions(id,user_id,owner_client,state,started_at,checkpoint_at,elapsed_ms) VALUES($1,'A',$2,'active','2020-01-01','2020-01-01',3000)",
      [id, randomUUID()],
    );
    const readOnly = {
      query: (sql, params) => {
        assert.match(sql.trim(), /^SELECT\b/);
        return db.query(sql, params);
      },
    };
    const snapshot = await timer.snapshot(readOnly, "A");
    assert.equal(snapshot.current.id, id);
    assert.equal(snapshot.current.revision, 1);
    assert.equal(snapshot.current.state, "active");
    assert.equal((await timer.snapshot(readOnly, "B")).current, null);
    assert.equal((await vocabulary.snapshot(readOnly, "A")).items.length, 0);
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM learner_timer_accounts"))
        .rows[0].n,
      0,
    );
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int n FROM learner_vocabulary_accounts",
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await db.query(
          "SELECT revision FROM learner_study_sessions WHERE id=$1",
          [id],
        )
      ).rows[0].revision,
      1,
    );
  } finally {
    await db.close();
  }
});
