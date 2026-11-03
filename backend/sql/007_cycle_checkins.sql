-- Week-6 check-in: builds the next cycle from the last one's results.
-- Mirrors prisma/schema.prisma. Apply with `npm run db:migrate`.

-- What the check-in decided for a cycle, so a mid-cycle day change rebuilds
-- the same week and calories (engine BuildOptions, checkin.ts).
ALTER TABLE tracking.generated_programs
  ADD COLUMN IF NOT EXISTS build_options JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Starting weight per exercise name from weeks 5-6 of the previous cycle.
  ADD COLUMN IF NOT EXISTS start_loads   JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Running calorie correction from real results, added to the computed target.
  ADD COLUMN IF NOT EXISTS kcal_offset   INTEGER NOT NULL DEFAULT 0;

-- One check-in per finished cycle.
CREATE TABLE tracking.cycle_checkins (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  program_id       UUID NOT NULL UNIQUE REFERENCES tracking.generated_programs(id) ON DELETE CASCADE,
  next_program_id  UUID REFERENCES tracking.generated_programs(id) ON DELETE SET NULL,
  answers          JSONB NOT NULL,
  results          JSONB NOT NULL,
  changes          JSONB NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cycle_checkins_user ON tracking.cycle_checkins(user_id);

ALTER TABLE notifications.reminder_log DROP CONSTRAINT IF EXISTS reminder_log_kind_check;
ALTER TABLE notifications.reminder_log ADD CONSTRAINT reminder_log_kind_check
  CHECK (kind IN ('TRAINING_DAY','PLAN_START_EVE','WEIGH_IN','PROGRESS_PHOTO','MISSED_SESSION','CHECKIN_READY'));
