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
{
  const { default: webpush } = await import("web-push");
  const keys = webpush.generateVAPIDKeys();
  process.env.VAPID_PUBLIC_KEY = keys.publicKey;
  process.env.VAPID_PRIVATE_KEY = keys.privateKey;
}

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
const { setPushSender } = await import("./modules/notifications/push.js");
const { runReminderJob } = await import("./modules/notifications/reminders.js");
const { WebPushError } = await import("web-push");
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

test("push reminders: subscribe, send once per day, drop dead devices", async () => {
  const pushed: { endpoint: string; msg: any }[] = [];
  const gone = new Set<string>();
  setPushSender(async (sub, payload) => {
    if (gone.has(sub.endpoint)) throw new WebPushError("Gone", 410, {}, "", sub.endpoint);
    pushed.push({ endpoint: sub.endpoint, msg: JSON.parse(payload) });
  });
  const cfg = await ok(`{ pushConfig { publicKey } }`);
  assert.equal(cfg.pushConfig.publicKey, process.env.VAPID_PUBLIC_KEY);
  const SUB = `mutation($i:PushSubscriptionInput!){ subscribePush(input:$i) }`;
  const phone = { endpoint: "https://push.example.com/phone", p256dh: "p", auth: "a", timeZone: "Africa/Accra" };
  const badTz = await gql(SUB, { i: { ...phone, timeZone: "Mars/Olympus" } }, jay);
  assert.equal(badTz.errors?.[0].extensions.code, "BAD_USER_INPUT");
  await ok(SUB, { i: phone }, jay);
  await ok(SUB, { i: { ...phone, endpoint: "https://push.example.com/laptop" } }, jay);

  // A training day in week 2, so nothing logged earlier in these tests interferes. Accra is UTC+0.
  const plan = (await ok(`{ myPlan { startDate sessions { weekday name } } }`, {}, jay)).myPlan;
  const day = [7, 8, 9, 10, 11, 12, 13].map((k) => addDaysIso(plan.startDate, k)).find((d) => plan.sessions.some((s: any) => s.weekday === weekdayOf(d)))!;
  const name = plan.sessions.find((s: any) => s.weekday === weekdayOf(day)).name;
  assert.deepEqual(await runReminderJob(new Date(`${day}T17:20:00Z`)), { sent: 0 }, "before the 17:30 reminder time");
  assert.deepEqual(await runReminderJob(new Date(`${day}T17:35:00Z`)), { sent: 1 });
  assert.equal(pushed.length, 2, "both devices");
  assert.equal(pushed[0].msg.title, `${name} today`);
  assert.deepEqual(await runReminderJob(new Date(`${day}T18:05:00Z`)), { sent: 0 }, "once per day");

  // Optional reminders: on by default, each switchable. Day 7 at 07:35 Accra is a weigh-in morning.
  const PREFS = `{ reminderPrefs { weighIn progressPhotos missedSession } }`;
  assert.deepEqual((await ok(PREFS, {}, jay)).reminderPrefs, { weighIn: true, progressPhotos: true, missedSession: true });
  const day7 = addDaysIso(plan.startDate, 7);
  await ok(`mutation($i:ReminderPrefsInput!){ setReminderPrefs(input:$i){ weighIn } }`, { i: { weighIn: false, progressPhotos: true, missedSession: true } }, jay);
  assert.deepEqual(await runReminderJob(new Date(`${day7}T07:35:00Z`)), { sent: 0 }, "weigh-in reminder turned off");
  await ok(`mutation($i:ReminderPrefsInput!){ setReminderPrefs(input:$i){ weighIn } }`, { i: { weighIn: true, progressPhotos: true, missedSession: true } }, jay);
  pushed.length = 0;
  assert.deepEqual(await runReminderJob(new Date(`${day7}T07:40:00Z`)), { sent: 1 });
  assert.equal(pushed[0].msg.title, "Weigh-in day");

  gone.add("https://push.example.com/laptop");
  pushed.length = 0;
  const sent = await ok(`mutation{ sendTestPush }`, {}, jay);
  assert.equal(sent.sendTestPush, 1);
  const { rows } = await pool.query(`SELECT endpoint FROM notifications.push_subscriptions WHERE user_id = $1`, [jay]);
  assert.deepEqual(rows.map((r) => r.endpoint), ["https://push.example.com/phone"], "410 Gone removes the device");

  // Signing in on the same browser as someone else moves the device to them.
  const other = await newUser("Ama");
  await ok(SUB, { i: phone }, other);
  assert.equal((await ok(`mutation{ sendTestPush }`, {}, jay)).sendTestPush, 0);
  await ok(`mutation($e:String!){ unsubscribePush(endpoint:$e) }`, { e: phone.endpoint }, other);
  assert.equal((await ok(`mutation{ sendTestPush }`, {}, other)).sendTestPush, 0);
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

test("food log: list foods, grams, quick-add, instead of a planned meal, edit, remove, water", async () => {
  const ama = await newUser("Ama");
  await ok(ONBOARD, { i: { displayName: "Ama", screening: screeningClear, training, diet, mindset: {}, startDate: today } }, ama);
  const DAY = `items{ slotIndex kcal eaten skipped } foods{ id slot name portionLabel quantity kcal proteinG replacedSlotIndex customFoodId }
    eaten{ kcal proteinG } water{ ml targetMl targetText }`;
  const LOG = `mutation($i:LogFoodInput!){ logFood(input:$i){ ${DAY} } }`;

  // Jollof instead of the planned lunch: the planned lunch stops counting.
  let d = (await ok(LOG, { i: { date: today, slot: "LUNCH", foodKey: "jollof-rice", portionIndex: 2, quantity: 1, insteadOfSlotIndex: 0 } }, ama)).logFood;
  assert.deepEqual(d.foods.map((f: any) => [f.name, f.portionLabel, f.kcal, f.replacedSlotIndex]), [["Jollof rice", "Medium plate (350 g)", 578, 0]]);
  assert.equal(d.items[0].skipped, true);
  assert.equal(d.eaten.kcal, 578);
  const jollof = d.foods[0].id;

  d = (await ok(`mutation($d:String!){ setMealEaten(date:$d, slotIndex:1, eaten:true){ ${DAY} } }`, { d: today }, ama)).setMealEaten;
  assert.equal(d.eaten.kcal, 578 + d.items[1].kcal);

  // Quick-add saves "My foods"; the same name again updates it.
  d = (await ok(LOG, { i: { date: today, slot: "DINNER", custom: { name: "Mum's light soup", kcal: 300, proteinG: 20 }, quantity: 2 } }, ama)).logFood;
  assert.deepEqual([d.foods[1].kcal, d.foods[1].proteinG, d.foods[1].portionLabel], [600, 40, "1 serving"]);
  await ok(LOG, { i: { date: today, slot: "SNACK", custom: { name: "mum's LIGHT soup", kcal: 280 }, quantity: 1 } }, ama);
  d = (await ok(LOG, { i: { date: today, slot: "DINNER", foodKey: "plain-rice", grams: 200, quantity: 1 } }, ama)).logFood;
  assert.deepEqual([d.foods[3].portionLabel, d.foods[3].kcal], ["200 g", 260]);

  // Edit the jollof to 1½ large plates, then remove it: the planned lunch is back.
  d = (await ok(`mutation($id:ID!){ changeFoodLog(id:$id, change:{ slot: LUNCH, portionIndex: 3, quantity: 1.5 }){ ${DAY} } }`, { id: jollof }, ama)).changeFoodLog;
  assert.equal(d.foods[0].kcal, 1238);
  const other = await gql(`mutation($id:ID!){ removeFoodLog(id:$id){ date } }`, { id: jollof }, jay);
  assert.ok(other.errors, "can't remove someone else's food");
  d = (await ok(`mutation($id:ID!){ removeFoodLog(id:$id){ ${DAY} } }`, { id: jollof }, ama)).removeFoodLog;
  assert.equal(d.items[0].skipped, false);
  assert.equal(d.foods.length, 3);

  const mine = (await ok(`{ myFoods{ custom{ name kcal } recent{ name foodKey customFoodId portionLabel grams } } }`, {}, ama)).myFoods;
  assert.deepEqual(mine.custom, [{ name: "mum's LIGHT soup", kcal: 280 }]);
  assert.deepEqual(mine.recent.map((r: any) => r.portionLabel), ["200 g", "1 serving"]);

  for (const bad of [
    { date: addDaysIso(today, 3), slot: "LUNCH", foodKey: "banku", portionIndex: 0, quantity: 1 },
    { date: today, slot: "LUNCH", foodKey: "pizza-hut", portionIndex: 0, quantity: 1 },
    { date: today, slot: "LUNCH", foodKey: "banku", portionIndex: 9, quantity: 1 },
    { date: today, slot: "LUNCH", foodKey: "banku", portionIndex: 0, quantity: 0 },
    { date: today, slot: "LUNCH", quantity: 1 },
    { date: today, slot: "LUNCH", custom: { name: "x", kcal: 100 }, quantity: 1 },
  ]) {
    const r = await gql(LOG, { i: bad }, ama);
    assert.equal(r.errors?.[0].extensions.code, "BAD_USER_INPUT", JSON.stringify(bad));
  }

  d = (await ok(`mutation($d:String!){ setWater(date:$d, ml:1500){ ${DAY} } }`, { d: today }, ama)).setWater;
  assert.equal(d.water.ml, 1500);
  assert.ok([2750, 3250].includes(d.water.targetMl), String(d.water.targetMl));
  assert.match(d.water.targetText, /Voltic or Bel-Aqua/);
  assert.equal((await gql(`mutation($d:String!){ setWater(date:$d, ml:-5){ date } }`, { d: today }, ama)).errors?.[0].extensions.code, "BAD_USER_INPUT");
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

test("week-6 check-in: results, preview, then cycle 2 built from them", async () => {
  const kofi = await newUser("Kofi");
  await ok(ONBOARD, { i: { displayName: "Kofi", screening: screeningClear, training: { ...training, injuries: [], fullBodyDay: false }, diet, mindset: {}, startDate: today } }, kofi);
  const CHECKIN = `query($t:String!){ cycleCheckin(today:$t){ open opensOn cycleNumber currentDays currentKcal dayRange{min max}
    results{ startKg endKg changeKg plannedChangeKg sessionsPlanned sessionsDone needsWeighIn goalReached suggestedDays bestLift{ name fromKg toKg } }
    eatingLog{ loggedDays onTargetDays suggested } } }`;
  const early = await ok(CHECKIN, { t: today }, kofi);
  assert.equal(early.cycleCheckin.open, false);
  assert.deepEqual(early.cycleCheckin.eatingLog, { loggedDays: 0, onTargetDays: 0, suggested: null });
  assert.equal(early.cycleCheckin.opensOn, addDaysIso(today, 40));

  // Pretend the cycle started 41 days ago and log 6 weeks of history.
  const start = addDaysIso(today, -41);
  await pool.query(`UPDATE tracking.generated_programs SET start_date = $2, end_date = $3 WHERE user_id = $1 AND status = 'ACTIVE'`, [kofi, start, today]);
  const at = (k: number) => `${addDaysIso(start, k)}T09:00:00Z`;
  for (const [k, kg] of [[0, 81.2], [36, 79], [38, 78.8], [40, 78.6]] as const) {
    await pool.query(`INSERT INTO tracking.weight_entries (user_id, recorded_at, weight_kg) VALUES ($1, $2, $3)`, [kofi, at(k), kg]);
  }
  const { rows: ex } = await pool.query(`SELECT id, name FROM tracking.exercises WHERE name IN ('Back squat', 'Bench press')`);
  const id = (n: string) => ex.find((e) => e.name === n).id;
  for (const [k, squat, bench, reps] of [[1, 60, 50, 8], [8, 62.5, 50, 8], [36, 70, 55, 10], [38, 72.5, 55, 7]] as const) {
    const { rows } = await pool.query(`INSERT INTO tracking.workout_sessions (user_id, started_at) VALUES ($1, $2) RETURNING id`, [kofi, at(k)]);
    await pool.query(
      `INSERT INTO tracking.set_logs (session_id, exercise_id, set_number, reps, weight_kg) VALUES ($1,$2,1,$4,$3), ($1,$5,1,$7,$6)`,
      [rows[0].id, id("Back squat"), squat, reps, id("Bench press"), bench, reps],
    );
  }
  const c = (await ok(CHECKIN, { t: today }, kofi)).cycleCheckin;
  assert.equal(c.open, true);
  assert.equal(c.cycleNumber, 1);
  assert.deepEqual(
    { ...c.results, sessionsPlanned: undefined },
    { startKg: 81.2, endKg: 78.8, changeKg: -2.4, plannedChangeKg: -3.7, sessionsPlanned: undefined, sessionsDone: 4, needsWeighIn: false,
      goalReached: false, suggestedDays: 3, bestLift: { name: "Back squat", fromKg: 62.5, toKg: 72.5 } },
  );
  assert.equal(c.results.sessionsPlanned, 24);

  const answers = { feel: "TOO_EASY", eating: "MOST_DAYS", days: 3 };
  const PREVIEW = `query($t:String!,$a:CheckinAnswersInput!){ previewNextCycle(today:$t, answers:$a){ daysPerWeek targets{ kcal }
    changes{ icon title why } sessions{ name exercises{ name sets rotatedFrom startLoadKg } } } }`;
  const p = (await ok(PREVIEW, { t: today, a: answers }, kofi)).previewNextCycle;
  assert.equal(p.daysPerWeek, 3);
  assert.ok(p.changes.some((x: any) => x.title === "4 → 3 training days a week"), JSON.stringify(p.changes));
  assert.ok(p.changes.some((x: any) => x.title === "One more set on your main lifts"));
  const all = p.sessions.flatMap((s: any) => s.exercises);
  assert.equal(all.find((e: any) => e.name === "Back squat")?.startLoadKg, 72.5, "70 × 10 hit the top of 6-10, but 72.5 is heavier and didn't");
  assert.equal(all.find((e: any) => e.name === "Bench press")?.startLoadKg, 56.25, "55 × 10: +1.25 kg");
  const rotated = all.find((e: any) => e.rotatedFrom);
  assert.ok(rotated, "an accessory rotates");

  const bad = await gql(PREVIEW, { t: today, a: { ...answers, days: 6 } }, kofi);
  assert.equal(bad.errors?.[0].extensions.code, "BAD_USER_INPUT");

  const DONE = `mutation($t:String!,$a:CheckinAnswersInput!,$s:String!){ completeCheckin(today:$t, answers:$a, startDate:$s){
    cycleNumber startDate daysPerWeek onboardingDays targets{ kcal } profile{ startWeightKg }
    sessions{ name exercises{ name sets startLoadKg } } } }`;
  const kept = rotated.rotatedFrom;
  const next = (await ok(DONE, { t: today, a: { ...answers, keep: [kept] }, s: tomorrow }, kofi)).completeCheckin;
  assert.equal(next.cycleNumber, 2);
  assert.equal(next.startDate, tomorrow);
  assert.equal(next.daysPerWeek, 3);
  assert.equal(next.onboardingDays, 3, "the ±1 range re-centres on the new day count");
  assert.equal(next.profile.startWeightKg, 78.8);
  assert.equal(next.targets.kcal, p.targets.kcal);
  const names = next.sessions.flatMap((s: any) => s.exercises.map((e: any) => e.name));
  assert.ok(names.includes(kept), "the kept exercise stayed");
  assert.equal(next.sessions.flatMap((s: any) => s.exercises).find((e: any) => e.name === "Bench press").startLoadKg, 56.25);

  const again = await gql(DONE, { t: today, a: answers, s: tomorrow }, kofi);
  assert.equal(again.errors?.[0].extensions.code, "BAD_USER_INPUT", "cycle 2 isn't open for a check-in");
  const { rows: saved } = await pool.query(`SELECT answers->>'feel' AS feel, results->>'endKg' AS end_kg FROM tracking.cycle_checkins WHERE user_id = $1`, [kofi]);
  assert.deepEqual(saved, [{ feel: "TOO_EASY", end_kg: "78.8" }]);

  // A mid-cycle day change keeps the check-in's decisions.
  const four = (await ok(`mutation{ setTrainingDays(days:4){ sessions{ exercises{ name sets } } targets{ kcal } } }`, {}, kofi)).setTrainingDays;
  assert.equal(four.sessions.flatMap((s: any) => s.exercises).find((e: any) => e.name === "Bench press").sets, 5, "still +1 set");
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
