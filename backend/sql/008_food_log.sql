-- Log any food (from the engine's food list or the user's own), and water.
-- Mirrors prisma/schema.prisma. Apply with `npm run db:migrate`.

-- A planned meal replaced by a logged food: it no longer counts as eaten.
ALTER TABLE nutrition.meal_entries ADD COLUMN IF NOT EXISTS skipped BOOLEAN NOT NULL DEFAULT false;

-- Quick-add foods, kept for re-logging ("My foods").
CREATE TABLE nutrition.custom_foods (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  kcal        INTEGER NOT NULL CHECK (kcal BETWEEN 0 AND 5000),
  protein_g   INTEGER NOT NULL DEFAULT 0 CHECK (protein_g BETWEEN 0 AND 500),
  carbs_g     INTEGER NOT NULL DEFAULT 0 CHECK (carbs_g BETWEEN 0 AND 1000),
  fat_g       INTEGER NOT NULL DEFAULT 0 CHECK (fat_g BETWEEN 0 AND 500),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_custom_foods_name ON nutrition.custom_foods(user_id, lower(name));

-- One row per food eaten. Name and numbers are copied in, so editing the food
-- list later never rewrites history.
CREATE TABLE nutrition.food_logs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  entry_date           DATE NOT NULL,
  slot                 TEXT NOT NULL CHECK (slot IN ('BREAKFAST','LUNCH','DINNER','SNACK')),
  food_key             TEXT,
  custom_food_id       UUID REFERENCES nutrition.custom_foods(id) ON DELETE SET NULL,
  name                 TEXT NOT NULL,
  portion_label        TEXT NOT NULL,
  -- Which of the food's portions, or a weight typed in grams (then quantity is 1).
  portion_index        SMALLINT,
  grams                INTEGER CHECK (grams BETWEEN 1 AND 5000),
  quantity             REAL NOT NULL CHECK (quantity > 0 AND quantity <= 10),
  kcal                 INTEGER NOT NULL,
  protein_g            INTEGER NOT NULL DEFAULT 0,
  carbs_g              INTEGER NOT NULL DEFAULT 0,
  fat_g                INTEGER NOT NULL DEFAULT 0,
  -- The planned meal this food was eaten instead of (meal_entries.skipped).
  replaced_slot_index  SMALLINT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_food_logs_user_date ON nutrition.food_logs(user_id, entry_date);

-- Water drunk per day. No row means nothing logged.
CREATE TABLE nutrition.water_days (
  user_id     UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  entry_date  DATE NOT NULL,
  ml          INTEGER NOT NULL CHECK (ml BETWEEN 0 AND 10000),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, entry_date)
);
