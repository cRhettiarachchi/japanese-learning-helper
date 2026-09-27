const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  { randomUUID } = require("node:crypto"),
  { PGlite } = require("@electric-sql/pglite");
const { validateCard } = require("../src/core/revision-card.cjs"),
  { generate, validateInput } = require("../server/revision-ai.cjs"),
  { createService } = require("../server/revision-cards.cjs"),
  vocabulary = require("../server/vocabulary.cjs");
const card = {
  japanese: "本を読んでしまった。",
  intent: "How てしまう expresses regret",
  prompt: "What nuance does てしまった add here?",
  answer:
    "It presents the reading as completed, with regret or an unintended result in this context.",
  segments: [
    { text: "本", reading: "ほん" },
    { text: "を", reading: "" },
    { text: "読", reading: "よ" },
    { text: "んでしまった。", reading: "" },
  ],
};
const op = (action, x) => ({ action, mutationId: randomUUID(), ...x });
async function fixture(fn) {
  const db = new PGlite();
  await db.exec(fs.readFileSync("db/vocabulary.sql", "utf8"));
  const migrate = () =>
    db.exec(fs.readFileSync("db/revision-cards.sql", "utf8"));
  const withUser = (user, action) =>
    db.transaction(async (tx) => {
      await tx.query("SELECT set_config('app.user_id',$1,true)", [user]);
      return action(tx);
    });
  const run = (user, input) =>
    withUser(user, (tx) => vocabulary.run(tx, user, input));
  try {
    await fn({ db, migrate, withUser, run });
  } finally {
    await db.close();
  }
}
test("draft validation preserves Japanese, requires hiragana over all kanji, and bounds editable fields", () => {
  assert.equal(validateCard(card), card);
  for (const value of [
    { ...card, answer: "" },
    { ...card, prompt: "x".repeat(301) },
    { ...card, segments: [{ text: card.japanese, reading: "" }] },
    { ...card, segments: [{ text: card.japanese, reading: "ホン" }] },
    { ...card, segments: [{ text: "本", reading: "ほん" }] },
    { ...card, userId: "victim" },
  ])
    assert.throws(() => validateCard(value), { status: 400 });
  assert.throws(
    () =>
      validateInput({
        japanese: card.japanese,
        intent: "different",
        previous: card,
      }),
    { status: 400 },
  );
  assert.throws(() => validateInput({ japanese: "hello", intent: "meaning" }), {
    status: 400,
  });
});
test("AI uses strict non-stored structured output and retry context; never changes source or saves a card", async () => {
  let sent;
  const fetchImpl = async (url, options) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    sent = JSON.parse(options.body);
    assert.equal(options.headers.Authorization, "Bearer test");
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
                text: JSON.stringify({
                  prompt: card.prompt,
                  answer: card.answer,
                  segments: card.segments,
                }),
              },
            ],
          },
        ],
      }),
    };
  };
  const result = await generate(
    {
      japanese: card.japanese,
      intent: card.intent,
      previous: card,
      hint: "Shorter",
    },
    { fetchImpl, env: { OPENAI_API_KEY: "test" } },
  );
  assert.deepEqual(result, card);
  assert.equal(sent.store, false);
  assert.equal(sent.text.format.strict, true);
  assert.equal(sent.text.format.name, "revision_card");
  assert.equal(JSON.parse(sent.input).hint, "Shorter");
  assert.equal(sent.model, "gpt-5-mini");
  for (const response of [
    { status: "incomplete" },
    {
      status: "completed",
      output: [{ type: "message", content: [{ type: "refusal" }] }],
    },
    {
      status: "completed",
      output: [
        { type: "message", content: [{ type: "output_text", text: "{}" }] },
      ],
    },
  ])
    await assert.rejects(
      generate(
        { japanese: card.japanese, intent: card.intent },
        {
          env: { OPENAI_API_KEY: "x" },
          fetchImpl: async () => ({ ok: true, json: async () => response }),
        },
      ),
    );
  await assert.rejects(
    generate({ japanese: card.japanese, intent: card.intent }, { env: {} }),
    { status: 503 },
  );
});
test("migration is additive and repeatable; SSR and old words work before and after it", () =>
  fixture(async ({ db, migrate, run }) => {
    const numeric = Object.keys(
      require("../server/vocabulary-catalog.json"),
    )[0];
    const before = await run("A", op("add", { entryId: numeric }));
    assert.equal(before.items[0].card, null);
    assert.equal((await vocabulary.snapshot(db, "A")).items.length, 1);
    await migrate();
    await migrate();
    const after = await run("A");
    assert.deepEqual(after.items, before.items);
  }));
