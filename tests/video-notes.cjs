const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  { randomUUID } = require("node:crypto"),
  { PGlite } = require("@electric-sql/pglite");
const notes = require("../server/video-notes.cjs"),
  {
    normalizeDocument,
    emptyDocument,
  } = require("../src/core/note-document.cjs"),
  { VideoNoteStore } = require("../src/core/video-notes.cjs");
const videoId = Object.keys(require("../server/grammar-video-catalog.json"))[0];
const doc = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "は and が" }],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "My own explanation", marks: [{ type: "bold" }] },
      ],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "日本語の例" }],
            },
          ],
        },
      ],
    },
  ],
};
const op = (document = doc, expectedRevision = 0) => ({
  videoId,
  document,
  expectedRevision,
  mutationId: randomUUID(),
});
async function fixture(fn) {
  const db = new PGlite();
  const migrate = () => db.exec(fs.readFileSync("db/video-notes.sql", "utf8"));
  const withUser = (user, fn) =>
    db.transaction(async (tx) => {
      await tx.query("SELECT set_config('app.user_id',$1,true)", [user]);
      return fn(tx);
    });
  const save = (user, input) =>
    withUser(user, (tx) => notes.save(tx, user, input));
  try {
    await fn({ db, migrate, withUser, save });
  } finally {
    await db.close();
  }
}
test("rich text accepts essential formatting, treats whitespace as deletion, and rejects executable markup/attributes", () => {
  assert.deepEqual(normalizeDocument(doc), doc);
  assert.equal(normalizeDocument(emptyDocument()), null);
  assert.equal(
    normalizeDocument({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: " \n\u200b" }] },
      ],
    }),
    null,
  );
  for (const bad of [
    { type: "html", text: "<script>x</script>" },
    {
      type: "doc",
      content: [{ type: "image", attrs: { src: "javascript:alert(1)" } }],
    },
    { type: "doc", content: [{ type: "paragraph", attrs: { onclick: "x" } }] },
    {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "x",
              marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
            },
          ],
        },
      ],
    },
    {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "a".repeat(20001) }],
        },
      ],
    },
  ])
    assert.throws(() => normalizeDocument(bad), { status: 400 });
  const text = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "<img src=x onerror=alert(1)>" }],
      },
    ],
  };
  assert.deepEqual(normalizeDocument(text), text);
});
test("SSR snapshot is read-only and handles an unapplied additive migration gracefully", () =>
  fixture(async ({ db, migrate, save }) => {
    const read = {
      query: (sql, args) => {
        assert.match(sql.trim(), /^SELECT\b/);
        return db.query(sql, args);
      },
    };
    assert.deepEqual(await notes.snapshot(read, "A"), {
      userId: "A",
      available: false,
      items: [],
    });
    await migrate();
    await migrate();
    assert.deepEqual(await notes.snapshot(read, "A"), {
      userId: "A",
      available: true,
      items: [],
    });
    await save("A", op());
    assert.equal((await notes.snapshot(read, "A")).items.length, 1);
    assert.equal((await notes.snapshot(read, "B")).items.length, 0);
  }));
test("notes persist per video/account; repeated saves deduplicate, stale edits conflict, and empty saves delete without resurrection", () =>
  fixture(async ({ db, migrate, save }) => {
    await migrate();
    const input = op();
    let a = await save("A", input);
    assert.deepEqual(a.items[0].document, doc);
    assert.equal(a.items[0].revision, 1);
    assert.equal((await save("A", input)).items[0].revision, 1);
    await assert.rejects(save("A", { ...input, document: emptyDocument() }), {
      status: 409,
    });
    await assert.rejects(save("A", op(doc, 0)), { status: 409 });
    await save("B", op());
    a = await save("A", op(emptyDocument(), 1));
    assert.equal(a.items[0].document, null);
    assert.equal(a.items[0].revision, 2);
    await assert.rejects(save("A", op(doc, 0)), { status: 409 });
    await assert.rejects(save("A", op(doc, 1)), { status: 409 });
    a = await save("A", op(doc, 2));
    assert.equal(a.items[0].revision, 3);
    assert.deepEqual((await notes.snapshot(db, "B")).items[0].document, doc);
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int n FROM learner_video_notes WHERE user_id='A'",
        )
      ).rows[0].n,
      1,
    );
  }));
