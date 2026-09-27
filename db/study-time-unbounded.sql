-- Apply before deploying the background timer fix to an existing database.
-- Idempotent: preserve all session rows, ownership policies and mutation receipts.
BEGIN;
ALTER TABLE learner_study_sessions
  DROP CONSTRAINT IF EXISTS learner_study_sessions_elapsed_ms_check,
  DROP CONSTRAINT IF EXISTS learner_study_sessions_confirmed_seconds_check;
ALTER TABLE learner_study_sessions
  ALTER COLUMN elapsed_ms TYPE bigint,
  ALTER COLUMN confirmed_seconds TYPE bigint;
ALTER TABLE learner_study_sessions
  ADD CONSTRAINT learner_study_sessions_elapsed_ms_check CHECK (elapsed_ms >= 0),
  ADD CONSTRAINT learner_study_sessions_confirmed_seconds_check CHECK (confirmed_seconds >= 0);
COMMIT;
