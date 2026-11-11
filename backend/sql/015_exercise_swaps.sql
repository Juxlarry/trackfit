-- Exercise swaps (README "Exercise swaps").
-- A swap for the rest of the cycle changes the template's exercise and keeps
-- the original for "Back to …". A one-off swap is only in the logged sets,
-- which remember the exercise they replaced.
-- Mirrors prisma/schema.prisma. Apply with `npm run db:migrate`.

ALTER TABLE tracking.workout_template_exercises
  ADD COLUMN swapped_from_exercise_id UUID REFERENCES tracking.exercises(id) ON DELETE SET NULL;

ALTER TABLE tracking.set_logs
  ADD COLUMN replaces_exercise_id UUID REFERENCES tracking.exercises(id) ON DELETE SET NULL;
