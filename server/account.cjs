const { session } = require("./auth.cjs");
const { withUser } = require("./db.cjs");
const progress = require("./progress.cjs");
const timer = require("./study-time.cjs");
const vocabulary = require("./vocabulary.cjs");
const catalog = require("./catalog.json");
// Request-scoped, read-only snapshot. Never cache this value or serialize the raw session.
async function loadAccount(req) {
  const empty = {
    status: "signedout",
    auth: null,
    progress: null,
    timer: null,
    vocabulary: null,
    catalog,
    error: null,
  };
  let auth;
  try {
    const s = await session(req);
    auth = { user: { id: s.user_id, name: s.display_name }, csrf: s.csrf };
  } catch (e) {
    if (e.status === 401) return empty;
    return {
      ...empty,
      status: "unavailable",
      error: "Account data is unavailable. Retry when connected.",
    };
  }
  try {
    const data = await withUser(auth.user.id, async (db) => {
      const now = new Date(
        (await db.query("SELECT clock_timestamp() AS now")).rows[0].now,
      ).getTime();
      return {
        progress: {
          userId: auth.user.id,
          rows: await progress.list(db, auth.user.id),
        },
        timer: await timer.snapshot(db, auth.user.id, now),
        vocabulary: await vocabulary.snapshot(db, auth.user.id, now),
      };
    });
    return JSON.parse(
      JSON.stringify({ ...empty, ...data, status: "account", auth }),
    );
  } catch {
    return {
      ...empty,
      status: "unavailable",
      auth,
      error: "Account data is unavailable. Retry when connected.",
    };
  }
}
module.exports = { loadAccount };
