// Opt-in check of the actual local runtime, using disposable, uniquely named accounts.
const assert = require("node:assert/strict");
const { random, hash } = require("../server/auth.cjs");
const { getPool, withUser } = require("../server/db.cjs");
(async () => {
  if (process.env.APP_ORIGIN !== "http://127.0.0.1:3000")
    throw Error("This check requires the port-3000 local app.");
  const prefix = "listening-integration-" + random(),
    users = [prefix + "-A", prefix + "-B"],
    tokens = [random(), random()],
    csrf = [random(), random()];
  const pool = getPool();
  const req = (path, i = 0, body) =>
    fetch(process.env.APP_ORIGIN + path, {
      method: body ? "POST" : "GET",
      headers: {
        Cookie: "learner_session=" + tokens[i],
        ...(body
          ? {
              Origin: process.env.APP_ORIGIN,
              "Content-Type": "application/json",
              "X-CSRF-Token": csrf[i],
            }
          : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  try {
    for (let i = 0; i < 2; i++)
      await pool.query(
        "INSERT INTO learner_sessions(token_hash,user_id,display_name,csrf,expires_at) VALUES($1,$2,'Listening integration check',$3,now()+interval '5 minutes')",
        [hash(tokens[i]), users[i], csrf[i]],
      );
    let r = await req("/api/listening");
    assert.equal(r.status, 200);
    assert.equal((await r.json()).available, true);
    let html = await (await req("/listening/library")).text();
    assert.ok(html.includes("Add a YouTube video"));
    const input = {
      url: "https://youtu.be/KJblreFQ2R8",
      title: "Temporary listening integration fixture",
      subtitles: "",
      expectedRevision: 0,
    };
    r = await req("/api/listening", 0, input);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).items[0].cues.length, 0);
    const subtitles =
      "WEBVTT\n\n00:01.250 --> 00:02.500\n<ruby>字幕<rt>じまく</rt></ruby>の確認";
    r = await req("/api/listening", 0, {
      ...input,
      subtitles,
      expectedRevision: 1,
    });
    assert.equal(r.status, 200);
    let data = await r.json();
    assert.deepEqual(data.items[0].cues, [
      {
        start: 1.25,
        end: 2.5,
        text: "字幕の確認",
        parts: [{ text: "字幕", reading: "じまく" }, { text: "の確認" }],
      },
    ]);
    r = await req("/api/listening", 1);
    assert.deepEqual((await r.json()).items, []);
    html = await (await req("/listening/library")).text();
    assert.ok(
      html.includes("<ruby>字幕<rt>じまく</rt></ruby>"),
      "Saved transcript must be in first HTML",
    );
    assert.equal(
      (await fetch(process.env.APP_ORIGIN + "/api/listening")).status,
      401,
    );
    console.log(
      "PASS actual port 3000: storage ready, form server-rendered, video saved, VTT imported and persisted, timed text server-rendered, account isolation, anonymous rejection.",
    );
  } finally {
    for (const id of users)
      await withUser(id, (db) =>
        db.query("DELETE FROM learner_listening WHERE user_id=$1", [id]),
      );
    await pool.query(
      "DELETE FROM learner_sessions WHERE user_id=ANY($1::text[])",
      [users],
    );
    await pool.end();
  }
})().catch((e) => {
  console.error("Listening integration check failed:", e.message);
  process.exitCode = 1;
});
