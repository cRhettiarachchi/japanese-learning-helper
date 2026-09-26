const h = require("../server/http.cjs");
const { loadAccount } = require("../server/account.cjs");
module.exports = h.wrap(async (req, res) => {
  if (req.method !== "GET") throw h.error(405, "Method not allowed");
  h.json(res, 200, await loadAccount(req));
});
