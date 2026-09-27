-- Additive, idempotent. Apply after db/vocabulary.sql, before enabling card creation.
-- No existing word, schedule, receipt, or policy is changed.
BEGIN;
ALTER TABLE learner_vocabulary ADD COLUMN IF NOT EXISTS card jsonb;
CREATE TABLE IF NOT EXISTS learner_card_generation_accounts (
  user_id text PRIMARY KEY,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  lease_id uuid,
  busy_until timestamptz
);
ALTER TABLE learner_card_generation_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE learner_card_generation_accounts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_card_generation ON learner_card_generation_accounts;
CREATE POLICY own_card_generation ON learner_card_generation_accounts
  USING (user_id = current_setting('app.user_id',true))
  WITH CHECK (user_id = current_setting('app.user_id',true));
COMMIT;
