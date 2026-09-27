// Real note persistence logic backed by isolated PGlite; no real accounts or AI calls.
const { chromium } = require("playwright"),
  { PGlite } = require("@electric-sql/pglite"),
  fs = require("node:fs"),
  assert = require("node:assert/strict");
const notes = require("../../server/video-notes.cjs"),
  catalog = require("../../server/catalog.json");
const videoId = Object.keys(
  require("../../server/grammar-video-catalog.json"),
)[0];
(async () => {
  const db = new PGlite();
  await db.exec(fs.readFileSync("db/video-notes.sql", "utf8"));
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  });
  const errors = [];
  const origin = process.env.TEST_APP_ORIGIN || "http://127.0.0.1:3000";
  async function device(user, mobile) {
    const state = { user, drop: false, posts: [], requests: [] };
    const context = await browser.newContext({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1280, height: 900 },
      isMobile: mobile,
      hasTouch: mobile,
      colorScheme: mobile ? "dark" : "light",
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await context.route("**/api/**", async (route) => {
      const req = route.request(),
        path = new URL(req.url()).pathname,
        body = req.postDataJSON(),
        owner = state.user;
      state.requests.push(path);
      assert.ok(
        !path.includes("grammar-practice") && !path.includes("revision-card"),
        "Notes never call AI",
      );
      let result = {};
      try {
        if (path === "/api/account")
          result = {
            status: "account",
            auth: { user: { id: owner, name: owner }, csrf: "fixture" },
            progress: { userId: owner, rows: [] },
            timer: { userId: owner, totalSeconds: 0, history: [] },
            vocabulary: {
              userId: owner,
              items: [],
              dueCount: 0,
              serverNow: new Date().toISOString(),
            },
            notes: await notes.snapshot(db, owner),
            catalog,
            error: null,
          };
        if (path === "/api/video-notes") {
          if (body) {
            state.posts.push(body);
            assert.equal(req.headers()["x-csrf-token"], "fixture");
            result = await db.transaction((tx) => notes.save(tx, owner, body));
            if (state.drop) {
              state.drop = false;
              await route.abort();
              return;
            }
          } else result = await notes.snapshot(db, owner);
        }
        await route.fulfill({ status: 200, json: result });
      } catch (e) {
        await route.fulfill({
          status: e.status || 500,
          json: { error: e.message },
        });
      }
    });
    await page.goto(origin + "/grammar.html");
    await page
      .getByRole("button", { name: "Appearance", exact: true })
      .waitFor();
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    const cell = page.locator(`[data-note-video="${videoId}"]`).first();
    await cell.waitFor();
    return { page, context, state, cell };
  }
  try {
    for (const mobile of [false, true]) {
      const A = await device("notes-" + mobile, mobile),
        { page, cell, state } = A;
      assert.ok(
        (await page
          .getByRole("columnheader", { name: "Notes", exact: true })
          .count()) > 0,
      );
      await cell.getByRole("button", { name: "Add note", exact: true }).click();
      await page
        .getByRole("textbox", { name: "Note content", exact: true })
        .fill("Cancel this new note");
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      assert.equal(state.posts.length, 0);
      assert.equal((await notes.snapshot(db, state.user)).items.length, 0);
      await cell.getByRole("button", { name: "Add note", exact: true }).click();
      let editor = page.getByRole("textbox", {
        name: "Note content",
        exact: true,
      });
      await editor.fill("Personal grammar notes");
      await editor.press("ControlOrMeta+A");
      await page.getByRole("button", { name: "Bold", exact: true }).click();
      await page.getByRole("button", { name: "Heading", exact: true }).click();
      await page
        .getByRole("button", { name: "Save note", exact: true })
        .click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      assert.equal(state.posts.length, 1);
      let saved = (await notes.snapshot(db, state.user)).items[0];
      assert.ok(JSON.stringify(saved.document).includes("heading"));
      assert.ok(JSON.stringify(saved.document).includes("bold"));
      assert.equal(
        await cell
          .getByRole("button", { name: "Add note", exact: true })
          .count(),
        0,
      );
      assert.equal(
        await cell
          .getByRole("button", { name: "Open note", exact: true })
          .count(),
        1,
      );
      assert.equal(
        await cell
          .getByRole("button", { name: "Edit note", exact: true })
          .count(),
        1,
      );
      await cell
        .getByRole("button", { name: "Open note", exact: true })
        .click();
      assert.equal(await page.locator("[contenteditable=true]").count(), 0);
      assert.ok(
        await page
          .getByRole("heading", { name: "Personal grammar notes", exact: true })
          .count(),
      );
      await page.waitForTimeout(250);
      await page.screenshot({
        path: `/tmp/video-note-reader-${mobile ? "phone-dark" : "desktop-light"}.png`,
      });
      const box = await page.getByRole("dialog").boundingBox();
      assert.ok(
        box.width <= (mobile ? 390 : 1280) &&
          box.height <= (mobile ? 844 : 900),
      );
      await page.keyboard.press("Escape");
      assert.equal(
        await cell
          .getByRole("button", { name: "Open note", exact: true })
          .evaluate((e) => e === document.activeElement),
        true,
      );
      await cell
        .getByRole("button", { name: "Edit note", exact: true })
        .click();
      editor = page.getByRole("textbox", { name: "Note content", exact: true });
      await editor.fill("Discard this edit");
      await page
        .getByRole("button", { name: "Bulleted list", exact: true })
        .click();
      assert.equal(await editor.locator("ul").count(), 1);
      await page
        .getByRole("button", { name: "Numbered list", exact: true })
        .click();
      assert.equal(await editor.locator("ol").count(), 1);
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      assert.deepEqual(
        (await notes.snapshot(db, state.user)).items[0].document,
        saved.document,
      );
      assert.equal(state.posts.length, 1);
      await cell
        .getByRole("button", { name: "Edit note", exact: true })
        .click();
      editor = page.getByRole("textbox", { name: "Note content", exact: true });
      await editor.fill("Saved once <img src=x onerror=alert(1)>");
      state.drop = true;
      await page
        .getByRole("button", { name: "Save note", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Retry save", exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Retry save", exact: true })
        .click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      assert.deepEqual(state.posts[1], state.posts[2]);
      assert.equal((await notes.snapshot(db, state.user)).items[0].revision, 2);
      const B = await device(state.user, mobile);
      await B.cell
        .getByRole("button", { name: "Open note", exact: true })
        .click();
      await B.page
        .getByText("Saved once <img src=x onerror=alert(1)>", { exact: true })
        .waitFor();
      assert.equal(await B.page.getByRole("dialog").locator("img").count(), 0);
      await B.page.keyboard.press("Escape");
      // Two devices edit revision 2. The second must not overwrite the first.
      await B.cell
        .getByRole("button", { name: "Edit note", exact: true })
        .click();
      await B.page
        .getByRole("textbox", { name: "Note content", exact: true })
        .fill("Stale second-device edit");
      await cell
        .getByRole("button", { name: "Edit note", exact: true })
        .click();
      await page
        .getByRole("textbox", { name: "Note content", exact: true })
        .fill("Latest saved note");
      await page
        .getByRole("button", { name: "Save note", exact: true })
        .click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await B.page
        .getByRole("button", { name: "Save note", exact: true })
        .click();
      await B.page
        .getByRole("alert")
        .filter({ hasText: "another device" })
        .waitFor();
      assert.equal(
        await B.page
          .getByRole("textbox", { name: "Note content", exact: true })
          .innerText(),
        "Stale second-device edit",
      );
      await B.page
        .getByRole("button", {
          name: "Reload saved note (replaces this draft)",
          exact: true,
        })
        .click();
      await B.page
        .getByRole("textbox", { name: "Note content", exact: true })
        .filter({ hasText: "Latest saved note" })
        .waitFor();
      await B.page.getByRole("button", { name: "Cancel", exact: true }).click();
      // Paste strips hostile HTML elements before saving; the server also validates the JSON.
      await cell
        .getByRole("button", { name: "Edit note", exact: true })
        .click();
      editor = page.getByRole("textbox", { name: "Note content", exact: true });
      await editor.fill("");
      await editor.evaluate((el) => {
        const data = new DataTransfer();
        data.setData(
          "text/html",
          '<p onclick="alert(1)">Pasted safely<script>alert(1)</script><img src="x" onerror="alert(1)"></p>',
        );
        el.dispatchEvent(
          new ClipboardEvent("paste", {
            clipboardData: data,
            bubbles: true,
            cancelable: true,
          }),
        );
      });
      assert.equal(
        await editor.locator("img,script,[onclick],[onerror]").count(),
        0,
      );
      await page.waitForTimeout(250);
      await page.screenshot({
        path: `/tmp/video-note-editor-${mobile ? "phone" : "desktop"}.png`,
      });
      await editor.fill("   ");
      await page
        .getByRole("button", { name: "Save note", exact: true })
        .click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await cell
        .getByRole("button", { name: "Add note", exact: true })
        .waitFor();
      assert.equal(
        (await notes.snapshot(db, state.user)).items[0].document,
        null,
      );
      // Unsaved drafts never survive an account switch or trigger a write.
      await cell.getByRole("button", { name: "Add note", exact: true }).click();
      await page
        .getByRole("textbox", { name: "Note content", exact: true })
        .fill("Private unsaved draft");
      const before = state.posts.length;
      state.user = "other-" + mobile;
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      assert.equal(state.posts.length, before);
      assert.equal((await notes.snapshot(db, state.user)).items.length, 0);
      await page.waitForTimeout(250);
      const requests = state.requests.length;
      await page.waitForTimeout(1500);
      assert.equal(state.requests.length, requests, "No idle polling");
      await B.context.close();
      await A.context.close();
      console.log(
        `${mobile ? "Phone" : "Desktop"} notes: formatting, persistence across devices, open/edit, cancellation, safe paste/rendering, lost-response retry, stale revision conflict, empty deletion, focus, account isolation and idle no-polling passed`,
      );
    }
    const paragraph = (text) => ({
      type: "paragraph",
      content: [{ type: "text", text }],
    });
    const rich = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "My notes: は and が" }],
        },
        paragraph(
          "は sets the topic: the thing we are talking about. が identifies the subject, often drawing attention to new information.",
        ),
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                paragraph("私は学生です。— As for me, I am a student."),
              ],
            },
            {
              type: "listItem",
              content: [paragraph("誰が来ますか。— Who is coming?")],
            },
          ],
        },
        {
          type: "blockquote",
          content: [
            paragraph(
              "Check the context before translating either particle into English.",
            ),
          ],
        },
        ...Array.from({ length: 12 }, (_, i) =>
          paragraph(
            `Practice ${i + 1}: write a short conversation, then explain which information is already shared and which is new.`,
          ),
        ),
      ],
    };
    await db.transaction((tx) =>
      notes.save(tx, "book-preview", {
        videoId,
        document: rich,
        expectedRevision: 0,
        mutationId: require("node:crypto").randomUUID(),
      }),
    );
    const preview = await device("book-preview", true);
    await preview.cell
      .getByRole("button", { name: "Open note", exact: true })
      .click();
    await preview.page.waitForTimeout(250);
    assert.equal(
      await preview.page
        .getByRole("dialog")
        .evaluate((el) => el.scrollHeight > el.clientHeight),
      true,
      "Long notes scroll inside the modal",
    );
    await preview.page.screenshot({
      path: "/tmp/video-note-book-long-phone.png",
    });
    await preview.context.close();
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await db.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
