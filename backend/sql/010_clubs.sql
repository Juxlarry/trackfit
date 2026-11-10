-- Clubs v1, first build step (README "Clubs v1"): app-wide roles, clubs,
-- invites, join links and club roles. Feed, routines and challenges come later.
-- Mirrors prisma/schema.prisma. Apply with `npm run db:migrate`.

-- App Owner (one, set by `npm run app:owner`) and App Admins (added by the owner).
-- These never grant a club role: club roles come only from memberships.
CREATE TABLE identity.app_roles (
  user_id     UUID PRIMARY KEY REFERENCES identity.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('OWNER','ADMIN')),
  granted_by  UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_app_roles_one_owner ON identity.app_roles(role) WHERE role = 'OWNER';

CREATE SCHEMA IF NOT EXISTS clubs;

CREATE TABLE clubs.clubs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 60),
  description  TEXT CHECK (char_length(description) <= 500),
  -- Challenge weeks (a later step) run Monday to Sunday in this zone.
  time_zone    TEXT NOT NULL DEFAULT 'Africa/Accra',
  created_by   UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at    TIMESTAMPTZ
);

-- One row per person per club, kept after they leave so history stays readable.
-- Admin and Coach are flags on an active membership. Users are RESTRICTed so a
-- future account deletion has to hand over the club first (last-Admin rule).
CREATE TABLE clubs.memberships (
  club_id       UUID NOT NULL REFERENCES clubs.clubs(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
  status        TEXT NOT NULL CHECK (status IN ('WAITING','ACTIVE','DECLINED','LEFT','REMOVED')),
  is_admin      BOOLEAN NOT NULL DEFAULT false,
  is_coach      BOOLEAN NOT NULL DEFAULT false,
  -- When they accepted that the club's coaches see the workouts and activities they log.
  consented_at  TIMESTAMPTZ NOT NULL,
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  joined_at     TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (club_id, user_id),
  CHECK (status = 'ACTIVE' OR NOT (is_admin OR is_coach))
);
CREATE INDEX idx_memberships_user ON clubs.memberships(user_id) WHERE status IN ('WAITING','ACTIVE');

-- Email invites. Claimed only by someone signed in with that address, verified.
CREATE TABLE clubs.invites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id      UUID NOT NULL REFERENCES clubs.clubs(id) ON DELETE CASCADE,
  email        TEXT NOT NULL CHECK (email = lower(email)),
  token        TEXT NOT NULL UNIQUE,
  -- The club's first Admin, named when the club is created (or by the console later).
  as_admin     BOOLEAN NOT NULL DEFAULT false,
  invited_by   UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at  TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ
);
CREATE UNIQUE INDEX uq_invites_open ON clubs.invites(club_id, email) WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX idx_invites_email ON clubs.invites(email) WHERE accepted_at IS NULL AND revoked_at IS NULL;

-- Shareable join links: whoever opens one asks to join, and an Admin approves.
CREATE TABLE clubs.join_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     UUID NOT NULL REFERENCES clubs.clubs(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  created_by  UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  max_uses    INTEGER NOT NULL CHECK (max_uses BETWEEN 1 AND 50),
  uses        INTEGER NOT NULL DEFAULT 0,
  revoked_at  TIMESTAMPTZ
);
CREATE INDEX idx_join_links_club ON clubs.join_links(club_id);

-- Every join, approval, role change and exit, with who did it. This is also the
-- record of each member's consent to coach visibility.
CREATE TABLE clubs.membership_events (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id   UUID NOT NULL REFERENCES clubs.clubs(id) ON DELETE CASCADE,
  user_id   UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  actor_id  UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  event     TEXT NOT NULL CHECK (event IN (
              'CLUB_CREATED','CLUB_CLOSED','INVITED','INVITE_REVOKED','REQUESTED','JOINED','APPROVED','DECLINED',
              'LEFT','REMOVED','ADMIN_ADDED','ADMIN_REMOVED','COACH_ADDED','COACH_REMOVED')),
  detail    TEXT,
  at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_membership_events_club ON clubs.membership_events(club_id, at);
