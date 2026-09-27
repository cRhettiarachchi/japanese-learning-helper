// Synthetic account, AI and save responses; never touches live database or OpenAI.
const { chromium } = require("playwright"),
  assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  });
  try {
    for (const mobile of [false, true]) {
      const context = await browser.newContext({
        viewport: mobile
          ? { width: 390, height: 844 }
          : { width: 1280, height: 900 },
        isMobile: mobile,
        hasTouch: mobile,
      });
      const page = await context.newPage();
      let account = "draft-A",
        items = [],
        generations = [],
        saves = [],
        mode = "ok",
        lost = false,
        delayedResolve;
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const card = {
        japanese: "本を読んでしまった。",
        intent: "How てしまう expresses regret",
        prompt: "What nuance does てしまった add here?",
        answer: "It adds regret about the completed action.",
        segments: [
          { text: "本", reading: "ほん" },
          { text: "を", reading: "" },
          { text: "読", reading: "よ" },
          { text: "んでしまった。", reading: "" },
        ],
      };
      const vocab = () => ({
        userId: account,
        items,
        dueCount: items.length,
        serverNow: new Date().toISOString(),
      });
      await context.route("**/api/**", async (route) => {
        const req = route.request(),
          path = new URL(req.url()).pathname,
          body = req.postDataJSON();
        let data = {};
        if (path === "/api/account")
          data = {
            status: "account",
            auth: { user: { id: account, name: account }, csrf: "synthetic" },
            progress: { userId: account, rows: [] },
            timer: { userId: account, totalSeconds: 0, history: [] },
            vocabulary: vocab(),
            catalog: require("../../server/catalog.json"),
            error: null,
          };
        if (path === "/api/revision-card") {
          generations.push(body);
          assert.equal(req.headers()["x-csrf-token"], "synthetic");
          if (mode === "fail") {
            await route.fulfill({
              status: 502,
              json: { error: "Draft unavailable; retry." },
            });
            return;
          }
          if (mode === "delay")
            await new Promise((resolve) => (delayedResolve = resolve));
          data = { userId: account, card };
        }
        if (path === "/api/vocabulary") {
          if (body) {
            saves.push(body);
            if (
              body.action === "add-card" &&
              !items.some((i) => i.entry_id === body.entryId)
            )
              items.push({
                entry_id: body.entryId,
                word: body.card.japanese,
                reading: "",
                readings: [],
                meanings: [body.card.answer],
                card: body.card,
                stage: 0,
                revision: 1,
                due_at: new Date(0).toISOString(),
              });
            if (lost) {
              lost = false;
              await route.abort();
              return;
            }
          }
          data = vocab();
        }
        await route.fulfill({ status: 200, json: data });
      });
      await page.goto(
        (process.env.TEST_APP_ORIGIN || "http://127.0.0.1:3000") +
          "/vocabulary.html",
      );
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      await page
        .getByRole("button", { name: "Create revision card", exact: true })
        .waitFor();
      const create = () =>
        page
          .getByRole("button", { name: "Create revision card", exact: true })
          .click();
      const fill = async () => {
        await page.getByLabel("Japanese sentence or word").fill(card.japanese);
        await page
          .getByLabel("What should this card teach you?")
          .fill(card.intent);
      };
      await create();
      await fill();
      await page
        .getByRole("button", { name: "Generate preview", exact: true })
        .click();
      await page.getByRole("region", { name: "Front preview" }).waitFor();
      assert.equal(saves.length, 0);
      await page.screenshot({
        path: `/tmp/revision-card-preview-${mobile ? "mobile" : "desktop"}.png`,
      });
      if (mobile) {
        await page.evaluate(() =>
          document.documentElement.classList.add("dark"),
        );
        await page.screenshot({ path: "/tmp/revision-card-preview-dark.png" });
        await page.evaluate(() =>
          document.documentElement.classList.remove("dark"),
        );
      }

      assert.equal(
        await page
          .locator('[aria-label="Front preview"] ruby rt')
          .allTextContents()
          .then((x) => x.join(" ")),
        "ほん よ",
      );
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      assert.equal(saves.length, 0);
      await create();
      await fill();
      mode = "fail";
      await page
        .getByRole("button", { name: "Generate preview", exact: true })
        .click();
      await page
        .getByRole("alert")
        .filter({ hasText: "Draft unavailable" })
        .waitFor();
      assert.equal(
        await page.getByLabel("Japanese sentence or word").inputValue(),
        card.japanese,
      );
      mode = "ok";
      await page
        .getByRole("button", { name: "Generate preview", exact: true })
        .click();
      await page.getByRole("region", { name: "Front preview" }).waitFor();
      await page.getByLabel("Retry hint (optional)").fill("Focus on regret");
      await Promise.all([
        page.waitForResponse((r) => r.url().endsWith("/api/revision-card")),
        page.getByRole("button", { name: "Retry draft", exact: true }).click(),
      ]);
      await page.waitForFunction(() =>
        Array.from(document.querySelectorAll("button")).some(
          (b) => b.textContent === "Retry draft" && !b.disabled,
        ),
      );
      await page
        .getByRole("button", { name: "Edit card", exact: true })
        .click();
      assert.equal(generations.at(-1).hint, "Focus on regret");
      assert.equal(generations.at(-1).japanese, card.japanese);
      assert.equal(generations.at(-1).intent, card.intent);
      assert.equal(saves.length, 0);
      await page
        .getByRole("button", { name: "Finish editing", exact: true })
        .waitFor();
      await page
        .getByLabel("Back answer", { exact: true })
        .fill("A completed action, with regret. <img src=x onerror=alert(1)>");
      await page.getByLabel("Reading 1: 本", { exact: true }).fill("ホン");
      await page
        .getByRole("button", { name: "Add to my reviews", exact: true })
        .click();
      await page.getByRole("alert").filter({ hasText: "hiragana" }).waitFor();
      assert.equal(saves.length, 0);
      await page.getByLabel("Reading 1: 本", { exact: true }).fill("ほん");
      assert.equal(
        await page.locator('[aria-label="Back preview"] img').count(),
        0,
      );
      // Mobile dialog must remain within viewport and scroll, with usable preview text.
      const box = await page.getByRole("dialog").boundingBox();
      assert.ok((box.x >= 0 && box.width <= 390) || !mobile);
      assert.ok(box.height <= 900);
      await page.screenshot({
        path: `/tmp/revision-card-${mobile ? "mobile" : "desktop"}.png`,
      });
      lost = true;
      await page
        .getByRole("button", { name: "Add to my reviews", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Retry approved save", exact: true })
        .waitFor();
      assert.equal(items.length, 1);
      await page
        .getByRole("button", { name: "Retry approved save", exact: true })
        .click();
      await page
        .getByRole("status")
        .filter({ hasText: "Revision card added" })
        .waitFor();
      assert.equal(items.length, 1);
      assert.equal(saves.length, 2);
      assert.deepEqual(saves[0], saves[1]);
      await page
        .getByRole("button", { name: "Reveal meaning", exact: true })
        .click();
      await page
        .getByText(
          "A completed action, with regret. <img src=x onerror=alert(1)>",
          { exact: true },
        )
        .waitFor();
      assert.equal(await page.locator(".vocabulary-card img").count(), 0);
      // Cancel an in-flight draft, then switch accounts: no draft or save crosses ownership.
      await create();
      await fill();
      mode = "delay";
      await page
        .getByRole("button", { name: "Generate preview", exact: true })
        .click();
      while (!delayedResolve) await page.waitForTimeout(10);
      account = "draft-B";
      items = [];
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      delayedResolve();
      await page.waitForTimeout(150);
      assert.equal(saves.length, 2);
      assert.equal(
        await page.getByRole("region", { name: "Front preview" }).count(),
        0,
      );
      assert.deepEqual(errors, []);
      await context.close();
      console.log(
        `Revision-card ${mobile ? "mobile" : "desktop"}: preview, cancel, errors, retry intent, editing/ruby validation, safe rendering, explicit approval, lost-response deduplication and account isolation passed`,
      );
    }
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
