// Run against scripts/preview-listening.cjs only (isolated loopback demo).
const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const { Client } = require("pg");
const { randomBytes, createHash } = require("node:crypto");
(async () => {
  const db = new Client({
    connectionString:
      "postgresql://postgres@127.0.0.1:55440/postgres?sslmode=disable",
  });
  await db.connect();
  const token = randomBytes(32).toString("base64url");
  await db.query(
    "DELETE FROM learner_listening WHERE user_id IN ('local-listening-preview','listening-test-other')",
  );
  await db.query(
    "INSERT INTO learner_sessions(token_hash,user_id,display_name,csrf,expires_at) VALUES($1,'listening-test-other','Other test account','test-csrf',now()+interval '1 hour')",
    [createHash("sha256").update(token).digest("hex")],
  );
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    await page.addInitScript(() => {
      window.YT = {
        PlayerState: { PLAYING: 1 },
        Player: function (el, opts) {
          let t = 0;
          this.getCurrentTime = () => t;
          this.seekTo = (x) => {
            t = x;
            window.__seek = x;
          };
          this.playVideo = () => opts.events.onStateChange({ data: 1 });
          this.destroy = () => {};
          window.__player = this;
          window.__setTime = (x) => (t = x);
          setTimeout(() => opts.events.onReady(), 0);
        },
      };
    });
    await page.goto("http://127.0.0.1:3010/listening/library");
    await page
      .getByLabel("YouTube link")
      .fill("https://www.youtube.com/watch?v=KJblreFQ2R8");
    await page
      .getByLabel("Title", { exact: true })
      .fill("日本語の練習 · Preview");
    await page
      .getByRole("button", { name: "Add to library", exact: true })
      .click();
    await page.getByRole("status").waitFor();
    assert.match(await page.locator("main").innerText(), /Subtitles needed/);
    await page
      .getByRole("button", { name: "Edit title or upload subtitles" })
      .click();
    await page
      .getByLabel("Subtitles (optional)")
      .setInputFiles({
        name: "sample.vtt",
        mimeType: "text/vtt",
        buffer: Buffer.from(
          "WEBVTT\n\n00:01.000 --> 00:03.000\nこんにちは\n\n00:04.000 --> 00:06.000\n日本語を勉強します",
        ),
      });
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await page.getByRole("list", { name: "Timed transcript" }).waitFor();
    await page
      .getByRole("button", { name: /0:04.*日本語を勉強します/ })
      .click();
    assert.equal(await page.evaluate(() => window.__seek), 4);
    await page.waitForFunction(() =>
      document
        .querySelector('[aria-current="true"]')
        ?.textContent.includes("日本語を勉強します"),
    );
    await page.evaluate(() => window.__setTime(3.5));
    await page.waitForFunction(
      () => !document.querySelector('ol [aria-current="true"]'),
    );
    let apiCalls = 0;
    page.on("request", (r) => {
      if (new URL(r.url()).pathname.startsWith("/api/")) apiCalls++;
    });
    await page.waitForTimeout(3000);
    assert.equal(apiCalls, 0, "Playback must not poll backend");
    await page.reload();
    await page.getByRole("list", { name: "Timed transcript" }).waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      "Mobile overflow",
    );
    const html = await (
      await page.request.get("http://127.0.0.1:3010/listening/library")
    ).text();
    assert.ok(html.includes("こんにちは"), "Transcript present in server HTML");
    await page.screenshot({
      path: "/tmp/hirogaru-listening-library-mobile.png",
      fullPage: true,
    });
    const data = await (
      await page.request.get("http://127.0.0.1:3010/api/listening")
    ).json();
    assert.equal(data.items.length, 1);
    const direct = "http://127.0.0.1:3011/api/listening";
    assert.equal((await page.request.get(direct)).status(), 401);
    const other = await page.request.get(direct, {
      headers: { cookie: "learner_session=" + token },
    });
    assert.deepEqual((await other.json()).items, []);
    const body = {
      url: "https://youtu.be/KJblreFQ2R8",
      title: "Attack",
      subtitles: "",
      expectedRevision: 0,
    };
    assert.equal(
      (
        await page.request.post(direct, {
          headers: {
            cookie: "learner_session=" + token,
            origin: "http://127.0.0.1:3010",
          },
          data: body,
        })
      ).status(),
      403,
    );
    assert.equal(
      (
        await page.request.post(direct, {
          headers: {
            cookie: "learner_session=" + token,
            origin: "https://evil.example",
            "x-csrf-token": "test-csrf",
          },
          data: body,
        })
      ).status(),
      403,
    );
    assert.equal(
      (
        await page.request.post(direct, {
          headers: {
            cookie: "learner_session=" + token,
            origin: "http://127.0.0.1:3010",
            "x-csrf-token": "test-csrf",
          },
          data: { ...body, user_id: "local-listening-preview" },
        })
      ).status(),
      400,
    );
    console.log(
      "PASS: create, subtitle replacement, persistence, SSR, seek/highlight/gap, idle network, mobile layout, unauthenticated access, account isolation and CSRF. Player timing uses a deterministic YouTube API test double.",
    );
  } finally {
    await browser.close();
    await db.query(
      "DELETE FROM learner_sessions WHERE user_id='listening-test-other'",
    );
    await db.end();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
