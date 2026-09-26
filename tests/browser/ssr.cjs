// Opt-in: real local Next SSR with unique temporary Development records only.
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { chromium } = require("playwright");
const { JSDOM } = require("jsdom");
const { random, hash } = require("../../server/auth.cjs");
const { getPool, withUser } = require("../../server/db.cjs");
const progress = require("../../server/progress.cjs");
const vocabulary = require("../../server/vocabulary.cjs");
const timer = require("../../server/study-time.cjs");
const catalog = require("../../server/catalog.json");
const vocabCatalog = require("../../server/vocabulary-catalog.json");
(async () => {
  assert.equal(
    process.env.APP_ORIGIN,
    "http://127.0.0.1:3000",
    "Only local Development origin",
  );
  const origin = process.env.APP_ORIGIN,
    pool = getPool(),
    prefix = "ssr-review-" + randomUUID(),
    users = [prefix + "-A", prefix + "-B"],
    tokens = [random(), random()],
    csrf = [random(), random()];
  const article = Object.keys(catalog.article)[0],
    entry = Object.keys(vocabCatalog)[0];
  let browser;
  const cookie = (i) => ({
    name: "learner_session",
    value: tokens[i],
    url: origin,
    httpOnly: true,
    sameSite: "Lax",
  });
  const html = async (path, i) => {
    const r = await fetch(origin + path, {
      headers:
        i === undefined ? {} : { Cookie: "learner_session=" + tokens[i] },
    });
    assert.equal(r.status, 200);
    if (process.env.STRICT_SSR_CACHE) {
      assert.match(r.headers.get("cache-control") || "", /private/);
      assert.match(r.headers.get("cache-control") || "", /no-store/);
    } else
      assert.match(r.headers.get("cache-control") || "", /no-cache|no-store/);
    const text = await r.text();
    for (const token of tokens) {
      assert.ok(!text.includes(token), "No bearer cookie in SSR");
      assert.ok(!text.includes(hash(token)), "No session token hash in SSR");
    }
    return new JSDOM(text).window.document;
  };
  try {
    for (let i = 0; i < 2; i++)
      await pool.query(
        "INSERT INTO learner_sessions(token_hash,user_id,display_name,csrf,expires_at) VALUES($1,$2,$3,$4,now()+interval '20 minutes')",
        [hash(tokens[i]), users[i], users[i], csrf[i]],
      );
    await withUser(users[0], (db) =>
      progress.update(db, users[0], {
        kind: "article",
        id: article,
        field: "done",
        value: true,
        expectedRevision: 0,
        mutationId: randomUUID(),
      }),
    );
    await withUser(users[0], (db) =>
      vocabulary.run(db, users[0], {
        action: "add",
        entryId: entry,
        mutationId: randomUUID(),
      }),
    );
    await withUser(users[0], (db) =>
      timer.run(db, users[0], {
        action: "commit",
        id: randomUUID(),
        clientId: randomUUID(),
        seconds: 7200,
        mutationId: randomUUID(),
      }),
    );
    const a = await html("/", 0),
      b = await html("/", 1),
      anonymous = await html("/");
    assert.ok(
      a.querySelector("[data-reading-key]").checked,
      "Completion included in first HTML",
    );
    assert.match(
      a.querySelector("[data-timer-total]").textContent,
      /2.00 hours saved/,
    );
    assert.ok(a.querySelector('[aria-label="Profile: ' + users[0] + '"]'));
    assert.equal(b.querySelector("[data-reading-key]").checked, false);
    assert.match(
      b.querySelector("[data-timer-total]").textContent,
      /0.00 hours saved/,
    );
    assert.ok(!b.body.textContent.includes(users[0]));
    assert.ok(
      !anonymous.querySelector('[aria-label="Profile: ' + users[0] + '"]'),
    );
    const va = await html("/vocabulary.html", 0),
      vb = await html("/vocabulary.html", 1);
    assert.equal(va.querySelectorAll(".vocabulary-card").length, 1);
    assert.equal(vb.querySelectorAll(".vocabulary-card").length, 0);
    console.log(
      "Authenticated SSR contains account progress, vocabulary and totals; uncached response and A/B/anonymous isolation pass",
    );
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
    });
    const context = await browser.newContext();
    await context.addCookies([cookie(0)]);
    const page = await context.newPage(),
      requests = [],
      errors = [];
    page.on("request", (req) => {
      if (
        new URL(req.url()).pathname.startsWith("/api/") ||
        req.url().endsWith("/progress-catalog.json")
      )
        requests.push({ url: req.url(), method: req.method() });
    });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.clock.install();
    await page.goto(origin + "/");
    await page.locator("[data-reading-key]").first().waitFor();
    await page.waitForFunction(
      () => !document.querySelector("[data-reading-key]").disabled,
    );
    await page.waitForTimeout(400);
    assert.deepEqual(
      requests,
      [],
      "No redundant client API/catalog calls on SSR hydration",
    );
    await page.clock.fastForward(300000);
    await page.waitForTimeout(100);
    assert.deepEqual(requests, [], "Five idle minutes cause no polling");
    await page.locator("[data-timer-main]").click();
    await page.clock.fastForward(3000);
    assert.deepEqual(requests, [], "Local timer ticks cause no API calls");
    await page.locator("[data-timer-main]").click();
    await page
      .getByRole("button", { name: "Review later", exact: true })
      .click();
    const saved = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/progress") && r.request().method() === "PUT",
    );
    await page.locator("[data-reading-key]").first().uncheck();
    assert.equal((await saved).status(), 200);
    assert.equal(
      (await html("/", 0)).querySelector("[data-reading-key]").checked,
      false,
    );
    console.log(
      "Hydration and five-minute idle/local timer perform zero network requests; explicit progress edit persists",
    );
    await context.addCookies([cookie(1)]);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.clock.runFor(150);
    await page
      .getByRole("button", { name: "Profile: " + users[1], exact: true })
      .waitFor();
    assert.equal(await page.locator("[data-timer-main]").innerText(), "Start");
    assert.equal(
      await page.locator("[data-reading-key]").first().isChecked(),
      false,
    );
    assert.deepEqual(errors, [], "No hydration/browser errors");
    console.log(
      "Event-triggered account switch isolates current progress and local drafts",
    );
    const prior = await (
      await context.request.get(origin + "/api/account")
    ).json();
    let releaseLogout, releaseAccount;
    await page.route("**/api/auth/signout", async (route) => {
      await new Promise((resolve) => (releaseLogout = resolve));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{}",
      });
    });
    await page.route("**/api/account", async (route) => {
      await new Promise((resolve) => (releaseAccount = resolve));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(prior),
      });
    });
    await page
      .getByRole("button", { name: "Profile: " + users[1], exact: true })
      .click();
    await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
    for (let i = 0; i < 100 && !releaseLogout; i++)
      await page.waitForTimeout(10);
    assert.ok(releaseLogout);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.clock.runFor(150);
    for (let i = 0; i < 100 && !releaseAccount; i++)
      await page.waitForTimeout(10);
    assert.ok(releaseAccount);
    releaseLogout();
    await page
      .locator('.header-actions a[href="/api/auth/authorize"]')
      .waitFor();
    releaseAccount();
    await page.waitForTimeout(300);
    assert.equal(
      await page
        .getByRole("button", { name: "Profile: " + users[1], exact: true })
        .count(),
      0,
    );
    assert.equal(
      await page.locator("[data-reading-key]").first().isDisabled(),
      true,
    );
    console.log(
      "Delayed pre-signout account response cannot restore signed-out data",
    );
    await context.close();
    const retryContext = await browser.newContext();
    await retryContext.addCookies([cookie(0)]);
    const revision = (
      await withUser(users[0], (db) => progress.list(db, users[0]))
    )[0].revision;
    const mutation = {
      kind: "article",
      id: article,
      field: "done",
      value: true,
      expectedRevision: revision,
      mutationId: randomUUID(),
      queuedAt: Date.now(),
    };
    await retryContext.addInitScript(
      ({ user, mutation }) => {
        localStorage.setItem(
          "japanese-learner-account-v1:" +
            user +
            ":pending:" +
            mutation.mutationId,
          JSON.stringify(mutation),
        );
        localStorage.setItem(
          "learner.vocabulary.pending." + user + ":broken",
          "{broken",
        );
      },
      { user: users[0], mutation },
    );
    const retryPage = await retryContext.newPage(),
      retryRequests = [];
    retryPage.on("request", (r) => {
      if (new URL(r.url()).pathname.startsWith("/api/"))
        retryRequests.push({
          path: new URL(r.url()).pathname,
          method: r.method(),
        });
    });
    const replay = retryPage.waitForResponse(
      (r) =>
        r.url().endsWith("/api/progress") && r.request().method() === "PUT",
    );
    await retryPage.goto(origin + "/");
    assert.equal((await replay).status(), 200);
    await retryPage.waitForFunction(
      () => document.querySelector("[data-reading-key]").checked,
    );
    assert.deepEqual(
      retryRequests,
      [{ path: "/api/progress", method: "PUT" }],
      "SSR pending recovery sends only required saved mutation",
    );
    assert.equal(
      (await html("/", 0)).querySelector("[data-reading-key]").checked,
      true,
    );
    assert.equal(
      await retryPage.evaluate(
        (user) =>
          localStorage.getItem(
            "learner.vocabulary.pending." + user + ":broken",
          ),
        users[0],
      ),
      "{broken",
    );
    await retryContext.close();
    console.log(
      "SSR hydration recovers account-owned pending journal using only necessary mutation; malformed vocabulary journal remains intact",
    );
    const dueContext = await browser.newContext();
    await dueContext.addCookies([cookie(0)]);
    const duePage = await dueContext.newPage(),
      dueRequests = [];
    duePage.on("request", (r) => {
      if (new URL(r.url()).pathname.startsWith("/api/"))
        dueRequests.push(r.url());
    });
    await duePage.clock.install();
    await duePage.goto(origin + "/vocabulary.html");
    await duePage.locator(".reveal-meaning").click();
    const rating = duePage.waitForResponse(
      (r) =>
        r.url().endsWith("/api/vocabulary") && r.request().method() === "POST",
    );
    await duePage
      .getByRole("button", { name: "Again / not good →", exact: true })
      .click();
    assert.equal((await rating).status(), 200);
    await duePage.waitForFunction(
      () => document.querySelector(".vocabulary-card") === null,
    );
    dueRequests.length = 0;
    await duePage.clock.fastForward(600100);
    await duePage.locator(".vocabulary-card").waitFor();
    assert.deepEqual(
      dueRequests,
      [],
      "Next due card appears through local clock without network",
    );
    await dueContext.close();
    console.log(
      "Again card becomes due after ten minutes with zero network polling",
    );
  } finally {
    if (browser) await browser.close();
    for (const user of users)
      await withUser(user, async (db) => {
        for (const table of [
          "learner_vocabulary_mutations",
          "learner_vocabulary_ratings",
          "learner_vocabulary",
          "learner_vocabulary_accounts",
          "learner_timer_mutations",
          "learner_study_sessions",
          "learner_timer_accounts",
          "learner_progress",
        ])
          await db.query(`DELETE FROM ${table} WHERE user_id=$1`, [user]);
      });
    await pool.query(
      "DELETE FROM learner_sessions WHERE user_id=ANY($1::text[])",
      [users],
    );
    await pool.end();
  }
})().catch((error) => {
  console.error(error.stack);
  process.exitCode = 1;
});
