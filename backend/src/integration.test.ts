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
// Club media goes to a throwaway folder (MEDIA_STORE=local is the default with the dev bypass).
process.env.MEDIA_DIR = (await import("node:fs")).mkdtempSync((await import("node:path")).join((await import("node:os")).tmpdir(), "trackfit-it-media-"));
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
const { LocalStore, getMediaStore } = await import("./shared/media/store.js");
const { cleanUpStaleUploads } = await import("./modules/clubs/feed.service.js");
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

  // Photo slots: the Week 3 line drops once this cycle's Week 3 photo is saved.
  const SYNC = `mutation($p:[ProgressPhotoInput!]!){ syncProgressPhotos(photos:$p) }`;
  const day14 = addDaysIso(plan.startDate, 14);
  const photoAt = (iso: string) => [{ slot: "Day 1", savedAt: `${plan.startDate}T08:00:00Z` }, { slot: "Week 3", savedAt: `${iso}T08:00:00Z` }];
  assert.equal((await gql(SYNC, { p: [{ slot: "Week 9", savedAt: `${day14}T08:00:00Z` }] }, jay)).errors?.[0].extensions.code, "BAD_USER_INPUT");
  await ok(SYNC, { p: photoAt(addDaysIso(plan.startDate, -1)) }, jay);
  pushed.length = 0;
  await runReminderJob(new Date(`${day14}T07:35:00Z`));
  assert.equal(pushed[0].msg.title, "Weigh-in day, and your Week 3 photo", "a photo from before this cycle doesn't count");
  await pool.query(`DELETE FROM notifications.reminder_log WHERE user_id = $1 AND local_date = $2`, [jay, day14]);
  await ok(SYNC, { p: photoAt(addDaysIso(plan.startDate, 12)) }, jay);
  pushed.length = 0;
  await runReminderJob(new Date(`${day14}T07:40:00Z`));
  assert.equal(pushed[0].msg.title, "Weigh-in day");
  await ok(SYNC, { p: [] }, jay);
  assert.equal((await pool.query(`SELECT 1 FROM tracking.progress_photos WHERE user_id = $1`, [jay])).rowCount, 0, "a deleted photo is removed");

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
  const cycles = (await ok(`{ myCycles { cycleNumber startDate active } }`, {}, kofi)).myCycles;
  assert.deepEqual(cycles.map((c: any) => [c.cycleNumber, c.active]), [[1, false], [2, true]]);
  assert.equal(cycles[1].startDate, tomorrow);
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

// ── Clubs v1, first build step ──────────────────────────────────────────

async function userWithEmail(name: string, email: string): Promise<string> {
  const id = await newUser(name);
  await pool.query(`UPDATE identity.users SET email = $2 WHERE id = $1`, [id, email]);
  return id;
}
const tokenIn = (text: string) => /\/join\/([A-Za-z0-9_-]+)/.exec(text)![1];
const lastMailTo = (to: string) => [...mailer.sent].reverse().find((m) => m.to === to);
const CLUB = `id name me{ isAdmin isCoach } members{ userId displayName isAdmin isCoach isMe } joinRequests{ userId displayName } invites{ id email } joinLinks{ id url uses maxUses expiresAt } limits{ maxAdmins maxMembers }`;
const JOIN = `mutation($t:String!,$c:Boolean!){ joinClub(token:$t, consent:$c){ clubId status } }`;
const ROLES = `mutation($c:ID!,$u:ID!,$a:Boolean!,$k:Boolean!){ setClubMemberRoles(clubId:$c,userId:$u,isAdmin:$a,isCoach:$k){ members{ userId isAdmin isCoach } } }`;

let owner = "", staff = "", kofi = "", ama = "", yaw = "", esi = "", clubId = "";

test("app roles: the owner is set by script, adds App Admins, and the console is staff-only", async () => {
  owner = await userWithEmail("Owner", "owner@example.com");
  staff = await userWithEmail("Staff", "staff@example.com");
  execFileSync("npx", ["tsx", "scripts/app-owner.ts", "OWNER@example.com"], { env: { ...process.env, DATABASE_URL: TEST_DB }, stdio: "pipe" });
  assert.equal((await ok(`{ me { appRole showClubs } }`, {}, owner)).me.appRole, "OWNER");
  assert.equal((await ok(`{ me { appRole showClubs } }`, {}, staff)).me.showClubs, false);

  const denied = await gql(`{ consoleClubs { id } }`, {}, staff);
  assert.equal(denied.errors?.[0].extensions.code, "FORBIDDEN");
  const added = await ok(`mutation($e:String!){ addAppAdmin(email:$e){ email role } }`, { e: "staff@example.com" }, owner);
  assert.deepEqual(added.addAppAdmin.map((s: any) => s.role), ["OWNER", "ADMIN"]);
  assert.equal((await ok(`{ me { appRole showClubs } }`, {}, staff)).me.showClubs, true, "staff see Clubs to reach the console");

  const notOwner = await gql(`mutation($e:String!){ addAppAdmin(email:$e){ email } }`, { e: "owner@example.com" }, staff);
  assert.equal(notOwner.errors?.[0].extensions.code, "FORBIDDEN", "only the owner adds admins");
  const unknown = await gql(`mutation($e:String!){ addAppAdmin(email:$e){ email } }`, { e: "nobody@example.com" }, owner);
  assert.equal(unknown.errors?.[0].extensions.code, "BAD_USER_INPUT");
  const otherUser = await newUser("Not staff");
  assert.equal((await ok(`{ me { appRole } }`, {}, otherUser)).me.appRole, null);
});

test("clubs: created in the console, the named first Admin joins by invite, and only that verified address can", async () => {
  kofi = await userWithEmail("Kofi", "kofi@example.com");
  ama = await userWithEmail("Ama", "ama@example.com");
  mailer.sent.length = 0;
  const created = await ok(`mutation($i:CreateClubInput!){ createClub(input:$i){ id name memberCount adminCount pendingAdminEmails } }`,
    { i: { name: "  Office Gym Crew ", description: "After-work sessions", firstAdminEmail: "Kofi@Example.com" } }, staff);
  clubId = created.createClub.id;
  assert.equal(created.createClub.name, "Office Gym Crew");
  assert.deepEqual(created.createClub.pendingAdminEmails, ["kofi@example.com"]);
  assert.equal(created.createClub.memberCount, 0, "the creator doesn't join");
  const mail = lastMailTo("kofi@example.com")!;
  assert.match(mail.subject, /running Office Gym Crew/);
  const token = tokenIn(mail.text);

  const preview = await ok(`query($t:String!){ joinPreview(token:$t){ clubName kind asAdmin problem emailHint myStatus clubId } }`, { t: token });
  assert.deepEqual(preview.joinPreview, { clubName: "Office Gym Crew", kind: "INVITE", asAdmin: true, problem: null, emailHint: "k•••@example.com", myStatus: null, clubId: null });
  assert.equal((await ok(`{ me { showClubs } }`, {}, kofi)).me.showClubs, true, "an open invite shows Clubs");
  assert.equal((await ok(`{ myClubInvites { clubName asAdmin } }`, {}, kofi)).myClubInvites[0].asAdmin, true);

  const wrong = await gql(JOIN, { t: token, c: true }, ama);
  assert.equal(wrong.errors?.[0].extensions.code, "FORBIDDEN");
  assert.match(wrong.errors?.[0].message, /k•••@example\.com/);
  const unverified = await gql(JOIN, { t: token, c: true }, kofi, { emailVerified: false, signInProvider: "password", email: "kofi@example.com" });
  assert.equal(unverified.errors?.[0].extensions.code, "FORBIDDEN", "an unverified address can't claim an invite");
  const noConsent = await gql(JOIN, { t: token, c: false }, kofi);
  assert.equal(noConsent.errors?.[0].extensions.code, "BAD_USER_INPUT");

  const joined = await ok(JOIN, { t: token, c: true }, kofi, { emailVerified: true, signInProvider: "google.com", email: "KOFI@example.com" });
  assert.deepEqual(joined.joinClub, { clubId, status: "ACTIVE" });
  const club = await ok(`query($id:ID!){ club(id:$id){ ${CLUB} } }`, { id: clubId }, kofi);
  assert.deepEqual(club.club.me, { isAdmin: true, isCoach: false });
  const again = await gql(JOIN, { t: token, c: true }, kofi);
  assert.equal(again.errors?.[0].extensions.code, "BAD_USER_INPUT", "an invite works once");

  const { rows } = await pool.query(`SELECT event, detail FROM clubs.membership_events WHERE club_id = $1 AND user_id = $2 ORDER BY at`, [clubId, kofi]);
  assert.deepEqual(rows.map((r) => r.event), ["JOINED", "ADMIN_ADDED"]);
  assert.match(rows[0].detail, /accepted coach visibility/);
});

