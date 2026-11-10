import { pool } from "../../shared/db/pool.js";
import { badInput, notFound } from "../../shared/errors.js";
import {
  MEAL_SLOTS, addDaysIso, menuFor, sessionOnDate, swapOptions, type DayMenu, type DietInput, type MealSlot, type Recipe,
} from "../planning/engine/index.js";
import { foodByKey, foodNumbers, waterInWords, waterTargetMl } from "../planning/engine/foods.js";
import { getActiveProgram, getIntake, listActiveSessions, listScheduleSwaps } from "../planning/planning.repository.js";
import {
  deleteFoodLog, foodKcalByDay, getActiveNutritionPlan, getCustomFood, getDietaryProfile, getFoodLog, getWaterMl, insertFoodLog,
  listCustomFoods, listFoodLogs, listMealEntries, listRecipes, recentFoodLogs, setWaterMl, slotStillReplaced, updateFoodLog,
  upsertCustomFood, upsertMealEntry, type CustomFoodRow, type FoodLogRow, type MealEntryRow, type NewFoodLog, type NutritionPlanRow,
} from "./nutrition.repository.js";

export interface DayTotals { kcal: number; proteinG: number; carbsG: number; fatG: number }

export interface MealDay extends DayMenu {
  targets: DayTotals;
  items: (DayMenu["items"][number] & { eaten: boolean; skipped: boolean })[];
  /** Foods logged on top of (or instead of) the plan. */
  foods: FoodLogRow[];
  water: { ml: number; targetMl: number; targetText: string };
  /** Ticked planned meals that weren't replaced, plus logged foods. */
  eaten: DayTotals;
}

async function context(userId: string) {
  const [diet, plan, recipes] = await Promise.all([getDietaryProfile(userId), getActiveNutritionPlan(userId), listRecipes()]);
  if (!diet || !plan) throw notFound("No nutrition plan yet. Finish onboarding first.");
  return { diet, plan, recipes };
}

function menuWith(dateIso: string, entries: MealEntryRow[], diet: DietInput, plan: NutritionPlanRow, recipes: Recipe[]) {
  const overrides: Record<number, string> = {};
  for (const e of entries) if (e.recipeKey) overrides[e.slotIndex] = e.recipeKey;
  const menu = menuFor(dateIso, diet, { kcal: plan.dailyKcal, proteinG: plan.proteinG }, overrides, recipes);
  const bySlot = new Map(entries.map((e) => [e.slotIndex, e]));
  return { ...menu, items: menu.items.map((it) => ({ ...it, eaten: !!bySlot.get(it.slotIndex)?.eaten, skipped: !!bySlot.get(it.slotIndex)?.skipped })) };
}

const sum = (xs: DayTotals[]): DayTotals => xs.reduce(
  (a, x) => ({ kcal: a.kcal + x.kcal, proteinG: a.proteinG + x.proteinG, carbsG: a.carbsG + x.carbsG, fatG: a.fatG + x.fatG }),
  { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
);

/** ~35 ml/kg, more on days with a session. */
async function waterTarget(userId: string, dateIso: string) {
  const [intake, program] = await Promise.all([getIntake(userId), getActiveProgram(userId)]);
  let trainingDay = false;
  if (program && dateIso >= program.startDate && dateIso <= program.endDate) {
    const [sessions, swaps] = await Promise.all([listActiveSessions(program.id), listScheduleSwaps(program.id)]);
    trainingDay = !!sessionOnDate(sessions, swaps, dateIso);
  }
  const targetMl = waterTargetMl(intake?.training.weightKg ?? 70, trainingDay);
  return { targetMl, targetText: waterInWords(targetMl) };
}

export async function getMealDay(userId: string, dateIso: string): Promise<MealDay> {
  const { diet, plan, recipes } = await context(userId);
  const [entries, foods, ml, target] = await Promise.all([
    listMealEntries(userId, dateIso), listFoodLogs(userId, dateIso), getWaterMl(userId, dateIso), waterTarget(userId, dateIso),
  ]);
  const menu = menuWith(dateIso, entries, diet, plan, recipes);
  return {
    ...menu,
    targets: { kcal: plan.dailyKcal, proteinG: plan.proteinG, carbsG: plan.carbsG, fatG: plan.fatG },
    foods,
    water: { ml, ...target },
    eaten: sum([...menu.items.filter((it) => it.eaten && !it.skipped), ...foods]),
  };
}

function checkSlot(slotIndex: number, slots: number) {
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= slots) throw badInput("That meal slot doesn't exist for your plan.");
}

export async function setMealEaten(userId: string, dateIso: string, slotIndex: number, eaten: boolean): Promise<MealDay> {
  const { diet } = await context(userId);
  checkSlot(slotIndex, MEAL_SLOTS[diet.mealPattern].length);
  await upsertMealEntry(userId, dateIso, slotIndex, { eaten });
  return getMealDay(userId, dateIso);
}

