// Isolated UI regression: synthetic account and mocked AI; no real database/key.
const { chromium } = require("playwright"),
  assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  });
  try {
    for (const width of [1280, 360]) {
      const context = await browser.newContext({
          viewport: { width, height: 900 },
        }),
        page = await context.newPage();
      let owner = "practice-A",
        calls = [],
        fail = true,
        revision = 0;
      const questions = Array.from({ length: 10 }, (_, i) => ({
        id: `q${i + 1}`,
        type: "situation",
        prompt: `Write a short Japanese sentence about student ${i + 1}.`,
      }));
      const setId = "12345678-1234-4234-8234-123456789abc";
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await context.route("**/api/**", async (route) => {
        const req = route.request(),
          path = new URL(req.url()).pathname,
          b = req.postDataJSON();
        let data;
        if (path === "/api/account")
          data = {
            status: "account",
            auth: { user: { id: owner, name: owner }, csrf: "test-csrf" },
            progress: { userId: owner, rows: [] },
            timer: { userId: owner, totalSeconds: 0, history: [] },
            vocabulary: {
              userId: owner,
              items: [],
              dueCount: 0,
              serverNow: new Date().toISOString(),
            },
            catalog: require("../../server/catalog.json"),
            error: null,
          };
        else if (path === "/api/grammar-practice") {
          assert.equal(req.headers()["x-csrf-token"], "test-csrf");
          calls.push(b);
          if (b.action === "grade" && fail) {
            fail = false;
            return route.fulfill({
              status: 502,
              contentType: "application/json",
              body: JSON.stringify({
                error: "Temporary grading error. Please retry.",
              }),
            });
          }
          if (b.action === "done") data = { userId: owner, dismissed: true };
          else
            data = {
              userId: owner,
              setId,
              lessonId: b.lessonId || "g-GUymRdqBglo",
              revision: b.action === "grade" ? ++revision : 0,
              expiresAt: new Date(Date.now() + 7200000).toISOString(),
              questions,
              feedback:
                b.action === "grade"
                  ? questions.map((q, i) => ({
                      id: q.id,
                      verdict:
                        i === 0 && revision === 1
                          ? "incorrect"
                          : i === 1
                            ? "less_natural"
                            : "correct",
                      explanation:
                        "<script>not executable</script> Valid alternatives are accepted.",
                      exampleAnswer: "私は学生です。",
                    }))
                  : null,
            };
        } else
          data = {
            userId: owner,
            totalSeconds: 0,
            history: [],
            items: [],
            dueCount: 0,
            serverNow: new Date().toISOString(),
          };
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify(data),
        });
      });
      await page.goto(
        (process.env.TEST_APP_ORIGIN || "http://127.0.0.1:3001") +
          "/grammar.html",
      );
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      await page.getByRole("button", { name: "Profile: practice-A" }).waitFor();
      assert.equal(
        await page
          .getByRole("navigation", { name: "Study pages" })
          .getByRole("link", { name: "Revisions", exact: true })
          .count(),
        0,
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Generate questions", exact: true })
          .count(),
        require("../../grammar-data.json").stages.flatMap((s) => s.lessons)
          .length,
      );
      await page
        .getByRole("button", { name: "Generate questions", exact: true })
        .first()
        .click();
      await page.locator("textarea").first().waitFor();
      assert.equal(await page.locator("textarea").count(), 10);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].lessonId, "g-GUymRdqBglo");
      assert.equal(
        await page.getByRole("button", { name: "Submit all ten" }).isEnabled(),
        false,
      );
      for (let i = 0; i < 10; i++)
        await page.locator("textarea").nth(i).fill("私は学生です。");
      await page.getByRole("button", { name: "Submit all ten" }).click();
      await page
        .getByRole("alert")
        .filter({ hasText: "Temporary grading error" })
        .waitFor();
      assert.equal(
        await page.locator("textarea").first().inputValue(),
        "私は学生です。",
      );
      await page.getByRole("button", { name: "Submit all ten" }).click();
      await page.getByText("9 of 10 accepted", { exact: true }).waitFor();
      assert.equal(await page.locator(".practice-feedback").count(), 10);
      assert.equal(
        await page
          .getByText("Accepted · wording suggestion", { exact: true })
          .count(),
        1,
      );
      assert.equal(calls.filter((c) => c.action === "grade").length, 2);
      assert.equal(calls.at(-1).answers.length, 10);
      assert.ok(!("questions" in calls.at(-1)));
      await page
        .getByRole("button", { name: "Retry mistakes", exact: true })
        .click();
      await page.locator("textarea").first().fill("学生です。");
      assert.equal(
        await page.locator("textarea").nth(1).getAttribute("readonly"),
        "",
      );
      await page.getByRole("button", { name: "Check answers again" }).click();
      await page.getByText("10 of 10 accepted", { exact: true }).waitFor();
      assert.equal(
        await page
          .locator(".practice-dialog")
          .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
        true,
      );
      await page.getByRole("button", { name: "Done", exact: true }).click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await page
        .getByRole("button", { name: "Generate questions", exact: true })
        .first()
        .click();
      await page.locator("textarea").first().waitFor();
      assert.equal(await page.locator("textarea").first().inputValue(), "");
      owner = "practice-B";
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      await page
        .getByRole("button", {
          name: "Profile: practice-B",
          includeHidden: true,
        })
        .waitFor({ state: "attached" });
      await page.locator("textarea").first().waitFor();
      assert.equal(await page.locator("textarea").first().inputValue(), "");
      assert.deepEqual(errors, []);
      console.log(
        `Practice ${width}px: ten answers, batched grading, error preservation, feedback, retry, dismissal and account switch passed.`,
      );
      await context.close();
    }
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
