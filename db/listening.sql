CREATE TABLE IF NOT EXISTS learner_listening (
 user_id text NOT NULL, video_id text NOT NULL, title text NOT NULL,
 cues jsonb NOT NULL DEFAULT '[]', revision integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,video_id)
);
ALTER TABLE learner_listening ENABLE ROW LEVEL SECURITY;
ALTER TABLE learner_listening FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS learner_own_listening ON learner_listening;
CREATE POLICY learner_own_listening ON learner_listening
 USING(user_id=current_setting('app.user_id',true))
 WITH CHECK(user_id=current_setting('app.user_id',true));
