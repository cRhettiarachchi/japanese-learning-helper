-- One vocabulary collection per authenticated account; no list IDs.
CREATE TABLE IF NOT EXISTS learner_vocabulary_accounts (user_id text PRIMARY KEY);
CREATE TABLE IF NOT EXISTS learner_vocabulary (
 user_id text NOT NULL, entry_id text NOT NULL,
 word text NOT NULL, reading text NOT NULL DEFAULT '', readings jsonb NOT NULL, meanings jsonb NOT NULL,
 stage integer NOT NULL DEFAULT 0 CHECK(stage BETWEEN 0 AND 6),
 due_at timestamptz NOT NULL, revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,entry_id)
);
ALTER TABLE learner_vocabulary ADD COLUMN IF NOT EXISTS reading text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS learner_vocabulary_due ON learner_vocabulary(user_id,due_at);
CREATE TABLE IF NOT EXISTS learner_vocabulary_ratings (
 user_id text NOT NULL, id uuid NOT NULL, entry_id text NOT NULL,
 rating text NOT NULL CHECK(rating IN ('good','again')),
 previous_stage integer NOT NULL, previous_due_at timestamptz NOT NULL,
 applied_revision integer NOT NULL, created_at timestamptz NOT NULL, undone_at timestamptz,
 PRIMARY KEY(user_id,id), FOREIGN KEY(user_id,entry_id) REFERENCES learner_vocabulary(user_id,entry_id)
);
CREATE TABLE IF NOT EXISTS learner_vocabulary_mutations (
 user_id text NOT NULL, id uuid NOT NULL, payload_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,id)
);
ALTER TABLE learner_vocabulary_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE learner_vocabulary_accounts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_vocabulary_account ON learner_vocabulary_accounts;
CREATE POLICY own_vocabulary_account ON learner_vocabulary_accounts USING(user_id=current_setting('app.user_id',true)) WITH CHECK(user_id=current_setting('app.user_id',true));
ALTER TABLE learner_vocabulary ENABLE ROW LEVEL SECURITY;
ALTER TABLE learner_vocabulary FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_vocabulary ON learner_vocabulary;
CREATE POLICY own_vocabulary ON learner_vocabulary USING(user_id=current_setting('app.user_id',true)) WITH CHECK(user_id=current_setting('app.user_id',true));
ALTER TABLE learner_vocabulary_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE learner_vocabulary_ratings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_vocabulary_ratings ON learner_vocabulary_ratings;
CREATE POLICY own_vocabulary_ratings ON learner_vocabulary_ratings USING(user_id=current_setting('app.user_id',true)) WITH CHECK(user_id=current_setting('app.user_id',true));
ALTER TABLE learner_vocabulary_mutations ENABLE ROW LEVEL SECURITY;
ALTER TABLE learner_vocabulary_mutations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_vocabulary_mutations ON learner_vocabulary_mutations;
CREATE POLICY own_vocabulary_mutations ON learner_vocabulary_mutations USING(user_id=current_setting('app.user_id',true)) WITH CHECK(user_id=current_setting('app.user_id',true));
