const h = require("../http.cjs");
const { session, authorizeWrite } = require("../auth.cjs");
const { withUser } = require("../db.cjs");
const listening = require("../listening.cjs");
module.exports = h.wrap(async (req, res) => {
  if (!["GET", "POST"].includes(req.method))
    throw h.error(405, "Method not allowed");
  const s = await session(req);
  let input;
  if (req.method === "POST") {
    authorizeWrite(req, s);
    input = await h.body(req, 1048576);
    listening.validate(input);
  }
  h.json(
    res,
    200,
    await withUser(s.user_id, (db) =>
      input
        ? listening.save(db, s.user_id, input)
        : listening.snapshot(db, s.user_id),
    ),
  );
});
