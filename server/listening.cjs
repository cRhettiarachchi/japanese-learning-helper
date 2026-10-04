const { error } = require("./http.cjs");
function videoId(value) {
  let u;
  try {
    u = new URL(value);
  } catch {
    throw error(400, "Enter a valid YouTube URL.");
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port)
    throw error(400, "Use an HTTPS YouTube link.");
  let id;
  if (u.hostname === "youtu.be") id = u.pathname.slice(1);
  else if (
    ["youtube.com", "www.youtube.com", "m.youtube.com"].includes(u.hostname)
  ) {
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else id = /^\/(?:shorts|embed|live)\/([^/]+)$/.exec(u.pathname)?.[1];
  }
  if (!/^[A-Za-z0-9_-]{11}$/.test(id || ""))
    throw error(400, "Enter a YouTube video link.");
  return id;
}
function timestamp(s) {
  const m = /^(?:(\d{1,3}):)?(\d{2}):(\d{2})[.,](\d{3})$/.exec(s);
  if (!m || +m[2] > 59 || +m[3] > 59)
    throw error(400, "Invalid subtitle timestamp.");
  return +(m[1] || 0) * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000;
}
function parseSubtitles(source) {
  if (typeof source !== "string" || Buffer.byteLength(source) > 500000)
    throw error(400, "Subtitles must be under 500 KB.");
  if (!source.trim()) return [];
  const blocks = source
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .split(/\n[ \t]*\n/);
  const cues = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    if (/^(WEBVTT(?:\s|$)|NOTE(?:\s|$)|STYLE$|REGION$)/.test(lines[0]))
      continue;
    const i = lines[0].includes("-->") ? 0 : 1;
    const m = /^(\S+)\s+-->\s+(\S+)(?:[ \t]+.*)?$/.exec(lines[i] || "");
    if (!m)
      throw error(400, "Invalid SRT/VTT cue. Upload a timed subtitle file.");
    const start = timestamp(m[1]),
      end = timestamp(m[2]);
    if (end <= start || end > 86400)
      throw error(
        400,
        "Subtitle times must be within 24 hours, with end after start.",
      );
    // Store only text, never subtitle markup; React renders it as text.
    const text = lines
      .slice(i + 1)
      .join("\n")
      .replace(/<[^>]*>/g, "")
      .replace(
        /&(amp|lt|gt|quot|apos|nbsp);/g,
        (_, x) =>
          ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " })[x],
      )
      .trim();
    if (!text || text.length > 4000)
      throw error(400, "Subtitle cue is empty or too long.");
    cues.push({ start, end, text });
  }
  if (!cues.length || cues.length > 10000)
    throw error(400, "Upload subtitles containing 1–10,000 timed lines.");
  return cues.sort((a, b) => a.start - b.start || a.end - b.end);
}
function validate(input) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some(
      (k) => !["url", "title", "subtitles", "expectedRevision"].includes(k),
    )
  )
    throw error(400, "Invalid listening request.");
  const id = videoId(input.url);
  if (
    typeof input.title !== "string" ||
    !input.title.trim() ||
    input.title.length > 200
  )
    throw error(400, "Add a title of up to 200 characters.");
  if (
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 0 ||
    input.expectedRevision >= 2147483647
  )
    throw error(400, "Invalid revision.");
  return {
    id,
    title: input.title.trim(),
    cues:
      input.subtitles === undefined && input.expectedRevision > 0
        ? null
        : parseSubtitles(input.subtitles),
    revision: input.expectedRevision,
  };
}
async function snapshot(db, userId) {
  if (
    !(
      await db.query(
        "SELECT to_regclass('public.learner_listening') AS relation",
      )
    ).rows[0].relation
  )
    return { userId, available: false, items: [] };
  return {
    userId,
    available: true,
    items: (
      await db.query(
        "SELECT video_id,title,cues,revision FROM learner_listening WHERE user_id=$1 ORDER BY updated_at DESC",
        [userId],
      )
    ).rows,
  };
}
async function save(db, userId, input) {
  const x = validate(input);
  if (!(await snapshot(db, userId)).available)
    throw error(
      503,
      "Listening storage needs the listening database migration.",
    );
  const result = await db.query(
    `INSERT INTO learner_listening(user_id,video_id,title,cues,revision)
 SELECT $1,$2,$3,$4,1 WHERE $5=0
 ON CONFLICT(user_id,video_id) DO NOTHING RETURNING video_id`,
    [
      userId,
      x.id,
      x.title,
      x.cues === null ? null : JSON.stringify(x.cues),
      x.revision,
    ],
  );
  if (!result.rows.length) {
    const update = await db.query(
      `UPDATE learner_listening SET title=$3,cues=COALESCE($4::jsonb,cues),revision=revision+1,updated_at=now()
 WHERE user_id=$1 AND video_id=$2 AND revision=$5 RETURNING video_id`,
      [
        userId,
        x.id,
        x.title,
        x.cues === null ? null : JSON.stringify(x.cues),
        x.revision,
      ],
    );
    if (!update.rows.length)
      throw error(
        409,
        "This video already exists or changed elsewhere. Reload before editing.",
      );
  }
  return snapshot(db, userId);
}
module.exports = { videoId, parseSubtitles, validate, snapshot, save };
