-- TrackFit MVP 2: guided onboarding, generated plans, nutrition, activities
-- (spec.md §4.8, architecture.md §3.1, onboarding-flow.md). Mirrors
-- prisma/schema.prisma field-for-field. Apply with `npm run db:migrate`.

CREATE SCHEMA IF NOT EXISTS nutrition;

-- ── Identity: screening + intake ─────────────────────────────────────────

ALTER TABLE identity.users ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ;

-- Only the boolean gate flags are stored, never free-text medical detail
-- (spec §6, architecture §11). Read only by the generation gate.
CREATE TABLE identity.health_screenings (
  user_id                    UUID PRIMARY KEY REFERENCES identity.users(id) ON DELETE CASCADE,
  heart_condition            BOOLEAN NOT NULL,
  high_blood_pressure        BOOLEAN NOT NULL,
  diabetes                   BOOLEAN NOT NULL,
  pregnant                   BOOLEAN NOT NULL,
  recent_surgery_or_injury   BOOLEAN NOT NULL,
  chest_pain_or_dizziness    BOOLEAN NOT NULL,
  under_18                   BOOLEAN NOT NULL,
  screened_out               BOOLEAN NOT NULL,
  screened_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE identity.intake_profiles (
  user_id            UUID PRIMARY KEY REFERENCES identity.users(id) ON DELETE CASCADE,
  sex                TEXT NOT NULL CHECK (sex IN ('MALE','FEMALE')),
  age                SMALLINT NOT NULL CHECK (age BETWEEN 18 AND 90),
  height_cm          DOUBLE PRECISION NOT NULL,
  weight_kg          DOUBLE PRECISION NOT NULL,
  body_fat_level     SMALLINT CHECK (body_fat_level BETWEEN 0 AND 4),
  goal_type          TEXT NOT NULL CHECK (goal_type IN ('LOSE_FAT','BUILD_MUSCLE','RECOMP','FITNESS','MAINTAIN')),
  target_weight_kg   DOUBLE PRECISION,
  goal_pace          TEXT CHECK (goal_pace IN ('STEADY','MODERATE','AMBITIOUS')),
  motivations        TEXT[] NOT NULL DEFAULT '{}',
  experience         TEXT NOT NULL CHECK (experience IN ('NEW','SOME','EXPERIENCED')),
  lift_comfort       TEXT NOT NULL CHECK (lift_comfort IN ('NEVER','LEARNING','SOLID','AVOID')),
  equipment          TEXT NOT NULL CHECK (equipment IN ('FULL_GYM','SMALL_GYM','HOME_GYM','DUMBBELLS','BANDS','BODYWEIGHT')),
  available_days     SMALLINT[] NOT NULL,
  days_per_week      SMALLINT NOT NULL CHECK (days_per_week BETWEEN 2 AND 6),
  session_minutes    SMALLINT NOT NULL CHECK (session_minutes IN (30,45,60,75)),
  split_preference   TEXT NOT NULL CHECK (split_preference IN ('AUTO','FULL_BODY','UPPER_LOWER','MUSCLE_FOCUS')),
  full_body_day      BOOLEAN NOT NULL DEFAULT false,
  priority_muscles   TEXT[] NOT NULL DEFAULT '{}',
  injuries           TEXT[] NOT NULL DEFAULT '{}',
  injury_note        TEXT,
  cardio_frequency   TEXT,
  cardio_likes       TEXT[] NOT NULL DEFAULT '{}',
  activity_level     TEXT NOT NULL CHECK (activity_level IN ('DESK','LIGHT','ACTIVE','VERY_ACTIVE')),
  sleep_hours        DOUBLE PRECISION NOT NULL,
  sleep_quality      TEXT,
  train_time         TEXT,
  busyness           TEXT,
  warmup             BOOLEAN NOT NULL DEFAULT true,
  energy             TEXT,
  blockers           TEXT[] NOT NULL DEFAULT '{}',
  -- Mindset and marketing answers that don't drive generation (Likert scores,
  -- past attempts, accountability person, support type, tracker history).
  mindset            JSONB NOT NULL DEFAULT '{}'::jsonb,
  reminder_time      TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Nutrition ────────────────────────────────────────────────────────────

CREATE TABLE nutrition.dietary_profiles (
  user_id            UUID PRIMARY KEY REFERENCES identity.users(id) ON DELETE CASCADE,
  diet_pattern       TEXT NOT NULL CHECK (diet_pattern IN ('OMNIVORE','HALAL','PESCATARIAN','VEGETARIAN','VEGAN','OTHER')),
  allergies          TEXT[] NOT NULL DEFAULT '{}',
  dislikes           TEXT NOT NULL DEFAULT '',
  favourite_dishes   TEXT[] NOT NULL DEFAULT '{}',
  meal_pattern       TEXT NOT NULL CHECK (meal_pattern IN ('TWO','TWO_PLUS_SNACK','THREE','THREE_PLUS_SNACK','THREE_PLUS_TWO_SNACKS')),
  prep_style         TEXT,
  fasting            TEXT NOT NULL DEFAULT 'NO' CHECK (fasting IN ('YES','CURIOUS','NO')),
  calorie_awareness  TEXT,
  protein_awareness  TEXT,
  struggles          TEXT[] NOT NULL DEFAULT '{}',
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE nutrition.recipes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key            TEXT NOT NULL UNIQUE,
  dish           TEXT NOT NULL,
  name           TEXT NOT NULL,
  slot           TEXT NOT NULL CHECK (slot IN ('BREAKFAST','LUNCH','DINNER','SNACK')),
  kcal           INTEGER NOT NULL,
  protein_g      INTEGER NOT NULL,
  carbs_g        INTEGER NOT NULL,
  fat_g          INTEGER NOT NULL,
  diets          TEXT[] NOT NULL,
  allergens      TEXT[] NOT NULL DEFAULT '{}',
  portion_guide  TEXT NOT NULL,
  is_local       BOOLEAN NOT NULL DEFAULT false,
  source         TEXT NOT NULL DEFAULT 'custom-seeded'
);

CREATE TABLE nutrition.nutrition_plans (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  cycle_number   INTEGER NOT NULL DEFAULT 1,
  daily_kcal     INTEGER NOT NULL,
  protein_g      INTEGER NOT NULL,
  carbs_g        INTEGER NOT NULL,
  fat_g          INTEGER NOT NULL,
  status         TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_nutrition_plans_active ON nutrition.nutrition_plans(user_id) WHERE status = 'ACTIVE';

-- One row per planned meal the user has touched: ticked as eaten and/or swapped.
-- Untouched slots are computed from the menu rotation, not stored.
CREATE TABLE nutrition.meal_entries (
  user_id        UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  entry_date     DATE NOT NULL,
  slot_index     SMALLINT NOT NULL,
  recipe_key     TEXT REFERENCES nutrition.recipes(key) ON DELETE SET NULL,
  eaten          BOOLEAN NOT NULL DEFAULT false,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, entry_date, slot_index)
);

-- ── Tracking: generated programs, activities ─────────────────────────────

ALTER TABLE tracking.exercises ADD COLUMN IF NOT EXISTS pattern TEXT;

CREATE TABLE tracking.generated_programs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  cycle_number     INTEGER NOT NULL DEFAULT 1,
  start_date       DATE NOT NULL,
  end_date         DATE NOT NULL,
  status           TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','COMPLETED','ARCHIVED')),
  -- The ±1 rule is anchored to onboarding_days; days_per_week is the current value.
  onboarding_days  SMALLINT NOT NULL,
  days_per_week    SMALLINT NOT NULL,
  split_label      TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (days_per_week BETWEEN GREATEST(2, onboarding_days - 1) AND LEAST(6, onboarding_days + 1))
);
CREATE UNIQUE INDEX uq_generated_programs_active ON tracking.generated_programs(user_id) WHERE status = 'ACTIVE';

