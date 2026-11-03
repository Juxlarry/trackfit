import type { PoolClient } from "pg";
import { pool } from "../../shared/db/pool.js";
import type { DietInput, MealSlot, Recipe, Targets } from "../planning/engine/index.js";

type Db = PoolClient | typeof pool;

export interface DietExtras {
  calorieAwareness: string | null;
  proteinAwareness: string | null;
}

export async function upsertDietaryProfile(db: Db, userId: string, d: DietInput, x: DietExtras) {
  await db.query(
    `INSERT INTO nutrition.dietary_profiles
       (user_id, diet_pattern, allergies, dislikes, favourite_dishes, meal_pattern, prep_style, fasting, calorie_awareness, protein_awareness, struggles, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
     ON CONFLICT (user_id) DO UPDATE SET
       diet_pattern = EXCLUDED.diet_pattern, allergies = EXCLUDED.allergies, dislikes = EXCLUDED.dislikes,
       favourite_dishes = EXCLUDED.favourite_dishes, meal_pattern = EXCLUDED.meal_pattern, prep_style = EXCLUDED.prep_style,
       fasting = EXCLUDED.fasting, calorie_awareness = EXCLUDED.calorie_awareness, protein_awareness = EXCLUDED.protein_awareness,
       struggles = EXCLUDED.struggles, updated_at = now()`,
    [userId, d.pattern, d.allergies, d.dislikes, d.favouriteDishes, d.mealPattern, d.prep, d.fasting, x.calorieAwareness, x.proteinAwareness, d.struggles],
  );
}

export async function getDietaryProfile(userId: string, db: Db = pool): Promise<DietInput | null> {
  const { rows } = await db.query(`SELECT * FROM nutrition.dietary_profiles WHERE user_id = $1`, [userId]);
  const r = rows[0];
  if (!r) return null;
  return {
    pattern: r.diet_pattern, allergies: r.allergies, dislikes: r.dislikes, favouriteDishes: r.favourite_dishes,
    mealPattern: r.meal_pattern, prep: r.prep_style, fasting: r.fasting, struggles: r.struggles,
  };
}