test("only approved add-card persists; retries deduplicate, schedules and undo work, ownership is enforced", () =>
  fixture(async ({ db, migrate, withUser, run }) => {
    await migrate();
    let calls = 0;
    const service = createService({
      withUser,
      configured: () => true,
      ai: async () => {
        calls++;
        return card;
      },
    });
    const input = { japanese: card.japanese, intent: card.intent };
    await service("A", input);
    await service("A", { ...input, previous: card, hint: "clearer" });
    assert.equal(calls, 2);
    assert.equal((await run("A")).items.length, 0);
    const entryId = "custom:" + randomUUID(),
      add = op("add-card", { entryId, card });
    let a = await run("A", add);
    assert.deepEqual(a.items[0].card, card);
    assert.equal(a.dueCount, 1);
    assert.equal((await run("A", add)).items.length, 1);
    assert.equal(
      (await run("A", op("add-card", { entryId, card }))).items.length,
      1,
    );
    await assert.rejects(
      run(
        "A",
        op("add-card", { entryId, card: { ...card, answer: "Changed" } }),
      ),
      { status: 409 },
    );
    assert.equal((await run("B")).items.length, 0);
    await assert.rejects(
      run("B", op("rate", { entryId, rating: "good", revision: 1 })),
      { status: 404 },
    );
    const rate = op("rate", { entryId, rating: "good", revision: 1 });
    a = await run("A", rate);
    assert.equal(a.items[0].stage, 1);
    assert.equal(a.dueCount, 0);
    a = await run("A", op("undo", { ratingId: rate.mutationId, revision: 2 }));
    assert.equal(a.items[0].stage, 0);
    assert.equal(a.items[0].revision, 3);
    assert.deepEqual((await vocabulary.snapshot(db, "A")).items[0].card, card);
    await assert.rejects(run("A", { ...add, userId: "B" }), { status: 400 });
  }));
test("generation leases block concurrency, recover after failures, and apply an account-scoped hourly quota", () =>
  fixture(async ({ db, migrate, withUser }) => {
    await migrate();
    let finish;
    const service = createService({
        withUser,
        configured: () => true,
        ai: () => new Promise((resolve) => (finish = resolve)),
      }),
      input = { japanese: card.japanese, intent: card.intent };
    const running = service("A", input);
    while (!finish) await new Promise((resolve) => setTimeout(resolve, 5));
    await assert.rejects(service("A", input), { status: 409 });
    finish(card);
    await running;
    const fail = createService({
      withUser,
      configured: () => true,
      ai: async () => {
        throw Object.assign(Error("upstream"), { status: 502 });
      },
    });
    await assert.rejects(fail("A", input), { status: 502 });
    const row = (
      await db.query(
        "SELECT * FROM learner_card_generation_accounts WHERE user_id='A'",
      )
    ).rows[0];
    assert.equal(row.busy_until, null);
    assert.equal(row.attempts, 2);
    await db.query(
      "UPDATE learner_card_generation_accounts SET attempts=30 WHERE user_id='A'",
    );
    const good = createService({
      withUser,
      configured: () => true,
      ai: async () => card,
    });
    await assert.rejects(good("A", input), { status: 429 });
    assert.equal((await good("B", input)).userId, "B");
    await db.query(
      "UPDATE learner_card_generation_accounts SET window_started_at=now()-interval '2 hours' WHERE user_id='A'",
    );
    await good("A", input);
  }));
