-- Clubs v1, build step 4: coach challenges (README "Clubs v1", "Coach challenges").
-- Coaches set them (at most 3 a week each); members take them on or say
-- "not for me"; every day (or week) needs proof; finishing offers a win post.
-- Mirrors prisma/schema.prisma. Apply with `npm run db:migrate`.

-- New upload purposes: a coach's video explaining a challenge, and proof.
ALTER TABLE clubs.media DROP CONSTRAINT IF EXISTS media_purpose_check;
ALTER TABLE clubs.media ADD CONSTRAINT media_purpose_check
  CHECK (purpose IN ('POST','COMMENT','CLUB_PHOTO','CHALLENGE','PROOF'));

CREATE TABLE clubs.challenges (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id             UUID NOT NULL REFERENCES clubs.clubs(id) ON DELETE CASCADE,
  coach_id            UUID NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
  title               TEXT NOT NULL CHECK (char_length(title) BETWEEN 2 AND 60),
  description         TEXT CHECK (char_length(description) <= 1000),
  -- DAILY: proof every day it runs. WEEKLY: proof once in each week it runs.
  cadence             TEXT NOT NULL CHECK (cadence IN ('DAILY','WEEKLY')),
  kind                TEXT NOT NULL CHECK (kind IN ('WORKOUT','ACTIVITY','FOOD','WATER')),
  starts_on           DATE NOT NULL,
  ends_on             DATE NOT NULL,
  -- Monday of the week it was set, in the club's time zone: the 3-a-week cap.
  set_week            DATE NOT NULL,
  video_media_id      UUID REFERENCES clubs.media(id) ON DELETE SET NULL,
  -- WORKOUT: [{ "exerciseId": uuid, "sets": n, "reps": n }] and an optional time limit.
  exercises           JSONB,
  time_limit_minutes  INTEGER CHECK (time_limit_minutes BETWEEN 1 AND 180),
  -- ACTIVITY: a type such as RUN, with a distance or time to reach.
  activity_type       TEXT,
  min_distance_km     NUMERIC(5,2) CHECK (min_distance_km > 0 AND min_distance_km <= 300),
  min_minutes         INTEGER CHECK (min_minutes BETWEEN 1 AND 600),
  -- FOOD: a food from the list (food_key) or typed in (name only), and an amount.
  food_key            TEXT,
  food_name           TEXT CHECK (char_length(food_name) BETWEEN 2 AND 80),
  food_grams          INTEGER CHECK (food_grams BETWEEN 1 AND 5000),
  -- WATER: the day's total logged water must reach this.
  water_ml            INTEGER CHECK (water_ml BETWEEN 100 AND 10000),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Ended early by its coach or an Admin.
  ended_at            TIMESTAMPTZ,
  CHECK (ends_on >= starts_on AND ends_on - starts_on <= 27),
  CHECK (kind <> 'WORKOUT' OR (jsonb_typeof(exercises) = 'array' AND jsonb_array_length(exercises) BETWEEN 1 AND 15)),
  CHECK (kind <> 'ACTIVITY' OR (activity_type IS NOT NULL AND (min_distance_km IS NOT NULL OR min_minutes IS NOT NULL))),
  CHECK (kind <> 'FOOD' OR food_name IS NOT NULL),
  CHECK (kind <> 'WATER' OR water_ml IS NOT NULL)
);
CREATE INDEX idx_challenges_club ON clubs.challenges(club_id, ends_on);
CREATE INDEX idx_challenges_cap ON clubs.challenges(club_id, coach_id, set_week);

-- A member's answer to the pop-up. No row: not answered yet, so it's offered again.
CREATE TABLE clubs.challenge_participants (
  challenge_id  UUID NOT NULL REFERENCES clubs.challenges(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  status        TEXT NOT NULL CHECK (status IN ('JOINED','DECLINED')),
  decided_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Every day (or week) has proof.
  completed_at  TIMESTAMPTZ,
  PRIMARY KEY (challenge_id, user_id)
);
CREATE INDEX idx_challenge_participants_user ON clubs.challenge_participants(user_id);

-- Proof, one per day (DAILY) or per week (WEEKLY). period_start is the day,
-- or the first day of that week within the challenge.
CREATE TABLE clubs.challenge_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id    UUID NOT NULL REFERENCES clubs.challenges(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  period_start    DATE NOT NULL,
  on_date         DATE NOT NULL,
  -- The result, as it was when submitted: time taken or reps (workouts),
  -- the activity's distance and time, the water drunk.
  result_seconds  INTEGER CHECK (result_seconds BETWEEN 1 AND 86400),
  result_reps     INTEGER CHECK (result_reps BETWEEN 1 AND 10000),
  distance_km     NUMERIC(6,2),
  minutes         INTEGER,
  water_ml        INTEGER,
  note            TEXT CHECK (char_length(note) <= 300),
  session_id      UUID REFERENCES tracking.workout_sessions(id) ON DELETE SET NULL,
  activity_id     UUID REFERENCES tracking.activity_logs(id) ON DELETE SET NULL,
  food_log_id     UUID REFERENCES nutrition.food_logs(id) ON DELETE SET NULL,
  media_id        UUID REFERENCES clubs.media(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (challenge_id, user_id, period_start)
);

-- Comments on the challenge's page (text only).
CREATE TABLE clubs.challenge_comments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id  UUID NOT NULL REFERENCES clubs.challenges(id) ON DELETE CASCADE,
  author_id     UUID NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
  body          TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX idx_challenge_comments ON clubs.challenge_comments(challenge_id, created_at) WHERE deleted_at IS NULL;

-- Challenge wins link back to the challenge. One win post per person per challenge.
ALTER TABLE clubs.posts ADD COLUMN challenge_id UUID REFERENCES clubs.challenges(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX uq_posts_challenge_win ON clubs.posts(challenge_id, author_id) WHERE challenge_id IS NOT NULL AND deleted_at IS NULL;

-- "New club challenges" push, on unless turned off.
ALTER TABLE notifications.reminder_prefs ADD COLUMN club_challenges BOOLEAN NOT NULL DEFAULT true;
