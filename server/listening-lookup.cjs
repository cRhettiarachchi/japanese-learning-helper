// Reuse the app's bundled JMdict entries. Unknown words remain lookup-able and
// show the dictionary's normal "No English meaning found" state.
let cached;
function lexicon() {
  if (cached) return cached;
  const dictionary = require("../listening/dictionary.json").entries;
  const index = new Map();
  for (const [id, entry] of Object.entries(dictionary))
    for (const form of [...(entry.forms || []), ...(entry.readings || [])]) {
      const key = form.normalize("NFC");
      if (!index.has(key)) index.set(key, []);
      if (!index.get(key).includes(id)) index.get(key).push(id);
    }
  return (cached = {
    dictionary,
    index,
    segmenter: new Intl.Segmenter("ja", { granularity: "word" }),
  });
}
function annotate(item) {
  const { dictionary, index, segmenter } = lexicon(),
    used = {};
  function word(text, reading) {
    const ids = index.get(text.normalize("NFC")) || [];
    for (const id of ids) used[id] = dictionary[id];
    return { text, ...(reading ? { reading } : {}), entries: ids };
  }
  const rows = item.cues.map((cue) =>
    (cue.parts || [{ text: cue.text }]).flatMap((part) => {
      if (part.reading) return [word(part.text, part.reading)];
      return Array.from(segmenter.segment(part.text), (s) =>
        s.isWordLike ? word(s.segment) : { text: s.segment },
      );
    }),
  );
  return { ...item, lookup: { rows, dictionary: used } };
}
module.exports = { annotate };
