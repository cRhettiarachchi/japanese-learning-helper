const fs = require("node:fs");
const path = require("node:path");

// Optional, ignored personal content. Only explicitly listed files enter the build.
function load(root, existing) {
  const dir = path.join(root, ".private-listening");
  const file = path.join(dir, "episodes.json");
  if (!fs.existsSync(file)) return [];
  const episodes = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(episodes))
    throw Error("Private listening catalog must be an array");
  const seen = new Set(Object.keys(existing));
  return episodes.map((ep) => {
    if (
      !ep ||
      typeof ep.slug !== "string" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(ep.slug) ||
      seen.has(ep.slug) ||
      typeof ep.title !== "string" ||
      !ep.title.trim() ||
      typeof ep.label !== "string" ||
      !Number.isFinite(ep.duration) ||
      ep.duration <= 0
    )
      throw Error("Invalid or duplicate private listening entry");
    seen.add(ep.slug);
    const files = Object.fromEntries(
      ["html", "mp3", "md"].map((ext) => {
        const name = path.join(dir, `${ep.slug}.${ext}`);
        if (!fs.statSync(name).isFile())
          throw Error("Missing private listening file");
        return [ext, name];
      }),
    );
    return { ...ep, files };
  });
}
module.exports = { load };
