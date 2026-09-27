-- Personal per-video notes; additive and repeatable. No existing table is altered.
BEGIN;
CREATE TABLE IF NOT EXISTS learner_video_note_accounts (user_id text PRIMARY KEY);
CREATE TABLE IF NOT EXISTS learner_video_notes (
 user_id text NOT NULL,
 video_id text NOT NULL,
 document jsonb,
 revision integer NOT NULL CHECK (revision > 0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,video_id)
);
-- Null documents retain a revision tombstone so stale devices cannot resurrect deleted notes.
CREATE TABLE IF NOT EXISTS learner_video_note_mutations (
 user_id text NOT NULL,
 id uuid NOT NULL,
 payload_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,id)
);
ALTER TABLE learner_video_note_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE learner_video_note_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE learner_video_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE learner_video_notes FORCE ROW LEVEL SECURITY;
ALTER TABLE learner_video_note_mutations ENABLE ROW LEVEL SECURITY;
ALTER TABLE learner_video_note_mutations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_video_note_account ON learner_video_note_accounts;
CREATE POLICY own_video_note_account ON learner_video_note_accounts USING(user_id=current_setting('app.user_id',true)) WITH CHECK(user_id=current_setting('app.user_id',true));
DROP POLICY IF EXISTS own_video_note ON learner_video_notes;
CREATE POLICY own_video_note ON learner_video_notes USING(user_id=current_setting('app.user_id',true)) WITH CHECK(user_id=current_setting('app.user_id',true));
DROP POLICY IF EXISTS own_video_note_mutation ON learner_video_note_mutations;
CREATE POLICY own_video_note_mutation ON learner_video_note_mutations USING(user_id=current_setting('app.user_id',true)) WITH CHECK(user_id=current_setting('app.user_id',true));
COMMIT;
