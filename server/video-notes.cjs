const { createHash } = require("node:crypto");
const { error } = require("./http.cjs");
const { normalizeDocument } = require("../src/core/note-document.cjs");
function validate(input, catalog = require("./grammar-video-catalog.json")) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some(
      (k) =>
        !["videoId", "document", "expectedRevision", "mutationId"].includes(k),
    )
  )
    throw error(400, "Invalid note request.");
  if (
    typeof input.videoId !== "string" ||
    !Object.hasOwn(catalog, input.videoId)
  )
    throw error(400, "This video is not in the grammar course.");
  if (
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 0 ||
    input.expectedRevision >= 2147483647
  )
    throw error(400, "Invalid note revision.");
  if (
    typeof input.mutationId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      input.mutationId,
    )
  )
    throw error(400, "Invalid save identifier.");
  return {
    videoId: input.videoId,
    document: normalizeDocument(input.document),
    expectedRevision: input.expectedRevision,
    mutationId: input.mutationId,
  };
}
async function available(db) {
  return !!(
    await db.query(
      "SELECT to_regclass('public.learner_video_notes') AS relation",
    )
  ).rows[0].relation;
}
async function snapshot(db, userId) {
  if (!(await available(db))) return { userId, available: false, items: [] };
  return {
    userId,
    available: true,
    items: (
      await db.query(
        "SELECT video_id,document,revision,updated_at FROM learner_video_notes WHERE user_id=$1 ORDER BY video_id",
        [userId],
      )
    ).rows,
  };
}
async function save(db, userId, input, { catalog } = {}) {
  const x = validate(input, catalog);
  if (!(await available(db)))
    throw error(503, "Notes are awaiting the video-notes database migration.");
  await db.query(
    "INSERT INTO learner_video_note_accounts(user_id) VALUES($1) ON CONFLICT DO NOTHING",
    [userId],
  );
  await db.query(
    "SELECT user_id FROM learner_video_note_accounts WHERE user_id=$1 FOR UPDATE",
    [userId],
  );
  const hash = createHash("sha256").update(JSON.stringify(x)).digest("hex");
  const prior = (
    await db.query(
      "SELECT payload_hash FROM learner_video_note_mutations WHERE user_id=$1 AND id=$2",
      [userId, x.mutationId],
    )
  ).rows[0];
  if (prior) {
    if (prior.payload_hash !== hash)
      throw error(
        409,
        "This save identifier was already used. Reopen the note.",
      );
    return snapshot(db, userId);
  }
  const existing = (
    await db.query(
      "SELECT revision FROM learner_video_notes WHERE user_id=$1 AND video_id=$2",
      [userId, x.videoId],
    )
  ).rows[0];
  if ((existing?.revision || 0) !== x.expectedRevision)
    throw error(
      409,
      "This note changed on another device. Your draft is still here. Reload the saved note before editing again.",
    );
  await db.query(
    "INSERT INTO learner_video_notes(user_id,video_id,document,revision) VALUES($1,$2,$3,1) ON CONFLICT(user_id,video_id) DO UPDATE SET document=EXCLUDED.document,revision=learner_video_notes.revision+1,updated_at=clock_timestamp()",
    [
      userId,
      x.videoId,
      x.document === null ? null : JSON.stringify(x.document),
    ],
  );
  await db.query(
    "INSERT INTO learner_video_note_mutations(user_id,id,payload_hash) VALUES($1,$2,$3)",
    [userId, x.mutationId, hash],
  );
  return snapshot(db, userId);
}
module.exports = { validate, snapshot, save };