export async function getSwapOptions(userId: string, dateIso: string, slotIndex: number): Promise<Recipe[]> {
  const { diet, recipes } = await context(userId);
  const slots = MEAL_SLOTS[diet.mealPattern];
  checkSlot(slotIndex, slots.length);
  return swapOptions(slots[slotIndex], diet, recipes);
}

export async function swapMeal(userId: string, dateIso: string, slotIndex: number, recipeKey: string): Promise<MealDay> {
  const options = await getSwapOptions(userId, dateIso, slotIndex);
  if (!options.some((r) => r.key === recipeKey)) throw badInput("That meal doesn't fit this slot or your diet.");
  await upsertMealEntry(userId, dateIso, slotIndex, { recipeKey });
  return getMealDay(userId, dateIso);
}

// ── Food log ──────────────────────────────────────────────────────────────

const SLOTS: MealSlot[] = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"];

/** Today (with a day's slack for time zones) and the week before it. */
function checkLoggable(dateIso: string) {
  const today = new Date().toISOString().slice(0, 10);
  if (dateIso > addDaysIso(today, 1)) throw badInput("You can't log food for a day that hasn't happened yet.");
  if (dateIso < addDaysIso(today, -8)) throw badInput("Food can only be logged for the past week.");
}

export interface CustomFoodInput { name: string; kcal: number; proteinG?: number | null; carbsG?: number | null; fatG?: number | null }

export interface LogFoodInput {
  date: string;
  slot: MealSlot;
  /** One of: a food from the list (with a portion or grams), a saved food, or a new quick-add food. */
  foodKey?: string | null;
  portionIndex?: number | null;
  grams?: number | null;
  customFoodId?: string | null;
  custom?: CustomFoodInput | null;
  quantity: number;
  /** The planned meal this was eaten instead of. */
  insteadOfSlotIndex?: number | null;
}

type Amount = Pick<LogFoodInput, "portionIndex" | "grams" | "quantity">;

function checkAmount(a: Amount) {
  if (!(a.quantity > 0 && a.quantity <= 10)) throw badInput("Pick an amount between ¼ and 10.", [{ field: "quantity", message: "Out of range." }]);
  if (a.grams != null && !(Number.isInteger(a.grams) && a.grams >= 1 && a.grams <= 5000)) {
    throw badInput("Enter a weight between 1 and 5,000 g.", [{ field: "grams", message: "Out of range." }]);
  }
}

/** Name, portion and numbers for a food from the list. */
function fromList(foodKey: string, a: Amount) {
  const food = foodByKey(foodKey);
  if (!food) throw badInput("That food isn't in the list.");
  const unit = food.liquid ? "ml" : "g";
  if (a.grams != null) {
    const n = foodNumbers(food, 0, 1, a.grams);
    return { foodKey, name: food.name, portionLabel: `${a.grams} ${unit}`, portionIndex: null, grams: a.grams, quantity: 1, kcal: n.kcal, proteinG: n.proteinG, carbsG: n.carbsG, fatG: n.fatG };
  }
  const portion = a.portionIndex != null ? food.portions[a.portionIndex] : undefined;
  if (!portion) throw badInput("Pick a portion.", [{ field: "portionIndex", message: "Unknown portion." }]);
  const n = foodNumbers(food, a.portionIndex!, a.quantity);
  return {
    foodKey, name: food.name, portionLabel: `${portion.label} (${portion.g} ${unit})`, portionIndex: a.portionIndex!, grams: null,
    quantity: a.quantity, kcal: n.kcal, proteinG: n.proteinG, carbsG: n.carbsG, fatG: n.fatG,
  };
}

/** A saved food is one serving; the numbers scale with the quantity. */
function fromCustom(c: Pick<CustomFoodRow, "name" | "kcal" | "proteinG" | "carbsG" | "fatG">, quantity: number) {
  const x = (n: number) => Math.round(n * quantity);
  return { name: c.name, portionLabel: "1 serving", portionIndex: null, grams: null, quantity, kcal: x(c.kcal), proteinG: x(c.proteinG), carbsG: x(c.carbsG), fatG: x(c.fatG) };
}

function checkCustom(c: CustomFoodInput): Omit<CustomFoodRow, "id"> {
  const name = c.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) throw badInput("Give the food a name (2 to 80 characters).", [{ field: "name", message: "Required." }]);
  const int = (v: number | null | undefined, max: number, field: string) => {
    const n = v ?? 0;
    if (!Number.isFinite(n) || n < 0 || n > max) throw badInput(`Enter 0 to ${max.toLocaleString("en-GB")} for ${field}.`, [{ field, message: "Out of range." }]);
    return Math.round(n);
  };
  return { name, kcal: int(c.kcal, 5000, "kcal"), proteinG: int(c.proteinG, 500, "proteinG"), carbsG: int(c.carbsG, 1000, "carbsG"), fatG: int(c.fatG, 500, "fatG") };
}

