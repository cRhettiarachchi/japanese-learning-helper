const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  { randomUUID } = require("node:crypto");
const { PGlite } = require("@electric-sql/pglite");
const {
  validate,
  createService,
  lessons,
} = require("../server/grammar-practice.cjs");
const {
  structured,
  validateGenerated,
  validateGraded,
} = require("../server/practice-ai.cjs");
const lessonId = [...lessons.keys()][0];
const generate = () => ({
  action: "generate",
  lessonId,
  requestId: randomUUID(),
});
const questions = () =>
  Array.from({ length: 10 }, (_, i) => ({
    id: `q${i + 1}`,
    type: "situation",
    prompt: `Write a sentence ${i + 1}.`,
    exampleAnswer: "私は学生です。",
  }));
const feedback = () =>
  questions().map((q, i) => ({
    id: q.id,
    verdict: i === 0 ? "incorrect" : i === 1 ? "less_natural" : "correct",
    category: i === 0 ? "particle" : "none",
    explanation: "Use the topic marker here.",
    exampleAnswer: "私は学生です。",
  }));
const grade = (s) => ({
  action: "grade",
  setId: s.setId,
  revision: s.revision,
  answers: questions().map((q) => ({ id: q.id, text: "私は学生です。" })),
});
async function fixture() {
  const db = new PGlite();
  await db.exec(fs.readFileSync("db/grammar-practice.sql", "utf8"));
  const withUser = async (u, fn) =>
    db.transaction(async (c) => {
      await c.query("SELECT set_config('app.user_id',$1,true)", [u]);
      return fn(c);
    });
  const cool = () =>
    db.query(
      "UPDATE learner_practice_accounts SET last_call=now()-interval '5 seconds'",
    );
  return { db, withUser, cool };
}
test("reject client context, injected owners, malformed IDs, missing/duplicate/oversized answers", () => {
  for (const x of [
    { action: "__proto__" },
    { action: "constructor" },
    { ...generate(), userId: "victim" },
    { ...generate(), lessonId: "nope" },
    { ...generate(), questions: [] },
    { action: "grade", setId: randomUUID(), revision: 0, answers: [] },
  ])
    assert.throws(() => validate(x), { status: 400 });
  const g = grade({ setId: randomUUID(), revision: 0 });
  g.answers[1].id = "q1";
  assert.throws(() => validate(g), { status: 400 });
  g.answers[1].id = "q2";
  g.answers[0].text = "x".repeat(501);
  assert.throws(() => validate(g), { status: 400 });
  assert.throws(() => validateGenerated({ questions: questions().slice(1) }), {
    status: 502,
  });
  assert.throws(
    () =>
      validateGraded(
        { feedback: [...feedback().slice(1), feedback()[1]] },
        questions(),
      ),
    { status: 502 },
  );
});
test("one set, private canonical questions, duplicate suppression, retries, bounded learning summary, Done deletion", async () => {
  const { db, withUser, cool } = await fixture();
  let calls = 0,
    contexts = [];
  const run = createService({
    withUser,
    configured: () => true,
    ai: async (kind, context) => {
      calls++;
      contexts.push(context);
      return kind === "generate" ? questions() : feedback();
    },
  });
  try {
    const op = generate(),
      s = await run("A", op);
    assert.equal(s.questions.length, 10);
    assert.ok(!JSON.stringify(s).includes("exampleAnswer"));
    assert.deepEqual(await run("A", op), s);
    assert.equal(calls, 1);
    await assert.rejects(run("B", grade(s)), { status: 410 });
    await cool();
    const g = grade(s),
      graded = await run("A", g);
    assert.equal(graded.feedback[1].verdict, "less_natural");
    assert.equal(graded.revision, 1);
    assert.equal(contexts[1].questions[0].exampleAnswer, "私は学生です。");
    assert.deepEqual(await run("A", g), graded);
    assert.equal(calls, 2);
    const summary = (await db.query("SELECT * FROM learner_practice_summary"))
      .rows[0];
    assert.equal(summary.mistakes, 1);
    assert.equal(summary.attempts, 1);
    assert.deepEqual(summary.categories, ["particle"]);
    const changed = grade(graded);
    changed.answers[0].text = "学生です。";
    await cool();
    await run("A", changed);
    assert.equal(
      (await db.query("SELECT attempts FROM learner_practice_summary")).rows[0]
        .attempts,
      1,
    );
    await cool();
    const next = await run("A", generate());
    assert.equal(contexts.at(-1).pastDifficulty.mistakes, 1);
    assert.equal(
      (await db.query("SELECT count(*)::int AS n FROM learner_practice_sets"))
        .rows[0].n,
      1,
    );
    await run("A", { action: "done", setId: next.setId });
    assert.equal(
      (await db.query("SELECT count(*)::int AS n FROM learner_practice_sets"))
        .rows[0].n,
      0,
    );
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int AS n FROM learner_practice_summary",
        )
      ).rows[0].n,
      1,
    );
  } finally {
    await db.close();
  }
});
test("concurrent calls, failure charges, daily limits and expired set rejection", async () => {
  const { db, withUser, cool } = await fixture();
  let release, entered;
  const entry = new Promise((r) => (entered = r));
  const run = createService({
    withUser,
    configured: () => true,
    ai: () => {
      entered();
      return new Promise((r) => (release = r));
    },
  });
  try {
    const pending = run("A", generate());
    await entry;
    await assert.rejects(run("A", generate()), { status: 409 });
    release(questions());
    const s = await pending;
    await cool();
    const failed = createService({
      withUser,
      configured: () => true,
      ai: async () => {
        throw Object.assign(Error("provider unavailable"), { status: 502 });
      },
    });
    await assert.rejects(failed("A", grade(s)), { status: 502 });
    assert.equal(
      (
        await db.query(
          "SELECT calls,busy_id FROM learner_practice_accounts WHERE user_id='A'",
        )
      ).rows[0].calls,
      2,
    );
    assert.equal(
      (
        await db.query(
          "SELECT busy_id FROM learner_practice_accounts WHERE user_id='A'",
        )
      ).rows[0].busy_id,
      null,
    );
    await db.exec("UPDATE learner_practice_accounts SET calls=40");
    await assert.rejects(run("A", generate()), { status: 429 });
    await db.exec(
      "UPDATE learner_practice_sets SET expires_at=now()-interval '1 second'",
    );
    await assert.rejects(run("A", grade(s)), { status: 410 });
  } finally {
    await db.close();
  }
});
test("RLS enforces account isolation, even without application WHERE clauses", async () => {
  const { db, withUser } = await fixture();
  try {
    await withUser("A", (c) =>
      c.query(
        "INSERT INTO learner_practice_summary(user_id,lesson_id) VALUES($1,$2)",
        ["A", lessonId],
      ),
    );
    await db.exec(
      "CREATE ROLE practice_runtime; GRANT USAGE ON SCHEMA public TO practice_runtime; GRANT SELECT,INSERT,UPDATE,DELETE ON learner_practice_accounts,learner_practice_sets,learner_practice_summary TO practice_runtime; SET ROLE practice_runtime;",
    );
    await db.query("SELECT set_config('app.user_id','B',false)");
    assert.deepEqual(
      (await db.query("SELECT * FROM learner_practice_summary")).rows,
      [],
    );
    await assert.rejects(
      db.query(
        "INSERT INTO learner_practice_summary(user_id,lesson_id) VALUES($1,$2)",
        ["A", "injected"],
      ),
      /row-level security/,
    );
  } finally {
    await db.close();
  }
});
test("OpenAI uses strict structured output, server-only key, no storage; refuses incomplete/malformed responses safely", async () => {
  let request;
  const env = {
    OPENAI_API_KEY: "synthetic-key",
    OPENAI_GRAMMAR_MODEL: "gpt-5-mini",
  };
  const fetchImpl = async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return {
      ok: true,
      json: async () => ({
        status: "completed",
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({ questions: questions() }),
              },
            ],
          },
        ],
      }),
    };
  };
  const result = await structured(
    "generate",
    { grammar: lessons.get(lessonId) },
    { env, fetchImpl },
  );
  assert.equal(result.length, 10);
  assert.equal(request.body.store, false);
  assert.equal(request.body.text.format.strict, true);
  assert.equal(request.body.max_output_tokens, 6000);
  assert.equal(request.options.headers.Authorization, "Bearer synthetic-key");
  assert.ok(!JSON.stringify(request.body).includes("synthetic-key"));
  assert.match(request.body.instructions, /Never multiple choice/);
  for (const data of [
    { status: "incomplete", output: [] },
    {
      status: "completed",
      output: [{ type: "message", content: [{ type: "refusal" }] }],
    },
    {
      status: "completed",
      output: [
        { type: "message", content: [{ type: "output_text", text: "<bad>" }] },
      ],
    },
  ])
    await assert.rejects(
      structured(
        "generate",
        {},
        { env, fetchImpl: async () => ({ ok: true, json: async () => data }) },
      ),
    );
  await assert.rejects(structured("generate", {}, { env: {} }), {
    status: 503,
  });
  await assert.rejects(
    structured(
      "generate",
      {},
      {
        env,
        fetchImpl: async () => ({
          ok: false,
          status: 401,
          json: async () => ({ error: "SECRET" }),
        }),
      },
    ),
    (e) => e.status === 502 && !e.message.includes("SECRET"),
  );
});
