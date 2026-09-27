// Rich text is stored as a small allowlisted document, never as executable HTML.
const emptyDocument = () => ({ type: "doc", content: [{ type: "paragraph" }] });
function fail(message = "This note contains unsupported formatting.") {
  throw Object.assign(Error(message), { status: 400 });
}
const blocks = [
  "paragraph",
  "heading",
  "blockquote",
  "bulletList",
  "orderedList",
];
function normalizeDocument(input) {
  if (input === null) return null;
  if (
    !input ||
    typeof input !== "object" ||
    JSON.stringify(input).length > 60000
  )
    fail("Keep notes under 20,000 characters and 60 KB.");
  let count = 0,
    length = 0,
    meaningful = false;
  function visit(n, parent, depth) {
    if (++count > 2000 || depth > 12)
      fail("This note has too much nested formatting.");
    if (
      !n ||
      typeof n !== "object" ||
      Array.isArray(n) ||
      Object.keys(n).some(
        (k) => !["type", "content", "attrs", "text", "marks"].includes(k),
      )
    )
      fail();
    const allowed =
      parent === null
        ? ["doc"]
        : ["doc", "blockquote"].includes(parent)
          ? blocks
          : parent === "listItem"
            ? blocks
            : ["bulletList", "orderedList"].includes(parent)
              ? ["listItem"]
              : ["paragraph", "heading"].includes(parent)
                ? ["text", "hardBreak"]
                : [];
    if (!allowed.includes(n.type)) fail();
    const out = { type: n.type };
    if (n.type === "text") {
      if (
        typeof n.text !== "string" ||
        !n.text ||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(n.text)
      )
        fail();
      length += n.text.length;
      if (length > 20000) fail("Keep notes under 20,000 characters.");
      meaningful ||= /[^\s\u200b-\u200f\u2060\ufeff]/u.test(n.text);
      out.text = n.text;
    } else if (n.text !== undefined) fail();
    if (n.attrs !== undefined) {
      if (!n.attrs || typeof n.attrs !== "object" || Array.isArray(n.attrs))
        fail();
      const keys = Object.keys(n.attrs);
      if (
        n.type === "heading" &&
        keys.length === 1 &&
        keys[0] === "level" &&
        [2, 3].includes(n.attrs.level)
      )
        out.attrs = { level: n.attrs.level };
      else if (
        n.type === "orderedList" &&
        keys.every((k) => ["start", "type"].includes(k)) &&
        Number.isInteger(n.attrs.start) &&
        n.attrs.start >= 1 &&
        n.attrs.start <= 999 &&
        (n.attrs.type === undefined || n.attrs.type === null)
      )
        out.attrs = { start: n.attrs.start };
      else if (keys.length) fail();
    }
    if (n.type === "heading" && !out.attrs) fail();
    if (n.marks !== undefined) {
      if (n.type !== "text" || !Array.isArray(n.marks) || n.marks.length > 5)
        fail();
      const marks = [];
      for (const mark of n.marks) {
        if (
          !mark ||
          Object.keys(mark).some((k) => k !== "type") ||
          !["bold", "italic", "underline", "strike", "code"].includes(mark.type)
        )
          fail();
        if (!marks.some((m) => m.type === mark.type))
          marks.push({ type: mark.type });
      }
      if (marks.length) out.marks = marks;
    }
    if (n.content !== undefined) {
      if (["text", "hardBreak"].includes(n.type) || !Array.isArray(n.content))
        fail();
      out.content = n.content.map((child) => visit(child, n.type, depth + 1));
    }
    if (
      ["bulletList", "orderedList", "blockquote", "listItem"].includes(
        n.type,
      ) &&
      !out.content?.length
    )
      fail();
    if (n.type === "listItem" && out.content[0].type !== "paragraph") fail();
    return out;
  }
  const doc = visit(input, null, 0);
  return meaningful ? doc : null;
}
module.exports = { normalizeDocument, emptyDocument };
