const h = require("../http.cjs");
const { session, authorizeWrite } = require("../auth.cjs");
const generate = require("../revision-cards.cjs").createService();
module.exports = h.wrap(async (req, res) => {
  if (req.method !== "POST") throw h.error(405, "Method not allowed");
  const s = await session(req);
  authorizeWrite(req, s);
  h.json(res, 200, await generate(s.user_id, await h.body(req)));
});
