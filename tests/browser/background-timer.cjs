// Isolated account fixture: no real study data or server mutations.
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  });
  try {
    const context = await browser.newContext();
    const api = [];
    const user = {
      id: "background-timer-fixture",
      name: "Background timer fixture",
    };
    await context.route("**/api/**", async (route) => {
      const req = route.request();
      api.push({ url: new URL(req.url()).pathname, method: req.method() });
      assert.equal(
        req.method(),
        "GET",
        "No server timer writes while running or stopping",
      );
      assert.equal(
        new URL(req.url()).pathname,
        "/api/account",
        "Only event-based account refresh",
      );
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "account",
          auth: { user, csrf: "fixture" },
          progress: { userId: user.id, rows: [] },
          timer: {
            userId: user.id,
            totalSeconds: 0,
            history: [],
            current: null,
          },
          vocabulary: {
            userId: user.id,
            items: [],
            dueCount: 0,
            serverNow: new Date().toISOString(),
          },
          catalog: { article: {}, grammar: {}, audio: {} },
          error: null,
        }),
      });
    });
    const key = "learner.timer.draft.v1." + user.id;
    const origin = process.env.TEST_APP_ORIGIN || "http://127.0.0.1:3000";
    let page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.clock.install();
    async function authenticate() {
      await page
        .getByRole("button", { name: "Appearance", exact: true })
        .waitFor();
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await page
        .getByRole("button", { name: "Profile: " + user.name, exact: true })
        .waitFor();
      await page.waitForTimeout(150);
    }
    const seconds = () =>
      page
        .locator("[data-timer-clock]")
        .innerText()
        .then((s) => s.split(":").reduce((n, x) => n * 60 + Number(x), 0));
    await page.goto(origin);
    await authenticate();
    await page.locator("[data-timer-main]").click();
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("pagehide"));
    });
    const before = api.length;
    await page.clock.fastForward(300000);
    assert.equal(await page.locator("[data-timer-main]").innerText(), "Stop");
    assert.ok(
      (await seconds()) >= 300,
      "Suspended/throttled five minutes counted",
    );
    assert.equal(api.length, before, "No background polling");
    const anchor = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)),
      key,
    );
    assert.equal(
      anchor.elapsed_ms,
      0,
      "Clock ticks do not repeatedly write checkpoints",
    );
    assert.ok(anchor.running_since);
    await page.reload();
    await authenticate();
    assert.equal(await page.locator("[data-timer-main]").innerText(), "Stop");
    assert.ok((await seconds()) >= 300, "Reload retains active elapsed time");
    await page.locator("[data-timer-main]").click();
    await page
      .getByRole("button", { name: "Review later", exact: true })
      .click();
    const stopped = await seconds();
    await page.clock.fastForward(120000);
    assert.equal(await seconds(), stopped, "Explicit Stop freezes time");
    assert.equal(
      await page.locator("[data-timer-main]").innerText(),
      "Review time",
    );
    // Reopen a running legacy draft: last checkpoint is the compatibility anchor.
    const now = await page.evaluate(() => Date.now());
    await page.evaluate(
      ({ key, now }) =>
        localStorage.setItem(
          key,
          JSON.stringify({
            id: crypto.randomUUID(),
            local: true,
            state: "active",
            owner_client: "closed-tab",
            elapsed_ms: 12000,
            updatedAt: now - 90000,
          }),
        ),
      { key, now },
    );
    await page.close();
    page = await context.newPage();
    await page.clock.install({ time: new Date(now) });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin);
    await authenticate();
    assert.equal(await page.locator("[data-timer-main]").innerText(), "Stop");
    assert.ok(
      (await seconds()) >= 102,
      "New tab reconciles legacy persisted active timestamp",
    );
    assert.equal(await page.locator("[data-timer-main]").isEnabled(), true);
    await page.locator("[data-timer-main]").click();
    assert.ok(await page.getByRole("dialog").isVisible());
    assert.deepEqual(errors, []);
    console.log(
      "PASS: background/pagehide/throttling, reload, closed-tab legacy recovery, explicit Stop, and no timer network requests",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