test("forced RLS isolates custom cards and generation budgets, including queries without ownership filters", () =>
  fixture(async ({ db, migrate, withUser, run }) => {
    await migrate();
    const service = createService({
      withUser,
      configured: () => true,
      ai: async () => card,
    });
    for (const user of ["A", "B"]) {
      await service(user, { japanese: card.japanese, intent: card.intent });
      await run(
        user,
        op("add-card", { entryId: "custom:" + randomUUID(), card }),
      );
    }
    await db.exec(
      "CREATE ROLE card_runtime; GRANT USAGE ON SCHEMA public TO card_runtime; GRANT SELECT,INSERT,UPDATE ON learner_vocabulary,learner_card_generation_accounts TO card_runtime; SET ROLE card_runtime;",
    );
    await db.query("SELECT set_config('app.user_id','A',false)");
    for (const table of [
      "learner_vocabulary",
      "learner_card_generation_accounts",
    ]) {
      const rows = (await db.query(`SELECT user_id FROM ${table}`)).rows;
      assert.equal(rows.length, 1);
      assert.equal(rows[0].user_id, "A");
    }
    await assert.rejects(
      db.query(
        "INSERT INTO learner_card_generation_accounts(user_id) VALUES('C')",
      ),
      /row-level security/,
    );
  }));

test("draft endpoint rejects missing sessions, foreign origins and missing CSRF before generating", async () => {
  const auth = require("../server/auth.cjs"),
    service = require("../server/revision-cards.cjs");
  const originalSession = auth.session,
    originalCreate = service.createService,
    originalOrigin = process.env.APP_ORIGIN;
  let calls = 0;
  try {
    process.env.APP_ORIGIN = "http://127.0.0.1:3000";
    auth.session = async (req) => {
      if (req.headers.cookie !== "test-session")
        throw Object.assign(Error("Sign in"), { status: 401 });
      return { user_id: "A", csrf: "test-csrf" };
    };
    service.createService = () => async (userId) => {
      calls++;
      return { userId, card };
    };
    delete require.cache[require.resolve("../server/handlers/revision-card.js")];
    const handler = require("../server/handlers/revision-card.js");
    async function request(headers, method = "POST") {
      const res = {
        headers: {},
        setHeader(k, v) {
          this.headers[k] = v;
        },
        end(value) {
          this.value = JSON.parse(value);
        },
      };
      await handler(
        {
          method,
          headers: { "content-type": "application/json", ...headers },
          body: { japanese: card.japanese, intent: card.intent },
        },
        res,
      );
      assert.equal(res.headers["Cache-Control"], "no-store");
      return res;
    }
    assert.equal((await request({})).statusCode, 401);
    assert.equal(
      (
        await request({
          cookie: "test-session",
          origin: "https://foreign.example",
          "x-csrf-token": "test-csrf",
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await request({
          cookie: "test-session",
          origin: process.env.APP_ORIGIN,
        })
      ).statusCode,
      403,
    );
    assert.equal((await request({}, "GET")).statusCode, 405);
    assert.equal(calls, 0);
    const ok = await request({
      cookie: "test-session",
      origin: process.env.APP_ORIGIN,
      "x-csrf-token": "test-csrf",
    });
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.value.userId, "A");
    assert.equal(calls, 1);
  } finally {
    auth.session = originalSession;
    service.createService = originalCreate;
    if (originalOrigin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = originalOrigin;
    delete require.cache[require.resolve("../server/handlers/revision-card.js")];
  }
});
test("unmigrated card generation and approval fail clearly without losing existing vocabulary", () =>
  fixture(async ({ withUser, run }) => {
    const service = createService({
      withUser,
      configured: () => true,
      ai: async () => card,
    });
    await assert.rejects(
      service("A", { japanese: card.japanese, intent: card.intent }),
      { status: 503 },
    );
    await assert.rejects(
      run("A", op("add-card", { entryId: "custom:" + randomUUID(), card })),
      { status: 503 },
    );
    assert.equal((await run("A")).items.length, 0);
  }));
