/**
 * API integration tests against a real Postgres database.
 *
 *   TEST_DATABASE_URL=postgresql://.../trackfit_test npm run test:integration
 *
 * The database is dropped and rebuilt from sql/*.sql (via scripts/migrate.ts)
 * so this also proves a fresh install migrates cleanly.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import pg from "pg";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (!TEST_DB) throw new Error("Set TEST_DATABASE_URL to run integration tests.");
process.env.DATABASE_URL = TEST_DB;
process.env.DEV_AUTH_BYPASS = "true";

// Recreate the database before any module opens a pool.
{
  const url = new URL(TEST_DB);
  const dbName = url.pathname.slice(1);
  url.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: url.toString() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();
  execFileSync("npx", ["tsx", "scripts/migrate.ts"], { env: { ...process.env, DATABASE_URL: TEST_DB }, stdio: "pipe" });
}

const { ApolloServer } = await import("@apollo/server");
const { typeDefs, resolvers } = await import("./graphql/schema.js");
const { pool } = await import("./shared/db/pool.js");
const { ConsoleMailer, setMailer } = await import("./shared/email/mailer.js");
const { findUserById } = await import("./modules/identity/identity.repository.js");
const { addDaysIso, mondayOf, swapIssue, toIsoDate, weekTypes, weekdayOf } = await import("./modules/planning/engine/index.js");

const mailer = new ConsoleMailer();
setMailer(mailer);
const server = new ApolloServer({ typeDefs, resolvers });
before(async () => { await server.start(); });
after(async () => { await server.stop(); await pool.end(); });

const today = toIsoDate(new Date());
const tomorrow = addDaysIso(today, 1);

async function gql<T = any>(query: string, variables: Record<string, unknown> = {}, userId?: string, auth: unknown = null): Promise<{ data: T; errors?: any[] }> {
  const user = userId ? await findUserById(userId) : null;
  const res = await server.executeOperation({ query, variables }, { contextValue: { user, auth } });
  assert.equal(res.body.kind, "single");
  const single = (res.body as any).singleResult;
  // GraphQL results use null-prototype objects; normalise so deepEqual compares values only.
  return { data: single.data ? JSON.parse(JSON.stringify(single.data)) : single.data, errors: single.errors };
}
async function ok<T = any>(query: string, variables: Record<string, unknown> = {}, userId?: string, auth: unknown = null): Promise<T> {
  const r = await gql<T>(query, variables, userId, auth);
  assert.equal(r.errors, undefined, JSON.stringify(r.errors));
  return r.data;
}
async function newUser(name = "Jay"): Promise<string> {
  const d = await ok(`mutation($n:String!){ devCreateUser(displayName:$n){ id } }`, { n: name });
  return d.devCreateUser.id;
}

const screeningClear = { heartCondition: false, highBloodPressure: false, diabetes: false, pregnant: false, recentSurgeryOrInjury: false, chestPainOrDizziness: false, under18: false };
const training = {
  sex: "MALE", age: 30, heightCm: 168, weightKg: 81.2, bodyFatLevel: 2, goal: "LOSE_FAT", targetWeightKg: 71, pace: "MODERATE",
  experience: "SOME", liftComfort: "LEARNING", equipment: "FULL_GYM", availableDays: [0, 1, 2, 3, 4], daysPerWeek: 4, sessionMinutes: 60,
  split: "AUTO", fullBodyDay: true, priorityMuscles: ["CORE"], injuries: ["KNEE"], activityLevel: "DESK", sleepHours: 6.5,
  sleepQuality: "VARIES", trainTime: "EVENING", busyness: "PACKED", warmup: true, cardioLikes: ["football", "walk"], blockers: ["TIME"],
  motivations: ["health"], injuryNote: "old ACL", cardioFrequency: "some", energy: "depends",
};
const diet = {
  pattern: "OMNIVORE", allergies: [], dislikes: "okro", favouriteDishes: ["jollof", "waakye", "banku", "oats"], mealPattern: "TWO_PLUS_SNACK",
  prep: "BATCH_FEW_DAYS", fasting: "NO", struggles: ["WEEKENDS"], calorieAwareness: "noidea", proteinAwareness: "noidea",
};
const PLAN_FIELDS = `programId cycleNumber startDate endDate onboardingDays daysPerWeek splitLabel dayRange{min max}
  targets{kcal proteinG} projection{weeks endDate}
  sessions{ templateId weekday name warmup{name} exercises{ exerciseId name pattern sets reps isCore swapped replaces suggestedLoadKg } }
  restDays{weekday suggestion} adaptations{icon text} profile{ goal startWeightKg reminderTime mealPattern favouriteDishes }`;
const ONBOARD = `mutation($i:OnboardingInput!){ completeOnboarding(input:$i){ screenedOut message plan{ ${PLAN_FIELDS} } } }`;

test("previewPlan works without signing in and validates answers", async () => {
  const d = await ok(`query($t:TrainingIntakeInput!,$d:DietIntakeInput!,$s:String!){ previewPlan(training:$t,diet:$d,startDate:$s){ splitLabel daysPerWeek sessions{name weekday} sampleMenu{items{name kcal}} dayRange{min max} } }`,
    { t: training, d: diet, s: today });
  assert.equal(d.previewPlan.daysPerWeek, 4);
  assert.equal(d.previewPlan.splitLabel, "Upper / Lower / Full body");
  assert.equal(d.previewPlan.sampleMenu.items.length, 3);
  const bad = await gql(`query($t:TrainingIntakeInput!,$d:DietIntakeInput!,$s:String!){ previewPlan(training:$t,diet:$d,startDate:$s){ daysPerWeek } }`,
    { t: { ...training, age: 16 }, d: diet, s: today });
  assert.equal(bad.errors?.[0].extensions.code, "BAD_USER_INPUT");
  assert.ok(bad.errors?.[0].extensions.issues.some((x: any) => x.field === "age"));
});

test("health gate blocks generation", async () => {
  const id = await newUser("Gated");
  const d = await ok(ONBOARD, { i: { screening: { ...screeningClear, diabetes: true }, training, diet, startDate: today } }, id);
  assert.equal(d.completeOnboarding.screenedOut, true);
  assert.equal(d.completeOnboarding.plan, null);
  const mine = await ok(`{ myPlan { programId } }`, {}, id);
  assert.equal(mine.myPlan, null);
  const { rows } = await pool.query(`SELECT screened_out FROM identity.health_screenings WHERE user_id = $1`, [id]);
  assert.equal(rows[0].screened_out, true);
});

let jay = "";
test("completeOnboarding generates and saves the plan, then emails", async () => {
  jay = await newUser("TrackFit User");
  mailer.sent.length = 0;
  const d = await ok(ONBOARD, { i: { displayName: "Jay Danso", email: "jay@example.com", screening: screeningClear, training, diet, mindset: { likertConsistency: 4, support: "both" }, startDate: tomorrow } }, jay,
    { emailVerified: false, signInProvider: "password" });
  const plan = d.completeOnboarding.plan;
  assert.equal(plan.cycleNumber, 1);
  assert.equal(plan.startDate, tomorrow);
  assert.deepEqual(plan.dayRange, { min: 3, max: 5 });
  assert.equal(plan.sessions.length, 4);
  assert.equal(plan.sessions[3].name, "Full body", "full-body-day toggle applied");
  for (const s of plan.sessions) {
    assert.ok(s.templateId);
    assert.equal(s.warmup.length, 4);
    assert.ok(s.exercises.every((e: any) => e.exerciseId), "every exercise is linked to the library");
    assert.ok(s.exercises.filter((e: any) => e.isCore).length >= 2, "core priority adds a second core move");
  }
  assert.ok(plan.sessions.some((s: any) => s.exercises.some((e: any) => e.replaces === "Back squat" && e.name === "Box squat to bench")));
  assert.equal(plan.restDays.length, 3);
  assert.equal(plan.profile.mealPattern, "TWO_PLUS_SNACK");
  const me = await ok(`{ me { displayName email } }`, {}, jay);
  assert.equal(me.me.displayName, "Jay Danso");
  assert.equal(me.me.email, "jay@example.com");
  assert.equal(mailer.sent.length, 1);
  assert.match(mailer.sent[0].subject, /Jay, your TrackFit plan is ready/);
  assert.match(mailer.sent[0].text, /You start tomorrow/);
  assert.match(mailer.sent[0].text, /Confirm and open my plan/);
});

test("±1 training days: regenerates the week and calories, rejects out of range", async () => {
  const before = await ok(`{ myPlan { daysPerWeek targets { kcal } sessions { templateId } } }`, {}, jay);
  const up = await ok(`mutation{ setTrainingDays(days:5){ daysPerWeek splitLabel targets{kcal} sessions{ name templateId } } }`, {}, jay);
  assert.equal(up.setTrainingDays.daysPerWeek, 5);
  assert.equal(up.setTrainingDays.sessions.length, 5);
  assert.ok(up.setTrainingDays.targets.kcal > before.myPlan.targets.kcal);
  assert.ok(!up.setTrainingDays.sessions.some((s: any) => before.myPlan.sessions.some((b: any) => b.templateId === s.templateId)), "new templates");
  const tooMany = await gql(`mutation{ setTrainingDays(days:6){ daysPerWeek } }`, {}, jay);
  assert.equal(tooMany.errors?.[0].extensions.code, "BAD_USER_INPUT");
  assert.match(tooMany.errors?.[0].message, /3 to 5 days/);
  const down = await ok(`mutation{ setTrainingDays(days:3){ daysPerWeek sessions{ name } } }`, {}, jay);
  assert.equal(down.setTrainingDays.sessions.length, 3);
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM tracking.workout_templates WHERE user_id = $1 AND is_generated AND is_active`, [jay]);
  assert.equal(rows[0].n, 3, "old templates deactivated, not deleted");
});

test("weekly day swaps reorder this week only, within limits", async (t) => {
  const id = await newUser("Swapper");
  const sixDays = { ...training, availableDays: [0, 1, 2, 3, 4, 5, 6], daysPerWeek: 6, split: "MUSCLE_FOCUS", fullBodyDay: false, lowPriorityMuscles: ["ARMS"] };
  await ok(ONBOARD, { i: { screening: screeningClear, training: sixDays, diet, startDate: today } }, id);
  const plan = (await ok(`{ myPlan { sessions { weekday type } scheduleSwaps { weekStart } profile { lowPriorityMuscles } } }`, {}, id)).myPlan;
  assert.deepEqual(plan.profile.lowPriorityMuscles, ["ARMS"]);
  assert.deepEqual(plan.scheduleSwaps, []);

  const SWAP = `mutation($a:String!,$b:String!){ swapSessionDays(dateA:$a,dateB:$b){ scheduleSwaps { weekStart dayA dayB } } }`;
  const nextMonday = addDaysIso(mondayOf(today), 7);
  const later = await gql(SWAP, { a: nextMonday, b: addDaysIso(nextMonday, 1) }, id);
  assert.match(later.errors?.[0].message, /only rearrange this week/);

  // A valid pair among this week's remaining days (none left late on a Sunday).
  const types = weekTypes(plan.sessions);
  const left = [0, 1, 2, 3, 4, 5, 6].filter((d) => d >= weekdayOf(today));
  const pair = left.flatMap((a) => left.map((b) => [a, b])).find(([a, b]) => a < b && !swapIssue(types, [], a, b));
  if (!pair) { t.skip("no swappable pair left this week"); return; }
  const date = (d: number) => addDaysIso(mondayOf(today), d);
  const swapped = await ok(SWAP, { a: date(pair[0]), b: date(pair[1]) }, id);
  assert.deepEqual(swapped.swapSessionDays.scheduleSwaps, [{ weekStart: mondayOf(today), dayA: pair[0], dayB: pair[1] }]);
  const rest = types.findIndex((x) => x === null);
  if (rest >= weekdayOf(today)) {
    const toRest = await gql(SWAP, { a: date(pair[0]), b: date(rest) }, id);
    assert.match(toRest.errors?.[0].message, /Rest days stay/);
  }

  const reset = await ok(`mutation($d:String!){ resetWeekSchedule(date:$d){ scheduleSwaps { weekStart } } }`, { d: today }, id);
  assert.deepEqual(reset.resetWeekSchedule.scheduleSwaps, []);
  await ok(SWAP, { a: date(pair[0]), b: date(pair[1]) }, id);
  const fewer = await ok(`mutation{ setTrainingDays(days:5){ scheduleSwaps { weekStart } } }`, {}, id);
  assert.deepEqual(fewer.setTrainingDays.scheduleSwaps, [], "a new week shape clears swaps");
});

test("start date and reminder", async () => {
  const d = await ok(`mutation($d:String!){ setStartDate(date:$d){ startDate endDate } }`, { d: today }, jay);
  assert.equal(d.setStartDate.startDate, today);
  assert.equal(d.setStartDate.endDate, addDaysIso(today, 41));
  const far = await gql(`mutation($d:String!){ setStartDate(date:$d){ startDate } }`, { d: addDaysIso(today, 60) }, jay);
  assert.equal(far.errors?.[0].extensions.code, "BAD_USER_INPUT");
  const r = await ok(`mutation{ setWorkoutReminder(time:"17:30"){ profile{ reminderTime } } }`, {}, jay);
  assert.equal(r.setWorkoutReminder.profile.reminderTime, "17:30");
  const badTime = await gql(`mutation{ setWorkoutReminder(time:"5pm"){ programId } }`, {}, jay);
  assert.ok(badTime.errors);
});

test("logging a planned session links it to the template and computes volume", async () => {
  const plan = (await ok(`{ myPlan { sessions { templateId name exercises { exerciseId } } } }`, {}, jay)).myPlan;
  const s = plan.sessions[0];
  const yesterdayNoon = new Date(Date.now() - 86_400_000);
  yesterdayNoon.setUTCHours(12, 0, 0, 0);
  const logged = await ok(`mutation($i:LogWorkoutSessionInput!){ logWorkoutSession(input:$i){ id templateId templateName setCount volumeKg startedAt } }`, {
    i: { templateId: s.templateId, durationMinutes: 52, startedAt: yesterdayNoon.toISOString(), sets: [
      { exerciseId: s.exercises[0].exerciseId, setNumber: 1, reps: 8, weightKg: 40 },
      { exerciseId: s.exercises[0].exerciseId, setNumber: 2, reps: 8, weightKg: 42.5 },
    ] },
  }, jay);
  assert.equal(logged.logWorkoutSession.templateName, s.name);
  assert.equal(logged.logWorkoutSession.setCount, 2);
  assert.equal(logged.logWorkoutSession.volumeKg, 660);
  const between = await ok(`query($f:String!,$t:String!){ workoutSessionsBetween(from:$f,to:$t){ id templateId } }`, { f: addDaysIso(today, -1), t: today }, jay);
  assert.equal(between.workoutSessionsBetween.length, 1);
  const other = await newUser("Stranger");
  const steal = await gql(`mutation($i:LogWorkoutSessionInput!){ logWorkoutSession(input:$i){ id } }`, { i: { templateId: s.templateId, sets: [] } }, other);
  assert.equal(steal.errors?.[0].extensions.code, "BAD_USER_INPUT");
});

test("meals: menu, eaten ticks, swaps", async () => {
  const day = (await ok(`query($d:String!){ mealDay(date:$d){ date proteinShortfallG targets{kcal} items{ slotIndex slot recipeKey kcal eaten } } }`, { d: today }, jay)).mealDay;
  assert.deepEqual(day.items.map((i: any) => i.slot), ["LUNCH", "SNACK", "DINNER"]);
  const total = day.items.reduce((a: number, i: any) => a + i.kcal, 0);
  assert.ok(Math.abs(total - day.targets.kcal) <= 30);
  const eaten = await ok(`mutation($d:String!){ setMealEaten(date:$d, slotIndex:0, eaten:true){ items{ slotIndex eaten } } }`, { d: today }, jay);
  assert.equal(eaten.setMealEaten.items[0].eaten, true);
  const opts = (await ok(`query($d:String!){ mealSwapOptions(date:$d, slotIndex:2){ key slot } }`, { d: today }, jay)).mealSwapOptions;
  assert.ok(opts.length > 1 && opts.every((o: any) => o.slot === "DINNER"));
  const target = opts.find((o: any) => o.key !== day.items[2].recipeKey).key;
  const swapped = await ok(`mutation($d:String!,$k:String!){ swapMeal(date:$d, slotIndex:2, recipeKey:$k){ items{ slotIndex recipeKey eaten } } }`, { d: today, k: target }, jay);
  assert.equal(swapped.swapMeal.items[2].recipeKey, target);
  assert.equal(swapped.swapMeal.items[0].eaten, true, "earlier tick kept");
  const wrongSlot = await gql(`mutation($d:String!){ swapMeal(date:$d, slotIndex:2, recipeKey:"hausa-koko-koose"){ date } }`, { d: today }, jay);
  assert.equal(wrongSlot.errors?.[0].extensions.code, "BAD_USER_INPUT");
});

test("activities: estimated vs entered calories and validation", async () => {
  const est = await ok(`mutation($i:LogActivityInput!){ logActivity(input:$i){ id kind kcal kcalEstimated distanceKm } }`,
    { i: { performedOn: today, activityType: "WALK", durationMinutes: 30, distanceKm: 2.5, effort: "MODERATE" } }, jay);
  assert.equal(est.logActivity.kind, "CARDIO");
  assert.equal(est.logActivity.kcalEstimated, true);
  assert.equal(est.logActivity.kcal, Math.round((3.5 * 81.2 * 30) / 60));
  const watch = await ok(`mutation($i:LogActivityInput!){ logActivity(input:$i){ kcal kcalEstimated kind } }`,
    { i: { performedOn: today, activityType: "FOOTBALL", durationMinutes: 60, kcal: 640, avgHeartRate: 148 } }, jay);
  assert.deepEqual(watch.logActivity, { kcal: 640, kcalEstimated: false, kind: "SPORT" });
  const bad = await gql(`mutation($i:LogActivityInput!){ logActivity(input:$i){ id } }`,
    { i: { performedOn: today, activityType: "FOOTBALL", durationMinutes: 60, distanceKm: 5 } }, jay);
  assert.equal(bad.errors?.[0].extensions.code, "BAD_USER_INPUT");
  const list = await ok(`query($d:String!){ activityLogs(from:$d,to:$d){ id activityType } }`, { d: today }, jay);
  assert.equal(list.activityLogs.length, 2);
  const del = await ok(`mutation($id:ID!){ deleteActivity(id:$id) }`, { id: est.logActivity.id }, jay);
  assert.equal(del.deleteActivity, true);
});

test("redoing onboarding starts cycle 2 and archives cycle 1", async () => {
  const d = await ok(ONBOARD, { i: { screening: screeningClear, training: { ...training, daysPerWeek: 3, fullBodyDay: false }, diet, startDate: today } }, jay);
  assert.equal(d.completeOnboarding.plan.cycleNumber, 2);
  assert.equal(d.completeOnboarding.plan.sessions.length, 3);
  const { rows } = await pool.query(`SELECT status, count(*)::int AS n FROM tracking.generated_programs WHERE user_id = $1 GROUP BY status ORDER BY status`, [jay]);
  assert.deepEqual(rows, [{ status: "ACTIVE", n: 1 }, { status: "ARCHIVED", n: 1 }]);
});

test("an email already owned by another account is rejected cleanly", async () => {
  const other = await newUser("Someone Else");
  const r = await gql(ONBOARD, { i: { email: "JAY@example.com", screening: screeningClear, training, diet, startDate: today } }, other);
  assert.equal(r.errors?.[0].extensions.code, "BAD_USER_INPUT");
  assert.match(r.errors?.[0].message, /already has a TrackFit account/);
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM tracking.generated_programs WHERE user_id = $1`, [other]);
  assert.equal(rows[0].n, 0, "nothing is saved");
});

test("everything requires sign-in except previewPlan", async () => {
  const r = await gql(`{ myPlan { programId } }`);
  assert.equal(r.errors?.[0].extensions.code, "UNAUTHENTICATED");
});
