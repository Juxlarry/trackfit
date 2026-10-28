import type { PoolClient } from "pg";
import { pool } from "../../shared/db/pool.js";
import type { DietInput, Recipe, Targets } from "../planning/engine/index.js";

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
  slotIndex: number;
  recipeKey: string | null;
  eaten: boolean;
}

export async function listMealEntries(userId: string, dateIso: string): Promise<MealEntryRow[]> {
  const { rows } = await pool.query(
    `SELECT slot_index, recipe_key, eaten FROM nutrition.meal_entries WHERE user_id = $1 AND entry_date = $2`,
    [userId, dateIso],
  );
  return rows.map((r) => ({ slotIndex: r.slot_index, recipeKey: r.recipe_key, eaten: r.eaten }));
}

export async function upsertMealEntry(userId: string, dateIso: string, slotIndex: number, patch: { recipeKey?: string; eaten?: boolean }) {
  await pool.query(
    `INSERT INTO nutrition.meal_entries (user_id, entry_date, slot_index, recipe_key, eaten, updated_at)
     VALUES ($1, $2, $3, $4, COALESCE($5, false), now())
     ON CONFLICT (user_id, entry_date, slot_index) DO UPDATE SET
       recipe_key = COALESCE($4, nutrition.meal_entries.recipe_key),
       eaten = COALESCE($5, nutrition.meal_entries.eaten),
       updated_at = now()`,
    [userId, dateIso, slotIndex, patch.recipeKey ?? null, patch.eaten ?? null],
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
