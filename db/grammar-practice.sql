-- Additive migration. No existing progress or historical revisions are removed.
CREATE TABLE IF NOT EXISTS learner_practice_accounts (
 user_id text PRIMARY KEY, day date NOT NULL DEFAULT CURRENT_DATE,
 calls integer NOT NULL DEFAULT 0 CHECK(calls>=0), sets integer NOT NULL DEFAULT 0 CHECK(sets>=0),
 last_call timestamptz, busy_until timestamptz, busy_id uuid
);
-- At most one temporary set/account. No submitted answer text is stored.
CREATE TABLE IF NOT EXISTS learner_practice_sets (
 user_id text PRIMARY KEY, id uuid NOT NULL, lesson_id text NOT NULL,
 questions jsonb NOT NULL, feedback jsonb, answer_hash text,
 revision integer NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 4),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '2 hours'
);
-- Bounded summary of difficulties, never full questions/answers or free-text profiles.
CREATE TABLE IF NOT EXISTS learner_practice_summary (
 user_id text NOT NULL, lesson_id text NOT NULL, attempts integer NOT NULL DEFAULT 0,
 mistakes integer NOT NULL DEFAULT 0, categories jsonb NOT NULL DEFAULT '[]',
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,lesson_id)
);
ALTER TABLE learner_practice_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE learner_practice_accounts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_practice_accounts ON learner_practice_accounts;
CREATE POLICY own_practice_accounts ON learner_practice_accounts USING(user_id=current_setting('app.user_id',true)) WITH CHECK(user_id=current_setting('app.user_id',true));
ALTER TABLE learner_practice_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE learner_practice_sets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_practice_sets ON learner_practice_sets;
CREATE POLICY own_practice_sets ON learner_practice_sets USING(user_id=current_setting('app.user_id',true)) WITH CHECK(user_id=current_setting('app.user_id',true));
ALTER TABLE learner_practice_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE learner_practice_summary FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_practice_summary ON learner_practice_summary;
CREATE POLICY own_practice_summary ON learner_practice_summary USING(user_id=current_setting('app.user_id',true)) WITH CHECK(user_id=current_setting('app.user_id',true));
