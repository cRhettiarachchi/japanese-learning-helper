const { createHash, randomUUID } = require("node:crypto");
const { error } = require("./http.cjs");
const curriculum = require("../grammar-data.json");
const lessons = new Map(
  curriculum.stages.flatMap((stage, index) =>
    stage.lessons.map((lesson) => [
      lesson.id,
      {
        id: lesson.id,
        topic: lesson.topic,
        description: lesson.description,
        stage: stage.title,
        level: index + 1,
      },
    ]),
  ),
);
const uuid = (x) =>
  typeof x === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    x,
  );
function validate(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw error(400, "Invalid practice request");
  const keys = {
    generate: ["action", "lessonId", "requestId"],
    grade: ["action", "setId", "revision", "answers"],
    done: ["action", "setId"],
  }[input.action];
  if (
    !Array.isArray(keys) ||
    Object.keys(input).some((k) => !keys.includes(k)) ||
    keys.some((k) => !(k in input))
  )
    throw error(400, "Invalid practice request");
  if (input.action === "generate") {
    if (!lessons.has(input.lessonId) || !uuid(input.requestId))
      throw error(400, "Unknown grammar point or request");
  } else if (!uuid(input.setId)) throw error(400, "Invalid practice set");
  if (input.action === "grade") {
    if (
      !Number.isInteger(input.revision) ||
      input.revision < 0 ||
      input.revision > 4 ||
      !Array.isArray(input.answers) ||
      input.answers.length !== 10
    )
      throw error(400, "Answer all ten questions");
    const seen = new Set();
    for (const a of input.answers) {
      if (
        !a ||
        Object.keys(a).sort().join(",") !== "id,text" ||
        !/^q(?:[1-9]|10)$/.test(a.id) ||
        seen.has(a.id) ||
        typeof a.text !== "string" ||
        !a.text.trim() ||
        a.text.length > 500
      )
        throw error(
          400,
          "Each question needs a short answer (up to 500 characters)",
        );
      seen.add(a.id);
    }
  }
}
function view(set, userId) {
  return {
    userId,
    setId: set.id,
    lessonId: set.lesson_id,
    expiresAt: set.expires_at,
    revision: set.revision,
    questions: set.questions.map(({ id, prompt, type }) => ({
      id,
      prompt,
      type,
    })),
    feedback: set.feedback || null,
  };
}
function createService({
  withUser = require("./db.cjs").withUser,
  ai = require("./practice-ai.cjs").structured,
  configured = () => !!process.env.OPENAI_API_KEY,
} = {}) {
  return async function run(userId, input) {
    validate(input);
    const answerHash =
      input.action === "grade"
        ? createHash("sha256")
            .update(
              JSON.stringify(
                [...input.answers].sort((a, b) => a.id.localeCompare(b.id)),
              ),
            )
            .digest("hex")
        : null;
    const lease = randomUUID();
    const reserved = await withUser(userId, async (c) => {
      await c.query(
        "INSERT INTO learner_practice_accounts(user_id) VALUES($1) ON CONFLICT DO NOTHING",
        [userId],
      );
      const account = (
        await c.query(
          "SELECT *, now() AS current_time FROM learner_practice_accounts WHERE user_id=$1 FOR UPDATE",
          [userId],
        )
      ).rows[0];
      await c.query(
        "DELETE FROM learner_practice_sets WHERE user_id=$1 AND expires_at<=now()",
        [userId],
      );
      const set = (
        await c.query("SELECT * FROM learner_practice_sets WHERE user_id=$1", [
          userId,
        ])
      ).rows[0];
      const busy =
        account.busy_until &&
        new Date(account.busy_until) > new Date(account.current_time);
      if (input.action === "done") {
        if (busy)
          throw error(
            409,
            "Practice is still processing. Please wait and try Done again.",
          );
        await c.query(
          "DELETE FROM learner_practice_sets WHERE user_id=$1 AND id=$2",
          [userId, input.setId],
        );
        return { cached: { userId, dismissed: true } };
      }
      if (input.action === "generate" && set?.id === input.requestId) {
        if (set.lesson_id !== input.lessonId)
          throw error(409, "Request already used for another lesson");
        return { cached: view(set, userId) };
      }
      if (input.action === "grade") {
        if (!set || set.id !== input.setId)
          throw error(
            410,
            "This set has expired or was replaced. Generate a new set.",
          );
        if (set.answer_hash === answerHash)
          return { cached: view(set, userId) };
        if (set.revision !== input.revision)
          throw error(
            409,
            "This set changed in another tab. Reopen practice before submitting.",
          );
        if (set.revision >= 4)
          throw error(
            429,
            "This set has reached its retry limit. Choose Done, then generate a new set.",
          );
      }
      if (busy)
        throw error(
          409,
          "Another practice request is running. Wait a moment, then retry.",
        );
      if (!configured())
        throw error(
          503,
          "AI practice is not configured in this environment yet.",
        );
      await c.query(
        "UPDATE learner_practice_accounts SET calls=CASE WHEN day<CURRENT_DATE THEN 0 ELSE calls END, sets=CASE WHEN day<CURRENT_DATE THEN 0 ELSE sets END, day=CURRENT_DATE WHERE user_id=$1",
        [userId],
      );
      const quota = (
        await c.query(
          "SELECT calls,sets FROM learner_practice_accounts WHERE user_id=$1",
          [userId],
        )
      ).rows[0];
      if (
        quota.calls >= 40 ||
        (input.action === "generate" && quota.sets >= 10)
      )
        throw error(
          429,
          "Daily practice limit reached. Please return tomorrow.",
        );
      if (
        account.last_call &&
        new Date(account.current_time) - new Date(account.last_call) < 3000
      )
        throw error(429, "Please wait a few seconds before trying again.");
      await c.query(
        "UPDATE learner_practice_accounts SET calls=calls+1,sets=sets+$2,last_call=now(),busy_until=now()+interval '90 seconds',busy_id=$3 WHERE user_id=$1",
        [userId, input.action === "generate" ? 1 : 0, lease],
      );
      const lesson = lessons.get(
        input.action === "generate" ? input.lessonId : set.lesson_id,
      );
      const prior =
        (
          await c.query(
            "SELECT attempts,mistakes,categories FROM learner_practice_summary WHERE user_id=$1 AND lesson_id=$2",
            [userId, lesson.id],
          )
        ).rows[0] || null;
      return {
        set,
        context:
          input.action === "generate"
            ? { grammar: lesson, pastDifficulty: prior }
            : {
                grammar: lesson,
                questions: set.questions,
                answers: input.answers,
              },
      };
    });
    if (reserved.cached) return reserved.cached;
    try {
      const result = await ai(
        input.action === "generate" ? "generate" : "grade",
        reserved.context,
      );
      return await withUser(userId, async (c) => {
        const a = (
          await c.query(
            "SELECT busy_id FROM learner_practice_accounts WHERE user_id=$1 FOR UPDATE",
            [userId],
          )
        ).rows[0];
        if (a?.busy_id !== lease)
          throw error(409, "A newer request replaced this one. Please retry.");
        let set;
        if (input.action === "generate") {
          set = (
            await c.query(
              "INSERT INTO learner_practice_sets(user_id,id,lesson_id,questions) VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET id=excluded.id,lesson_id=excluded.lesson_id,questions=excluded.questions,feedback=NULL,answer_hash=NULL,revision=0,expires_at=now()+interval '2 hours' RETURNING *",
              [userId, input.requestId, input.lessonId, JSON.stringify(result)],
            )
          ).rows[0];
        } else {
          set = (
            await c.query(
              "UPDATE learner_practice_sets SET feedback=$3,answer_hash=$4,revision=revision+1 WHERE user_id=$1 AND id=$2 AND revision=$5 RETURNING *",
              [
                userId,
                input.setId,
                JSON.stringify(result),
                answerHash,
                input.revision,
              ],
            )
          ).rows[0];
          if (!set)
            throw error(409, "This practice set changed. Please retry.");
          // Only first attempts affect the summary; retries never inflate difficulty.
          if (input.revision === 0) {
            const mistakes = result.filter((f) => f.verdict === "incorrect");
            await c.query(
              "INSERT INTO learner_practice_summary(user_id,lesson_id,attempts,mistakes,categories) VALUES($1,$2,1,$3,$4) ON CONFLICT(user_id,lesson_id) DO UPDATE SET attempts=LEAST(1000,learner_practice_summary.attempts+1),mistakes=LEAST(10000,learner_practice_summary.mistakes+excluded.mistakes),categories=excluded.categories,updated_at=now()",
              [
                userId,
                set.lesson_id,
                mistakes.length,
                JSON.stringify([...new Set(mistakes.map((f) => f.category))]),
              ],
            );
            await c.query(
              "DELETE FROM learner_practice_summary WHERE user_id=$1 AND lesson_id NOT IN (SELECT lesson_id FROM learner_practice_summary WHERE user_id=$1 ORDER BY updated_at DESC,lesson_id LIMIT 40)",
              [userId],
            );
          }
        }
        await c.query(
          "UPDATE learner_practice_accounts SET busy_id=NULL,busy_until=NULL WHERE user_id=$1",
          [userId],
        );
        return view(set, userId);
      });
    } catch (e) {
      await withUser(userId, (c) =>
        c.query(
          "UPDATE learner_practice_accounts SET busy_id=NULL,busy_until=NULL WHERE user_id=$1 AND busy_id=$2",
          [userId, lease],
        ),
      );
      throw e;
    }
  };
}
module.exports = { validate, lessons, view, createService };
