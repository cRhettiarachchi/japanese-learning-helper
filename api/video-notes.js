const h = require("../server/http.cjs");
const { session, authorizeWrite } = require("../server/auth.cjs");
const { withUser } = require("../server/db.cjs");
const notes = require("../server/video-notes.cjs");
module.exports = h.wrap(async (req, res) => {
  if (!["GET", "POST"].includes(req.method))
    throw h.error(405, "Method not allowed");
  const s = await session(req);
  let input;
  if (req.method === "POST") {
    authorizeWrite(req, s);
    input = await h.body(req);
    notes.validate(input);
  }
  h.json(
    res,
    200,
    await withUser(s.user_id, (db) =>
      input ? notes.save(db, s.user_id, input) : notes.snapshot(db, s.user_id),
    ),
  );
});
