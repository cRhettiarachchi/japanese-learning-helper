const h = require("../server/http.cjs");
const { session, authorizeWrite } = require("../server/auth.cjs");
const { createService } = require("../server/grammar-practice.cjs");
const run = createService();
module.exports = h.wrap(async (req, res) => {
  if (req.method !== "POST") throw h.error(405, "Method not allowed");
  const s = await session(req);
  authorizeWrite(req, s);
  h.json(res, 200, await run(s.user_id, await h.body(req)));
});
