// Isolated browser regression: API requests use synthetic accounts; no real study data is touched.
const root = require("node:path").resolve(__dirname, "../..");
const { chromium } = require(root + "/node_modules/playwright"),
  { PGlite } = require(root + "/node_modules/@electric-sql/pglite"),
  timer = require(root + "/server/study-time.cjs"),
  vocab = require(root + "/server/vocabulary.cjs"),
  assert = require("assert/strict"),
  fs = require("fs"),
  crypto = require("crypto");
(async () => {
  const db = new PGlite();
  await db.exec(fs.readFileSync(root + "/db/study-time.sql", "utf8"));
  await db.exec(fs.readFileSync(root + "/db/vocabulary.sql", "utf8"));
  const catalog = {
    100: {
      word: "食べる",
      reading: "たべる",
      readings: ["たべる"],
      meanings: [
        "to eat",
        "first",
        "second",
        "third",
        "fourth",
        "fifth",
        "sixth",
      ],
    },
    200: {
      word: "読む",
      reading: "よむ",
      readings: ["よむ"],
      meanings: ["to read"],
    },
  };
  let account = "review-A",
    requests = [],
    errors = [],
    drop = false,
    holdVocabulary = false,
    releaseVocabulary = null;
  const callV = (body) =>
    db.transaction((tx) => vocab.run(tx, account, body, { catalog }));
  await callV({
    action: "add",
    entryId: "100",
    mutationId: crypto.randomUUID(),
  });
  await callV({
    action: "add",
    entryId: "200",
    mutationId: crypto.randomUUID(),
  });
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  });
  const context = await browser.newContext({
      viewport: { width: 360, height: 800 },
      isMobile: true,
      hasTouch: true,
      colorScheme: "dark",
    }),
    p = await context.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  await context.route("**/api/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname,
      body = req.postDataJSON();
    requests.push({ path, body });
    let result,
      status = 200;
    try {
      if (path === "/api/account")
        result = {
          status: "account",
          auth: { user: { id: account, name: account }, csrf: "fixture" },
          progress: { userId: account, rows: [] },
          timer: await db.transaction((tx) => timer.run(tx, account)),
          vocabulary: await callV(null),
          catalog: require("../../server/catalog.json"),
          error: null,
        };
      else if (path === "/api/auth/session")
        result = { user: { id: account, name: account }, csrf: "fixture" };
      else if (path === "/api/progress") result = { userId: account, rows: [] };
      else if (path === "/api/vocabulary") result = await callV(body);
      else if (path === "/api/study-time")
        result = await db.transaction((tx) => timer.run(tx, account, body));
      else result = {};
    } catch (e) {
      status = e.status || 500;
      result = { error: e.message };
    }
    if (drop && body) {
      drop = false;
      await route.abort();
      return;
    }
    if (holdVocabulary && path === "/api/vocabulary" && !body) {
      holdVocabulary = false;
      await new Promise((resolve) => (releaseVocabulary = resolve));
    }
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(result),
    });
  });
  await p.goto(
    (process.env.TEST_APP_ORIGIN || "http://127.0.0.1:3000") +
      "/vocabulary.html",
  );
  await p.waitForTimeout(200);
  await p.evaluate(() => window.dispatchEvent(new Event("online")));
  await p.locator(".reveal-meaning").waitFor();
  assert.equal(await p.locator("html").getAttribute("class"), "dark");
  assert.equal(await p.locator(".vocabulary-answer").count(), 0);
  assert.equal(
    await p.locator(".vocabulary-card ruby rt").innerText(),
    "たべる",
  );
  await p.locator(".reveal-meaning").click();
  assert.equal(await p.locator(".vocabulary-answer li").count(), 3);
  await p.getByRole("button", { name: "More meanings" }).click();
  assert.equal(
    await p.locator(".vocabulary-answer li").first().innerText(),
    "third",
  );
  await p.screenshot({ path: "/tmp/hirogaru-next-mobile-vocab.png" });
  async function swipe(dx, dy) {
    await p.locator(".vocabulary-answer").evaluate(
      (el, { dx, dy }) => {
        for (const [type, x, y] of [
          ["pointerdown", 200, 200],
          ["pointermove", 200 + dx, 200 + dy],
          ["pointerup", 200 + dx, 200 + dy],
        ])
          el.dispatchEvent(
            new PointerEvent(type, {
              bubbles: true,
              clientX: x,
              clientY: y,
              pointerId: 1,
              isPrimary: true,
              button: 0,
              pointerType: "touch",
            }),
          );
      },
      { dx, dy },
    );
  }
  await swipe(-150, 0);
  await p.waitForFunction(() =>
    document.querySelector(".vocabulary-card h2")?.textContent.includes("読む"),
  );
  await p.locator(".reveal-meaning").click();
  await swipe(0, -130);
  await p.waitForFunction(() =>
    document
      .querySelector(".vocabulary-card h2")
      ?.textContent.includes("食べる"),
  );
  assert.equal(await p.locator(".vocabulary-answer").count(), 0);
  await p.locator(".reveal-meaning").click();
  await swipe(150, 0);
  await p.waitForFunction(() =>
    document.querySelector(".vocabulary-card h2")?.textContent.includes("読む"),
  );
  console.log(
    "phone reveal/pagination/leftGood/upUndo/rightAgain passed with actual PGlite backend",
  );
  await p.locator("[data-timer-main]").click();
  await p.waitForTimeout(2200);
  await p.locator("[data-timer-main]").click();
  await p.getByRole("button", { name: "Adjust time", exact: true }).click();
  await p.getByLabel("Minutes", { exact: true }).fill("2");
  await p.getByLabel("Seconds", { exact: true }).fill("0");
  drop = true;
  await p.getByRole("button", { name: "Save time", exact: true }).click();
  await p.waitForTimeout(400);
  await p.getByRole("button", { name: "Review later", exact: true }).click();
  await p.getByRole("button", { name: "Retry", exact: true }).click();
  await p.waitForTimeout(500);
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int n FROM learner_study_sessions WHERE state='saved'",
      )
    ).rows[0].n,
    1,
  );
  await p.locator("[data-timer-history]").click();
  await p.getByRole("button", { name: "Edit", exact: true }).click();
  await p.getByRole("button", { name: "Discard", exact: true }).click();
  await p.waitForTimeout(300);
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int n FROM learner_study_sessions WHERE state='saved'",
      )
    ).rows[0].n,
    0,
  );
  console.log(
    "timer explicit lost-response Save idempotent; saved history discard passed",
  );
  await p.locator("[data-timer-main]").click();
  await p.waitForTimeout(1100);
  holdVocabulary = true;
  await p.getByRole("button", { name: "Refresh", exact: true }).click();
  for (let i = 0; i < 100 && !releaseVocabulary; i++)
    await p.waitForTimeout(10);
  assert.ok(releaseVocabulary);
  account = "review-B";
  await p.evaluate(() => window.dispatchEvent(new Event("focus")));
  await p
    .getByRole("button", { name: "Profile: review-B", exact: true })
    .waitFor();
  releaseVocabulary();
  await p.waitForTimeout(400);
  assert.equal(await p.locator(".vocabulary-card").count(), 0);
  assert.equal(await p.locator("[data-timer-main]").innerText(), "Start");
  assert.ok(
    await p.evaluate(() =>
      localStorage.getItem("learner.timer.draft.v1.review-A"),
    ),
  );
  account = "review-A";
  await p.evaluate(() => window.dispatchEvent(new Event("focus")));
  await p
    .getByRole("button", { name: "Profile: review-A", exact: true })
    .waitFor();
  await p.waitForTimeout(200);
  assert.equal(await p.locator("[data-timer-main]").innerText(), "Review time");
  console.log(
    "delayed vocabulary response/account switch isolation and timer draft recovery passed",
  );
  await p.getByRole("link", { name: "Reading", exact: true }).click();
  await p.locator("[data-reading-key]").first().waitFor();
  await p.screenshot({ path: "/tmp/hirogaru-next-mobile-reading.png" });
  await p.locator(".article-word").first().click();
  await p.getByRole("dialog").waitFor();
  await p.waitForTimeout(500);
  await p.screenshot({ path: "/tmp/hirogaru-next-mobile-dictionary.png" });
  const rect = await p.getByRole("dialog").boundingBox();
  assert.ok(
    rect.x >= -1 &&
      rect.x + rect.width <= 361 &&
      rect.y >= 0 &&
      rect.y + rect.height <= 801,
    "Dictionary fits mobile viewport",
  );
  const overflow = await p.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  assert.equal(overflow, false, "No mobile horizontal overflow");
  assert.deepEqual(errors, [], "No browser errors");
  await browser.close();
  await db.close();
})().catch((e) => {
  console.error(e.stack);
  process.exit(1);
});
