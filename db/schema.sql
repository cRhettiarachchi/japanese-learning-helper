CREATE TABLE IF NOT EXISTS learner_sessions (
 token_hash text PRIMARY KEY, user_id text NOT NULL, display_name text NOT NULL,
 csrf text NOT NULL, expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS learner_sessions_expiry ON learner_sessions(expires_at);
CREATE TABLE IF NOT EXISTS learner_oauth (
 state_hash text PRIMARY KEY, binding_hash text NOT NULL, verifier text NOT NULL,
 nonce text NOT NULL, expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS learner_progress (
 user_id text NOT NULL, kind text NOT NULL CHECK(kind IN ('article','grammar','audio')),
 content_id text NOT NULL, field text NOT NULL CHECK(field IN ('done','position')),
 value jsonb NOT NULL, revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 mutation_id text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,kind,content_id,field)
);
ALTER TABLE learner_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE learner_progress FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS learner_own_progress ON learner_progress;
CREATE POLICY learner_own_progress ON learner_progress
 USING(user_id=current_setting('app.user_id',true))
 WITH CHECK(user_id=current_setting('app.user_id',true));