-- Generated sessions reuse MVP 1's template model (spec §4.3 note). Changing
-- training days deactivates the old set and inserts a new one, so logged
-- sessions keep pointing at the template they were done from.
ALTER TABLE tracking.workout_templates
  ADD COLUMN IF NOT EXISTS is_generated BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS program_id   UUID REFERENCES tracking.generated_programs(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS weekday      SMALLINT CHECK (weekday BETWEEN 0 AND 6),
  ADD COLUMN IF NOT EXISTS session_type TEXT,
  ADD COLUMN IF NOT EXISTS is_active    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS warmup       JSONB NOT NULL DEFAULT '[]'::jsonb;
CREATE INDEX IF NOT EXISTS idx_workout_templates_program ON tracking.workout_templates(program_id) WHERE program_id IS NOT NULL;

ALTER TABLE tracking.workout_template_exercises
  ADD COLUMN IF NOT EXISTS rep_range TEXT,
  ADD COLUMN IF NOT EXISTS replaces  TEXT;

CREATE TABLE tracking.activity_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  performed_on      DATE NOT NULL,
  kind              TEXT NOT NULL CHECK (kind IN ('CARDIO','SPORT','WARMUP','MOBILITY','ABS')),
  activity_type     TEXT NOT NULL,
  duration_minutes  INTEGER NOT NULL CHECK (duration_minutes BETWEEN 1 AND 600),
  distance_km       DOUBLE PRECISION CHECK (distance_km >= 0),
  kcal              INTEGER CHECK (kcal >= 0),
  kcal_estimated    BOOLEAN NOT NULL DEFAULT true,
  avg_heart_rate    INTEGER CHECK (avg_heart_rate BETWEEN 30 AND 230),
  effort            TEXT CHECK (effort IN ('EASY','MODERATE','HARD')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_activity_logs_user_date ON tracking.activity_logs(user_id, performed_on);
