// Isolated browser regression: API requests use synthetic accounts; no real study data is touched.
const { chromium } = require("playwright");
const assert = require("node:assert/strict"),
  fs = require("fs");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  });
  const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    }),
    page = await context.newPage();
  let account = "review-A",
    posts = [],
    rows = [],
    errors = [],
    failSave = false;
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("net::ERR_FAILED"))
      errors.push(m.text().slice(0, 300));
  });
  await context.route("**/api/**", async (route) => {
    const req = route.request(),
      p = new URL(req.url()).pathname;
    const payload = req.postDataJSON();
    if (req.method() !== "GET") posts.push({ p, body: payload });
    if (p === "/api/progress" && payload && failSave) {
      failSave = false;
      await route.abort();
      return;
    }
    let data;
    if (p === "/api/account")
      data = {
        status: "account",
        auth: { user: { id: account, name: account }, csrf: "synthetic" },
        progress: { userId: account, rows },
        timer: { userId: account, totalSeconds: 0, history: [] },
        vocabulary: {
          userId: account,
          items: [],
          dueCount: 0,
          serverNow: new Date().toISOString(),
        },
        catalog: require("../../server/catalog.json"),
        error: null,
      };
    else if (p === "/api/auth/session")
      data = { user: { id: account, name: account }, csrf: "synthetic" };
    else if (p === "/api/progress") {
      if (payload) {
        const row = { ...payload, revision: payload.expectedRevision + 1 };
        rows = rows.filter(
          (r) =>
            !(r.kind === row.kind && r.id === row.id && r.field === row.field),
        );
        rows.push(row);
        data = { userId: account, row };
      } else data = { userId: account, rows };
    } else if (p === "/api/study-time")
      data = { userId: account, totalSeconds: 0, history: [] };
    else if (p === "/api/vocabulary")
      data = {
        userId: account,
        items: [],
        dueCount: 0,
        serverNow: new Date().toISOString(),
      };
    else data = {};
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  await page.goto(
    (process.env.TEST_APP_ORIGIN || "http://127.0.0.1:3000") + "/",
  );
  await page.locator("[data-reading-key]").first().waitFor();
  await page.waitForTimeout(150);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForFunction(
    () => !document.querySelector("[data-reading-key]").disabled,
  );
  assert.equal(await page.locator("iframe").count(), 0);
  console.log("root loaded, no iframe");
  await page.locator("[data-reading-key]").first().check();
  await page.waitForTimeout(300);
  assert.equal(posts.filter((x) => x.p === "/api/progress").length, 1);
  console.log("article automatic save passed");
  failSave = true;
  await page.locator("[data-reading-key]").first().uncheck();
  await page.waitForTimeout(150);
  assert.equal(
    await page.locator("[data-reading-key]").first().isChecked(),
    false,
  );
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForTimeout(300);
  assert.equal(rows[0].value, false);
  console.log("offline pending uncheck recovers automatically");
  await page.locator("[data-timer-main]").click();
  await page.waitForTimeout(1200);
  await page.evaluate(
    () => (window.__header = document.querySelector(".app-header")),
  );
  await page.getByRole("link", { name: "Grammar", exact: true }).click();
  await page.locator("[data-lesson]").first().waitFor();
  assert.equal(
    await page.evaluate(
      () => window.__header === document.querySelector(".app-header"),
    ),
    true,
  );
  assert.equal(await page.locator("[data-lesson]").count(), 129);
  assert.equal(await page.locator("[data-timer-main]").innerText(), "Stop");
  assert.equal(posts.filter((x) => x.p === "/api/study-time").length, 0);
  console.log("persistent header/timer and129grammar passed");
  assert.match(await page.locator("#results").innerText(), /165 of 165/);
  assert.equal(await page.locator("#empty").isVisible(), false);
  await page.screenshot({ path: "/tmp/hirogaru-next-grammar-desktop.png" });
  await page.locator("#search").fill("unlikely-no-match-9385");
  assert.equal(await page.locator("tr[data-topic]:visible").count(), 0);
  assert.equal(await page.locator("#empty").isVisible(), true);
  await page.locator("#search").fill("");
  await page.getByRole("link", { name: "Reading", exact: true }).click();
  await page.locator(".article-word").first().click();
  await page.getByRole("dialog").waitFor();
  console.log(
    "dictionary open",
    await page
      .getByRole("dialog")
      .innerText()
      .then((s) => s.slice(0, 100)),
  );
  await page.waitForTimeout(500);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  assert.equal(await page.getByRole("dialog").isVisible(), false);
  assert.equal(
    await page.evaluate(() => document.activeElement?.matches(".article-word")),
    true,
  );
  console.log("dictionary Escape focus restored");
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Dark", exact: true }).click();
  assert.equal(await page.locator("html").getAttribute("class"), "dark");
  await page.screenshot({
    path: "/tmp/hirogaru-next-dark-desktop.png",
    fullPage: false,
  });
  await page.reload();
  await page.locator("[data-reading-key]").first().waitFor();
  await page.waitForTimeout(150);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  assert.equal(await page.locator("html").getAttribute("class"), "dark");
  console.log("dark preference persists");
  await page.getByRole("switch", { name: "Show furigana" }).click();
  assert.equal(
    await page
      .locator("article ruby rt")
      .first()
      .evaluate((e) => getComputedStyle(e).visibility),
    "hidden",
  );
  await page.getByRole("combobox", { name: "Text size", exact: true }).click();
  await page.getByRole("option", { name: "30 px", exact: true }).click();
  assert.equal(
    await page
      .locator(".prose p")
      .first()
      .evaluate((e) => getComputedStyle(e).fontSize),
    "30px",
  );
  console.log("reader furigana and text size controls passed");
  await page.getByRole("link", { name: "Listening", exact: true }).click();
  await page.locator("audio").waitFor();
  console.log(
    "audio completion boxes",
    await page.locator("#audio-done").count(),
  );
  await page.locator("#view-focus").click();
  assert.equal(await page.locator("#focus-view").isVisible(), true);
  await page.screenshot({ path: "/tmp/hirogaru-next-listening.png" });
  console.log("focus transcript works");
  await page.locator("audio").evaluate(async (audio) => {
    audio.muted = true;
    await audio.play();
  });
  await page.waitForFunction(
    () => document.querySelector("audio").currentTime > 0.2,
  );
  await page.locator("#focus-view [data-word]").first().click();
  await page.getByRole("dialog").waitFor();
  assert.equal(await page.locator("audio").evaluate((a) => a.paused), true);
  await page.waitForTimeout(500);
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => document.querySelector("audio").paused === false,
  );
  await page.locator("audio").evaluate((a) => a.pause());
  console.log("actual audio playback and dictionary pause/resume passed");
  await page.evaluate(
    () => (window.__header = document.querySelector(".app-header")),
  );
  await page.goBack();
  await page.locator("[data-reading-key]").first().waitFor();
  await page.waitForTimeout(150);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.goForward();
  await page.locator("audio").waitFor();
  assert.equal(
    await page.evaluate(
      () => window.__header === document.querySelector(".app-header"),
    ),
    true,
  );
  console.log("Back/Forward restored routes");
  for (const route of [
    "/index.html",
    "/readings/2026-09-09.html",
    "/readings/2026-09-14.html",
    "/readings/2026-09-23.html",
    "/readings/2026-09-24.html",
    "/grammar.html",
    "/listening/teppei-1586.html",
    "/listening/teppei-1587.html",
    "/listening/yuyu-get-better-slowly.html",
    "/vocabulary.html",
    "/revisions.html",
    "/revisions/revision-1-test.html",
    "/revisions/revision-1-answers.html",
  ])
    assert.equal(
      (
        await context.request.get(
          (process.env.TEST_APP_ORIGIN || "http://127.0.0.1:3000") + route,
        )
      ).status(),
      200,
      route,
    );
  console.log("all13 existing routes return200");
  assert.deepEqual(errors, [], "No browser errors");
  fs.writeFileSync(
    "/tmp/hirogaru-next-review-errors.json",
    JSON.stringify(errors),
  );
  await context.close();
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
