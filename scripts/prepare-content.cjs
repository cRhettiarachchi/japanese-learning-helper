const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const { JSDOM } = require("jsdom");
const root = path.resolve(__dirname, "..");
const read = (n) => fs.readFileSync(path.join(root, n), "utf8");
const generated = path.join(root, "src/generated");
fs.mkdirSync(generated, { recursive: true });
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "learner-revisions-"));
require("./render-revisions.cjs").render(root, temp);
const archive = JSON.parse(read("reading-archive.json"));
const routes = [
  "index.html",
  "grammar.html",
  ...archive.map((s) => s.url.slice(1)),
  ...fs
    .readdirSync(path.join(root, "listening"))
    .filter((s) => s.endsWith(".html"))
    .map((s) => "listening/" + s),
  "revisions.html",
  "revisions/revision-1-test.html",
  "revisions/revision-1-answers.html",
];
const manifest = {};
const catalog = {
  article: {},
  grammar: {},
  audio: JSON.parse(read("audio-catalog.json")),
};
for (const set of archive)
  for (const a of set.articles) catalog.article[a.key] = {};
for (const name of routes) {
  const doc = new JSDOM(
    fs.readFileSync(
      path.join(name.startsWith("revisions") ? temp : root, name),
      "utf8",
    ),
  ).window.document;
  const lookup = doc.querySelector("#article-lookup-data,#study-data");
  let data = lookup ? JSON.parse(lookup.textContent) : null;
  if (lookup?.id === "article-lookup-data")
    data = {
      tokens: data,
      dictionary: JSON.parse(read("listening/dictionary.json")).entries,
    };
  if (data?.dictionary && data?.tokens) {
    const used = new Set(
      Object.values(data.tokens).flatMap((token) => token.entries || []),
    );
    data.dictionary = Object.fromEntries(
      Object.entries(data.dictionary).filter(([id]) => used.has(id)),
    );
  }
  const kind =
    name === "grammar.html"
      ? "grammar"
      : name.startsWith("listening/")
        ? "listening"
        : name.startsWith("revisions")
          ? "revision"
          : "reading";
  const keys = [
    ...doc.querySelectorAll("[data-reading-key],[data-lesson]"),
  ].map((e) => ({
    id: e.getAttribute("data-reading-key") || e.getAttribute("data-lesson"),
    anchor: e.closest("article,tr").id,
  }));
  if (kind === "grammar") for (const k of keys) catalog.grammar[k.id] = {};
  for (const e of doc.querySelectorAll("script,.topbar,.skip")) e.remove();
  // Relative source links resolve exactly as in the original document.
  for (const e of doc.querySelectorAll("[href],[src]"))
    for (const a of ["href", "src"]) {
      const v = e.getAttribute(a);
      if (v && !v.startsWith("#")) {
        const u = new URL(v, "https://local.test/" + name);
        if (u.origin === "https://local.test")
          e.setAttribute(a, u.pathname + u.search + u.hash);
      }
    }
  for (const e of doc.querySelectorAll("li"))
    if (e.textContent.includes("Import older browser progress explicitly"))
      e.textContent =
        "Sign in to save progress automatically across devices. Older browser data is preserved without assigning it to an unknown account.";
  const styles = [...doc.querySelectorAll("style")]
    .map((e) => e.textContent)
    .join("\n");
  const value = {
    route: "/" + name,
    title: doc.title,
    kind,
    html: doc.body.innerHTML,
    data,
    styles,
    keys,
    grammarRows:
      kind === "grammar"
        ? [...doc.querySelectorAll("tr[data-topic]")].map((row) => ({
            id: row.id,
            topic: row.dataset.topic,
            lesson:
              row.querySelector("[data-lesson]")?.getAttribute("data-lesson") ||
              null,
            stage: row.closest(".stage").id,
          }))
        : [],
  };
  const file = name.replaceAll("/", "__").replace(".html", ".json");
  fs.writeFileSync(path.join(generated, file), JSON.stringify(value));
  manifest["/" + name] = file;
}
manifest["/"] = manifest["/index.html"];
manifest["/vocabulary.html"] = "vocabulary";
fs.writeFileSync(
  path.join(generated, "manifest.json"),
  JSON.stringify(manifest),
);
fs.writeFileSync(
  path.join(root, "server/catalog.json"),
  JSON.stringify(catalog, null, 2) + "\n",
);
require("./build-vocabulary-catalog.cjs").build(root);
// Public files are generated from an explicit data/media allowlist. No legacy HTML or JS remains.
const out = path.join(root, "public");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const files = [
  "reading-archive.json",
  "grammar-data.json",
  "sources.json",
  "research/catalog-audit.json",
];
for (const dir of ["audio", "listening", "revisions"])
  for (const f of fs.readdirSync(path.join(root, dir)))
    if (/\.(mp3|json|vtt|md)$/.test(f)) files.push(dir + "/" + f);
for (const name of files) {
  const dest = path.join(out, name);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(root, name), dest);
}
fs.writeFileSync(
  path.join(out, "progress-catalog.json"),
  JSON.stringify(catalog),
);
fs.rmSync(temp, { recursive: true });
console.log(
  `Prepared ${routes.length} React content routes: ${Object.keys(catalog.article).length} articles, ${Object.keys(catalog.grammar).length} lessons, ${Object.keys(catalog.audio).length} audio episodes.`,
);