test("forced RLS protects note bodies and save receipts even without account predicates", () =>
  fixture(async ({ db, migrate, save }) => {
    await migrate();
    await save("A", op());
    await save("B", op());
    const tables = [
      "learner_video_notes",
      "learner_video_note_accounts",
      "learner_video_note_mutations",
    ];
    await db.exec(
      `CREATE ROLE notes_runtime; GRANT USAGE ON SCHEMA public TO notes_runtime; GRANT SELECT,INSERT,UPDATE,DELETE ON ${tables.join(",")} TO notes_runtime; SET ROLE notes_runtime;`,
    );
    await db.query("SELECT set_config('app.user_id','A',false)");
    for (const table of tables) {
      const rows = (await db.query(`SELECT user_id FROM ${table}`)).rows;
      assert.equal(rows.length, 1);
      assert.equal(rows[0].user_id, "A");
    }
    assert.equal(
      (
        await db.query(
          "UPDATE learner_video_notes SET document=NULL WHERE user_id='B' RETURNING *",
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.query("INSERT INTO learner_video_note_accounts(user_id) VALUES('C')"),
      /row-level security/,
    );
  }));
test("notes reject unknown videos, forged owners, invalid revisions, and absent migration without writes", () =>
  fixture(async ({ db, save }) => {
    for (const input of [
      { ...op(), videoId: "not-in-course" },
      { ...op(), userId: "B" },
      { ...op(), expectedRevision: -1 },
      { ...op(), mutationId: "bad" },
    ])
      assert.throws(() => notes.validate(input), { status: 400 });
    await assert.rejects(save("A", op()), { status: 503 });
    assert.equal((await notes.snapshot(db, "A")).available, false);
  }));
test("client notes refuse cross-account responses and stale snapshot regressions; no polling is scheduled", async () => {
  const auth = { user: { id: "A" }, csrf: "csrf" },
    requests = [];
  let response = {
    userId: "A",
    available: true,
    items: [{ video_id: videoId, document: doc, revision: 2 }],
  };
  const store = new VideoNoteStore({
    auth,
    getAuth: async () => auth,
    request: async (url, options) => {
      requests.push({ url, options });
      return response;
    },
  });
  store.accept(response);
  store.accept({
    ...response,
    items: [{ ...response.items[0], revision: 1, document: null }],
  });
  assert.deepEqual(store.get(videoId).document, doc);
  assert.equal(requests.length, 0);
  response = { ...response, userId: "B" };
  await assert.rejects(store.load(), { status: 403 });
  assert.equal(store.data.userId, "A");
  assert.deepEqual(store.get(videoId).document, doc);
  const input = op(doc, 2);
  response = {
    userId: "A",
    available: true,
    items: [{ video_id: videoId, document: doc, revision: 3 }],
  };
  await store.save(input);
  assert.equal(requests.at(-1).options.csrf, "csrf");
  assert.deepEqual(requests.at(-1).options.body, input);
  assert.equal(store.get(videoId).revision, 3);
});
test("notes endpoint requires a session, same origin and CSRF before any save", async () => {
  const auth = require("../server/auth.cjs"),
    database = require("../server/db.cjs"),
    oldSession = auth.session,
    oldWith = database.withUser,
    oldOrigin = process.env.APP_ORIGIN;
  let writes = 0;
  const oldSave = notes.save;
  try {
    process.env.APP_ORIGIN = "http://127.0.0.1:3000";
    auth.session = async (req) => {
      if (req.headers.cookie !== "fixture")
        throw Object.assign(Error("Sign in"), { status: 401 });
      return { user_id: "A", csrf: "csrf" };
    };
    database.withUser = async (user, fn) => {
      assert.equal(user, "A");
      return fn({});
    };
    notes.save = async () => {
      writes++;
      return { userId: "A", available: true, items: [] };
    };
    delete require.cache[require.resolve("../api/video-notes.js")];
    const handler = require("../api/video-notes.js");
    async function request(headers) {
      const res = {
        headers: {},
        setHeader(k, v) {
          this.headers[k] = v;
        },
        end(x) {
          this.value = JSON.parse(x);
        },
      };
      await handler(
        {
          method: "POST",
          headers: { "content-type": "application/json", ...headers },
          body: op(),
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
          cookie: "fixture",
          origin: "https://evil.example",
          "x-csrf-token": "csrf",
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (await request({ cookie: "fixture", origin: process.env.APP_ORIGIN }))
        .statusCode,
      403,
    );
    assert.equal(writes, 0);
    assert.equal(
      (
        await request({
          cookie: "fixture",
          origin: process.env.APP_ORIGIN,
          "x-csrf-token": "csrf",
        })
      ).statusCode,
      200,
    );
    assert.equal(writes, 1);
  } finally {
    auth.session = oldSession;
    database.withUser = oldWith;
    notes.save = oldSave;
    if (oldOrigin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = oldOrigin;
    delete require.cache[require.resolve("../api/video-notes.js")];
  }
});

test("main and extra videos keep independent notes and an idempotent migration preserves saved content", () =>
  fixture(async ({ db, migrate, save }) => {
    await migrate();
    await save("A", op());
    const extra = Object.keys(
      require("../server/grammar-video-catalog.json"),
    )[1];
    const another = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Extra video note" }],
        },
      ],
    };
    await save("A", { ...op(another), videoId: extra });
    const before = await notes.snapshot(db, "A");
    assert.equal(before.items.length, 2);
    await migrate();
    assert.deepEqual(await notes.snapshot(db, "A"), before);
    assert.deepEqual(
      before.items.find((n) => n.video_id === videoId).document,
      doc,
    );
    assert.deepEqual(
      before.items.find((n) => n.video_id === extra).document,
      another,
    );
  }));
