-- Weigh-in, progress-photo and missed-session reminders, each switchable.
-- Mirrors prisma/schema.prisma. Apply with `npm run db:migrate`.

ALTER TABLE notifications.reminder_log DROP CONSTRAINT IF EXISTS reminder_log_kind_check;
ALTER TABLE notifications.reminder_log ADD CONSTRAINT reminder_log_kind_check
  CHECK (kind IN ('TRAINING_DAY','PLAN_START_EVE','WEIGH_IN','PROGRESS_PHOTO','MISSED_SESSION'));

-- No row means every reminder is on. The workout reminder itself is
-- identity.intake_profiles.reminder_time (null = off).
CREATE TABLE notifications.reminder_prefs (
  user_id          UUID PRIMARY KEY REFERENCES identity.users(id) ON DELETE CASCADE,
  weigh_in         BOOLEAN NOT NULL DEFAULT true,
  progress_photos  BOOLEAN NOT NULL DEFAULT true,
  missed_session   BOOLEAN NOT NULL DEFAULT true,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
