-- Muscles not to prioritise, and per-week training-day swaps.
-- Mirrors prisma/schema.prisma. Apply with `npm run db:migrate`.

ALTER TABLE identity.intake_profiles
  ADD COLUMN IF NOT EXISTS low_priority_muscles TEXT[] NOT NULL DEFAULT '{}';

-- One row per swap, applied in created_at order on top of the plan's week.
-- Swaps only reorder sessions within one week; templates are untouched.
CREATE TABLE tracking.schedule_swaps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id  UUID NOT NULL REFERENCES tracking.generated_programs(id) ON DELETE CASCADE,
  -- Monday of the week the swap applies to.
  week_start  DATE NOT NULL CHECK (EXTRACT(ISODOW FROM week_start) = 1),
  day_a       SMALLINT NOT NULL CHECK (day_a BETWEEN 0 AND 6),
  day_b       SMALLINT NOT NULL CHECK (day_b BETWEEN 0 AND 6),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK (day_a <> day_b)
);
CREATE INDEX idx_schedule_swaps_program_week ON tracking.schedule_swaps(program_id, week_start);
