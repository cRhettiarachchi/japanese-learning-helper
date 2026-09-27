// Shared validation for editable drafts and the authenticated save boundary.
const kanji = /[\p{Script=Han}々〆ヶ]/u;
function invalid(message) {
  throw Object.assign(Error(message), { status: 400 });
}
function object(x, fields) {
  if (
    !x ||
    typeof x !== "object" ||
    Array.isArray(x) ||
    Object.keys(x).some((k) => !fields.includes(k)) ||
    fields.some((k) => !Object.hasOwn(x, k))
  )
    invalid("Invalid card fields.");
}
function text(value, max, label) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)
  )
    invalid(`${label} is required (maximum ${max} characters).`);
}
function validateSource(japanese, intent) {
  text(japanese, 500, "Japanese");
  text(intent, 500, "Learning goal");
  if (!/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(japanese))
    invalid("Enter a Japanese sentence or word.");
}
function validateCard(card) {
  object(card, ["japanese", "intent", "prompt", "answer", "segments"]);
  validateSource(card.japanese, card.intent);
  text(card.prompt, 300, "Question");
  text(card.answer, 800, "Answer");
  if (
    !Array.isArray(card.segments) ||
    !card.segments.length ||
    card.segments.length > 150
  )
    invalid("Check the Japanese readings.");
  for (const segment of card.segments) {
    object(segment, ["text", "reading"]);
    if (
      typeof segment.text !== "string" ||
      !segment.text.length ||
      segment.text.length > 500 ||
      typeof segment.reading !== "string" ||
      segment.reading.length > 200
    )
      invalid("Check the Japanese readings.");
    if (segment.reading && !/^[\p{Script=Hiragana}ー]+$/u.test(segment.reading))
      invalid("Readings must use hiragana.");
    if (kanji.test(segment.text) && !segment.reading)
      invalid("Add a hiragana reading for every kanji segment.");
  }
  if (card.segments.map((s) => s.text).join("") !== card.japanese)
    invalid("The front must preserve the exact original Japanese.");
  return card;
}
module.exports = { validateCard, validateSource, kanji };
