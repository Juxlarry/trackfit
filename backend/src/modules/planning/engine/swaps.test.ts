import { test } from "node:test";
import assert from "node:assert/strict";
import { ALTERNATES, CORE, POOL, allGeneratorExercises, exerciseSwapOptions, familyOf, swapEquipment, swapFilters, type SwapContext } from "./index.js";

const ctx = (o: Partial<SwapContext> = {}): SwapContext => ({ equipment: "FULL_GYM", injuries: [], liftComfort: "SOLID", sessionExercises: [], planExercises: [], ...o });
const names = (name: string, o?: Partial<SwapContext>) => exerciseSwapOptions(name, ctx(o)).map((x) => x.name);

test("every exercise the plan can give has a family", () => {
  const all = [...allGeneratorExercises(), ...Object.values(ALTERNATES).flatMap((m) => Object.values(m).flat())];
  assert.deepEqual(all.filter((n) => !familyOf(n)), []);
});

test("options keep the family: a leg curl never becomes a squat, a fly never a press", () => {
  for (const n of names("Lying leg curl")) assert.equal(familyOf(n), "hinge", n);
  for (const n of names("Cable fly")) assert.equal(familyOf(n), "chestFly", n);
  assert.ok(!names("Back squat").includes("Leg extension") || familyOf("Leg extension") === "squat");
  assert.ok(names("Dead bug").every((n) => familyOf(n) === "core"));
});

test("same movement first, then the rest, at most 6, with a reason", () => {
  const o = exerciseSwapOptions("Bench press", ctx());
  assert.ok(o.length <= 6 && o.length >= 3);
  assert.equal(o[0].sameMovement, true);
  assert.match(o[0].reason, /Same movement, dumbbells instead of a barbell/);
  const firstOther = o.findIndex((x) => !x.sameMovement);
  assert.ok(firstOther === -1 || o.slice(firstOther).every((x) => !x.sameMovement));
});

test("equipment: only what the member has, narrowed for the day", () => {
  assert.ok(names("DB bench press", { equipment: "DUMBBELLS" }).every((n) => ["Dumbbell", "Bodyweight"].includes(swapEquipment(n))));
  assert.ok(names("Push-up", { equipment: "BODYWEIGHT" }).every((n) => swapEquipment(n) === "Bodyweight"));
  assert.ok(names("Band chest press", { equipment: "BODYWEIGHT" }).every((n) => swapEquipment(n) === "Bodyweight"), "bodyweight members get no band options");
  assert.ok(names("Bench press", { only: "BODYWEIGHT" }).every((n) => swapEquipment(n) === "Bodyweight"));
  assert.ok(names("Bench press", { only: "DUMBBELLS" }).length > 0);
  assert.deepEqual(swapFilters("FULL_GYM"), ["ANY", "DUMBBELLS", "BODYWEIGHT"]);
  assert.deepEqual(swapFilters("DUMBBELLS"), ["ANY", "BODYWEIGHT"]);
  assert.deepEqual(swapFilters("BODYWEIGHT"), ["ANY"]);
  // A small gym gets machines only if the plan already uses that one.
  assert.ok(!names("Bench press", { equipment: "SMALL_GYM" }).includes("Machine chest press"));
  assert.ok(names("Bench press", { equipment: "SMALL_GYM", planExercises: ["Machine chest press"] }).includes("Machine chest press"));
});

test("injuries, lift comfort and the session rule options out", () => {
  assert.ok(!names("Leg press", { injuries: ["KNEE"] }).includes("Back squat"), "the knee swap list is never offered");
  assert.ok(names("Leg press").includes("Back squat"));
  assert.ok(!names("Leg press", { liftComfort: "AVOID" }).includes("Back squat"));
  assert.ok(!names("Bench press", { sessionExercises: ["Bench press", "Incline DB press"] }).includes("Incline DB press"));
});

test("every planned exercise has an option with the equipment it was planned for", () => {
  const cls = { FULL_GYM: "gym", SMALL_GYM: "gym", HOME_GYM: "db", DUMBBELLS: "db", BANDS: "bw" } as const;
  for (const [eq, c] of Object.entries(cls)) {
    const planned = [...new Set([...Object.values(POOL[c]).flat(), ...CORE[c]])];
    const none = planned.filter((p) => exerciseSwapOptions(p, ctx({ equipment: eq as SwapContext["equipment"], sessionExercises: [p], planExercises: planned })).length === 0);
    assert.deepEqual(none, [], eq);
  }
});

test("names from the original library match whatever their case", () => {
  assert.equal(familyOf("Lat Pulldown"), "verticalPull");
  assert.equal(swapEquipment("Hammer Curl"), "Dumbbell");
  assert.ok(exerciseSwapOptions("Lat Pulldown", ctx()).length > 0);
  assert.ok(!names("Leg Press", { injuries: ["KNEE"] }).includes("Back squat"));
  assert.ok(!names("Bench Press").map((n) => n.toLowerCase()).includes("bench press"), "never itself");
});
