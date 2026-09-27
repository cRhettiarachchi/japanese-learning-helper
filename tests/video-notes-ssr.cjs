const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  { randomUUID } = require("node:crypto"),
  { PGlite } = require("@electric-sql/pglite");
const notes = require("../server/video-notes.cjs"),
  videoId = Object.keys(require("../server/grammar-video-catalog.json"))[0];
test("request-scoped SSR includes personal notes before hydration and never shares another account note", async () => {
  const db = new PGlite(),
    auth = require("../server/auth.cjs"),
    database = require("../server/db.cjs"),
    originalSession = auth.session,
    originalWith = database.withUser;
  try {
    for (const file of ["schema", "study-time", "vocabulary", "video-notes"])
      await db.exec(fs.readFileSync("db/" + file + ".sql", "utf8"));
    const document = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Private A note" }],
        },
      ],
    };
    await db.transaction((tx) =>
      notes.save(tx, "A", {
        videoId,
        document,
        expectedRevision: 0,
        mutationId: randomUUID(),
      }),
    );
    auth.session = async (req) => {
      if (!req.headers.cookie)
        throw Object.assign(Error("Sign in"), { status: 401 });
      return {
        user_id: req.headers.cookie,
        display_name: "Test",
        csrf: "fixture",
      };
    };
    database.withUser = async (user, fn) =>
      fn({
        query: (sql, args) => {
          assert.match(sql.trim(), /^SELECT\b/, "SSR may only read");
          return db.query(sql, args);
        },
      });
    delete require.cache[require.resolve("../server/account.cjs")];
    const { loadAccount } = require("../server/account.cjs");
    const a = await loadAccount({ headers: { cookie: "A" } });
    assert.equal(a.status, "account");
    assert.equal(a.notes.userId, "A");
    assert.deepEqual(a.notes.items[0].document, document);
    const b = await loadAccount({ headers: { cookie: "B" } });
    assert.equal(b.notes.userId, "B");
    assert.equal(b.notes.items.length, 0);
    assert.ok(!JSON.stringify(b).includes("Private A note"));
    const anonymous = await loadAccount({ headers: {} });
    assert.equal(anonymous.notes, null);
    assert.equal(anonymous.auth, null);
  } finally {
    auth.session = originalSession;
    database.withUser = originalWith;
    delete require.cache[require.resolve("../server/account.cjs")];
    await db.close();
  }
});
test("server note rendering escapes HTML text and refuses unsafe document nodes", () => {
  require("tsx/cjs");
  const React = require("react"),
    { renderToStaticMarkup } = require("react-dom/server"),
    { NoteDocument } = require("../src/components/note-renderer.tsx");
  const document = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Heading" }],
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "<img src=x onerror=alert(1)>",
            marks: [{ type: "bold" }],
          },
        ],
      },
    ],
  };
  const html = renderToStaticMarkup(
    React.createElement(NoteDocument, { document }),
  );
  assert.match(html, /<h2>Heading<\/h2>/);
  assert.match(html, /<strong>&lt;img/);
  assert.ok(!html.includes("<img"));
  const unsafe = renderToStaticMarkup(
    React.createElement(NoteDocument, {
      document: {
        type: "doc",
        content: [{ type: "script", text: "alert(1)" }],
      },
    }),
  );
  assert.match(unsafe, /unsupported formatting/);
  assert.ok(!unsafe.includes("<script"));
});
