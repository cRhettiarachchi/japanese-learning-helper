const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");
const {
  videoId,
  parseSubtitles,
  validate,
  save,
  snapshot,
} = require("../server/listening.cjs");
const base = {
  url: "https://www.youtube.com/watch?v=KJblreFQ2R8",
  title: "日本語",
  subtitles: "",
  expectedRevision: 0,
};
test("only genuine HTTPS YouTube video URLs are accepted", () => {
  for (const u of [
    "https://youtu.be/KJblreFQ2R8?t=30",
    "https://m.youtube.com/watch?v=KJblreFQ2R8",
    "https://youtube.com/shorts/KJblreFQ2R8",
  ])
    assert.equal(videoId(u), "KJblreFQ2R8");
  for (const u of [
    "https://youtube.com.evil.test/watch?v=KJblreFQ2R8",
    "javascript:alert(1)",
    "https://user@youtube.com/watch?v=KJblreFQ2R8",
    "http://youtube.com/watch?v=KJblreFQ2R8",
    "https://youtu.be/bad",
    "https://localhost/watch?v=KJblreFQ2R8",
  ])
    assert.throws(() => videoId(u), { status: 400 });
  assert.throws(() => validate({ ...base, user_id: "victim" }), {
    status: 400,
  });
});
test("SRT and VTT preserve Japanese, timings and overlaps; malformed files fail", () => {
  const srt =
    "1\r\n00:00:01,250 --> 00:00:03,000\r\nこんにちは\r\n世界\r\n\r\n2\r\n00:00:02,000 --> 00:00:04,500\r\n<b>日本語</b> &amp; 本";
  assert.deepEqual(parseSubtitles(srt), [
    { start: 1.25, end: 3, text: "こんにちは\n世界" },
    { start: 2, end: 4.5, text: "日本語 & 本" },
  ]);
  assert.deepEqual(
    parseSubtitles(
      "\uFEFFWEBVTT\n\nNOTE test\nignored\n\ncue-id\n00:01.000 --> 00:02.000 align:start\n日本語",
    ),
    [{ start: 1, end: 2, text: "日本語" }],
  );
  for (const x of [
    "WEBVTT",
    "plain text",
    "1\n00:00:60,000 --> 00:01:01,000\ntext",
    "1\n00:00:05,000 --> 00:00:04,000\ntext",
    "x".repeat(500001),
  ])
    assert.throws(() => parseSubtitles(x), { status: 400 });
});
test("dynamic library persists, prevents duplicate/stale writes and isolates users with RLS", async () => {
  const db = new PGlite();
  try {
    assert.equal((await snapshot(db, "A")).available, false);
    await db.exec(fs.readFileSync("db/listening.sql", "utf8"));
    await save(db, "A", base);
    assert.equal((await snapshot(db, "A")).items[0].revision, 1);
    assert.deepEqual((await snapshot(db, "B")).items, []);
    await assert.rejects(save(db, "A", base), { status: 409 });
    const subtitles =
      "1\n00:00:01,000 --> 00:00:03,000\n&lt;literal&gt; 日本語";
    await save(db, "A", { ...base, expectedRevision: 1, subtitles });
    await save(db, "A", {
      url: base.url,
      title: "new title",
      expectedRevision: 2,
    });
    assert.equal(
      (await snapshot(db, "A")).items[0].cues[0].text,
      "<literal> 日本語",
    );
    await assert.rejects(save(db, "A", { ...base, expectedRevision: 1 }), {
      status: 409,
    });
    await save(db, "B", base);
    await db.exec(
      "CREATE ROLE listening_runtime; GRANT USAGE ON SCHEMA public TO listening_runtime; GRANT SELECT,INSERT,UPDATE,DELETE ON learner_listening TO listening_runtime; SET ROLE listening_runtime;",
    );
    await db.query("SELECT set_config('app.user_id',$1,false)", ["A"]);
    assert.ok(
      (await db.query("SELECT user_id FROM learner_listening")).rows.every(
        (r) => r.user_id === "A",
      ),
    );
    assert.equal(
      (
        await db.query(
          "UPDATE learner_listening SET title='attack' WHERE user_id='B' RETURNING *",
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.query(
        "INSERT INTO learner_listening(user_id,video_id,title) VALUES('B','another','attack')",
      ),
      /row-level security/,
    );
  } finally {
    await db.close();
  }
});
