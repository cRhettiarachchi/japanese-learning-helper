const { randomUUID } = require("node:crypto");
const { error } = require("./http.cjs");
const { validateInput, generate } = require("./revision-ai.cjs");
// A database lease enforces limits across serverless instances, without storing drafts.
function createService({
  withUser = require("./db.cjs").withUser,
  ai = generate,
  configured = () => !!process.env.OPENAI_API_KEY,
} = {}) {
  return async (userId, input) => {
    validateInput(input);
    if (!configured())
      throw error(
        503,
        "AI card creation is not configured in this environment yet.",
      );
    const lease = randomUUID();
    try {
      await withUser(userId, async (db) => {
        await db.query(
          "INSERT INTO learner_card_generation_accounts(user_id) VALUES($1) ON CONFLICT DO NOTHING",
          [userId],
        );
        const row = (
          await db.query(
            "SELECT *,clock_timestamp() AS now FROM learner_card_generation_accounts WHERE user_id=$1 FOR UPDATE",
            [userId],
          )
        ).rows[0];
        const now = new Date(row.now).getTime(),
          fresh = now - new Date(row.window_started_at).getTime() >= 3600000;
        if (row.busy_until && new Date(row.busy_until).getTime() > now)
          throw error(
            409,
            "A draft is already being prepared. Please wait a minute before retrying.",
          );
        if (!fresh && row.attempts >= 30)
          throw error(
            429,
            "You have reached 30 drafts this hour. Please try again later.",
          );
        await db.query(
          "UPDATE learner_card_generation_accounts SET attempts=$2,window_started_at=$3,lease_id=$4,busy_until=$5 WHERE user_id=$1",
          [
            userId,
            fresh ? 1 : row.attempts + 1,
            fresh ? row.now : row.window_started_at,
            lease,
            new Date(now + 60000),
          ],
        );
      });
    } catch (e) {
      if (e.code === "42P01")
        throw error(
          503,
          "Card creation is awaiting the revision-card database migration.",
        );
      throw e;
    }
    try {
      return { userId, card: await ai(input) };
    } finally {
      await withUser(userId, (db) =>
        db.query(
          "UPDATE learner_card_generation_accounts SET lease_id=NULL,busy_until=NULL WHERE user_id=$1 AND lease_id=$2",
          [userId, lease],
        ),
      );
    }
  };
}
module.exports = { createService };
