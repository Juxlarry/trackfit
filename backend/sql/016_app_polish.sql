-- App polish (README "App polish: workouts, weigh-ins, cardio and Fuel").
-- Exercise ease ratings feed progression offers; treadmill walks and runs;
-- the time of the daily weigh-in reminder.
-- Mirrors prisma/schema.prisma. Apply with `npm run db:migrate`.

CREATE TABLE tracking.exercise_ratings (
  session_id   UUID NOT NULL REFERENCES tracking.workout_sessions(id) ON DELETE CASCADE,
  exercise_id  UUID NOT NULL REFERENCES tracking.exercises(id) ON DELETE CASCADE,
  ease         TEXT NOT NULL CHECK (ease IN ('EASY','OKAY','HARD')),
  PRIMARY KEY (session_id, exercise_id)
);

ALTER TABLE tracking.activity_logs
  ADD COLUMN setting     TEXT NOT NULL DEFAULT 'OUTDOOR' CHECK (setting IN ('OUTDOOR','TREADMILL')),
  ADD COLUMN incline_pct DOUBLE PRECISION CHECK (incline_pct BETWEEN 0 AND 15);

ALTER TABLE notifications.reminder_prefs
  ADD COLUMN weigh_in_time TEXT NOT NULL DEFAULT '07:30' CHECK (weigh_in_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
