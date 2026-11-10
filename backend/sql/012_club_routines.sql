-- Clubs v1, build step 3: club routines (README "Clubs v1", "Club routines").
-- Set by Admins, recurring, optional for members. No proof, no weekly cap,
-- no pop-up, and they never change anyone's plan.
-- Mirrors prisma/schema.prisma. Apply with `npm run db:migrate`.

CREATE TABLE clubs.routines (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id          UUID NOT NULL REFERENCES clubs.clubs(id) ON DELETE CASCADE,
  created_by       UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  title            TEXT NOT NULL CHECK (char_length(title) BETWEEN 2 AND 60),
  description      TEXT CHECK (char_length(description) <= 500),
  -- ACTIVITY: ticked when a matching activity is logged that day.
  -- WORKOUT: logged as a session from the routine's exercises.
  kind             TEXT NOT NULL CHECK (kind IN ('ACTIVITY','WORKOUT')),
  -- 0 = Monday ... 6 = Sunday. All seven means every day.
  weekdays         SMALLINT[] NOT NULL CHECK (cardinality(weekdays) BETWEEN 1 AND 7 AND weekdays <@ ARRAY[0,1,2,3,4,5,6]::smallint[]),
  -- ACTIVITY: what counts. A type such as RUN, and optional minimums.
  activity_type    TEXT,
  min_distance_km  NUMERIC(5,2) CHECK (min_distance_km > 0 AND min_distance_km <= 300),
  min_minutes      INTEGER CHECK (min_minutes BETWEEN 1 AND 600),
  -- WORKOUT: [{ "exerciseId": uuid, "sets": n, "reps": n }], in order.
  exercises        JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at      TIMESTAMPTZ,
  CHECK (kind <> 'ACTIVITY' OR activity_type IS NOT NULL),
  CHECK (kind <> 'WORKOUT' OR (jsonb_typeof(exercises) = 'array' AND jsonb_array_length(exercises) BETWEEN 1 AND 15))
);
CREATE INDEX idx_routines_club ON clubs.routines(club_id) WHERE archived_at IS NULL;

-- Workout routines done, one per person per day. Activity routines aren't
-- stored: they're worked out from the member's activity log when shown, so
-- deleting the activity un-ticks the routine.
CREATE TABLE clubs.routine_completions (
  routine_id  UUID NOT NULL REFERENCES clubs.routines(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  on_date     DATE NOT NULL,
  session_id  UUID REFERENCES tracking.workout_sessions(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (routine_id, user_id, on_date)
);
CREATE INDEX idx_routine_completions_user ON clubs.routine_completions(user_id, on_date);
