import { badInput, notFound } from "../../shared/errors.js";
import { MEAL_SLOTS, menuFor, swapOptions, type DayMenu, type Recipe } from "../planning/engine/index.js";
import {
  getActiveNutritionPlan, getDietaryProfile, listMealEntries, listRecipes, upsertMealEntry,
} from "./nutrition.repository.js";

export interface MealDay extends DayMenu {
  targets: { kcal: number; proteinG: number; carbsG: number; fatG: number };
  items: (DayMenu["items"][number] & { eaten: boolean })[];
}

async function context(userId: string) {
  const [diet, plan, recipes] = await Promise.all([getDietaryProfile(userId), getActiveNutritionPlan(userId), listRecipes()]);
  if (!diet || !plan) throw notFound("No nutrition plan yet. Finish onboarding first.");
  return { diet, plan, recipes };
}

export async function getMealDay(userId: string, dateIso: string): Promise<MealDay> {
  const { diet, plan, recipes } = await context(userId);
  const entries = await listMealEntries(userId, dateIso);
  const overrides: Record<number, string> = {};
  for (const e of entries) if (e.recipeKey) overrides[e.slotIndex] = e.recipeKey;
  const menu = menuFor(dateIso, diet, { kcal: plan.dailyKcal, proteinG: plan.proteinG }, overrides, recipes);
  const eaten = new Set(entries.filter((e) => e.eaten).map((e) => e.slotIndex));
  return {
    ...menu,
    targets: { kcal: plan.dailyKcal, proteinG: plan.proteinG, carbsG: plan.carbsG, fatG: plan.fatG },
    items: menu.items.map((it) => ({ ...it, eaten: eaten.has(it.slotIndex) })),
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
