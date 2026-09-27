const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
test("Vercel discovers only Next API routes, not duplicate standalone root handlers", () => {
  assert.equal(
    fs.existsSync("api"),
    false,
    "A root api/ directory creates additional Vercel functions and can exceed the Hobby quota.",
  );
  const bridge = fs.readFileSync("src/app/api/[...endpoint]/route.ts", "utf8");
  const handlers = [
    ...bridge.matchAll(
      /from "(\.\.\/\.\.\/\.\.\/\.\.\/server\/handlers\/[^"]+)"/g,
    ),
  ].map((match) => path.resolve("src/app/api/[...endpoint]", match[1] + ".js"));
  assert.equal(
    handlers.length,
    11,
    "Keep every existing endpoint reachable through the Next catch-all route.",
  );
  for (const handler of handlers)
    assert.equal(typeof require(handler), "function", handler);
  assert.match(bridge, /export const runtime = "nodejs"/);
});
