-- Clubs v1, build step 2: the feed (README "Clubs v1", "Posts" and "Sharing").
-- Posts, their photo or video, comments, reactions and reports, plus each
-- member's "ask me to share" setting and the club photo.
-- Mirrors prisma/schema.prisma. Apply with `npm run db:migrate`.

-- A photo or video uploaded for a club. The file lives in Firebase Storage at
-- storage_path (clubs/{clubId}/{id}); it's never public, and the API hands out
-- short-lived links to upload and view it. PENDING until the API has checked
-- the uploaded file, then READY.
CREATE TABLE clubs.media (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id           UUID NOT NULL REFERENCES clubs.clubs(id) ON DELETE CASCADE,
  uploader_id       UUID NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
  purpose           TEXT NOT NULL CHECK (purpose IN ('POST','COMMENT','CLUB_PHOTO')),
  kind              TEXT NOT NULL CHECK (kind IN ('IMAGE','VIDEO')),
  content_type      TEXT NOT NULL,
  size_bytes        INTEGER NOT NULL CHECK (size_bytes > 0),
  duration_seconds  NUMERIC(6,2),
  storage_path      TEXT NOT NULL UNIQUE,
  status            TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','READY')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_club_media_pending ON clubs.media(created_at) WHERE status = 'PENDING';

ALTER TABLE clubs.clubs ADD COLUMN photo_media_id UUID REFERENCES clubs.media(id) ON DELETE SET NULL;

-- "Ask me to share after workouts", per club. On by default.
ALTER TABLE clubs.memberships ADD COLUMN ask_to_share BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE clubs.posts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id           UUID NOT NULL REFERENCES clubs.clubs(id) ON DELETE CASCADE,
  author_id         UUID NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
  kind              TEXT NOT NULL CHECK (kind IN ('WORKOUT','RUN','CYCLE','ACTIVITY','PROGRESS','MEAL','CHALLENGE_WIN','COACH_VIDEO')),
  body              TEXT NOT NULL DEFAULT '' CHECK (char_length(body) <= 1000),
  -- The logged workout or activity a post shares. If the log is deleted, the post stays as text.
  session_id        UUID REFERENCES tracking.workout_sessions(id) ON DELETE SET NULL,
  activity_id       UUID REFERENCES tracking.activity_logs(id) ON DELETE SET NULL,
  -- Progress posts: weight change since Day 1 of the plan, as it was when posted.
  weight_change_kg  NUMERIC(5,1),
  -- PR posts and challenge wins count as "Wins" in the feed filter.
  has_pr            BOOLEAN NOT NULL DEFAULT false,
  media_id          UUID REFERENCES clubs.media(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at         TIMESTAMPTZ,
  deleted_at        TIMESTAMPTZ,
  deleted_by        UUID REFERENCES identity.users(id) ON DELETE SET NULL
);
CREATE INDEX idx_posts_feed ON clubs.posts(club_id, created_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_posts_author ON clubs.posts(author_id, club_id) WHERE deleted_at IS NULL;
-- One post per workout or activity per club.
CREATE UNIQUE INDEX uq_posts_session ON clubs.posts(club_id, session_id) WHERE session_id IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX uq_posts_activity ON clubs.posts(club_id, activity_id) WHERE activity_id IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE clubs.comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID NOT NULL REFERENCES clubs.posts(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
  body        TEXT NOT NULL DEFAULT '' CHECK (char_length(body) <= 500),
  -- Coaches can reply with a 30-second video.
  media_id    UUID REFERENCES clubs.media(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ,
  CHECK (char_length(body) > 0 OR media_id IS NOT NULL)
);
CREATE INDEX idx_comments_post ON clubs.comments(post_id, created_at) WHERE deleted_at IS NULL;

-- One reaction per person per post; tapping another one changes it.
CREATE TABLE clubs.reactions (
  post_id     UUID NOT NULL REFERENCES clubs.posts(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  reaction    TEXT NOT NULL CHECK (reaction IN ('FIRE','STRONG','CLAP','HEART')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

-- Reports go to the App Owner and App Admins (the console).
CREATE TABLE clubs.reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id      UUID NOT NULL REFERENCES clubs.clubs(id) ON DELETE CASCADE,
  post_id      UUID NOT NULL REFERENCES clubs.posts(id) ON DELETE CASCADE,
  comment_id   UUID REFERENCES clubs.comments(id) ON DELETE CASCADE,
  reporter_id  UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  reason       TEXT NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at  TIMESTAMPTZ,
  resolved_by  UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  -- REMOVED: the post or comment was deleted. DISMISSED: left up.
  outcome      TEXT CHECK (outcome IN ('REMOVED','DISMISSED'))
);
CREATE INDEX idx_reports_open ON clubs.reports(created_at) WHERE resolved_at IS NULL;
-- One open report per person per post or comment.
CREATE UNIQUE INDEX uq_reports_open ON clubs.reports(reporter_id, post_id, COALESCE(comment_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE resolved_at IS NULL;
