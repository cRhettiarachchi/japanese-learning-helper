const test = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { load } = require("../scripts/private-listening.cjs");
test("private episodes are opt-in and reject collisions, invalid durations and path traversal", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "private-listening-"));
  try {
    assert.deepEqual(load(root, {}), []);
    const dir = path.join(root, ".private-listening");
    fs.mkdirSync(dir);
    for (const ext of ["html", "mp3", "md"])
      fs.writeFileSync(path.join(dir, "sample." + ext), "synthetic");
    const ep = {
      slug: "sample",
      title: "Synthetic episode",
      label: "Test",
      duration: 60,
    };
    const write = (value) =>
      fs.writeFileSync(path.join(dir, "episodes.json"), JSON.stringify(value));
    write([ep]);
    assert.equal(load(root, {})[0].files.mp3, path.join(dir, "sample.mp3"));
    assert.throws(() => load(root, { sample: { duration: 60 } }), /duplicate/);
    for (const changed of [
      { slug: "../escape" },
      { duration: 0 },
      { duration: "60" },
    ]) {
      write([{ ...ep, ...changed }]);
      assert.throws(() => load(root, {}), /Invalid/);
    }
    write([ep, ep]);
    assert.throws(() => load(root, {}), /duplicate/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("private runtime catalogs merge without changing the tracked baseline", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "private-runtime-")),
    previous = process.cwd();
  const filename = require.resolve("../server/content-catalog.cjs");
  try {
    fs.mkdirSync(path.join(root, "server"));
    process.chdir(root);
    delete require.cache[filename];
    const base = require("../server/catalog.json");
    assert.deepEqual(require(filename).catalog, base);
    fs.writeFileSync(
      path.join(root, "server/local-listening.json"),
      JSON.stringify({
        audio: { sample: { duration: 60 } },
        vocabulary: {
          synthetic: { word: "試験", reading: "しけん", meanings: ["test"] },
        },
      }),
    );
    delete require.cache[filename];
    const merged = require(filename);
    assert.equal(merged.catalog.audio.sample.duration, 60);
    assert.equal(base.audio.sample, undefined);
    assert.equal(merged.vocabulary.synthetic.word, "試験");
    require("../server/progress.cjs").validate(
      {
        kind: "audio",
        id: "sample",
        field: "position",
        value: { seconds: 30, duration: 60, ended: false },
        expectedRevision: 0,
        mutationId: "synthetic-mutation-0001",
      },
      merged.catalog,
    );
  } finally {
    process.chdir(previous);
    delete require.cache[filename];
    fs.rmSync(root, { recursive: true, force: true });
  }
});