export interface NutritionPlanRow {
  id: string;
  cycleNumber: number;
  dailyKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export async function archiveActiveNutritionPlan(db: Db, userId: string) {
  await db.query(`UPDATE nutrition.nutrition_plans SET status = 'ARCHIVED', updated_at = now() WHERE user_id = $1 AND status = 'ACTIVE'`, [userId]);
}

export async function insertNutritionPlan(db: Db, userId: string, cycleNumber: number, t: Targets) {
  await db.query(
    `INSERT INTO nutrition.nutrition_plans (user_id, cycle_number, daily_kcal, protein_g, carbs_g, fat_g) VALUES ($1,$2,$3,$4,$5,$6)`,
    [userId, cycleNumber, t.kcal, t.proteinG, t.carbsG, t.fatG],
  );
}

export async function updateActiveNutritionTargets(db: Db, userId: string, t: Targets) {
  await db.query(
    `UPDATE nutrition.nutrition_plans SET daily_kcal = $2, protein_g = $3, carbs_g = $4, fat_g = $5, updated_at = now()
     WHERE user_id = $1 AND status = 'ACTIVE'`,
    [userId, t.kcal, t.proteinG, t.carbsG, t.fatG],
  );
}

export async function getActiveNutritionPlan(userId: string, db: Db = pool): Promise<NutritionPlanRow | null> {
  const { rows } = await db.query(`SELECT * FROM nutrition.nutrition_plans WHERE user_id = $1 AND status = 'ACTIVE'`, [userId]);
  const r = rows[0];
  return r ? { id: r.id, cycleNumber: r.cycle_number, dailyKcal: r.daily_kcal, proteinG: r.protein_g, carbsG: r.carbs_g, fatG: r.fat_g } : null;
}

let recipeCache: { at: number; recipes: Recipe[] } | null = null;
/** Recipes change only through migrations/seeds, so a short in-process cache is safe. */
export async function listRecipes(): Promise<Recipe[]> {
  if (recipeCache && Date.now() - recipeCache.at < 5 * 60_000) return recipeCache.recipes;
  const { rows } = await pool.query(`SELECT * FROM nutrition.recipes ORDER BY key`);
  const recipes: Recipe[] = rows.map((r) => ({
    key: r.key, dish: r.dish, name: r.name, slot: r.slot, kcal: r.kcal, proteinG: r.protein_g, carbsG: r.carbs_g, fatG: r.fat_g,
    diets: r.diets, allergens: r.allergens, portionGuide: r.portion_guide, isLocal: r.is_local,
  }));
  recipeCache = { at: Date.now(), recipes };
  return recipes;
}

export interface MealEntryRow {
  date: string;
  slotIndex: number;
  recipeKey: string | null;
  eaten: boolean;
  skipped: boolean;
}

export async function listMealEntries(userId: string, fromIso: string, toIso = fromIso, db: Db = pool): Promise<MealEntryRow[]> {
  const { rows } = await db.query(
    `SELECT to_char(entry_date,'YYYY-MM-DD') AS d, slot_index, recipe_key, eaten, skipped FROM nutrition.meal_entries
     WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3`,
    [userId, fromIso, toIso],
  );
  return rows.map((r) => ({ date: r.d, slotIndex: r.slot_index, recipeKey: r.recipe_key, eaten: r.eaten, skipped: r.skipped }));
}

/** Ticking a meal as eaten un-skips it; skipping it un-ticks it. */
export async function upsertMealEntry(userId: string, dateIso: string, slotIndex: number, patch: { recipeKey?: string; eaten?: boolean; skipped?: boolean }, db: Db = pool) {
  const skipped = patch.eaten ? false : patch.skipped;
  const eaten = patch.skipped ? false : patch.eaten;
  await db.query(
    `INSERT INTO nutrition.meal_entries (user_id, entry_date, slot_index, recipe_key, eaten, skipped, updated_at)
     VALUES ($1, $2, $3, $4, COALESCE($5, false), COALESCE($6, false), now())
     ON CONFLICT (user_id, entry_date, slot_index) DO UPDATE SET
       recipe_key = COALESCE($4, nutrition.meal_entries.recipe_key),
       eaten = COALESCE($5, nutrition.meal_entries.eaten),
       skipped = COALESCE($6, nutrition.meal_entries.skipped),
       updated_at = now()`,
    [userId, dateIso, slotIndex, patch.recipeKey ?? null, eaten ?? null, skipped ?? null],
  );
}

/** Daily eaten totals for a date range, for Progress/Today summaries. */
export async function listEatenSlots(userId: string, fromIso: string, toIso: string): Promise<{ date: string; slotIndex: number }[]> {
  const { rows } = await pool.query(
    `SELECT to_char(entry_date,'YYYY-MM-DD') AS d, slot_index FROM nutrition.meal_entries
     WHERE user_id = $1 AND eaten AND entry_date BETWEEN $2 AND $3`,
    [userId, fromIso, toIso],
  );
  return rows.map((r) => ({ date: r.d, slotIndex: r.slot_index }));
}

// ── Food log ──────────────────────────────────────────────────────────────

export interface FoodLogRow {
  id: string;
  date: string;
  slot: MealSlot;
  foodKey: string | null;
  customFoodId: string | null;
  name: string;
  portionLabel: string;
  portionIndex: number | null;
  grams: number | null;
  quantity: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  replacedSlotIndex: number | null;
}

export type NewFoodLog = Omit<FoodLogRow, "id">;

const FOOD_LOG_COLS = `id, to_char(entry_date,'YYYY-MM-DD') AS d, slot, food_key, custom_food_id, name, portion_label, portion_index, grams,
  quantity, kcal, protein_g, carbs_g, fat_g, replaced_slot_index`;

const toFoodLog = (r: Record<string, never>): FoodLogRow => ({
  id: r.id, date: r.d, slot: r.slot, foodKey: r.food_key, customFoodId: r.custom_food_id, name: r.name, portionLabel: r.portion_label,
  portionIndex: r.portion_index, grams: r.grams, quantity: r.quantity, kcal: r.kcal, proteinG: r.protein_g, carbsG: r.carbs_g, fatG: r.fat_g,
  replacedSlotIndex: r.replaced_slot_index,
});

export async function listFoodLogs(userId: string, dateIso: string): Promise<FoodLogRow[]> {
  const { rows } = await pool.query(
    `SELECT ${FOOD_LOG_COLS} FROM nutrition.food_logs WHERE user_id = $1 AND entry_date = $2 ORDER BY created_at`,
    [userId, dateIso],
  );
  return rows.map(toFoodLog);
}

export async function getFoodLog(userId: string, id: string, db: Db = pool): Promise<FoodLogRow | null> {
  const { rows } = await db.query(`SELECT ${FOOD_LOG_COLS} FROM nutrition.food_logs WHERE user_id = $1 AND id = $2`, [userId, id]);
  return rows[0] ? toFoodLog(rows[0]) : null;
}

export async function insertFoodLog(db: Db, userId: string, f: NewFoodLog) {
  await db.query(
    `INSERT INTO nutrition.food_logs
       (user_id, entry_date, slot, food_key, custom_food_id, name, portion_label, portion_index, grams, quantity, kcal, protein_g, carbs_g, fat_g, replaced_slot_index)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [userId, f.date, f.slot, f.foodKey, f.customFoodId, f.name, f.portionLabel, f.portionIndex, f.grams, f.quantity, f.kcal, f.proteinG, f.carbsG, f.fatG, f.replacedSlotIndex],
  );
}

export async function updateFoodLog(db: Db, userId: string, id: string, f: Pick<FoodLogRow, "slot" | "portionLabel" | "portionIndex" | "grams" | "quantity" | "kcal" | "proteinG" | "carbsG" | "fatG">) {
  await db.query(
    `UPDATE nutrition.food_logs SET slot = $3, portion_label = $4, portion_index = $5, grams = $6, quantity = $7, kcal = $8, protein_g = $9, carbs_g = $10, fat_g = $11
     WHERE user_id = $1 AND id = $2`,
    [userId, id, f.slot, f.portionLabel, f.portionIndex, f.grams, f.quantity, f.kcal, f.proteinG, f.carbsG, f.fatG],
  );
}

export async function deleteFoodLog(db: Db, userId: string, id: string) {
  await db.query(`DELETE FROM nutrition.food_logs WHERE user_id = $1 AND id = $2`, [userId, id]);
}

/** Whether any food logged that day still replaces this planned meal. */
export async function slotStillReplaced(db: Db, userId: string, dateIso: string, slotIndex: number): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM nutrition.food_logs WHERE user_id = $1 AND entry_date = $2 AND replaced_slot_index = $3 LIMIT 1`,
    [userId, dateIso, slotIndex],
  );
  return rows.length > 0;
}

/** The last distinct foods and portions logged, newest first, for one-tap re-logging. */
export async function recentFoodLogs(userId: string, limit = 12): Promise<FoodLogRow[]> {
  const { rows } = await pool.query(
    `SELECT * FROM (
       SELECT DISTINCT ON (COALESCE(food_key, custom_food_id::text, name), portion_label) ${FOOD_LOG_COLS}, created_at
       FROM nutrition.food_logs WHERE user_id = $1
       ORDER BY COALESCE(food_key, custom_food_id::text, name), portion_label, created_at DESC
     ) x ORDER BY created_at DESC LIMIT $2`,
    [userId, limit],
  );
  return rows.map(toFoodLog);
}

/** kcal from logged foods per day, for days that have any. */
export async function foodKcalByDay(userId: string, fromIso: string, toIso: string): Promise<Map<string, number>> {
  const { rows } = await pool.query(
    `SELECT to_char(entry_date,'YYYY-MM-DD') AS d, SUM(kcal)::int AS kcal FROM nutrition.food_logs
     WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3 GROUP BY entry_date`,
    [userId, fromIso, toIso],
  );
  return new Map(rows.map((r) => [r.d, r.kcal]));
}

export interface CustomFoodRow { id: string; name: string; kcal: number; proteinG: number; carbsG: number; fatG: number }

const toCustom = (r: Record<string, never>): CustomFoodRow => ({ id: r.id, name: r.name, kcal: r.kcal, proteinG: r.protein_g, carbsG: r.carbs_g, fatG: r.fat_g });

export async function listCustomFoods(userId: string): Promise<CustomFoodRow[]> {
  const { rows } = await pool.query(`SELECT * FROM nutrition.custom_foods WHERE user_id = $1 ORDER BY lower(name)`, [userId]);
  return rows.map(toCustom);
}

export async function getCustomFood(userId: string, id: string): Promise<CustomFoodRow | null> {
  const { rows } = await pool.query(`SELECT * FROM nutrition.custom_foods WHERE user_id = $1 AND id = $2`, [userId, id]);
  return rows[0] ? toCustom(rows[0]) : null;
}

/** Saves a quick-add food; the same name again updates its numbers. */
export async function upsertCustomFood(db: Db, userId: string, f: Omit<CustomFoodRow, "id">): Promise<CustomFoodRow> {
  const { rows } = await db.query(
    `INSERT INTO nutrition.custom_foods (user_id, name, kcal, protein_g, carbs_g, fat_g) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (user_id, lower(name)) DO UPDATE SET name = EXCLUDED.name, kcal = EXCLUDED.kcal,
       protein_g = EXCLUDED.protein_g, carbs_g = EXCLUDED.carbs_g, fat_g = EXCLUDED.fat_g
     RETURNING *`,
    [userId, f.name, f.kcal, f.proteinG, f.carbsG, f.fatG],
  );
  return toCustom(rows[0]);
}

export async function deleteCustomFood(userId: string, id: string) {
  await pool.query(`DELETE FROM nutrition.custom_foods WHERE user_id = $1 AND id = $2`, [userId, id]);
}

// ── Water ─────────────────────────────────────────────────────────────────

export async function getWaterMl(userId: string, dateIso: string): Promise<number> {
  const { rows } = await pool.query(`SELECT ml FROM nutrition.water_days WHERE user_id = $1 AND entry_date = $2`, [userId, dateIso]);
  return rows[0]?.ml ?? 0;
}

export async function setWaterMl(userId: string, dateIso: string, ml: number) {
  await pool.query(
    `INSERT INTO nutrition.water_days (user_id, entry_date, ml) VALUES ($1,$2,$3)
     ON CONFLICT (user_id, entry_date) DO UPDATE SET ml = EXCLUDED.ml, updated_at = now()`,
    [userId, dateIso, ml],
  );
}
