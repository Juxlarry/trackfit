import { test } from "node:test";
import assert from "node:assert/strict";
import { FOODS, eatingFromLog, foodByKey, foodNumbers, searchFoods, waterInWords, waterTargetMl } from "./foods.js";

test("food list: unique keys, portions, and macros that add up to the calories", () => {
  assert.equal(new Set(FOODS.map((f) => f.key)).size, FOODS.length);
  for (const f of FOODS) {
    assert.ok(f.portions.length > 0 && f.portions.every((p) => p.g > 0), `${f.key} portions`);
    const [kcal, p, c, fat] = f.per100;
    const fromMacros = 4 * p + 4 * c + 9 * fat;
    // Alcohol has calories without macros; fibre and rounding explain the rest.
    if (["beer", "stout", "palm-wine", "wine", "spirits"].includes(f.key)) assert.ok(fromMacros <= kcal, f.key);
    else assert.ok(Math.abs(fromMacros - kcal) <= Math.max(12, kcal * 0.15), `${f.key}: ${kcal} kcal vs ${fromMacros.toFixed(0)} from macros`);
  }
});

test("foodNumbers scales a portion, a quantity, or grams", () => {
  const jollof = foodByKey("jollof-rice")!;
  assert.deepEqual(foodNumbers(jollof, 2, 1), { kcal: 578, proteinG: 11, carbsG: 98, fatG: 16, grams: 350 });
  assert.equal(foodNumbers(jollof, 2, 1.5).grams, 525);
  assert.equal(foodNumbers(jollof, 0, 1, 100).kcal, 165);
});

test("search: Ghanaian foods and local names come first", () => {
  assert.equal(searchFoods("jollof", FOODS)[0].key, "jollof-rice");
  assert.equal(searchFoods("rice", FOODS)[0].key, "plain-rice");
  assert.equal(searchFoods("bissap", FOODS)[0].key, "sobolo");
  assert.equal(searchFoods("coke", FOODS)[0].key, "soft-drink");
  assert.equal(searchFoods("TZ", FOODS)[0].key, "tz");
  assert.ok(searchFoods("fried chi", FOODS).some((f) => f.key === "chicken-fried"));
  assert.deepEqual(searchFoods("   ", FOODS), []);
  assert.deepEqual(searchFoods("zzzz", FOODS), []);
});

test("water: target from body weight and training, described in bottles and sachets", () => {
  assert.equal(waterTargetMl(80, false), 2750);
  assert.equal(waterTargetMl(80, true), 3250);
  assert.equal(waterTargetMl(30, false), 1500);
  assert.equal(waterTargetMl(160, false), 4000);
  assert.equal(waterInWords(3000), "About 2 large Voltic or Bel-Aqua bottles (1.5 L), or 6 sachets of pure water.");
  assert.equal(waterInWords(750), "About 1 medium Voltic or Bel-Aqua bottle (750 ml), or 1½ sachets of pure water.");
});

test("eating log: suggests a check-in answer only when at least half the days were logged", () => {
  const target = 2000;
  const days = (on: number, off: number, none: number) => [...Array(on).fill(2050), ...Array(off).fill(2600), ...Array(none).fill(0)];
  assert.deepEqual(eatingFromLog(days(30, 6, 6), target, 42), { loggedDays: 36, onTargetDays: 30, suggested: "MOST_DAYS" });
  assert.equal(eatingFromLog(days(12, 12, 18), target, 42).suggested, "SOME_DAYS");
  assert.equal(eatingFromLog(days(5, 20, 17), target, 42).suggested, "HARD");
  assert.equal(eatingFromLog(days(10, 5, 27), target, 42).suggested, null);
});
