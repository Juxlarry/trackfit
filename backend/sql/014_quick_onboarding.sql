-- Quick start onboarding (README "Quick start onboarding").
-- Which path a user took, and the question blocks they still owe. FUEL must be
-- answered before Fuel opens; TRAINING_DETAILS is optional and offered later.
-- Mirrors prisma/schema.prisma. Apply with `npm run db:migrate`.

ALTER TABLE identity.intake_profiles
  ADD COLUMN onboarding_path TEXT NOT NULL DEFAULT 'FULL' CHECK (onboarding_path IN ('FULL','QUICK')),
  ADD COLUMN pending_sections TEXT[] NOT NULL DEFAULT '{}' CHECK (pending_sections <@ ARRAY['FUEL','TRAINING_DETAILS']::text[]);
