-- Additive and idempotent. Apply to Development for testing; production only at rollout.
CREATE TABLE IF NOT EXISTS learner_timer_accounts (user_id text PRIMARY KEY);
CREATE TABLE IF NOT EXISTS learner_study_sessions (
 id uuid PRIMARY KEY, user_id text NOT NULL, owner_client uuid NOT NULL,
 state text NOT NULL CHECK(state IN ('active','review','saved','discarded')),
 elapsed_ms integer NOT NULL DEFAULT 0 CHECK(elapsed_ms BETWEEN 0 AND 86400000),
 confirmed_seconds integer CHECK(confirmed_seconds BETWEEN 0 AND 86400),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 started_at timestamptz NOT NULL, checkpoint_at timestamptz NOT NULL,
 stopped_at timestamptz, saved_at timestamptz, recovered boolean NOT NULL DEFAULT false,
 CHECK((state='saved' AND confirmed_seconds IS NOT NULL) OR (state<>'saved' AND confirmed_seconds IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS learner_one_open_timer ON learner_study_sessions(user_id) WHERE state IN ('active','review');
CREATE INDEX IF NOT EXISTS learner_study_history ON learner_study_sessions(user_id,started_at DESC);
CREATE TABLE IF NOT EXISTS learner_timer_mutations (
 user_id text NOT NULL, id uuid NOT NULL, payload_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,id)
);
ALTER TABLE learner_timer_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE learner_timer_accounts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_timer_account ON learner_timer_accounts;
CREATE POLICY own_timer_account ON learner_timer_accounts USING(user_id=current_setting('app.user_id',true)) WITH CHECK(user_id=current_setting('app.user_id',true));
ALTER TABLE learner_study_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE learner_study_sessions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_study_sessions ON learner_study_sessions;
CREATE POLICY own_study_sessions ON learner_study_sessions USING(user_id=current_setting('app.user_id',true)) WITH CHECK(user_id=current_setting('app.user_id',true));
ALTER TABLE learner_timer_mutations ENABLE ROW LEVEL SECURITY;
ALTER TABLE learner_timer_mutations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_timer_mutations ON learner_timer_mutations;
CREATE POLICY own_timer_mutations ON learner_timer_mutations USING(user_id=current_setting('app.user_id',true)) WITH CHECK(user_id=current_setting('app.user_id',true));
