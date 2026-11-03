-- Which progress-photo slots have a photo, and when it was saved. The files
-- themselves live in Firebase Storage; the app reports the slots each time
-- Progress loads, so the photo reminders can skip a slot that's already done.
-- Mirrors prisma/schema.prisma. Apply with `npm run db:migrate`.

CREATE TABLE tracking.progress_photos (
  user_id   UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  slot      TEXT NOT NULL CHECK (slot IN ('Day 1','Week 3','Week 6')),
  saved_at  TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, slot)
);
