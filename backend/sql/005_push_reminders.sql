-- Push notifications for workout reminders (notifications module).
-- Mirrors prisma/schema.prisma. Apply with `npm run db:migrate`.

CREATE SCHEMA IF NOT EXISTS notifications;

-- IANA zone from the browser, e.g. "Africa/Accra". Reminder times are local.
ALTER TABLE identity.users ADD COLUMN IF NOT EXISTS time_zone TEXT;

-- One row per browser/device that allowed notifications (Web Push).
CREATE TABLE notifications.push_subscriptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  endpoint      TEXT NOT NULL UNIQUE,
  p256dh        TEXT NOT NULL,
  auth          TEXT NOT NULL,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_sent_at  TIMESTAMPTZ
);
CREATE INDEX idx_push_subscriptions_user ON notifications.push_subscriptions(user_id);

-- What was sent, so each reminder goes out once per local day however often
-- the job runs (in-process timer and the external cron can overlap).
CREATE TABLE notifications.reminder_log (
  user_id     UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('TRAINING_DAY','PLAN_START_EVE')),
  local_date  DATE NOT NULL,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind, local_date)
);