test("clubs: Admins invite by email and by join link, and approve link requests", async () => {
  yaw = await userWithEmail("Yaw", "yaw@example.com");
  esi = await userWithEmail("Esi", "esi@example.com");
  mailer.sent.length = 0;
  const inv = await ok(`mutation($c:ID!,$e:[String!]!){ inviteToClub(clubId:$c, emails:$e){ invites{ email } } }`,
    { c: clubId, e: ["ama@example.com", " AMA@example.com", "kofi@example.com"] }, kofi);
  assert.deepEqual(inv.inviteToClub.invites.map((i: any) => i.email), ["ama@example.com"], "deduped, and existing members skipped");
  assert.equal(mailer.sent.length, 1);
  const bad = await gql(`mutation($c:ID!,$e:[String!]!){ inviteToClub(clubId:$c, emails:$e){ id } }`, { c: clubId, e: ["not-an-email"] }, kofi);
  assert.equal(bad.errors?.[0].extensions.code, "BAD_USER_INPUT");

  const mine = await ok(`{ myClubInvites { token clubName } }`, {}, ama);
  assert.equal(mine.myClubInvites[0].clubName, "Office Gym Crew");
  assert.equal((await ok(JOIN, { t: mine.myClubInvites[0].token, c: true }, ama)).joinClub.status, "ACTIVE");

  const memberTries = await gql(`mutation($c:ID!){ createJoinLink(clubId:$c){ id } }`, { c: clubId }, ama);
  assert.equal(memberTries.errors?.[0].extensions.code, "FORBIDDEN", "only Admins make links");
  const linked = await ok(`mutation($c:ID!){ createJoinLink(clubId:$c, maxUses:2){ joinLinks{ url uses maxUses expiresAt } } }`, { c: clubId }, kofi);
  const link = linked.createJoinLink.joinLinks[0];
  const days = (Date.parse(link.expiresAt) - Date.now()) / 86_400_000;
  assert.ok(days > 6.9 && days <= 7, "links last 7 days");
  const linkToken = tokenIn(link.url);

  const p = await ok(`query($t:String!){ joinPreview(token:$t){ kind problem emailHint } }`, { t: linkToken });
  assert.deepEqual(p.joinPreview, { kind: "LINK", problem: null, emailHint: null });
  mailer.sent.length = 0;
  assert.equal((await ok(JOIN, { t: linkToken, c: true }, yaw)).joinClub.status, "WAITING");
  assert.equal((await ok(JOIN, { t: linkToken, c: true }, yaw)).joinClub.status, "WAITING", "asking twice doesn't use the link twice");
  assert.match(lastMailTo("kofi@example.com")!.subject, /Yaw wants to join Office Gym Crew/);
  assert.equal((await ok(`query($id:ID!){ club(id:$id){ id } }`, { id: clubId }, yaw)).club, null, "waiting members can't open the club");
  assert.deepEqual((await ok(`{ myClubs { name status } }`, {}, yaw)).myClubs, [{ name: "Office Gym Crew", status: "WAITING" }]);
  assert.deepEqual((await ok(`query($id:ID!){ club(id:$id){ joinRequests{ userId } } }`, { id: clubId }, ama)).club.joinRequests, [], "only Admins see requests");

  const approved = await ok(`mutation($c:ID!,$u:ID!){ respondToJoinRequest(clubId:$c,userId:$u,approve:true){ ${CLUB} } }`, { c: clubId, u: yaw }, kofi);
  assert.deepEqual(approved.respondToJoinRequest.joinRequests, []);
  assert.deepEqual(approved.respondToJoinRequest.members.map((m: any) => m.displayName), ["Kofi", "Ama", "Yaw"]);
  assert.equal(approved.respondToJoinRequest.joinLinks[0].uses, 1);

  assert.equal((await ok(JOIN, { t: linkToken, c: true }, esi)).joinClub.status, "WAITING");
  await ok(`mutation($c:ID!,$u:ID!){ respondToJoinRequest(clubId:$c,userId:$u,approve:false){ id } }`, { c: clubId, u: esi }, kofi);
  const used = await ok(`query($t:String!){ joinPreview(token:$t){ problem myStatus } }`, { t: linkToken }, esi);
  assert.match(used.joinPreview.problem, /used as many times/);
  assert.equal(used.joinPreview.myStatus, "DECLINED");
});