export async function logFood(userId: string, input: LogFoodInput): Promise<MealDay> {
  checkLoggable(input.date);
  if (!SLOTS.includes(input.slot)) throw badInput("Pick breakfast, lunch, dinner or a snack.");
  checkAmount(input);
  const { diet } = await context(userId);
  if (input.insteadOfSlotIndex != null) checkSlot(input.insteadOfSlotIndex, MEAL_SLOTS[diet.mealPattern].length);

  let saved: CustomFoodRow | null = null;
  if (!input.foodKey && input.customFoodId) {
    saved = await getCustomFood(userId, input.customFoodId);
    if (!saved) throw notFound("That saved food no longer exists.");
  }
  const custom = !input.foodKey && !saved && input.custom ? checkCustom(input.custom) : null;
  if (!input.foodKey && !saved && !custom) throw badInput("Pick a food, or add your own.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (custom) saved = await upsertCustomFood(client, userId, custom);
    const base = input.foodKey ? fromList(input.foodKey, input) : { foodKey: null, ...fromCustom(saved!, input.quantity) };
    const row: NewFoodLog = { ...base, date: input.date, slot: input.slot, customFoodId: saved?.id ?? null, replacedSlotIndex: input.insteadOfSlotIndex ?? null };
    await insertFoodLog(client, userId, row);
    if (input.insteadOfSlotIndex != null) await upsertMealEntry(userId, input.date, input.insteadOfSlotIndex, { skipped: true }, client);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return getMealDay(userId, input.date);
}

export interface FoodLogChange { slot: MealSlot; portionIndex?: number | null; grams?: number | null; quantity: number }

export async function changeFoodLog(userId: string, id: string, change: FoodLogChange): Promise<MealDay> {
  const row = await getFoodLog(userId, id);
  if (!row) throw notFound("That food entry no longer exists.");
  if (!SLOTS.includes(change.slot)) throw badInput("Pick breakfast, lunch, dinner or a snack.");
  checkAmount(change);
  const perServing = (n: number) => n / row.quantity;
  const next = row.foodKey
    ? fromList(row.foodKey, change)
    : fromCustom({ name: row.name, kcal: perServing(row.kcal), proteinG: perServing(row.proteinG), carbsG: perServing(row.carbsG), fatG: perServing(row.fatG) }, change.quantity);
  await updateFoodLog(pool, userId, id, { ...next, slot: change.slot });
  return getMealDay(userId, row.date);
}

/** Removing the food that replaced a planned meal brings that meal back. */
export async function removeFoodLog(userId: string, id: string): Promise<MealDay> {
  const row = await getFoodLog(userId, id);
  if (!row) throw notFound("That food entry no longer exists.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await deleteFoodLog(client, userId, id);
    if (row.replacedSlotIndex != null && !(await slotStillReplaced(client, userId, row.date, row.replacedSlotIndex))) {
      await upsertMealEntry(userId, row.date, row.replacedSlotIndex, { skipped: false }, client);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return getMealDay(userId, row.date);
}

export async function getMyFoods(userId: string) {
  const [custom, recent] = await Promise.all([listCustomFoods(userId), recentFoodLogs(userId)]);
  // A saved food that was deleted can't be re-logged from Recent.
  return { custom, recent: recent.filter((r) => r.foodKey || r.customFoodId) };
}

export async function setWater(userId: string, dateIso: string, ml: number): Promise<MealDay> {
  checkLoggable(dateIso);
  if (!Number.isInteger(ml) || ml < 0 || ml > 10000) throw badInput("Enter 0 to 10,000 ml.", [{ field: "ml", message: "Out of range." }]);
  await setWaterMl(userId, dateIso, ml);
  return getMealDay(userId, dateIso);
}

/**
 * Calories eaten on each day from `from` to `to` (0 when nothing was logged),
 * for the week-6 check-in. Planned meals count at the current plan's portions.
 */
export async function eatenKcalByDay(userId: string, fromIso: string, toIso: string): Promise<number[]> {
  const { diet, plan, recipes } = await context(userId);
  const [entries, foods] = await Promise.all([listMealEntries(userId, fromIso, toIso), foodKcalByDay(userId, fromIso, toIso)]);
  const out: number[] = [];
  for (let d = fromIso; d <= toIso; d = addDaysIso(d, 1)) {
    const day = entries.filter((e) => e.date === d);
    const planned = day.some((e) => e.eaten && !e.skipped)
      ? menuWith(d, day, diet, plan, recipes).items.filter((it) => it.eaten && !it.skipped).reduce((a, it) => a + it.kcal, 0)
      : 0;
    out.push(planned + (foods.get(d) ?? 0));
  }
  return out;
}

// ── Read by other modules (Clubs challenges) ─────────────────────────────

/** Foods the user logged on a day. */
export const foodLogsOn = (userId: string, dateIso: string) => listFoodLogs(userId, dateIso);

/** The day's total logged water, in ml. */
export const waterOn = (userId: string, dateIso: string) => getWaterMl(userId, dateIso);
