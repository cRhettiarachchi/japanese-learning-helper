const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  { JSDOM } = require("jsdom");
test("React content migration preserves article text, ruby associations, completion keys and archive routes", () => {
  const archive = JSON.parse(fs.readFileSync("reading-archive.json"));
  const manifest = JSON.parse(fs.readFileSync("src/generated/manifest.json"));
  const seen = new Set();
  let rubies = 0;
  for (const set of archive) {
    assert.ok(manifest[set.url]);
    const source = new JSDOM(fs.readFileSync("." + set.url, "utf8")).window
      .document;
    const generated = JSON.parse(
      fs.readFileSync(path.join("src/generated", manifest[set.url])),
    );
    const migrated = new JSDOM(generated.html).window.document;
    for (const checkbox of source.querySelectorAll("[data-reading-key]")) {
      const key = checkbox.dataset.readingKey;
      assert.ok(!seen.has(key));
      seen.add(key);
      const article = checkbox.closest("article"),
        copy = migrated.getElementById(article.id);
      assert.equal(copy.textContent, article.textContent);
      const pairs = (d) =>
        [...d.querySelectorAll("ruby")].map(
          (r) =>
            [...r.childNodes]
              .filter((n) => n.nodeName !== "RT" && n.nodeName !== "RP")
              .map((n) => n.textContent)
              .join("") +
            "|" +
            r.querySelector("rt").textContent,
        );
      assert.deepEqual(pairs(copy), pairs(article));
      rubies += pairs(copy).length;
      assert.ok(generated.keys.some((k) => k.id === key));
    }
    assert.equal(migrated.querySelectorAll("script,iframe").length, 0);
    assert.ok(generated.data.tokens);
    assert.ok(generated.data.dictionary);
  }
  assert.equal(seen.size, 20);
  assert.equal(rubies, 1000);
});
test("Next build public allowlist excludes iframe documents, browser bootstraps, server and credentials", () => {
  const walk = (dir) =>
    fs
      .readdirSync(dir, { withFileTypes: true })
      .flatMap((e) =>
        e.isDirectory()
          ? walk(path.join(dir, e.name))
          : [path.join(dir, e.name)],
      );
  for (const file of walk("public")) {
    assert.doesNotMatch(file, /\.(html|js|cjs|tsx?|env)$/);
    assert.doesNotMatch(file, /(?:_pages|server|node_modules|\.env)/);
  }
  for (const file of walk("src/components"))
    if (file.endsWith(".tsx"))
      assert.doesNotMatch(
        fs.readFileSync(file, "utf8"),
        /<iframe|contentWindow|innerHTML/,
      );
});
