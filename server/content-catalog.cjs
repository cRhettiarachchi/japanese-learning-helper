const fs = require("node:fs");
const path = require("node:path");
const base = require("./catalog.json");
const vocabulary = require("./vocabulary-catalog.json");
let local = {};
const file = path.join(process.cwd(), "server/local-listening.json");
if (fs.existsSync(file)) local = JSON.parse(fs.readFileSync(file, "utf8"));
module.exports = {
  catalog: { ...base, audio: { ...base.audio, ...local.audio } },
  vocabulary: { ...vocabulary, ...local.vocabulary },
};