test("club roles: at most 3 Admins, never none, any number of Coaches, and the last Admin can't leave", async () => {
  await ok(ROLES, { c: clubId, u: ama, a: true, k: true }, kofi);
  await ok(ROLES, { c: clubId, u: yaw, a: true, k: false }, kofi);
  const invite = await ok(`mutation($c:ID!,$e:[String!]!){ inviteToClub(clubId:$c, emails:$e){ invites{ id email } } }`, { c: clubId, e: ["esi@example.com"] }, kofi);
  await ok(JOIN, { t: (await ok(`{ myClubInvites { token } }`, {}, esi)).myClubInvites[0].token, c: true }, esi);
  assert.equal(invite.inviteToClub.invites.length, 1);
  const fourth = await gql(ROLES, { c: clubId, u: esi, a: true, k: false }, kofi);
  assert.equal(fourth.errors?.[0].extensions.code, "BAD_USER_INPUT");
  assert.match(fourth.errors?.[0].message, /at most 3 Admins/);
  const coaches = await ok(ROLES, { c: clubId, u: esi, a: false, k: true }, kofi);
  assert.equal(coaches.setClubMemberRoles.members.filter((m: any) => m.isCoach).length, 2);
  const byMember = await gql(ROLES, { c: clubId, u: ama, a: false, k: false }, esi);
  assert.equal(byMember.errors?.[0].extensions.code, "FORBIDDEN");

  // Two Admins step down, leaving Kofi as the only one.
  await ok(ROLES, { c: clubId, u: yaw, a: false, k: false }, yaw);
  await ok(ROLES, { c: clubId, u: ama, a: false, k: true }, kofi);
  const stepDown = await gql(ROLES, { c: clubId, u: kofi, a: false, k: false }, kofi);
  assert.match(stepDown.errors?.[0].message, /at least one Admin/);
  const leave = await gql(`mutation($c:ID!){ leaveClub(clubId:$c) }`, { c: clubId }, kofi);
  assert.match(leave.errors?.[0].message, /last Admin/);

  // Two Admins leaving at the same moment: exactly one gets out.
  await ok(ROLES, { c: clubId, u: ama, a: true, k: true }, kofi);
  const both = await Promise.all([kofi, ama].map((u) => gql(`mutation($c:ID!){ leaveClub(clubId:$c) }`, { c: clubId }, u)));
  assert.equal(both.filter((r) => !r.errors).length, 1);
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM clubs.memberships WHERE club_id = $1 AND status = 'ACTIVE' AND is_admin`, [clubId]);
  assert.equal(rows[0].n, 1);
  const stayed = both[0].errors ? kofi : ama;
  const left = stayed === kofi ? ama : kofi;
  assert.equal((await ok(`query($id:ID!){ club(id:$id){ id } }`, { id: clubId }, left)).club, null);

  const removed = await ok(`mutation($c:ID!,$u:ID!){ removeClubMember(clubId:$c,userId:$u){ members{ userId } } }`, { c: clubId, u: yaw }, stayed);
  assert.ok(!removed.removeClubMember.members.some((m: any) => m.userId === yaw));
  const self = await gql(`mutation($c:ID!,$u:ID!){ removeClubMember(clubId:$c,userId:$u){ id } }`, { c: clubId, u: stayed }, stayed);
  assert.equal(self.errors?.[0].extensions.code, "BAD_USER_INPUT");
});

test("clubs: expired links, closed clubs and the off switch", async () => {
  const admin = (await pool.query(`SELECT user_id FROM clubs.memberships WHERE club_id = $1 AND is_admin`, [clubId])).rows[0].user_id;
  const made = await ok(`mutation($c:ID!){ createJoinLink(clubId:$c){ joinLinks{ id url } } }`, { c: clubId }, admin);
  const link = made.createJoinLink.joinLinks[0];
  await pool.query(`UPDATE clubs.join_links SET expires_at = now() - interval '1 minute' WHERE id = $1`, [link.id]);
  const late = await newUser("Late");
  assert.match((await ok(`query($t:String!){ joinPreview(token:$t){ problem } }`, { t: tokenIn(link.url) })).joinPreview.problem, /expired/);
  assert.match((await gql(JOIN, { t: tokenIn(link.url), c: true }, late)).errors?.[0].message, /expired/);
  assert.equal((await ok(`query($t:String!){ joinPreview(token:$t){ problem } }`, { t: "no-such-token" })).joinPreview, null);

  const closed = await ok(`mutation($id:ID!){ closeClub(id:$id){ closedAt } }`, { id: clubId }, owner);
  assert.ok(closed.closeClub.closedAt);
  assert.deepEqual((await ok(`{ myClubs { id } }`, {}, admin)).myClubs, []);
  assert.equal((await ok(`{ me { showClubs } }`, {}, esi)).me.showClubs, false, "nothing open left for a plain member");

  process.env.CLUBS_ENABLED = "false";
  try {
    assert.equal((await gql(`{ myClubs { id } }`, {}, esi)).errors?.[0].extensions.code, "FORBIDDEN");
    assert.equal((await ok(`{ me { showClubs } }`, {}, owner)).me.showClubs, false);
  } finally {
    delete process.env.CLUBS_ENABLED;
  }
  assert.equal((await gql(`{ myClubs { id } }`)).errors?.[0].extensions.code, "UNAUTHENTICATED");
});

// ── Clubs feed (build step 2) ───────────────────────────────────────────

const POST = `id kind body hasPr weightChangeKg canEdit canDelete commentCount myReaction
  author{ userId displayName isCoach isAdmin inClub isMe } media{ id kind url durationSeconds }
  reactions{ reaction count } workout{ name setCount volumeKg exercises{ name sets{ reps weightKg } } prs{ exerciseName type weightKg reps } }
  activity{ activityType label distanceKm durationMinutes }`;
const FEED = `query($id:ID!,$f:ClubFeedFilter,$a:String,$l:Int){ club(id:$id){ feed(filter:$f, after:$a, limit:$l){ nextCursor posts{ ${POST} } } } }`;
const CREATE_POST = `mutation($i:CreateClubPostInput!){ createClubPost(input:$i){ ${POST} } }`;
const UPLOAD = `mutation($c:ID!,$p:ClubUploadPurpose!,$t:String!,$s:Int!,$d:Float){ requestClubUpload(clubId:$c, purpose:$p, contentType:$t, sizeBytes:$s, durationSeconds:$d){ mediaId url method headers{ name value } maxBytes } }`;
const SHARE = `query($s:ID,$a:ID){ clubShareDraft(sessionId:$s, activityId:$a){ text clubs{ id name } } }`;

const store = () => getMediaStore() as InstanceType<typeof LocalStore>;
const tokenOf = (url: string) => url.slice(url.lastIndexOf("/") + 1);

/** Requests an upload and PUTs the bytes, like the web app does. */
async function upload(userId: string, club: string, purpose: string, contentType: string, bytes: number, seconds?: number): Promise<string> {
  const u = (await ok(UPLOAD, { c: club, p: purpose, t: contentType, s: bytes, d: seconds ?? null }, userId)).requestClubUpload;
  assert.equal(u.method, "PUT");
  assert.equal(await store().put(tokenOf(u.url), contentType, Buffer.alloc(bytes, 7)), 200);
  return u.mediaId;
}

/** A club with an Admin (Abena), a Coach (Kwame) and two members (Efua, Kojo). */
let feedClub = "", abena = "", kwame = "", efua = "", kojo = "", outsider = "";
let bench = "", squat = "", heavySession = "";

test("feed setup: a fresh club, and a member's logs", async () => {
  abena = await userWithEmail("Abena", "abena@example.com");
  kwame = await userWithEmail("Kwame", "kwame@example.com");
  efua = await userWithEmail("Efua", "efua@example.com");
  kojo = await userWithEmail("Kojo", "kojo@example.com");
  outsider = await userWithEmail("Outsider", "outsider@example.com");
  mailer.sent.length = 0;
  feedClub = (await ok(`mutation($i:CreateClubInput!){ createClub(input:$i){ id } }`, { i: { name: "Gym Friends", firstAdminEmail: "abena@example.com" } }, owner)).createClub.id;
  await ok(JOIN, { t: tokenIn(lastMailTo("abena@example.com")!.text), c: true }, abena);
  await ok(`mutation($c:ID!,$e:[String!]!){ inviteToClub(clubId:$c, emails:$e){ id } }`, { c: feedClub, e: ["kwame@example.com", "efua@example.com", "kojo@example.com"] }, abena);
  for (const [id, email] of [[kwame, "kwame@example.com"], [efua, "efua@example.com"], [kojo, "kojo@example.com"]]) {
    await ok(JOIN, { t: tokenIn(lastMailTo(email)!.text), c: true }, id);
  }
  await ok(ROLES, { c: feedClub, u: kwame, a: false, k: true }, abena);

  // Efua has a plan (for "since Day 1"), a workout from before she joined, and two after.
  await ok(ONBOARD, { i: { displayName: "Efua", screening: screeningClear, training, diet, startDate: today } }, efua);
  const ex = (await ok(`{ exercises { id name } }`)).exercises;
  bench = ex.find((e: any) => /bench press/i.test(e.name)).id;
  squat = ex.find((e: any) => /squat/i.test(e.name)).id;
  const LOG = `mutation($i:LogWorkoutSessionInput!){ logWorkoutSession(input:$i){ id } }`;
  await ok(LOG, { i: { durationMinutes: 40, startedAt: new Date(Date.now() - 3 * 86_400_000).toISOString(), sets: [{ exerciseId: bench, setNumber: 1, reps: 5, weightKg: 60 }] } }, efua);
  await ok(LOG, { i: { durationMinutes: 45, sets: [{ exerciseId: bench, setNumber: 1, reps: 5, weightKg: 70 }, { exerciseId: squat, setNumber: 1, reps: 5, weightKg: 90 }] } }, efua);
  heavySession = (await ok(LOG, { i: { durationMinutes: 52, sets: [
    { exerciseId: bench, setNumber: 1, reps: 5, weightKg: 80 }, { exerciseId: bench, setNumber: 2, reps: 5, weightKg: 75 },
    { exerciseId: squat, setNumber: 1, reps: 5, weightKg: 85 },
  ] } }, efua)).logWorkoutSession.id;
  await ok(`mutation{ logWeight(input:{ weightKg: 79 }){ id } }`, {}, efua);
});

test("sharing a workout: drafted summary, one post per club, full workout for every member, private to the club", async () => {
  const benchName = (await ok(`{ exercises { id name } }`)).exercises.find((e: any) => e.id === bench).name;
  const draft = (await ok(SHARE, { s: heavySession }, efua)).clubShareDraft;
  assert.equal(draft.text, `Workout done in 52 min: 2 exercises, 3 sets, 1,200 kg moved. New best: ${benchName} 80 kg × 5.`);
  assert.deepEqual(draft.clubs, [{ id: feedClub, name: "Gym Friends" }]);
  assert.equal((await gql(SHARE, { s: heavySession }, kojo)).errors?.[0].extensions.code, "NOT_FOUND", "only your own logs");

  const posted = (await ok(CREATE_POST, { i: { clubIds: [feedClub], sessionId: heavySession, body: `${draft.text} 💪` } }, efua)).createClubPost[0];
  assert.equal(posted.kind, "WORKOUT");
  assert.equal(posted.hasPr, true);
  assert.deepEqual(posted.workout.exercises.map((e: any) => e.sets.length).sort(), [1, 2]);
  assert.deepEqual(posted.workout.exercises.find((e: any) => e.name === benchName).sets, [{ reps: 5, weightKg: 80 }, { reps: 5, weightKg: 75 }]);
  assert.deepEqual(posted.workout.prs.slice(0, 1).map((p: any) => [p.type, p.weightKg, p.reps]), [["HEAVIEST_SET", 80, 5]]);
  assert.equal((await gql(CREATE_POST, { i: { clubIds: [feedClub], sessionId: heavySession } }, efua)).errors?.[0].extensions.code, "BAD_USER_INPUT", "once per club");
  assert.deepEqual((await ok(SHARE, { s: heavySession }, efua)).clubShareDraft.clubs, [], "no prompt once it's shared");
  assert.equal((await gql(CREATE_POST, { i: { clubIds: [feedClub], sessionId: heavySession } }, outsider)).errors?.[0].extensions.code, "NOT_FOUND");

  const seen = (await ok(FEED, { id: feedClub }, kojo)).club.feed.posts[0];
  assert.equal(seen.id, posted.id);
  assert.deepEqual([seen.canEdit, seen.canDelete, seen.author.isMe, seen.author.displayName], [false, false, false, "Efua"]);
  assert.equal(seen.workout.volumeKg, 1200);
  assert.equal((await ok(`query($id:ID!){ clubPost(id:$id){ id } }`, { id: posted.id }, outsider)).clubPost, null, "outsiders can't open it");
  assert.equal((await ok(FEED, { id: feedClub }, abena)).club.feed.posts[0].canDelete, true, "Admins can delete any post");
});

test("reactions, comments and coach video replies", async () => {
  const postId = (await ok(FEED, { id: feedClub }, kojo)).club.feed.posts[0].id;
  const REACT = `mutation($p:ID!,$r:ClubReaction){ reactToClubPost(postId:$p, reaction:$r){ myReaction reactions{ reaction count } } }`;
  await ok(REACT, { p: postId, r: "FIRE" }, kojo);
  const changed = (await ok(REACT, { p: postId, r: "HEART" }, kojo)).reactToClubPost;
  assert.equal(changed.myReaction, "HEART", "one reaction each; tapping another changes it");
  await ok(REACT, { p: postId, r: "FIRE" }, abena);
  assert.deepEqual((await ok(REACT, { p: postId, r: "FIRE" }, kwame)).reactToClubPost.reactions, [{ reaction: "FIRE", count: 2 }, { reaction: "HEART", count: 1 }]);
  assert.equal((await ok(REACT, { p: postId, r: null }, kwame)).reactToClubPost.myReaction, null);
  assert.equal((await gql(REACT, { p: postId, r: "FIRE" }, outsider)).errors?.[0].extensions.code, "NOT_FOUND");

  const COMMENT = `mutation($p:ID!,$b:String,$m:ID){ commentOnClubPost(postId:$p, body:$b, mediaId:$m){ commentCount comments{ id body canDelete author{ displayName isCoach } media{ kind url } } } }`;
  await ok(COMMENT, { p: postId, b: "  Strong!  " }, kojo);
  assert.equal((await gql(COMMENT, { p: postId, b: "   " }, kojo)).errors?.[0].extensions.code, "BAD_USER_INPUT");
  assert.equal((await gql(UPLOAD, { c: feedClub, p: "COMMENT", t: "video/mp4", s: 1000, d: 10 }, kojo)).errors?.[0].extensions.code, "FORBIDDEN", "only coaches reply with video");
  const tooLong = await gql(UPLOAD, { c: feedClub, p: "COMMENT", t: "video/mp4", s: 1000, d: 45 }, kwame);
  assert.match(tooLong.errors?.[0].message, /30 seconds/);
  const clip = await upload(kwame, feedClub, "COMMENT", "video/mp4", 2048, 20);
  const withVideo = (await ok(COMMENT, { p: postId, b: "Brace before you unrack", m: clip }, kwame)).commentOnClubPost;
  assert.equal(withVideo.commentCount, 2);
  const reply = withVideo.comments[1];
  assert.deepEqual([reply.author.isCoach, reply.media.kind], [true, "VIDEO"]);
  const served = await store().read(tokenOf(reply.media.url));
  assert.equal(served?.body.length, 2048);
  assert.equal(served?.contentType, "video/mp4");
  assert.equal((await gql(COMMENT, { p: postId, m: clip }, kwame)).errors?.[0].extensions.code, "BAD_USER_INPUT", "an upload attaches once");

  const DEL = `mutation($id:ID!){ deleteClubComment(id:$id){ commentCount } }`;
  assert.equal((await gql(DEL, { id: reply.id }, kojo)).errors?.[0].extensions.code, "FORBIDDEN");
  assert.equal((await ok(DEL, { id: reply.id }, kwame)).deleteClubComment.commentCount, 1);
  const { rows } = await pool.query(`SELECT storage_path FROM clubs.media WHERE id = $1`, [clip]);
  assert.equal(rows.length, 0, "the video reply's file goes with it");
});

test("posts with media: limits, progress with weight change, coach videos, filters, pages, edits and deletes", async () => {
  // Upload limits.
  assert.match((await gql(UPLOAD, { c: feedClub, p: "POST", t: "video/mp4", s: 1000, d: 45 }, efua)).errors?.[0].message, /30 seconds/);
  assert.match((await gql(UPLOAD, { c: feedClub, p: "POST", t: "image/jpeg", s: 11 * 1048576 }, efua)).errors?.[0].message, /limit is 10 MB/);
  assert.match((await gql(UPLOAD, { c: feedClub, p: "POST", t: "text/plain", s: 10 }, efua)).errors?.[0].message, /isn't supported/);
  assert.equal((await gql(UPLOAD, { c: feedClub, p: "POST", t: "image/jpeg", s: 10 }, outsider)).errors?.[0].extensions.code, "NOT_FOUND");
  const big = (await ok(UPLOAD, { c: feedClub, p: "POST", t: "video/mp4", s: 1000, d: 45 }, kwame)).requestClubUpload;
  assert.equal(big.maxBytes, 100 * 1048576, "coach videos can run to 60 seconds and 100 MB");
  const tooBig = (await ok(UPLOAD, { c: feedClub, p: "POST", t: "image/png", s: 10 }, efua)).requestClubUpload;
  assert.equal(await store().put(tokenOf(tooBig.url), "image/png", Buffer.alloc(11 * 1048576)), 413, "the upload link enforces the size too");
  const never = (await ok(UPLOAD, { c: feedClub, p: "POST", t: "image/jpeg", s: 10 }, efua)).requestClubUpload.mediaId;
  assert.match((await gql(CREATE_POST, { i: { clubIds: [feedClub], kind: "MEAL", body: "Waakye", mediaId: never } }, efua)).errors?.[0].message, /didn't finish/);

  // Progress, with the change since Day 1 (81.2 kg in the quiz, 79 kg now).
  const photo = await upload(efua, feedClub, "POST", "image/jpeg", 4096);
  const progress = (await ok(CREATE_POST, { i: { clubIds: [feedClub], kind: "PROGRESS", body: "Two weeks in", mediaId: photo, includeWeightChange: true } }, efua)).createClubPost[0];
  assert.deepEqual([progress.kind, progress.weightChangeKg, progress.media.kind], ["PROGRESS", -2.2, "IMAGE"]);
  assert.equal((await gql(CREATE_POST, { i: { clubIds: [feedClub], kind: "PROGRESS", includeWeightChange: true, body: "x" } }, kojo)).errors?.[0].extensions.code, "BAD_USER_INPUT", "no weigh-in, no weight change");
  assert.equal((await gql(CREATE_POST, { i: { clubIds: [feedClub], kind: "MEAL" } }, kojo)).errors?.[0].extensions.code, "BAD_USER_INPUT", "words or a photo");

  // Coach videos: coaches only, and a video.
  const memberClip = await upload(efua, feedClub, "POST", "video/mp4", 1024, 12);
  assert.equal((await gql(CREATE_POST, { i: { clubIds: [feedClub], kind: "COACH_VIDEO", body: "Form tip", mediaId: memberClip } }, efua)).errors?.[0].extensions.code, "FORBIDDEN");
  const coachClip = await upload(kwame, feedClub, "POST", "video/mp4", 1024, 55);
  const coachPost = (await ok(CREATE_POST, { i: { clubIds: [feedClub], kind: "COACH_VIDEO", body: "Hip hinge, slow", mediaId: coachClip } }, kwame)).createClubPost[0];
  assert.equal(coachPost.media.durationSeconds, 55);
  const meal = (await ok(CREATE_POST, { i: { clubIds: [feedClub], kind: "MEAL", body: "Banku and tilapia" } }, kojo)).createClubPost[0];

  // Filters and pages.
  const kinds = async (f: string) => (await ok(FEED, { id: feedClub, f }, kojo)).club.feed.posts.map((p: any) => p.kind);
  assert.deepEqual(await kinds("ALL"), ["MEAL", "COACH_VIDEO", "PROGRESS", "WORKOUT"]);
  assert.deepEqual(await kinds("WINS"), ["PROGRESS", "WORKOUT"]);
  assert.deepEqual(await kinds("COACH_VIDEOS"), ["COACH_VIDEO"]);
  assert.deepEqual(await kinds("CHALLENGES"), []);
  const p1 = (await ok(FEED, { id: feedClub, l: 3 }, kojo)).club.feed;
  const p2 = (await ok(FEED, { id: feedClub, l: 3, a: p1.nextCursor }, kojo)).club.feed;
  assert.deepEqual([p1.posts.length, p2.posts.length, p2.nextCursor], [3, 1, null]);
  assert.equal(p2.posts[0].kind, "WORKOUT");

  // Edits and deletes.
  const EDIT = `mutation($id:ID!,$b:String!){ editClubPost(id:$id, body:$b){ body } }`;
  assert.equal((await ok(EDIT, { id: meal.id, b: "Banku and tilapia, no regrets" }, kojo)).editClubPost.body, "Banku and tilapia, no regrets");
  assert.equal((await gql(EDIT, { id: meal.id, b: "hacked" }, abena)).errors?.[0].extensions.code, "FORBIDDEN", "even Admins can't edit others' words");
  const DELETE = `mutation($id:ID!){ deleteClubPost(id:$id) }`;
  assert.equal((await gql(DELETE, { id: coachPost.id }, efua)).errors?.[0].extensions.code, "FORBIDDEN");
  const path = (await pool.query(`SELECT storage_path FROM clubs.media WHERE id = $1`, [coachClip])).rows[0].storage_path;
  assert.ok(await store().stat(path));
  assert.equal((await ok(DELETE, { id: coachPost.id }, abena)).deleteClubPost, true);
  assert.equal(await store().stat(path), null, "deleting a post deletes its file");
  assert.deepEqual(await kinds("COACH_VIDEOS"), []);
  assert.equal((await ok(`query($id:ID!){ clubPost(id:$id){ id } }`, { id: coachPost.id }, kwame)).clubPost, null);
});

test("activities: share prompt, run post, and the ask-to-share setting", async () => {
  const RUN = `mutation($i:LogActivityInput!){ logActivity(input:$i){ id } }`;
  const run = (await ok(RUN, { i: { performedOn: today, activityType: "RUN", durationMinutes: 28, distanceKm: 5.2 } }, efua)).logActivity.id;
  const draft = (await ok(SHARE, { a: run }, efua)).clubShareDraft;
  assert.equal(draft.text, "Ran 5.2 km in 28 min (5:23 /km).");
  const post = (await ok(CREATE_POST, { i: { clubIds: [feedClub], activityId: run, body: draft.text } }, efua)).createClubPost[0];
  assert.deepEqual([post.kind, post.activity.label, post.activity.distanceKm], ["RUN", "Running", 5.2]);

  const SETTING = `mutation($c:ID!,$on:Boolean!){ setClubShareSetting(clubId:$c, askToShare:$on){ me{ askToShare } members{ userId askToShare } } }`;
  const off = (await ok(SETTING, { c: feedClub, on: false }, efua)).setClubShareSetting;
  assert.equal(off.me.askToShare, false);
  assert.ok(off.members.every((m: any) => m.userId === efua || m.askToShare === null), "nobody sees anyone else's setting");
  const walk = (await ok(RUN, { i: { performedOn: today, activityType: "WALK", durationMinutes: 30 } }, efua)).logActivity.id;
  assert.deepEqual((await ok(SHARE, { a: walk }, efua)).clubShareDraft.clubs, [], "no prompt when asked not to");
  await ok(SETTING, { c: feedClub, on: true }, efua);
});

test("coaches see members' workouts and activities since they joined, and only while both are in the club", async () => {
  const OVERVIEW = `query($id:ID!){ club(id:$id){ coachOverview{ member{ userId displayName } workouts activities prs sessionsPerWeek lastWorkoutAt } } }`;
  const overview = (await ok(OVERVIEW, { id: feedClub }, kwame)).club.coachOverview;
  const e = overview.find((o: any) => o.member.userId === efua);
  assert.deepEqual([e.workouts, e.activities], [2, 2], "the workout from before she joined isn't shown");
  assert.ok(e.prs >= 2 && e.lastWorkoutAt);
  assert.ok(!overview.some((o: any) => o.member.userId === kwame), "not themselves");
  assert.deepEqual((await ok(OVERVIEW, { id: feedClub }, kojo)).club.coachOverview, [], "members don't get this");

  const LOG = `query($c:ID!,$u:ID!){ clubMemberLog(clubId:$c, userId:$u){ member{ displayName } workouts{ id volumeKg prs{ type } } activities{ activityType } } }`;
  const log = (await ok(LOG, { c: feedClub, u: efua }, kwame)).clubMemberLog;
  assert.deepEqual([log.member.displayName, log.workouts.length, log.workouts[0].id], ["Efua", 2, heavySession]);
  assert.deepEqual(log.activities.map((a: any) => a.activityType).sort(), ["RUN", "WALK"]);
  assert.equal((await gql(LOG, { c: feedClub, u: efua }, kojo)).errors?.[0].extensions.code, "FORBIDDEN");
  assert.equal((await gql(LOG, { c: feedClub, u: outsider }, kwame)).errors?.[0].extensions.code, "NOT_FOUND");

  // Removed: the coach loses access at once, and her posts stay, marked as no longer in the club.
  await ok(`mutation($c:ID!,$u:ID!){ removeClubMember(clubId:$c,userId:$u){ id } }`, { c: feedClub, u: efua }, abena);
  assert.equal((await gql(LOG, { c: feedClub, u: efua }, kwame)).errors?.[0].extensions.code, "NOT_FOUND");
  const hers = (await ok(FEED, { id: feedClub }, kojo)).club.feed.posts.filter((p: any) => p.author.userId === efua);
  assert.ok(hers.length >= 3 && hers.every((p: any) => p.author.inClub === false));
  assert.equal((await gql(SHARE, { s: heavySession }, efua)).errors, undefined);
  assert.deepEqual((await ok(SHARE, { s: heavySession }, efua)).clubShareDraft.clubs, []);
});

test("reports reach the console, the club photo, leaving with your posts, and stale uploads", async () => {
  const workoutPost = (await ok(FEED, { id: feedClub, f: "WINS" }, kojo)).club.feed.posts.find((p: any) => p.kind === "WORKOUT");
  const REPORT = `mutation($p:ID!,$r:String!){ reportClubPost(postId:$p, reason:$r) }`;
  await ok(REPORT, { p: workoutPost.id, r: "Spam" }, kojo);
  await ok(REPORT, { p: workoutPost.id, r: "Spam again" }, kojo);
  await ok(REPORT, { p: workoutPost.id, r: "Not okay" }, kwame);
  assert.equal((await gql(REPORT, { p: workoutPost.id, r: "x" }, outsider)).errors?.[0].extensions.code, "NOT_FOUND");
  const REPORTS = `{ consoleReports { id clubName reason reporterName reportCount item{ postId kind authorName body deleted } } }`;
  assert.equal((await gql(REPORTS, {}, abena)).errors?.[0].extensions.code, "FORBIDDEN", "club Admins aren't App staff");
  const reports = (await ok(REPORTS, {}, staff)).consoleReports;
  assert.deepEqual(reports.map((r: any) => [r.reporterName, r.reportCount]), [["Kojo", 2], ["Kwame", 2]], "one open report per person");
  assert.deepEqual([reports[0].clubName, reports[0].item.kind, reports[0].item.authorName, reports[0].item.deleted], ["Gym Friends", "WORKOUT", "Efua", false]);
  await ok(`mutation($id:ID!){ resolveClubReport(id:$id, remove:true) }`, { id: reports[0].id }, staff);
  assert.deepEqual((await ok(REPORTS, {}, staff)).consoleReports, [], "both reports on that post close");
  assert.ok(!(await ok(FEED, { id: feedClub }, kojo)).club.feed.posts.some((p: any) => p.id === workoutPost.id));

  // Club photo: Admins only.
  assert.equal((await gql(UPLOAD, { c: feedClub, p: "CLUB_PHOTO", t: "image/jpeg", s: 100 }, kojo)).errors?.[0].extensions.code, "FORBIDDEN");
  const pic = await upload(abena, feedClub, "CLUB_PHOTO", "image/jpeg", 300);
  const PHOTO = `mutation($c:ID!,$m:ID){ setClubPhoto(clubId:$c, mediaId:$m){ photoUrl } }`;
  assert.ok((await ok(PHOTO, { c: feedClub, m: pic }, abena)).setClubPhoto.photoUrl);
  assert.ok((await ok(`query($id:ID!){ club(id:$id){ photoUrl } }`, { id: feedClub }, kojo)).club.photoUrl);
  assert.equal((await ok(PHOTO, { c: feedClub, m: null }, abena)).setClubPhoto.photoUrl, null);
  assert.equal((await pool.query(`SELECT 1 FROM clubs.media WHERE id = $1`, [pic])).rows.length, 0, "the old photo is removed");

  // Leaving with "delete my posts".
  const LEAVE = `mutation($c:ID!,$d:Boolean){ leaveClub(clubId:$c, deleteMyPosts:$d) }`;
  await ok(LEAVE, { c: feedClub, d: true }, kojo);
  const left = (await ok(FEED, { id: feedClub }, abena)).club.feed.posts;
  assert.ok(!left.some((p: any) => p.author.userId === kojo), "Kojo's posts went with him");
  assert.ok(left.some((p: any) => p.author.userId === efua), "removed members' posts stay");
  const before = (await ok(FEED, { id: feedClub }, abena)).club.feed.posts.length;
  assert.match((await gql(LEAVE, { c: feedClub, d: true }, abena)).errors?.[0].message, /last Admin/);
  assert.equal((await ok(FEED, { id: feedClub }, abena)).club.feed.posts.length, before, "a blocked leave deletes nothing");

  // Uploads never attached are cleaned up after a day.
  const stale = (await ok(UPLOAD, { c: feedClub, p: "POST", t: "image/jpeg", s: 10 }, abena)).requestClubUpload.mediaId;
  await pool.query(`UPDATE clubs.media SET created_at = now() - interval '2 days' WHERE id = $1`, [stale]);
  assert.ok((await cleanUpStaleUploads()) >= 1);
  assert.equal((await pool.query(`SELECT 1 FROM clubs.media WHERE id = $1`, [stale])).rows.length, 0);
});

// ── Club routines (build step 3) ────────────────────────────────────────

const ROUTINE = `id title kind weekdays activityType activityLabel minDistanceKm minMinutes clubName exercises{ exerciseId name sets reps }`;
const CREATE_ROUTINE = `mutation($c:ID!,$i:ClubRoutineInput!){ createClubRoutine(clubId:$c, input:$i){ ${ROUTINE} } }`;
const MY_ROUTINES = `query($d:String!){ myClubRoutines(date:$d){ done routine{ id title } } }`;
const PROGRESS = `query($id:ID!,$t:String!){ clubRoutineProgress(id:$id, today:$t, weeks:3){ weekStarts members{ displayName isMe streak doneToday weeks{ weekStart done scheduled } } } }`;
let ato = "", runDay = "", circuit = "";

test("routines: Admins only, checked input, at most 5 active per club", async () => {
  ato = await userWithEmail("Ato", "ato@example.com");
  mailer.sent.length = 0;
  await ok(`mutation($c:ID!,$e:[String!]!){ inviteToClub(clubId:$c, emails:$e){ id } }`, { c: feedClub, e: ["ato@example.com"] }, abena);
  await ok(JOIN, { t: tokenIn(lastMailTo("ato@example.com")!.text), c: true }, ato);

  const run = { title: "Tuesday is run day", kind: "ACTIVITY", weekdays: [weekdayOf(today)], activityType: "RUN", minDistanceKm: 5 };
  assert.equal((await gql(CREATE_ROUTINE, { c: feedClub, i: run }, kwame)).errors?.[0].extensions.code, "FORBIDDEN", "coaches set challenges, not routines");
  const bad = async (i: object) => (await gql(CREATE_ROUTINE, { c: feedClub, i: { ...run, ...i } }, abena)).errors?.[0].message;
  assert.match(await bad({ weekdays: [] }), /at least one day/);
  assert.match(await bad({ weekdays: [7] }), /at least one day/);
  assert.match(await bad({ activityType: "LIFTING" }), /Pick the activity/);
  assert.match(await bad({ activityType: "FOOTBALL" }), /doesn't take a distance/);
  assert.match(await bad({ kind: "WORKOUT", exercises: [] }), /Add 1 to 15 exercises/);
  assert.match(await bad({ title: "x" }), /2 to 60/);

  const made = (await ok(CREATE_ROUTINE, { c: feedClub, i: run }, abena)).createClubRoutine;
  runDay = made.id;
  assert.deepEqual([made.activityLabel, made.minDistanceKm, made.clubName, made.exercises], ["Running", 5, "Gym Friends", []]);

  const ex = (await ok(`{ exercises { id name } }`)).exercises;
  const wk = { title: "Office circuit", kind: "WORKOUT", weekdays: [0, 1, 2, 3, 4, 5, 6], exercises: [{ exerciseId: bench, sets: 3, reps: 10 }, { exerciseId: squat, sets: 2, reps: 12 }] };
  assert.match((await gql(CREATE_ROUTINE, { c: feedClub, i: { ...wk, exercises: [...wk.exercises, { exerciseId: bench, sets: 1, reps: 1 }] } }, abena)).errors?.[0].message, /only be in a routine once/);
  const c = (await ok(CREATE_ROUTINE, { c: feedClub, i: wk }, abena)).createClubRoutine;
  circuit = c.id;
  assert.deepEqual(c.exercises.map((e: any) => [e.name, e.sets, e.reps]), [[ex.find((e: any) => e.id === bench).name, 3, 10], [ex.find((e: any) => e.id === squat).name, 2, 12]]);

  const extra = [];
  for (let i = 0; i < 3; i++) extra.push((await ok(CREATE_ROUTINE, { c: feedClub, i: { ...run, title: `Walk ${i}`, activityType: "WALK", minDistanceKm: null } }, abena)).createClubRoutine.id);
  assert.match((await gql(CREATE_ROUTINE, { c: feedClub, i: { ...run, title: "Sixth" } }, abena)).errors?.[0].message, /up to 5 routines/);
  await ok(`mutation($id:ID!){ archiveClubRoutine(id:$id) }`, { id: extra[0] }, abena);
  const listed = (await ok(`query($id:ID!){ club(id:$id){ routineLimit routines{ id } } }`, { id: feedClub }, ato)).club;
  assert.deepEqual([listed.routineLimit, listed.routines.length], [5, 4], "ending one frees a slot");

  const UPDATE = `mutation($id:ID!,$i:ClubRoutineInput!){ updateClubRoutine(id:$id, input:$i){ title minDistanceKm } }`;
  assert.match((await gql(UPDATE, { id: runDay, i: { ...wk } }, abena)).errors?.[0].message, /can't switch/);
  assert.equal((await gql(UPDATE, { id: runDay, i: run }, ato)).errors?.[0].extensions.code, "FORBIDDEN");
  assert.deepEqual((await ok(UPDATE, { id: runDay, i: { ...run, title: "Run day", minDistanceKm: 5 } }, abena)).updateClubRoutine, { title: "Run day", minDistanceKm: 5 });
  for (const id of extra.slice(1)) await ok(`mutation($id:ID!){ archiveClubRoutine(id:$id) }`, { id }, abena);
});

test("activity routines tick themselves from the log, and untick if the activity goes", async () => {
  const LOG_ACT = `mutation($i:LogActivityInput!){ logActivity(input:$i){ id } }`;
  const doneOf = async (id: string) => (await ok(MY_ROUTINES, { d: today }, ato)).myClubRoutines.find((r: any) => r.routine.id === id)?.done;
  assert.equal(await doneOf(runDay), false);
  await ok(LOG_ACT, { i: { performedOn: today, activityType: "RUN", durationMinutes: 25, distanceKm: 4 } }, ato);
  assert.equal(await doneOf(runDay), false, "4 km doesn't meet the 5 km bar");
  const run = (await ok(LOG_ACT, { i: { performedOn: today, activityType: "RUN", durationMinutes: 28, distanceKm: 5.2 } }, ato)).logActivity.id;
  assert.equal(await doneOf(runDay), true);

  const p = (await ok(PROGRESS, { id: runDay, t: today }, kwame)).clubRoutineProgress;
  assert.equal(p.weekStarts.length, 3);
  const mine = p.members.find((m: any) => m.displayName === "Ato");
  assert.deepEqual([mine.streak, mine.doneToday, mine.weeks[2]], [1, true, { weekStart: mondayOf(today), done: 1, scheduled: 1 }]);
  assert.equal(p.members[0].displayName, "Ato", "longest streak first");
  assert.deepEqual(p.members.filter((m: any) => m.displayName !== "Ato").map((m: any) => m.streak), [0, 0]);
  assert.equal((await ok(PROGRESS, { id: runDay, t: today }, outsider)).clubRoutineProgress, null);

  await ok(`mutation($id:ID!){ deleteActivity(id:$id) }`, { id: run }, ato);
  assert.equal(await doneOf(runDay), false, "deleting the run unticks it");
});

test("workout routines are logged as a session, once a day", async () => {
  const LOG = `mutation($r:ID!,$d:String!,$m:Int,$w:[ClubRoutineWeightInput!]){ logClubRoutineWorkout(routineId:$r, date:$d, durationMinutes:$m, weights:$w){ done routine{ id } } }`;
  assert.match((await gql(LOG, { r: runDay, d: today }, ato)).errors?.[0].message, /ticks itself/);
  assert.match((await gql(LOG, { r: circuit, d: addDaysIso(today, -5) }, ato)).errors?.[0].message, /today or yesterday/);
  assert.equal((await gql(LOG, { r: circuit, d: today }, outsider)).errors?.[0].extensions.code, "NOT_FOUND");
  const logged = (await ok(LOG, { r: circuit, d: today, m: 20, w: [{ exerciseId: bench, weightKg: 20 }] }, ato)).logClubRoutineWorkout;
  assert.equal(logged.done, true);
  assert.match((await gql(LOG, { r: circuit, d: today }, ato)).errors?.[0].message, /already logged/);

  const hist = (await ok(`{ workoutHistory(limit: 1) { setCount volumeKg durationMinutes notes } }`, {}, ato)).workoutHistory[0];
  assert.deepEqual([hist.setCount, hist.volumeKg, hist.durationMinutes, hist.notes], [5, 600, 20, "Club routine: Office circuit"], "3×10 at 20 kg, plus 2×12 bodyweight");
  const p = (await ok(PROGRESS, { id: circuit, t: today }, abena)).clubRoutineProgress;
  assert.deepEqual(p.members.find((m: any) => m.displayName === "Ato").weeks.at(-1).done, 1);
  assert.equal(p.members.find((m: any) => m.isMe).displayName, "Abena");

  // Leaving takes the routines off Today.
  await ok(`mutation($c:ID!){ leaveClub(clubId:$c) }`, { c: feedClub }, ato);
  assert.deepEqual((await ok(MY_ROUTINES, { d: today }, ato)).myClubRoutines, []);
  assert.ok(!(await ok(PROGRESS, { id: circuit, t: today }, abena)).clubRoutineProgress.members.some((m: any) => m.displayName === "Ato"));
});

// ── Coach challenges (Clubs v1 step 4) ──────────────────────────────────

const CHALLENGE = `id title kind cadence startsOn endsOn state totalPeriods joinedCount myAnswer canEnd clubName waterMl foodName foodGrams foodUnit
  activityLabel minDistanceKm timeLimitMinutes coach{ displayName isMe } video{ kind } exercises{ name sets reps }`;
const CREATE_CH = `mutation($c:ID!,$i:ClubChallengeInput!){ createClubChallenge(clubId:$c, input:$i){ ${CHALLENGE} } }`;
const MINE = `doneForPeriod done total completed winDraft challenge{ id title }`;
const MY_CH = `query($d:String!){ myClubChallenges(date:$d){ ${MINE} } }`;
const PENDING = `query($d:String!){ pendingClubChallenges(date:$d){ id title myAnswer } }`;
const RESPOND = `mutation($id:ID!,$j:Boolean!){ respondToClubChallenge(id:$id, join:$j){ id myAnswer joinedCount } }`;
const ENTRY = `mutation($id:ID!,$i:ClubChallengeEntryInput!){ submitClubChallengeEntry(challengeId:$id, input:$i){ completed mine{ ${MINE} } } }`;
const CH_PAGE = `query($id:ID!){ clubChallenge(id:$id){ challenge{ id title state } mine{ ${MINE} }
  participants{ person{ displayName isMe } done total completed entries{ onDate waterMl distanceKm resultSeconds proof{ kind url } } }
  comments{ id body canDelete author{ displayName } } } }`;
let drink = "", run3k = "", salad = "", circuitCh = "", yaa = "", kobby = "";

test("challenges setup: two new members, one with a plan", async () => {
  yaa = await userWithEmail("Yaa", "yaa@example.com");
  kobby = await userWithEmail("Kobby", "kobby@example.com");
  mailer.sent.length = 0;
  await ok(`mutation($c:ID!,$e:[String!]!){ inviteToClub(clubId:$c, emails:$e){ id } }`, { c: feedClub, e: ["yaa@example.com", "kobby@example.com"] }, abena);
  for (const [id, email] of [[yaa, "yaa@example.com"], [kobby, "kobby@example.com"]]) await ok(JOIN, { t: tokenIn(lastMailTo(email)!.text), c: true }, id);
  await ok(ONBOARD, { i: { displayName: "Yaa", screening: screeningClear, training, diet, startDate: today } }, yaa);
});

test("challenges: coaches only, checked input, at most 3 a week each, and a push to members", async () => {
  const water = { title: "Drink 500 ml", cadence: "DAILY", kind: "WATER", waterMl: 500, startsOn: today, endsOn: today };
  assert.equal((await gql(CREATE_CH, { c: feedClub, i: water }, yaa)).errors?.[0].extensions.code, "FORBIDDEN");
  assert.match((await gql(CREATE_CH, { c: feedClub, i: water }, abena)).errors?.[0].message, /Only coaches set challenges/, "an Admin needs the Coach role too");
  const bad = async (i: object) => (await gql(CREATE_CH, { c: feedClub, i: { ...water, ...i } }, kwame)).errors?.[0].message;
  assert.match(await bad({ waterMl: 50 }), /100 and 10,000 ml/);
  assert.match(await bad({ startsOn: addDaysIso(today, -1) }), /can't start in the past/);
  assert.match(await bad({ endsOn: addDaysIso(today, 28) }), /up to 4 weeks/);
  assert.match(await bad({ kind: "ACTIVITY", activityType: "RUN" }), /distance or a time/);
  assert.match(await bad({ kind: "ACTIVITY", activityType: "FOOTBALL", minDistanceKm: 2 }), /doesn't take a distance/);
  assert.match(await bad({ kind: "FOOD", foodKey: "pizza-from-mars", foodGrams: 50 }), /isn't in the list/);
  assert.match(await bad({ kind: "WORKOUT", exercises: [] }), /Add 1 to 15/);

  // Videos explaining a challenge: coaches only, and video only.
  assert.equal((await gql(UPLOAD, { c: feedClub, p: "CHALLENGE", t: "video/mp4", s: 100, d: 20 }, yaa)).errors?.[0].extensions.code, "FORBIDDEN");
  assert.match((await gql(UPLOAD, { c: feedClub, p: "CHALLENGE", t: "image/png", s: 100 }, kwame)).errors?.[0].message, /takes a video/);
  const video = await upload(kwame, feedClub, "CHALLENGE", "video/mp4", 2000, 50);

  // Kobby wants the push; Yaa turned it off.
  const pushed: string[] = [];
  setPushSender(async (sub) => { pushed.push(sub.endpoint); });
  const SUB = `mutation($i:PushSubscriptionInput!){ subscribePush(input:$i) }`;
  await ok(SUB, { i: { endpoint: "https://push.example.com/kobby", p256dh: "p", auth: "a", timeZone: "Africa/Accra" } }, kobby);
  await ok(SUB, { i: { endpoint: "https://push.example.com/yaa", p256dh: "p", auth: "a", timeZone: "Africa/Accra" } }, yaa);
  await ok(`mutation{ setReminderPrefs(input:{ weighIn:true, progressPhotos:true, missedSession:true, clubChallenges:false }){ clubChallenges } }`, {}, yaa);
  assert.equal((await ok(`{ reminderPrefs { clubChallenges } }`, {}, kobby)).reminderPrefs.clubChallenges, true, "on by default");
  // Leaving it out keeps it.
  await ok(`mutation{ setReminderPrefs(input:{ weighIn:true, progressPhotos:true, missedSession:false }){ clubChallenges } }`, {}, yaa);
  assert.equal((await ok(`{ reminderPrefs { clubChallenges } }`, {}, yaa)).reminderPrefs.clubChallenges, false);

  const made = (await ok(CREATE_CH, { c: feedClub, i: { ...water, videoMediaId: video } }, kwame)).createClubChallenge;
  drink = made.id;
  assert.deepEqual([made.state, made.totalPeriods, made.coach.isMe, made.video.kind, made.myAnswer, made.canEnd], ["RUNNING", 1, true, "VIDEO", null, true]);
  assert.deepEqual(pushed, ["https://push.example.com/kobby"]);

  // Defaults: from today to that week's Sunday.
  const run = (await ok(CREATE_CH, { c: feedClub, i: { title: "Run 3 km", cadence: "WEEKLY", kind: "ACTIVITY", activityType: "RUN", minDistanceKm: 3 } }, kwame)).createClubChallenge;
  run3k = run.id;
  assert.deepEqual([run.startsOn, run.endsOn, run.activityLabel, run.totalPeriods], [today, addDaysIso(mondayOf(today), 6), "Running", 1]);
  const food = (await ok(CREATE_CH, { c: feedClub, i: { ...water, title: "Salad a day", kind: "FOOD", foodKey: "salad", foodGrams: 50, waterMl: null } }, kwame)).createClubChallenge;
  salad = food.id;
  assert.deepEqual([food.foodName, food.foodGrams, food.foodUnit], ["Salad (no dressing)", 50, "g"]);

  assert.match((await gql(CREATE_CH, { c: feedClub, i: { ...water, title: "Fourth" } }, kwame)).errors?.[0].message, /3 challenges this week/);
  const quota = (await ok(`query($id:ID!){ club(id:$id){ challengeQuota{ limit usedThisWeek } challenges{ id } } }`, { id: feedClub }, kwame)).club;
  assert.deepEqual(quota.challengeQuota, { limit: 3, usedThisWeek: 3 });
  assert.equal((await ok(`query($id:ID!){ club(id:$id){ challengeQuota{ limit } } }`, { id: feedClub }, yaa)).club.challengeQuota, null);

  // The cap is per coach: an Admin who takes the Coach role has their own 3.
  await ok(ROLES, { c: feedClub, u: abena, a: true, k: true }, abena);
  const wk = { title: "Push-up ladder", cadence: "DAILY", kind: "WORKOUT", startsOn: today, endsOn: tomorrow, timeLimitMinutes: 20, exercises: [{ exerciseId: bench, sets: 2, reps: 10 }] };
  const c = (await ok(CREATE_CH, { c: feedClub, i: wk }, abena)).createClubChallenge;
  circuitCh = c.id;
  assert.deepEqual([c.timeLimitMinutes, c.totalPeriods, c.exercises.length], [20, 2, 1]);
});

test("challenges: the pop-up, taking one on, and saying not for me", async () => {
  const pending = async (u: string) => (await ok(PENDING, { d: today }, u)).pendingClubChallenges.map((c: any) => c.title).sort();
  assert.deepEqual(await pending(kobby), ["Drink 500 ml", "Push-up ladder", "Run 3 km", "Salad a day"]);
  assert.deepEqual(await pending(kwame), ["Push-up ladder"], "a coach isn't offered their own");
  assert.deepEqual(await pending(outsider), []);

  assert.equal((await ok(RESPOND, { id: run3k, j: false }, kobby)).respondToClubChallenge.myAnswer, "DECLINED");
  assert.ok(!(await pending(kobby)).includes("Run 3 km"), "not for me: it stops appearing");
  assert.equal((await gql(RESPOND, { id: drink, j: true }, outsider)).errors?.[0].extensions.code, "NOT_FOUND");
  for (const id of [drink, run3k, salad, circuitCh]) await ok(RESPOND, { id, j: true }, yaa);
  assert.deepEqual(await pending(yaa), []);
  assert.equal((await ok(RESPOND, { id: drink, j: true }, kobby)).respondToClubChallenge.joinedCount, 2);

  const mine = (await ok(MY_CH, { d: today }, yaa)).myClubChallenges;
  assert.equal(mine.length, 4);
  assert.ok(mine.every((m: any) => !m.doneForPeriod && m.done === 0 && !m.completed && m.winDraft === null));
});

test("challenges: proof is checked against the log, and finishing offers a win post", async () => {
  // Water: the day's total has to reach the amount, and proof is a photo or video.
  const proof = () => upload(yaa, feedClub, "PROOF", "image/jpeg", 500);
  assert.match((await gql(ENTRY, { id: drink, i: { date: today, mediaId: await proof() } }, yaa)).errors?.[0].message, /logged 0 ml so far/);
  await ok(`mutation($d:String!){ setWater(date:$d, ml:600){ water{ ml } } }`, { d: today }, yaa);
  assert.equal((await gql(ENTRY, { id: drink, i: { date: today, mediaId: await upload(yaa, feedClub, "POST", "image/jpeg", 10) } }, yaa)).errors?.[0].message, "That upload can't be used here.", "proof needs a PROOF upload");
  const done = (await ok(ENTRY, { id: drink, i: { date: today, mediaId: await proof(), note: "Two bottles" } }, yaa)).submitClubChallengeEntry;
  assert.deepEqual([done.completed, done.mine.done, done.mine.total, done.mine.doneForPeriod], [true, 1, 1, true]);
  assert.equal(done.mine.winDraft, "Challenge done: Drink 500 ml.");
  assert.match((await gql(ENTRY, { id: drink, i: { date: today, mediaId: await proof() } }, yaa)).errors?.[0].message, /already sent proof/);
  assert.match((await gql(ENTRY, { id: run3k, i: { date: today, mediaId: await upload(kobby, feedClub, "PROOF", "image/jpeg", 10) } }, kobby)).errors?.[0].message, /Take on the challenge first/);

  // The win post: in the club's feed, with a copy of the proof, once.
  const WIN = `mutation($id:ID!,$b:String){ postClubChallengeWin(challengeId:$id, body:$b){ id kind body media{ kind } challenge{ title } } }`;
  assert.match((await gql(WIN, { id: salad }, yaa)).errors?.[0].message, /Finish the challenge first/);
  const win = (await ok(WIN, { id: drink }, yaa)).postClubChallengeWin;
  assert.deepEqual([win.kind, win.body, win.media?.kind, win.challenge.title], ["CHALLENGE_WIN", "Challenge done: Drink 500 ml.", "IMAGE", "Drink 500 ml"]);
  assert.match((await gql(WIN, { id: drink }, yaa)).errors?.[0].message, /already posted/);
  const wins = (await ok(FEED, { id: feedClub, f: "CHALLENGES" }, kobby)).club.feed.posts;
  assert.deepEqual(wins.map((p: any) => p.id), [win.id]);
  assert.equal((await ok(MY_CH, { d: today }, yaa)).myClubChallenges.find((m: any) => m.challenge.id === drink).winDraft, null, "no draft once posted");
  await ok(`mutation($id:ID!){ deleteClubPost(id:$id) }`, { id: win.id }, yaa);
  const page = (await ok(CH_PAGE, { id: drink }, kobby)).clubChallenge;
  assert.equal(page.participants[0].entries[0].proof.kind, "IMAGE", "deleting the win leaves the proof");

  // Activity: from the logged activity, which has to meet the bar.
  const LOG_ACT = `mutation($i:LogActivityInput!){ logActivity(input:$i){ id } }`;
  const short = (await ok(LOG_ACT, { i: { performedOn: today, activityType: "RUN", durationMinutes: 15, distanceKm: 2.5 } }, yaa)).logActivity.id;
  assert.match((await gql(ENTRY, { id: run3k, i: { date: today, mediaId: await proof() } }, yaa)).errors?.[0].message, /Log the activity first/);
  assert.match((await gql(ENTRY, { id: run3k, i: { date: today, mediaId: await proof(), activityId: short } }, yaa)).errors?.[0].message, /doesn't meet the challenge/);
  const run = (await ok(LOG_ACT, { i: { performedOn: today, activityType: "RUN", durationMinutes: 18, distanceKm: 3.1 } }, yaa)).logActivity.id;
  assert.equal((await ok(ENTRY, { id: run3k, i: { date: today, mediaId: await proof(), activityId: run } }, yaa)).submitClubChallengeEntry.completed, true);

  // Food from the list: logged on Fuel first.
  assert.match((await gql(ENTRY, { id: salad, i: { date: today, mediaId: await proof() } }, yaa)).errors?.[0].message, /Log salad \(no dressing\) on Fuel/);
  await ok(`mutation($i:LogFoodInput!){ logFood(input:$i){ eaten{ kcal } } }`, { i: { date: today, slot: "LUNCH", foodKey: "salad", grams: 50, quantity: 1 } }, yaa);
  assert.equal((await ok(ENTRY, { id: salad, i: { date: today, mediaId: await proof() } }, yaa)).submitClubChallengeEntry.completed, true);

  // Workout: inside the time limit, and logged as a session. Daily over two days, so not complete yet.
  assert.match((await gql(ENTRY, { id: circuitCh, i: { date: today, mediaId: await proof() } }, yaa)).errors?.[0].message, /time it took or the reps/);
  assert.match((await gql(ENTRY, { id: circuitCh, i: { date: today, mediaId: await proof(), resultSeconds: 25 * 60 } }, yaa)).errors?.[0].message, /over the 20-minute limit/);
  const wk = (await ok(ENTRY, { id: circuitCh, i: { date: today, mediaId: await proof(), resultSeconds: 15 * 60, weights: [{ exerciseId: bench, weightKg: 20 }] } }, yaa)).submitClubChallengeEntry;
  assert.deepEqual([wk.completed, wk.mine.done, wk.mine.total], [false, 1, 2]);
  const hist = (await ok(`{ workoutHistory(limit: 1) { setCount volumeKg durationMinutes notes } }`, {}, yaa)).workoutHistory[0];
  assert.deepEqual([hist.setCount, hist.volumeKg, hist.durationMinutes, hist.notes], [2, 400, 15, "Club challenge: Push-up ladder"]);
  assert.match((await gql(ENTRY, { id: circuitCh, i: { date: addDaysIso(today, 5), mediaId: await proof(), resultReps: 20 } }, yaa)).errors?.[0].message, /runs from/);

  // You can't drop out once you've sent proof.
  assert.match((await gql(RESPOND, { id: circuitCh, j: false }, yaa)).errors?.[0].message, /can't drop out/);
});

test("challenges: the page, comments, the coaches' view, and ending one", async () => {
  const page = (await ok(CH_PAGE, { id: circuitCh }, kobby)).clubChallenge;
  assert.equal(page.mine, null, "Kobby hasn't taken it on");
  assert.deepEqual(page.participants.map((p: any) => [p.person.displayName, p.done, p.total]), [["Yaa", 1, 2]]);
  assert.equal(page.participants[0].entries[0].resultSeconds, 900);
  assert.equal((await ok(CH_PAGE, { id: circuitCh }, outsider)).clubChallenge, null);

  const COMMENT = `mutation($id:ID!,$b:String!){ commentOnClubChallenge(id:$id, body:$b){ comments{ id body canDelete } } }`;
  const k = (await ok(COMMENT, { id: circuitCh, b: "Ladder done before breakfast" }, yaa)).commentOnClubChallenge.comments[0];
  assert.equal(k.canDelete, true);
  assert.equal((await ok(CH_PAGE, { id: circuitCh }, kobby)).clubChallenge.comments[0].canDelete, false);
  assert.equal((await gql(`mutation($id:ID!){ deleteClubChallengeComment(id:$id){ comments{ id } } }`, { id: k.id }, kobby)).errors?.[0].extensions.code, "FORBIDDEN");
  assert.deepEqual((await ok(`mutation($id:ID!){ deleteClubChallengeComment(id:$id){ comments{ id } } }`, { id: k.id }, abena)).deleteClubChallengeComment.comments, [], "Admins can delete any");

  const overview = (await ok(`query($id:ID!){ club(id:$id){ coachOverview{ member{ displayName } challengesTaken challengesCompleted } } }`, { id: feedClub }, kwame)).club.coachOverview;
  const e = overview.find((o: any) => o.member.displayName === "Yaa");
  assert.deepEqual([e.challengesTaken, e.challengesCompleted], [4, 3]);

  // Only its coach or an Admin can end it; then it leaves Today and the pop-up.
  assert.equal((await gql(`mutation($id:ID!){ endClubChallenge(id:$id) }`, { id: circuitCh }, kwame)).errors?.[0].extensions.code, "FORBIDDEN");
  await ok(`mutation($id:ID!){ endClubChallenge(id:$id) }`, { id: circuitCh }, abena);
  assert.ok(!(await ok(MY_CH, { d: today }, yaa)).myClubChallenges.some((m: any) => m.challenge.id === circuitCh));
  assert.equal((await ok(CH_PAGE, { id: circuitCh }, yaa)).clubChallenge.challenge.state, "ENDED");
  assert.match((await gql(ENTRY, { id: circuitCh, i: { date: today, mediaId: await upload(yaa, feedClub, "PROOF", "image/jpeg", 10), resultReps: 20 } }, yaa)).errors?.[0].message, /has ended/);
  assert.match((await gql(RESPOND, { id: circuitCh, j: true }, kobby)).errors?.[0].message, /is over/);
});
