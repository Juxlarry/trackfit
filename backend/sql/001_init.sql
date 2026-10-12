-- TrackFit — initial schema (MVP 1: Identity + Tracking modules only)
-- Hand-written to mirror prisma/schema.prisma exactly (see backend/README.md
-- for why this sandbox applies SQL directly instead of `prisma migrate dev`).
-- Keeps the "separate schema per module" guardrail from architecture.md §3.

CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS tracking;

-- ── Identity ────────────────────────────────────────────────────────────

CREATE TYPE identity.units_preference AS ENUM ('METRIC', 'IMPERIAL');

CREATE TABLE identity.users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid  TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  phone_number  TEXT UNIQUE,
  email         TEXT UNIQUE,
  units         identity.units_preference NOT NULL DEFAULT 'METRIC',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Tracking ────────────────────────────────────────────────────────────

CREATE TABLE tracking.weight_entries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  recorded_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  weight_kg        DOUBLE PRECISION NOT NULL,
  body_fat_percent DOUBLE PRECISION,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_weight_entries_user_recorded ON tracking.weight_entries(user_id, recorded_at);

CREATE TYPE tracking.muscle_group AS ENUM (
  'CHEST', 'BACK', 'SHOULDERS', 'BICEPS', 'TRICEPS', 'LEGS', 'GLUTES',
  'CORE', 'FULL_BODY', 'CARDIO', 'OTHER'
);

CREATE TABLE tracking.exercises (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  muscle_group  tracking.muscle_group NOT NULL,
  equipment     TEXT,
  is_custom     BOOLEAN NOT NULL DEFAULT false,
  owner_id      UUID REFERENCES identity.users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_exercises_name ON tracking.exercises(name);

CREATE TABLE tracking.workout_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_workout_templates_user ON tracking.workout_templates(user_id);

CREATE TABLE tracking.workout_template_exercises (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  UUID NOT NULL REFERENCES tracking.workout_templates(id) ON DELETE CASCADE,
  exercise_id  UUID NOT NULL REFERENCES tracking.exercises(id) ON DELETE RESTRICT,
  "order"      INTEGER NOT NULL,
  target_sets  INTEGER NOT NULL,
  target_reps  INTEGER NOT NULL,
  UNIQUE (template_id, "order")
);

CREATE TABLE tracking.workout_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  template_id      UUID REFERENCES tracking.workout_templates(id) ON DELETE SET NULL,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_minutes INTEGER,
  notes            TEXT,
  share_to_clubs   BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_workout_sessions_user_started ON tracking.workout_sessions(user_id, started_at);

CREATE TABLE tracking.set_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES tracking.workout_sessions(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES tracking.exercises(id) ON DELETE RESTRICT,
  set_number  INTEGER NOT NULL,
  reps        INTEGER NOT NULL,
  weight_kg   DOUBLE PRECISION NOT NULL,
  rpe         DOUBLE PRECISION,
  notes       TEXT
);
CREATE INDEX idx_set_logs_session ON tracking.set_logs(session_id);
CREATE INDEX idx_set_logs_exercise ON tracking.set_logs(exercise_id);

CREATE TYPE tracking.milestone_type AS ENUM ('HEAVIEST_SET', 'ESTIMATED_1RM', 'MOST_REPS_AT_WEIGHT');

CREATE TABLE tracking.milestones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES tracking.workout_sessions(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL,
  type        tracking.milestone_type NOT NULL,
  value       DOUBLE PRECISION NOT NULL,
  achieved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_milestones_exercise ON tracking.milestones(exercise_id);
