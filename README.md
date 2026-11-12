# TrackFit

Fitness tracker with a personalised onboarding quiz, a generated 6-week training program and meal plan, and tracking for workouts, activities, meals, weight and progress photos. The web app (React + TypeScript) is backed by a GraphQL API (Node.js + TypeScript, Apollo Server). Flutter mobile and the social layer (Clubs, see [v1](#clubs-v1-first-release) and the [longer-term spec](#clubs-spec-planned)) are planned but not built yet.

## What's in MVP 2

- **Onboarding quiz** at `/start` (45 screens across 6 stages: You, Goal, Training, Lifestyle, Fuel, Mindset), or [quick start](#quick-start-onboarding-spec) with 13 questions. Answers stay on the device until the account exists, so nothing is lost on refresh.
- **Health gate**: any screening flag stops plan generation and points to safer next steps.
- **Plan generation** in one step: 6-week program (split, warm-ups, abs & core in every session, optional full-body day, injury swaps) plus a nutrition plan from the user's favourite dishes (2 meals + snack up to 3 meals + 2 snacks).
- **±1 training days** after rollout, anchored to the onboarding answer (`max(2, n-1)` to `min(6, n+1)`), on the plan reveal, the Train tab and the profile sheet.
- **Sign-up at the peak** (after the reveal): Google or email/password via Firebase, with email typo suggestions and live password rules. The backend sends a welcome email with the start date and a plan link.
- **App tabs**: Today, Train, Fuel, Progress (a slot is reserved for Clubs). Includes live sessions with rest timer and last-time column, activity logging (cardio distance, calories, heart rate, MET estimates), meal ticks and swaps, a weight trend, a consistency heat map, strength trends and progress photos/videos (10 MB photos, 30 s / 50 MB videos). Photos are kept for every cycle (`web/src/lib/media.ts`), with a first-vs-latest comparison and a picker to compare any two.
- **Animated exercise form figures** with a correct form vs common mistake view, and illustrated body types with a gauge toggle.
- MVP 1 screens (custom templates, history, weight log) are still reachable from Train at `/templates`, `/workouts` and `/weight`.

## Architecture at a glance

- **API**: GraphQL (Apollo Server 5), modular monolith. Each module has its own Postgres schema:
  - `identity`: users, auth, health screening, intake;
  - `tracking`: weight, exercises, templates, sessions, milestones, generated programs, activities;
  - `nutrition`: recipes, nutrition plans, meal entries, food logs, custom foods, water;
  - `clubs`: clubs, memberships with Admin and Coach roles, invites, join links and a log of membership changes (Clubs v1, first step). App-wide roles for the console live in `identity.app_roles`.
  - The `planning` module orchestrates onboarding and owns no tables of its own.
- **Plan engine**: `backend/src/modules/planning/engine` is pure TypeScript with no I/O. The backend uses it to generate plans. The web app imports the same code through the `@engine` Vite alias for live previews in the quiz, so the rules exist once. The seed SQL for exercises and recipes is generated from its catalogue.
- **Auth**: Firebase Authentication with Google and email/password. The backend verifies ID tokens.
- **Week-6 check-in**: from day 40 of a cycle, `/checkin` shows what the cycle did (weight against planned pace, sessions done, best lift), asks three questions and builds the next cycle: calories recalculated and corrected ±150 kcal against the pace, day count, set changes, rotated accessories and starting weights from weeks 5-6. Rules: `backend/src/modules/planning/engine/checkin.ts`; history in `tracking.cycle_checkins`.
- **Log any food** on Fuel: search about 140 foods, Ghanaian dishes first, with local names (`backend/src/modules/planning/engine/foods.ts`, searched on the device), pick a household portion or grams and the meal. Foods not in the list can be quick-added and are kept in "My foods". A food logged "instead of" a planned meal stops that meal counting. The daily totals combine ticked meals and logged foods, and the week-6 check-in pre-answers its eating question from them. Optional water tracking uses sachet and Voltic/Bel-Aqua bottle sizes, with a target of about 35 ml/kg (+500 ml on training days).
- **Notifications**: reminders as Web Push (VAPID, `web-push`): training days, the evening before each cycle starts, daily weigh-ins at a chosen time (skipped once logged), Week 3/6 photo slots (skipped once that slot has a photo from this cycle; the app reports filled slots to `tracking.progress_photos`), missed sessions (those three switchable, `notifications.reminder_prefs`) and the week-6 check-in on days 40-42. Rules and times are at the top of `backend/src/modules/notifications/reminders.ts`. A job checks every few minutes for reminders due in each user's time zone and logs each one so it is sent once. See "Reminders" under Deploying.
- **Email**: a `Mailer` interface. `MAIL_PROVIDER=console` (the default) logs each email; `MAIL_PROVIDER=resend` sends through Resend (see "Clubs and email" under Deploying).
- **Web**: Vite, React 19, Apollo Client 4 and react-router 7. Fonts are Bricolage Grotesque, Onest and JetBrains Mono. The theme is "Sunrise Lime" with light and dark modes.

## Repo layout

```
backend/
  sql/             001 init, 002 MVP 2 schema, 003 generated seed (exercises + recipes)
  scripts/         migrate.ts (npm run db:migrate), gen-seed.ts (npm run gen:seed)
  prisma/          schema.prisma, kept as documentation of the data model
  src/modules/     identity/, tracking/, planning/ (+ engine/), nutrition/
  src/shared/      db pool, auth, event bus, mailer, errors
  src/integration.test.ts   GraphQL integration tests against a real Postgres
web/src/
  onboarding/      quiz steps, flow, plan reveal, sign-up, draft storage
  app/             tab shell, Today, Train, Fuel, Progress, live session, sheets
  pages/           welcome/inbox, sign-in, MVP 1 pages
  figures/         exercise and body-type illustration engine
  components/      ui kit (options, measure, sheet, toast, ring), plan pieces
  styles/          global.css (design system), legacy.css (MVP 1 pages)
```

## Running it locally

### 1. Backend

Requires Postgres 16+.

```bash
cd backend
npm install
cp .env.example .env      # DATABASE_URL, DEV_AUTH_BYPASS, MAIL_PROVIDER, APP_URL
npm run db:migrate        # applies sql/ in order; safe on an existing MVP 1 database
npm run dev               # http://localhost:4000/
```

After changing the engine catalogue (exercises or recipes), run `npm run gen:seed` and commit the regenerated `sql/003_seed_mvp2.sql`.

### 2. Web app

```bash
cd web
npm install
cp .env.example .env      # VITE_API_URL, Firebase web config, VITE_DEV_AUTH_BYPASS
npm run dev               # http://localhost:5173/
```

With `DEV_AUTH_BYPASS` and `VITE_DEV_AUTH_BYPASS` both set to `"true"`, sign-up creates a throwaway dev user instead of a Firebase account. The quiz also shows a **Fill sample answers** shortcut. **Never enable either flag in a deployed environment.**

For real auth, enable **Google** and **Email/Password** under Firebase Authentication. Add your web domain to the authorised domains list.

### 3. Tests

```bash
cd backend
npm test                  # engine unit tests
TEST_DATABASE_URL=postgresql://USER:PASS@localhost:5432/trackfit_test npm run test:integration
npm run typecheck
cd ../web && npm run build && npm run lint
```

The integration suite drops and recreates the test database each run. The whole web journey was also run in Playwright against the live stack:

- the quiz;
- the plan reveal with ±1 days;
- sign-up;
- the inbox preview;
- a logged session;
- an activity;
- meal ticks and a swap;
- Train ±1;
- the exercise guide;
- Progress;
- mobile layouts.

That run had no console errors.

## Open items

- **Food numbers** are estimates from standard food tables (about ±15%). Spot-check the Ghanaian dishes against local data when possible. Barcode scanning is not built.
- **Meal audit and "previewed first session"** flags are kept per device in localStorage.

## About Prisma

`backend/prisma/schema.prisma` is the authoritative, documented data model
and matches `backend/sql/001_init.sql` field-for-field. In the sandbox this
was built in, `prisma migrate` / `prisma generate` couldn't reach
`binaries.prisma.sh` to download their engine binary (network policy, not a
bug), so the actual data-access layer in `backend/src/modules/*/\*.repository.ts`
is hand-written SQL run through the `pg` package instead of a generated
Prisma Client. Functionally this is a wash for MVP1's scope, but it does
mean schema changes currently have to be made in two places (the raw SQL
and `schema.prisma`) rather than one. Outside a network-restricted sandbox,
`npm run prisma:migrate` should work normally — switching to it (and
deleting the SQL files) is a reasonable follow-up once that's confirmed,
and would remove that duplication.

## Known limitations

- **`MOST_REPS_AT_WEIGHT` milestones can be noisy.** It fires on the first
  time you log a given weight for an exercise, even if that weight is lower
  than a heavier set you've already done (e.g. squatting 90kg for the first
  time after already hitting 100kg still "wins" a 90kg rep PR). This matches
  the literal spec but may read as confusing — worth revisiting once there's
  real usage to look at.
- **N+1 queries** in a few nested resolvers (e.g. exercise lookups inside
  workout history) are an accepted simplification for MVP1's data volumes,
  flagged in code comments where they occur.
- The main JS bundle is about 215 KB gzipped (most of it Firebase). The MVP 1 pages and charts are lazy-loaded.

## Deploying (no-cost path)

All free tiers, no card on file:

| Piece | Service | Config in this repo |
|---|---|---|
| Auth | Firebase Authentication | none |
| Postgres | Neon | `backend/sql/*.sql`, applied with `npm run db:migrate` |
| API | Render free web service | `render.yaml` |
| Web | Firebase Hosting | `web/firebase.json` |

1. **Firebase.** Create a project. Under Authentication, enable **Google** and **Email/Password**. Add a Web app and copy its config (`apiKey`, `authDomain`, `projectId`, `appId`). Under Project settings > Service accounts, generate a private key (a JSON file; keep it out of git).
2. **Neon.** Create a project and copy the connection string (it ends in `?sslmode=require`). Then run the migrations against it:
   ```bash
   cd backend
   DATABASE_URL="<neon connection string>" npm run db:migrate
   ```
   Run this again whenever a new `sql/*.sql` file lands. Render doesn't run migrations.
3. **Render.** New > Blueprint > this GitHub repo. It reads `render.yaml` and asks for `DATABASE_URL`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (from the service-account JSON) and `APP_URL` (the web address from step 4). Every push to `main` that touches `backend/` redeploys. The free plan sleeps after 15 idle minutes, so the first request after a break takes up to a minute.
4. **Firebase Hosting.** Create `web/.env.production.local` (git-ignored):
   ```bash
   VITE_API_URL="https://trackfit-api.onrender.com/"   # your Render URL
   VITE_FIREBASE_API_KEY="..."
   VITE_FIREBASE_AUTH_DOMAIN="<project-id>.firebaseapp.com"
   VITE_FIREBASE_PROJECT_ID="<project-id>"
   VITE_FIREBASE_APP_ID="..."
   VITE_DEV_AUTH_BYPASS="false"
   ```
   Then build and deploy:
   ```bash
   cd web
   npm run build
   firebase deploy --only hosting --project <project-id>
   ```
   The production build refuses to run if `VITE_DEV_AUTH_BYPASS` is `"true"` or any of these values is missing. Your local `.env` would otherwise leak into the build. `<project-id>.web.app` is already an authorised domain for sign-in. Add any custom domain under Authentication > Settings.
5. **Smoke test.** On your phone, open the `web.app` link, sign up with a real email, finish onboarding and log one workout.
6. **Reminders.** Workout reminders are push notifications sent by a job on the API.
   - Run `npx web-push generate-vapid-keys` once. Put the keys in Render as `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`, and set `VAPID_SUBJECT` to `mailto:<your email>`. Keep the private key out of git. Changing the keys later means everyone has to turn notifications on again.
   - Set `CRON_SECRET` in Render to a long random string (`openssl rand -hex 32`).
   - The free Render plan sleeps, so something outside has to wake it. At [cron-job.org](https://cron-job.org) (free), create a job: URL `https://<your-render-url>/jobs/reminders`, every 5 minutes, method POST, header `Authorization: Bearer <CRON_SECRET>`. It answers `{"sent":N}`. While awake, the API also checks every 5 minutes by itself; the two never double-send.
   - On a phone: Profile > Workout reminder > Save and allow notifications, then "Send a test". iPhone needs iOS 16.4+ with TrackFit added to the home screen.

7. **Clubs and email.** Clubs are invite-only, and only the App Owner and App Admins can create them.
   - **Resend: the domain.** You need a domain you own; `web.app` and `onrender.com` can't send. In Resend, go to Domains > Add Domain and add a sending subdomain such as `mail.your-domain`. This keeps app mail from affecting your main domain's reputation. Add the records Resend lists at your DNS host: a DKIM TXT at `resend._domainkey.mail`, plus an MX and an SPF TXT at `send.mail`. A `_dmarc` TXT of `v=DMARC1; p=none;` is optional but helps. On Cloudflare, set them to "DNS only". Click Verify and wait for "Verified".
   - **Resend: the key.** Go to API Keys > Create, with "Sending access" restricted to that domain. It's shown once.
   - **Render.** In dashboard.render.com, open `trackfit-api` > Environment and set:
     - `MAIL_PROVIDER=resend`
     - `RESEND_API_KEY`
     - `MAIL_FROM`, on the verified domain exactly, e.g. `TrackFit <hello@mail.your-domain>`. The mailbox doesn't need to exist.
     - `MAIL_REPLY_TO`, optional: an inbox you read, so replies reach you.
     - `CLUBS_ENABLED=true`

     Check `APP_URL` is the live web address, because email links use it. These are `sync: false` in `render.yaml`, so a Blueprint sync never overwrites them. Welcome emails start going out for real too.
   - **Database.** From `backend/`, run `DATABASE_URL="<neon connection string>" npm run db:migrate`. The Clubs tables are additive, so this is safe before the merge.
   - **Set the App Owner.** Sign in once to the live TrackFit web app with your own email; this creates your account. Then run `DATABASE_URL="<neon connection string>" npm run app:owner -- you@example.com` from `backend/`. Add App Admins later from the console (Clubs > Open the console). To hand over ownership, add `--replace`.
   - **Check.** Create a test club in the console with yourself as first Admin, then confirm the invite arrives. Resend's Emails page shows each send. A failed send never fails the action: it appears in Render's Logs as "Club email failed" or "Welcome email failed" with Resend's reason. A `403 domain is not verified` means `MAIL_FROM` isn't on the verified domain.
   - **Emergency stop.** Setting `CLUBS_ENABLED` to `false` in Render hides Clubs everywhere and rejects every Clubs request.
8. **Club photos and videos.** They live in the same Firebase Storage bucket as progress photos, under `clubs/`, and are never public. The API hands out 15-minute upload links and 1-hour view links.
   - **Render.** If the web app sets `VITE_FIREBASE_STORAGE_BUCKET`, set `FIREBASE_STORAGE_BUCKET` to the same value. Otherwise leave it unset: both default to `<project-id>.firebasestorage.app`. Projects made before late 2024 often use `<project-id>.appspot.com`; the Firebase console's Storage page shows the name. Don't set `MEDIA_STORE` on Render; it defaults to Firebase Storage.
   - **Allow uploads from the web app, once.** From `backend/`, with the same Firebase values as Render in your `.env` (or on the command line), run `npm run media:cors`. It allows `APP_URL`; to allow other addresses, pass them instead, e.g. `npm run media:cors -- https://your-project.web.app https://your-domain`. Run it again if the web address changes.
   - **Database.** `npm run db:migrate` against Neon adds `sql/011_club_feed.sql` (additive).
   - **Storage rules don't change.** `web/storage.rules` gives browsers no access to `clubs/`, and the signed links don't go through rules.
   - **Clean-up.** Uploads that were started but never posted are deleted after a day, by the API's hourly timer and by each cron wake-up.

**Never set `DEV_AUTH_BYPASS` on Render, and never set `VITE_DEV_AUTH_BYPASS` to `"true"` for a deployed build.**

When the product outgrows the free tiers, the modular monolith and
schema-per-module design are meant to make a move to AWS eu-west-2 (RDS
Postgres + PostGIS, ECS or similar) a configuration change rather than a
rewrite.

## Source control

The repo lives at [github.com/Juxlarry/trackfit](https://github.com/Juxlarry/trackfit). `main` is what's deployed:

- **API**: Render redeploys on every push to `main` that touches `backend/`. New `backend/sql/*.sql` files still need `npm run db:migrate` against Neon *before* pushing.
- **Web**: not deployed from GitHub. Build and run `firebase deploy` from `web/` (step 4 above).
- **CI**: `.github/workflows/ci.yml` type-checks and tests both apps on every push and pull request.

## App polish: workouts, weigh-ins, cardio and Fuel (spec)

**Status: approved November 2026.** Built on `feature/app-polish`, branched from `feature/exercise-swaps` because both change the workout screen. The choices are listed under [Polish decisions](#polish-decisions).

### Why

Testing on a phone in November 2026 turned up eight issues:
1. The rest timer hides at the top of the screen.
2. Suggested weights never go up.
3. Logging weight is hard to find.
4. The tab highlight drifts away from its tab.
5. The Start workout button is too big.
6. Cardio has no treadmill option.
7. Fuel lists the menu before the place to log what you actually ate.
8. Leaving a started workout loses all of it.

### 1. Rest timer under the exercise

**Today:** the rest timer is a floating bar. During a workout it ends up near the top of the screen, over the set rows, and can't be seen once you scroll down.

**Change:**
- The timer appears **in the exercise card, straight under the set you just ticked**, with the ring, time left, **+15 s** and **Skip**. Your eyes are already there.
- If you scroll that card out of view, a small pill (ring and time only) stays at the bottom of the screen. Tapping it scrolls back to the exercise.
- When rest ends, the "Rest done. Next set." toast stays. The phone also vibrates briefly where the browser allows it.

### 2. Exercise ease: Easy, Okay, Hard

**Today:** a weight box suggests whatever you lifted last time. The hint "next week adjusts to it" overpromises, because nothing ever goes up.

**Rating:**
- After you tick the **last set of an exercise**, the card asks **"How did that feel?"** with three chips:
  - **Easy:** you had reps to spare.
  - **Okay:** hard but clean.
  - **Hard:** a grind, or you missed reps.
- It's optional. You can change your answer until you finish the workout. An unrated exercise counts as "hold" next time.
- Ratings are saved with the workout, one per exercise.

**Only after steady logging.** One good day isn't enough to go up. A session counts as **steady** for an exercise when:
- it's at the **same weight** as the session before;
- **every planned set** was done;
- it **wasn't rated Hard**.

A Hard rating, a missed set or a change of weight resets the count to zero. New exercises, swapped-in ones and a new cycle's first sessions start at zero. Until an offer applies, the boxes suggest last time's numbers.

**What happens next time you do that exercise** ("reps then weight"):

| Steady sessions in a row at this weight | Next time offers |
|---|---|
| 0 or 1 | Last time's numbers. Okay or Easy shows "aim for +1 rep" as a goal; nothing changes in the boxes. |
| **2 or 3**, latest Easy or Okay | **+1 rep** per set, same weight, up to the top of the rep range |
| **4**, latest Easy or Okay | **More weight** (next step, below), reps back to the bottom of the range. The count starts again at the new weight. |
| Latest Hard | Hold |
| Hard twice in a row | **A lighter weight**, about 10% less. This doesn't wait for a steady record. |

For example, with 4 sets of 6-10 at 40 kg: sessions 1 and 2 at 8 reps are steady, so session 3 offers 9 reps. Session 4 offers 10 reps. After the 4th steady session, session 5 offers 42.5 kg at 6 reps.

**Ask first, always.** Nothing is bumped without your OK.
- **The offer:** a line at the top of the exercise card, such as "4 steady sessions at 40 kg. Go up to 42.5 kg?", with **Go up** and **Keep 40 kg**, or "2 steady sessions. Try 9 reps?", with **Try 9** and **Keep 8**.
- **Accepting** fills that workout's weight or rep boxes. **Keeping**, or ignoring it, leaves last time's numbers.
- **Repeating:** the offer comes back the next time it still applies.
- **The plan isn't changed.** Only what the boxes suggest changes.

**Weight steps:**
- Barbell, machine and cable: +2.5 kg (+5 lb).
- Dumbbells: +2 kg per hand (+5 lb), the usual jump between dumbbells.
- Bodyweight and band exercises have no weight to add, so the rule counts sessions at the same reps instead. Two steady sessions offer +1 rep (+5 s for timed holds). Four steady sessions offer +2 reps (+10 s).

**Also:**
- Swapped-in exercises follow the same rules, from their own history.
- The hint becomes "Rate each exercise when you finish it. Next time we'll suggest whether to go up."
- The week-6 check-in doesn't use ratings yet. It still asks "How did the workouts feel?" for the whole cycle.

### 3. Weigh-ins that are easy to find

**Today:**
- **Logging:** only from the Progress tab, or the first-week Today checklist.
- **Reminders:** only on days 7, 14, 21, 28 and 35.
- **Advice:** the card says to weigh in 3 to 4 times a week.

**Change:**
- **Daily reminder:**
  - A push every morning at a time you choose. The default is 07:30, in 15-minute steps.
  - **Skipped** if you've already weighed in that day.
  - **On by default.** Switchable in the profile sheet with the other reminders.
  - On days 14 and 35 it still mentions the progress photo, as now.
- **On Today:** a compact **"Log today's weigh-in"** card near the top until you've logged one that day. One tap opens the weigh-in sheet, with yesterday's number filled in to adjust.
- **Profile (J) menu:** a **Log weigh-in** entry, reachable from every tab.
- **On Progress:** the Log weigh-in button stays where it is. The advice becomes "Every morning, before breakfast. The 7-day average smooths out the daily swings."

### 4. Tab highlight that stays on its tab

**Cause:** the highlight's size and position are measured when the route changes. The tab labels change width once the web fonts load, and again when Clubs is added, so the measurement goes stale. That's the offset highlight in the screenshots.

**Fix:**
- Measure again whenever the tab bar or any tab changes size, and once the fonts are ready.
- On phones, give each tab an equal fixed share of the width, so labels can't push their neighbours.

### 5. A normal-sized Start workout button

**Cause:** the button has the class `pulse`, which the loading screen also uses. It picks up the loader's column layout and 56 px padding, so it renders as a tall blob.

**Fix**:
- Rename the classes so they can't collide again.
- **Start workout** becomes a normal lime pill, 52 px tall, next to a **Preview** pill of the same height.
- A soft glow pulses about once every 3 seconds, and is turned off for "reduce motion".
- The exercise illustration on the card is unchanged.

### 6. Treadmill runs and walks

- Walking and Running get an **Outdoor / Treadmill** switch, defaulting to Outdoor.
- Treadmill adds an optional **Incline (%)**, 0 to 15.
- **Calorie estimate:**
  - With a distance, it uses the standard treadmill formula from speed and incline.
  - Without a distance, each 1% of incline adds about 0.5 MET when walking and 0.3 MET when running.
  - Watch calories still win, as now.
- **Display:**
  - History and Progress show "Treadmill run, 2% incline".
  - Club share drafts say "Ran 5 km on the treadmill".
  - Pace is shown as for outdoor runs.
- **Challenges:** a treadmill run still counts as a run, and a treadmill walk as a walk.

### 7. Fuel: log first, suggestion below

**Today:**
- One "Today's menu" list of planned meals, with one **Log food** link.
- Logged foods appear in a separate list underneath.

**Change:** the day is grouped by meal, always in this order: **Breakfast, Lunch, Dinner, Snacks**. Each section has, top to bottom:
1. **Header:** the meal name and its kcal so far.
2. **Log breakfast** (or lunch, dinner, a snack). This opens the food sheet with that meal already chosen.
3. **Foods you've logged** for that meal.
4. **Suggested:** the planned meal, with its tick and Swap as now.
   - If you logged something "instead of the plan", the suggestion shows as Replaced.
   - With no planned meal that day: "Not on your plan today".

**Also:**
- The protein top-up goes under Snacks.
- Future days show the suggestions only, as now. Logging opens on the day itself.

### 8. A started workout is never lost

**Today:** a workout lives only in the workout screen's memory. Leaving the screen loses everything: the start time, ticked sets, weights and reps typed, warm-up ticks and today-only swaps. That happens when you go to another tab, tap back, or the phone closes the browser in the background while you use another app. Coming back starts the workout from the top. The rest timer also counts in one-second ticks, which pause while the app is in the background.

**Change:** once you tap **Start workout**, the workout is kept until you **Finish** or **Discard** it.
- **Saved as you go:** every tick, number typed, swap and warm-up tick is saved on the phone straight away. Nothing is lost if the app is closed, the phone locks or the browser reloads.
- **The clock keeps time:** the elapsed time and the rest timer count from saved start and end times, not ticks. Coming back after 4 minutes in another app shows the right time, and a rest that ended meanwhile shows as done.
- **Leaving is safe:** the ✕ and the tabs leave the workout running in the background. The "Leave this workout?" sheet becomes **Keep it running** (the default), **Finish and save what I did** and **Discard this workout**.
- **Getting back:**
  - A **"Push in progress, 12:40"** bar sits above the tab bar on every tab. Tap it to return exactly where you were, scrolled to the next unticked set.
  - Today's workout card shows **Resume workout** instead of Start.
  - Opening the app again goes straight back into the workout.
- **One at a time:** starting a different session while one is running asks you to finish or discard the first.
- **Forgotten workouts:** after 4 hours without a tick, the bar becomes "Still training?", with **Finish and save** and **Discard**. A workout is never thrown away without asking.
- **Same phone only.** It's saved on the device, like the onboarding answers. Carrying on from a different device isn't part of this change.

### Technical outline

- **Engine (pure, unit-tested):**
  - `progressionOffer(history, exercise, units)` takes the exercise's recent rated sessions, counts steady sessions at the current weight and returns `{ kind: "WEIGHT_UP" | "REPS_UP" | "GOAL" | "LIGHTER" | "HOLD", weightKg?, reps?, reason }`. Rep ranges come from the plan, such as "6-10".
  - The treadmill MET rule goes in `catalog.ts`.
- **Database (`sql/016_app_polish.sql`):**
  - `tracking.exercise_ratings (session_id, exercise_id, ease)`, with `ease` one of `EASY`, `OKAY` or `HARD`, and a primary key on `(session_id, exercise_id)`.
  - `tracking.activity_logs` gains `setting` (`OUTDOOR` or `TREADMILL`, default `OUTDOOR`) and `incline_pct`.
  - `notifications.reminder_prefs` gains `weigh_in_time` (default `07:30`).
- **API:**
  - `LogWorkoutSessionInput.ratings: [{ exerciseId, ease }]`. Each exercise must have a logged set in that session.
  - `PlannedExercise.offer`: the progression offer for the next session.
  - `LogActivityInput` gains `setting` and `inclinePct`.
  - Reminder prefs gain `weighInTime`.
  - `WEIGH_IN` reminders become daily at that time.
- **Web:**
  - **Active workout store** (`lib/activeWorkout.ts`):
    - Saved in `localStorage` per signed-in user. It holds the template, date, `startedAt`, `restEndsAt`, rows, warm-up ticks, today-only swaps and ratings.
    - Every read and write is wrapped so private browsing still works for the session itself.
    - Cleared on Finish or Discard.
  - **Resume:** `AppLayout` shows the resume bar, and Today and Train show **Resume workout**.
  - `SessionPage`: loads from the store, the rest timer in the card, the bottom pill, ease chips and the offer line.
  - `AppLayout`: the tab highlight is re-measured with a `ResizeObserver` and after fonts load.
  - `TodayPage`: the start button and the weigh-in card.
  - The profile menu gets Log weigh-in and the reminder time.
  - The cardio sheet gets the treadmill switch.
  - `FuelPage`: sections by meal.
- **Tests:**
  - Engine: every row of the progression table, weight steps per equipment and unit, and treadmill calories.
  - API: ratings saved and checked, the daily weigh-in reminder and its skip, and treadmill activities.
  - Steady rule: +1 rep after 2 and 3 steady sessions, more weight after 4. A Hard, a missed set or a weight change resets the count.
  - Active workout: it survives leaving, a reload, and a rest that ends while away.
  - Browser: one run at phone width covering each item above, including leaving a workout for another tab and coming back.

### Build order

Each step is a separate commit:
1. A started workout is never lost. First, as it's the biggest bug.
2. Fixes: tab highlight, Start workout button, rest timer placement.
3. Fuel by meal.
4. Treadmill.
5. Weigh-ins: daily reminder, Today card, profile entry.
6. Exercise ease and progression offers.

### Polish decisions

Decided by the App Owner in November 2026:

1. **Progression:** reps then weight, as in the table above, always asked before any change. Steady sessions in a row at one weight: 2 or 3 offer +1 rep, and 4 offer the next weight step. The weight steps are approved.
2. **Weigh-in reminder:** daily at a chosen time, skipped once you've logged that day. Plus a Today card and a profile-menu entry.
3. **Treadmill:** an Outdoor / Treadmill switch with an optional incline, not separate activity types.
4. **Fuel:** Breakfast, Lunch, Dinner and Snacks always appear with a log button. A meal without a planned suggestion says so.
5. **Steady sessions:** sessions rated Easy or Okay both count. Only Hard, a missed set or a change of weight resets the count. Bodyweight and band moves count sessions at the same reps.
6. **Started workouts:**
   - kept on the phone until you Finish or Discard;
   - opening the app goes back into a running one;
   - after 4 hours with no ticks, the app asks "Still training?";
   - other devices aren't covered.
7. **The other defaults:**
   - the rest timer sits in the exercise card, with a bottom pill when you scroll away, and a vibration when rest ends;
   - the Start workout pill glows gently;
   - the treadmill switch defaults to Outdoor, with the incline estimate.

### Polish as built

- **Saved workouts:** `web/src/lib/activeWorkout.ts` keeps one workout per signed-in user in `localStorage`, with a memory copy for when storage is blocked.
  - **Resume bar:** `ResumeBar` in `AppLayout` shows it on every tab.
  - **Opening the app again** goes back into the workout, unless the link asked for something else. For example, the weigh-in push opens `/today?weigh=1` and shows the weigh-in sheet; the bar still shows.
  - **"Still training?":** "Finish and save" opens the workout with `&finish=1`, which saves it.
- **Progression:** `engine/progression.ts` (`progressionOffer`). The API adds `PlannedExercise.offer` from each exercise's last 8 logged sessions.
  - **Unrated sessions** count towards the steady streak if every set was done. An offer is only made when the latest session was rated Easy or Okay.
  - **Today-only swaps** get no offer.
  - **Ratings** are saved in `tracking.exercise_ratings`, sent with `logWorkoutSession`.
- **Weigh-in reminder:** daily on plan days 1 to 39 at `weigh_in_time`. Days 40-42 belong to the check-in push. The title is now "Morning weigh-in".
  - The weigh-in sheet starts from your last weigh-in.
  - The Today card shows whenever you haven't weighed in that day, including in week 1, next to the first-week checklist.
- **Treadmill:** `activity_logs.setting` and `incline_pct`. `treadmillMet` uses the ACSM treadmill equations when there's a distance, and otherwise +0.5 MET (walking) or +0.3 MET (running) per 1% of incline.
- **Start workout button:** the loader's class is now `pulse-load`. The hero buttons use `start-cta` and `glow`.
- **Tab highlight:** measured again by a `ResizeObserver` and after `document.fonts.ready`. On phones, tabs share the width equally.
- **Also fixed:** a type error in `integration.test.ts` (quick start test) that had broken `npm run typecheck`.
- **Checked:**
  - 84 unit tests and 46 integration tests.
  - A headless Chromium run at 390 px wide, dark mode, covering:
    - the tab highlight, within 1 px on every tab;
    - the offer, the rest timer and its pill, and the ease chips;
    - leaving a workout, reloading, and coming back with ticks and the clock intact;
    - "Still training?" → Finish, with the rating saved;
    - Fuel by meal, the weigh-in link and card, and a treadmill walk.

## Exercise swaps (spec)

**Status: approved and built November 2026** on `feature/exercise-swaps` (see [Swaps as built](#swaps-as-built)). The choices are listed under [Swap decisions](#swap-decisions).

### Why

The bench is taken, the cable machine is broken, or a move just doesn't feel right. Today the only way round it is to skip the exercise. Members should be able to swap it for another that trains the same thing with equipment they have, without changing the shape of their plan.

### What a swap keeps

A swap changes the exercise and nothing else:

- **The same target:** the replacement trains the same muscle in the same way. Each exercise in the catalogue gets a **family**, finer than today's muscle groups:
  - quads, hamstrings, glutes and calves (today's "legs" is too broad: a leg curl must not become a leg extension);
  - chest press and chest fly;
  - horizontal pull (rows) and vertical pull (pulldowns, pull-ups);
  - shoulder press, side delts and rear delts;
  - biceps, triceps and core.
- **The same role:**
  - A main lift is swapped for a main lift, such as a squat for a leg press or a bench press for a dumbbell press.
  - Accessory work is swapped for accessory work.
  - Core is swapped for core.
  
  The session stays as hard as planned.
- **The same prescription:** sets, reps, rest and the exercise's place in the session stay as planned. The suggested weight is worked out again for the new exercise.
- **Equipment the member has:** only what their onboarding answer covers. They can also narrow it for the day, with "Any I have" (the default), "Dumbbells" or "Bodyweight", for a busy gym or training away. A choice only shows if their equipment covers it.

  | Where they train | Equipment offered |
  |---|---|
  | Full gym | Barbell, machine, cable, dumbbell, band, bodyweight |
  | Small gym | Barbell, cable, dumbbell, band, bodyweight. Machines only if the plan already uses that machine |
  | Home gym | Barbell, dumbbell, band, bodyweight |
  | Dumbbells only | Dumbbell, bodyweight |
  | Resistance bands | Band, bodyweight |
  | Bodyweight only | Bodyweight |

- **Safe for their injuries and lift comfort:** anything the plan generator swaps away for an injury the member reported is never offered. "I avoid squats, bench and deadlifts" keeps barbell versions of those out too.
- **Within the session:** an exercise already in the session isn't offered again.
- **From TrackFit's library only:** every option has form cues and an illustration. Custom exercises aren't offered.

**Order of options:**
1. Same movement first. Bench press offers dumbbell bench press and machine chest press before push-ups.
2. Then the rest of the family.
3. At most 6 options. Each shows its equipment and form illustration, and a one-line reason such as "Same muscle, dumbbells instead of barbell".

**When there's nothing to offer:** the sheet says so ("No other chest fly option with dumbbells") and suggests skipping the sets today. Logging always allows that.

### How long a swap lasts

Each time, the member chooses one of these. Neither is preselected:
- **This workout only.**
  - Only today's logged sets use the new exercise. Next time the plan shows the original again.
  - Nothing is saved to the plan.
  - The logged workout records which exercise it replaced, so history and coaches see "DB bench press, swapped for Bench press".
- **For the rest of this cycle:**
  - The plan itself changes from this session on: Train, the session preview, reminders and the check-in all show the new exercise, tagged "Swapped" with **Back to Bench press** to undo it.
  - **Next cycle:** the week-6 check-in builds it fresh from the generator's rules as usual. The check-in preview lists the member's swaps, so they can make them again if they want.

**Changing training days or fine-tuning:** either rebuilds the week, which resets the cycle swaps. The confirmation says so first.

### Where it appears

- **In a workout:** a **Swap** button on each exercise card in the session, next to How.
  - Swapping replaces the card. It's available until the first set of that exercise is ticked. After that, untick the sets to swap.
- **In the session preview** (Today and Train): **Swap**, for the rest of the cycle only. One-off swaps belong in the workout.
- **Not in club routines or challenges.** Their exercises are set by Admins and coaches.

### Progress and history

- **Each exercise keeps its own history:** "Last time", PRs and strength trends are per exercise. A swapped-in exercise starts its own record, and the original's isn't touched.
- **Suggested weight:** for a new exercise it comes from the same estimate the plan uses. After it's been logged once, it comes from the member's own history.
- **Week-6 check-in:** the carry-over weights for cycle 2 come from what was actually logged. A main lift swapped for the whole cycle has no weeks 5 and 6 to carry, so cycle 2 estimates it as for a new member.

### Library additions

Checked against today's library of 86 exercises:
- **Full gym:** every exercise has 2 or more options except the cable fly, which has 1.
- **Dumbbells, bands or bodyweight:** several have 0 or 1, including calf raises, the dumbbell floor fly, the pullover, the Superman hold, the band chest press and the band pull-apart.

So this step adds 21 exercises to close the gaps, such as a seated DB calf raise, DB fly, band fly, prone Y-T raise, reverse snow angel and band straight-arm pulldown. Each gets a family, a movement pattern for its illustration, and form cues.

**Found while checking:** bodyweight-only members are given band exercises today, because bands and bodyweight share one exercise pool. Swaps follow the equipment table above, so a bodyweight-only member gets bodyweight options for those. Fixing the plan generator itself is a separate change, not part of this step.

### Technical outline

- **Engine (shared by the API and the web app):**
  - `family` on every catalogue exercise.
  - `swapOptions(exercise, { equipment, injuries, liftComfort, sessionExercises, only })` returns ranked options. It's pure and unit-tested.
- **Database (`sql/015_exercise_swaps.sql`):**
  - `tracking.workout_template_exercises` gains `swapped_from_exercise_id` (the original, for Back to …).
  - `tracking.set_logs` gains `replaces_exercise_id` for one-off swaps, so history can say what was swapped.
- **API:**
  - **`exerciseSwapOptions(templateId, exerciseId, only)`.**
  - **`swapPlanExercise(templateId, exerciseId, toExerciseId)` and `resetPlanExercise(templateId, exerciseId)`** for cycle swaps. They check the choice against `swapOptions`, so a swap the app wouldn't offer is refused.
  - **`logWorkoutSession` sets can carry `replacesExerciseId`.** The API checks it's an allowed swap for that template's exercise.
- **Web:**
  - A swap sheet in `SessionPage` and the session preview, with the two length choices and the equipment filter.
  - "Swapped" tags with **Back to …** on Train.
- **Tests:**
  - **Option rules:** same family and role, equipment, injury and lift-comfort exclusions, no duplicates in a session, ranking.
  - **Saving:** cycle swap and undo, and that refused swaps are refused.
  - **Logging and resets:** one-off swaps are logged with their record, and changing days resets swaps.
  - **Browser run:** at phone width.

### Swap decisions

Decided by the App Owner in November 2026:

1. **Length:** asked every time, with no default: "This workout only" or "For the rest of this cycle".
2. **Next cycle:** cycle swaps end at the week-6 check-in, which lists them so they can be redone.
3. **Mid-exercise:** swapping is only possible before the first set of that exercise is ticked.
4. **Bodyweight-only members:** swap options offer bodyweight moves only. Fixing the generator's band exercises is a separate change.
5. **Equipment filter:** offered for the day, with "Any I have" (the default), "Dumbbells" and "Bodyweight".

### Swaps as built

- **Engine:** `engine/swaps.ts` holds the families, the 21 added exercises (`SWAP_EXTRAS`), the equipment table and `exerciseSwapOptions`. Every added exercise reuses an existing illustration and its form cues (`web/src/figures/figureEngine.ts`).
  - **Equipment labels:** they were guessed from the exercise name, and about a dozen came out wrong (for example "Calf raise" read as a machine). Swaps use a correction table. Pull-ups and hanging knee raises count as gym equipment, since both need a bar.
  - **Case:** lookups ignore it, because the original exercise library spells some names differently ("Lat Pulldown").
  - **Coverage:** with a full or small gym, every planned exercise has at least 2 options. With dumbbells, bands or bodyweight, a few have 1. A unit test checks that every planned exercise has at least one.
- **API:** `sql/015_exercise_swaps.sql`.
  - `exerciseSwapOptions` lists the options. `swapPlanExercise` and `resetPlanExercise` save and undo cycle swaps, and refuse anything the options wouldn't offer.
  - `PlannedExercise.swappedFrom` names the planned exercise for **Back to …**.
- **Checking one-off swaps:** a logged set's `replacesExerciseId` must be in that workout's plan, and the new exercise must be in the same family. Equipment and injuries aren't checked again at logging; the app only offers options that already passed those checks.
- **Showing what was replaced:** workout details show "swapped for …", for the member and their club's coaches.
- **Web:** the swap sheet is `app/ExerciseSwap.tsx`.
  - **Train and the session preview:** **Swap** for the rest of the cycle, and **Back to …**. The preview swaps without leaving the preview.
  - **The workout:** both lengths are offered, until the exercise's first set is ticked.
  - **Check-in:** the preview lists the cycle's swaps, which end there.


## Quick start onboarding (spec)

**Status: approved and built November 2026** on `feature/quick-onboarding` (see [As built](#as-built)). The choices that were signed off are listed under [Approved decisions](#approved-decisions).

### Why

Some users say the quiz is too long: 45 screens over 6 stages, about 8 minutes. Most of it tunes the plan, but only part of it is needed to start someone training safely. The idea is to offer a short path that asks just enough to build a sound first plan, and to ask the rest later, when the user reaches a feature that needs it.

### The choice

- **On the welcome screen,** below "Start my plan", a second, smaller option: **"Short on time? Quick start, about 2 minutes."**
- **The full quiz stays the default.** It's the big button, and its copy says it builds the most personal plan.
- **Club invites get the same choice.** A new user who opens an invite or join link, and then starts the quiz, sees the same welcome screen. The invite is kept with the draft either way, and they land in the club after signing up.
- **Switching paths:**
  - Someone on the full quiz can move to the quick path at any point ("Finish faster"), keeping every answer so far.
  - Someone on the quick path can switch to the full quiz ("Answer everything instead").
  - Answers are never asked twice.

### The quick path

Thirteen question screens, plus two more for weight-loss or muscle-gain goals, then the plan reveal, the start date and sign-up as today:

| Stage | Screens | Why it can't wait |
|---|---|---|
| Safety | Health check | Decides whether a plan can be generated at all |
| You | Name, sex, age, height, weight | Calories, protein and starting loads |
| Goal | Goal, then target weight and pace for weight loss or muscle gain | Calories and the 6-week projection |
| Training | Experience, where you train, which days, how many days, session length | The split, exercises and volume |
| Training | Injuries | Safety: the injury-friendly swaps |

**What the rest gets until it's answered:**

| Not asked yet | Default used |
|---|---|
| Body type | "Not sure", which is already allowed |
| Squat, bench and deadlift comfort | Learning (lighter technique sets first) |
| Split, full-body day | Auto, no forced full-body day |
| Priority and low-priority muscles | None: balanced |
| Cardio likes | None, so rest days suggest walking |
| Warm-up | On |
| Daily activity | Light |
| Sleep | 7 hours, quality unknown |
| Training time, busyness, blockers | Unknown: no timing tips |
| Everything in Fuel | Not set (see below) |
| Mindset questions | Not asked |

The defaults are chosen by the API, not the app, so there's one source of truth.

### Asked later, when a feature needs it

The deferred questions are grouped into two blocks. Each is asked in the same style as the quiz, one question per screen, and saved on the device as it goes, so leaving halfway resumes where it stopped.

**1. Set up Fuel: required before Fuel opens.** About 9 screens:

- How you eat, allergies, meals you love, how many times a day you eat.
- Prep style, what makes eating well hardest, intermittent fasting.
- Daily activity and when you train. Both change the calorie target and meal timing, so they belong with Fuel.

**Why it's a gate:** the menu is built from these answers, and showing meals before allergies are known isn't safe.

**Where it triggers:**
- Opening the **Fuel** tab, or "Open" on Today's **Fuel today** card.
- Logging food or water from anywhere.

**What it looks like:** a screen that says "Fuel builds your menu from how you eat, so it needs a few answers first. About 2 minutes." with **Answer now** and **Go back**. Go back returns to where they were, and nothing changes. Today's Fuel card shows "Set up Fuel" instead of the menu.

**When it's done:** the dietary profile is saved, the calorie and macro targets are recalculated with the real activity level, and Fuel opens.

**2. Fine-tune your training: optional.** About 8 screens: lift comfort, split, full-body day, priority and low-priority muscles, cardio likes, warm-up, sleep.

- **Why it isn't a gate:** no feature needs it, because the plan works with the defaults.
- **Where it's offered:** a card on **Train** ("Your plan uses sensible defaults. Fine-tune it, 2 minutes") and a row in the profile sheet.
- **When it's done:** the weekly plan is rebuilt with the new answers, the same way ±1 training days already rebuilds it (`setTrainingDays`). Any week-6 check-in adjustments are kept, logged workouts keep their history, and this week's day swaps are cleared.
- **At the week-6 check-in:** anyone who never did it is asked these questions as part of the check-in, so cycle 2 is fully personal.

**The mindset questions** (blockers, the two "sounds like me" questions, what you've tried, accountability, what you want from TrackFit) are stored but barely used today. The quick path skips them and nothing asks for them later.

### What else has to handle a quick-start account

- **Today:** the Fuel card shows "Set up Fuel". Lifestyle tips that need an unanswered question aren't shown.
- **The plan reveal and welcome email:** show calories and the projection as today, since those come from questions on the quick path. They leave out the menu preview until Fuel is set up.
- **Week-6 check-in:** the eating part is skipped while Fuel was never set up, because there's no menu to compare with. The training part works as today.
- **The profile sheet:** shows "Not set yet" with an **Answer** link for anything deferred.
- **Clubs:** nothing changes. Coaches see logs, never intake answers.
- **Retaking the quiz:** anyone can still redo the full quiz later, as today.

### Technical outline

- **Database:** `identity.intake_profiles` gains `onboarding_path` (`FULL` or `QUICK`) and `pending_sections` (`text[]`, values `FUEL` and `TRAINING_DETAILS`).
- **Diet columns:** a quick-start user has no `nutrition.dietary_profiles` row until Fuel is set up. The lifestyle and training-detail columns get the defaults above, and are marked as pending.
- **API:**
  - `completeOnboarding` takes `path: QUICK`, with only the quick-path answers required. The API fills the defaults, generates the plan, and saves the nutrition targets but no dietary profile.
  - `me.onboarding { path pendingSections }` tells the app what's still to ask.
  - `completeFuelSetup(input)` saves the dietary profile, the activity level and the training time, then recalculates the targets.
  - `fineTuneTraining(input)` saves the training details and rebuilds the weekly templates the way `setTrainingDays` does.
  - **Fuel without setup:** `mealDay`, `logFood` and `setWater` return a clear `FUEL_SETUP_NEEDED` error, so an old app version can't show a menu without allergies.
- **Web:**
  - The welcome screen's choice, and a `path` in the onboarding draft.
  - The step list is filtered by path: each step is tagged `quick`, `fuel`, `training` or `mindset`.
  - A `RequireSection` gate component wraps Fuel and the food and water sheets, and reuses the existing step components for the deferred blocks.
- **Tests:**
  - The quick path produces a valid plan, with the defaults stored and pending sections set.
  - Fuel calls are refused until setup, then work, with targets recalculated.
  - Fine-tuning rebuilds the plan and keeps logged history.
  - The check-in works with Fuel never set up.
  - A club invite survives the quick path.
  - A browser run covers both paths at phone width.

### Approved decisions

Signed off by the App Owner in November 2026:

1. **Fine-tune training** is optional: a card on Train and a row in the profile sheet. Anyone who never answered is asked at the week-6 check-in.
2. **Mindset questions** are dropped for quick start users. Nothing asks for them later.
3. **Target weight and pace** stay on the quick path for weight-loss and muscle-gain goals.
4. **Switching** works both ways mid-quiz, keeping every answer: "Finish faster" on the full quiz, "Answer everything instead" on the quick path.

### As built

- **API:** `sql/014_quick_onboarding.sql`, `engine/quickstart.ts` (the defaults, shared with the web app's plan preview), and `planning.service.ts`.
  - **Its own mutation,** not a flag on `completeOnboarding`: `completeQuickOnboarding(input: QuickOnboardingInput)`. It requires `basics` (the quick questions). `details` and `fuel` are optional, and are sent when they were answered anyway, after switching from the full quiz.
  - **Earlier answers are kept.** Redoing onboarding the quick way keeps answers from an earlier cycle instead of resetting them to defaults, so nothing is owed twice.
  - **Pending blocks live on the plan:** `myPlan { onboardingPath pendingSections }`, not on `me`. The app already loads the plan everywhere it needs this.
  - **Fuel without setup:** `mealDay`, `logFood` and `setWater` return the `FUEL_SETUP_NEEDED` error code.
  - **Later answers:** `completeFuelSetup` recalculates the targets and keeps any check-in correction. `fineTuneTraining` rebuilds the week like `setTrainingDays`.
  - **The check-in:** `previewNextCycle` and `completeCheckin` take an optional `details`. Without Fuel, the check-in skips the eating question and uses "some days", so calories never get stricter.
- **Web:**
  - **Quiz steps:** each one in `onboarding/steps.tsx` has a `block` tag (`fuel`, `details`, `mindset` or `extra`). `onboarding/blocks.ts` decides what each path asks.
  - **Building the plan:** quick start skips the warm-up and energy pop-ups. Warm-up is part of "Fine-tune your training".
  - **Asked later:** `app/IntakeSection.tsx` shows the same quiz screens one block at a time. It's used by the Fuel gate, `/fine-tune` and the check-in, and saves answers on the device as it goes.
  - **Where it shows:** Today's Fuel card says "Set up Fuel", and the profile sheet shows "Not set yet" rows with Answer.
- **Not in this step:** the welcome email still shows only the training plan and targets for everyone, as before, so nothing changed there.


## Clubs v1 (first release)

**Status: approved November 2026. All four steps of the [build order](#build-order-within-v1) are built.** This is the first, smaller release of Clubs. Where it differs from the [longer-term Clubs spec](#clubs-spec-planned), this section wins. The defaults that were signed off are listed under [Approved defaults](#approved-defaults).

### In and out

**In v1**

- App Owner and App Admins, with a console for creating clubs.
- Joining by invite list or by a join link that an admin approves.
- Club roles Admin (at most 3) and Coach (any number).
- Coaches automatically see members' workouts and activities.
- Sharing after a workout or activity, with an editable drafted summary.
- Posts with a photo or video, plus comments and reactions.
- Coach challenges and club routines.

**Later**

- Group analytics.
- Payments, tips and Premium.
- Personal-training requests and questionnaires.
- Public clubs and club search.
- Trainer certification badges.

**Never:** coaches don't change anyone's plan.

### The two target groups, checked against v1

**Gym friends:** 3 members and 2 coaches who already have the physique.

| What they need | How v1 covers it |
|---|---|
| Coaches as accountability stewards | Coaches see every workout and activity each member logs, on a page per member |
| Checking form | A member attaches a video to their workout post, and coaches comment or reply with a short video |
| Checking members push themselves | Coaches see sets, reps, weights and PRs, and can set up to 3 challenges a week each |
| Coaches posting anything | Coach video posts on any topic: form, motivation, a story, a day at the gym |

**Office buddies:** friends who use the office gym after work and run together on one day a week.

| What they need | How v1 covers it |
|---|---|
| The routines they do together | Club routines set by Admins, optional for members |
| A weekly run | A routine such as "Tuesday run day, at least 5 km", ticked automatically when they log a run of 5 km or more that day |
| A record of their routines | Each routine's page shows who did it each week, with a streak for each person |
| Tracking growth | Each person's own Progress tab, as today. Group-level growth is analytics, planned for later |
| A group with no coach | An Admin can also hold the Coach role, so challenges are still available |

### App Owner and App Admins

- **Two app-wide roles,** separate from club roles, in `identity.app_roles`:
  - **App Owner:** set once by script (`npm run app:owner -- you@example.com`).
  - **App Admins:** added and removed by the App Owner only.
- **The "special area" is an admin console at `/console`,** shown only to those accounts, and the API checks the role on every call. It isn't protected by a shared passcode, because a passcode can be passed around and can't be withdrawn from one person.
- **Only the App Owner and App Admins create clubs.** Creating one takes a name, a description, an optional photo, and the email of the person who'll run it. That person becomes the club's first Admin when they join, and can be the creator themselves.
- **The App Owner and App Admins can also be club members.** They join like anyone else, by invite or by naming themselves as first Admin, and can hold Admin or Coach roles there. Club roles come only from membership: an app role never grants a club role.
- **The console can also:** list clubs with their member counts, close a club, and replace a club's Admins if a club is stuck.
- **The console can't open anyone's logs, posts or media.** It only handles reported posts. An App Admin who is also a member of a club sees exactly what their club role allows, and nothing more.

### Joining

There are two ways in. Both are set up by club Admins, or from the console when a club is created.

| Way in | How it works |
|---|---|
| **Invite list** | Admins add emails. Each person gets an email with a link, and also sees the invite in the app when they sign in with that address. They join straight away |
| **Join link** | Admins create or turn off a link, which expires after 7 days and has a use limit. Whoever opens it signs up or signs in, gives their name, and waits for an Admin to approve them |

- **Email invites need a real email provider,** so v1 adds Resend behind the existing `Mailer` interface (`MAIL_PROVIDER=resend`). Admins also get an email and push notification when someone is waiting for approval.
- **Resend setup:** the App Owner has an existing Resend account.
  - Add TrackFit's sending domain there and publish the DNS records Resend asks for, so mail isn't marked as spam.
  - Put `RESEND_API_KEY` and `MAIL_FROM` (an address on that domain) in Render as secret settings, never in git.
  - The welcome email will start going out for real too, once the provider is switched on.
- **An invite only counts for a verified email.** An email/password account can be created with an address the person doesn't own.
- **New users take the existing quiz and health check, then land in the club.** The invite is kept with the onboarding draft so it survives the quiz. Someone the health check stops gets no plan and can't use the app, as today. That limitation is accepted for v1.
- **Before joining, the screen says plainly** that the club's coaches will see the workouts and activities they log. They must accept, and that acceptance is recorded as consent.
- **The Clubs tab appears only for club members** (including anyone waiting for approval) and App Admins. Everyone else keeps seeing the current "Clubs join this menu" note.
- **A club holds up to 50 members for now.**

### Club roles

Everyone in a club is a member. Coach and Admin are roles added on top, and one person can hold both.

| Action | Member | Coach | Admin |
|---|---|---|---|
| Post, comment, react, take challenges, log routines | Yes | Yes | Yes |
| See every member's workouts and activities | | Yes | |
| Set challenges (up to 3 per coach per week) | | Yes | |
| Approve joins, remove members | | | Yes |
| Make or remove Admins and Coaches | | | Yes |
| Set club routines, edit the club, delete any post or comment | | | Yes |

- **At most 3 Admins, always at least 1.** The last Admin can't leave or step down until they've made someone else an Admin. If nobody else is left, the App Owner closes the club.
- **Enforced in Postgres:** the club row is locked during the change, so two Admins leaving at the same moment can't both succeed. A test covers this race.
- **Coaches are members too,** so other coaches see a coach's own workouts as well.
- **When a coach loses the role or leaves,** they stop seeing members' logs at once.

### What coaches see

- **Without the member posting anything:**
  - every workout: exercises, sets, reps, weights, duration and PRs;
  - every activity: type, duration, distance, pace or speed, heart rate and effort.
- **From when:** logs from the day the member joined the club onward.
- **Never, unless the member posts it:** food, water, weight, photos, plan details and health answers.
- **The Members page** lists each member's recent workouts and activities, PRs, sessions per week and the challenges they've taken.
- **All access goes through one server check:** the viewer must be a coach, and the member active, in the same club. It ends the moment either one leaves.

### Posts

| Post | Comes from | Shows |
|---|---|---|
| **Workout** | The prompt after a workout, or the post composer | Summary text, optional photo or video, and the full workout to open |
| **Run or jog** | The prompt after logging the activity, or the composer | Distance, time, pace (min/km), optional photo such as a route screenshot |
| **Cycling** | Same | Distance, time, average speed (km/h), optional photo |
| **Other activity** | Same | Type, time, distance if any, optional photo |
| **Progress or gains** | Composer | Text and photo. The member can add a weight change from their log, such as "−2.4 kg since Day 1" |
| **Meal** | Composer | Text and photo |
| **Challenge win** | The prompt after finishing a challenge | The result and proof |
| **Coach video** | Coaches | A video and caption on any topic |

- **Media:** one photo (up to 10 MB) or one video per post.
  - Member videos are up to 30 s and 50 MB, the app's current limits.
  - Coach videos are up to 60 s.
- **Opening a workout post** shows the exercises with sets, reps and weights, the duration, PRs, and any video posted with it. Weights appear in the viewer's own units.
- **Anyone in the club can react and comment.** Coaches can also reply with a 30-second video.
- **Members can edit or delete their own posts,** and Admins can delete any. Anyone can report a post to the App Admins.
- **Leaving a club keeps a member's posts,** with an option to delete them on the way out.
- **The feed** is newest first, with filters for All, Wins, Coach videos and Challenges.

### Sharing after a workout or activity

1. **The prompt:** the existing "Workout done" sheet in `SessionPage` gains a card asking "Share with <club>?", with a drafted summary. For example: "Push day done in 52 min: 5 exercises, 18 sets, 4,350 kg moved. New best: bench press 80 kg × 5."
2. **What the draft includes:** PRs only from `HEAVIEST_SET` and `ESTIMATED_1RM`, since `MOST_REPS_AT_WEIGHT` is noisy, with weights in the member's units.
3. **The buttons:**
   - **Post**, which shares the draft as it is.
   - **Edit**, to change the text, add a photo or video, and pick clubs if the member is in more than one.
   - **Not now**, which shares nothing.
4. **Activities get the same prompt** after they're logged. For example: "Ran 5.2 km in 28:40 (5:31 /km)."
5. **Nothing posts until the member taps Post.** Each club has an "Ask me to share after workouts" setting the member can turn off.

The old `shareToClubs` flag isn't used. Posts replace it.

### Coach challenges

**What a challenge has**

- **Basics:** a title, a description, and Daily or Weekly. It runs from a start to an end date, by default this week.
- **Optional video:** a coach can explain the challenge in a short video. The title and kind are still required, so the app knows where to show it.
- **Proof:** always required, as a photo or video.

| Kind | Coach sets | Example | Result |
|---|---|---|---|
| **Workout** | Exercises from the catalogue with sets and reps, and an optional time limit | "This circuit in 20 minutes" | Time taken or reps, plus proof |
| **Activity** | Type and distance or time | "Run 3 km" | Taken from the logged activity, plus proof |
| **Food** | A food from the food list or typed in, and an amount | "A 50 g bowl of salad every day" | Ticked while logging food, plus proof |
| **Water** | A daily amount | "Drink 500 ml of water daily" | The day's logged water reaches the amount, plus proof |

**The limit:** each coach can set at most 3 challenges per week. Weeks run Monday to Sunday in the club's time zone, Africa/Accra by default. The API enforces this.

**How a member takes part**

1. **Pop-up:** the first time a member opens the app each day, one sheet lists the club challenges they haven't joined or declined. Tapping one shows the details and any video.
2. **Choosing:**
   - **Take on challenge:** the member joins.
   - **Not for me:** that challenge stops appearing.
   - **Closing the sheet:** the challenge appears again the next day.
3. **Where a joined challenge shows up:**
   - **Workout challenges** appear in the day's session as an extra block after the planned exercises, with a countdown when there's a time limit. On a rest day they appear on Today as a short session of their own.
   - **Activity challenges** appear in the activity logger as "Log for this challenge".
   - **Food challenges** appear in the food logging sheet on Fuel as a quick option, such as "Challenge: 50 g salad".
   - **Water challenges** appear on the water tracker with the target. If the member hasn't turned water tracking on, it shows anyway while the challenge runs.
4. **Proof:** "Submit result" is prefilled from the log where possible, and needs a photo or video.
   - A daily challenge needs proof each day.
   - A weekly challenge needs it once during the week.
5. **Finishing:** proof goes on the challenge's page, not the feed. When the member completes the challenge (every day of a daily one, or the single entry of a weekly one), they're asked to post a win to the feed, with drafted text.

**The challenge page** shows the details and video, who joined, each day's entries, and progress such as "5 of 7 days". Members can comment there.

**Notifications:** members get a push notification when a coach posts a challenge. This is a new kind, which members can turn off.

### Club routines

Routines are set by Admins, recur, and are optional for members. Unlike challenges, they need no proof, have no weekly cap and don't pop up.

| Kind | Example | How it's done |
|---|---|---|
| **Activity** | "Tuesday is run day: at least 5 km" | Ticked automatically when the member logs a matching activity that day |
| **Workout** | "Thursday office circuit" | The member logs it as a session from the routine |

- **On Today:** on its days, a routine appears as "Club routine: Tuesday run, 5 km", with a button to log it.
- **Frequency:** a routine repeats on chosen weekdays or every day.
- **The routine's page** shows who did it each week and each person's streak.
- **Plans don't change:** a routine adds to the day and never alters anyone's plan.
- **Limit:** up to 5 active routines per club.

### Privacy and safety

- **Media stays inside the club.** Club photos and videos go in Firebase Storage under `clubs/{clubId}/`, and are uploaded and viewed through short-lived signed URLs from the API. Storage rules can't check club membership, so the files are never public.
- **Consent is recorded:** joining and every role change are logged.
- **Safety basics:** reporting, deleting posts and removing members are in v1 from the start.
- **Account deletion,** when it's built, must keep the last-Admin rule.

### Technical outline

- **Backend:**
  - A `clubs` module (Postgres schema `clubs`) with the usual repository, service, resolvers and schema files.
  - `identity.app_roles` for the App Owner and App Admins.
  - A real email provider.
  - `notifications.in_app_notifications`, with pushes sent through the existing push code.
- **Tables:**
  - `clubs`, `memberships` (Admin and Coach flags, status, joined date, consent date), `invites`, `join_links`;
  - `posts` (linked session, activity or challenge), `post_media`, `comments`, `reactions`, `reports`;
  - `challenges`, `challenge_participants`, `challenge_entries`, `routines`, `routine_completions`.
- **Reading other modules:** Clubs reads workouts and activities through `tracking` service functions, with no direct table access.
- **Events:**
  - `WorkoutLogged` and `ActivityLogged` tick matching routines and challenge results.
  - `MilestoneAchieved` feeds PRs into the drafted summary.
- **Web:**
  - A Clubs tab, `/clubs` and `/clubs/:id` with Feed, Challenges, Routines and Members.
  - `/console` for the App Owner and Admins.
  - The challenge pop-up on Today, the share card and challenge block in `SessionPage`, and challenge options in the food sheet, water tracker and activity logger.
- **Emergency stop:** setting `CLUBS_ENABLED=false` hides Clubs everywhere.
- **Tests:**
  - At most 3 Admins and never 0, including the race.
  - At most 3 challenges per coach per week.
  - A coach sees only members of a shared club, and loses access on removal.
  - Non-members are rejected.
  - An unverified email can't claim an invite.

### Build order within v1

Each step can go to testers on its own:

1. **Console and clubs (built):** app roles, creating clubs, invites, join links and approval, club roles.
2. **Feed (built):** posts, sharing after workouts and activities, media, comments and reactions, the coaches' Members page.
3. **Club routines (built).**
4. **Challenges (built):** creating them, the pop-up, showing them in sessions, Fuel, water and the activity logger, proof, wins.

**Step 1 as built**

- **API:** the `clubs` module in `backend/src/modules/clubs/` and `sql/010_clubs.sql`.
  - The console mutations check `requireAppStaff`. Club changes lock the club row before checking the Admin and member counts.
  - `verifiedEmail` in `shared/auth/context.ts` only trusts an address from a verified sign-in token.
- **Web:**
  - Clubs pages are `/clubs`, `/clubs/:id` and `/console`, in `web/src/app/clubs/`. The Clubs tab shows only when `me.showClubs` is true.
  - Invite emails and join links open `/join/:token` (`web/src/pages/JoinPage.tsx`), which works signed out. A link opened before sign-in or the quiz is kept on the device (`web/src/lib/pendingJoin.ts`), and the app returns to it afterwards.
- **Not yet:**
  - **Account deletion:** memberships use `ON DELETE RESTRICT`, so the delete-account flow, when it's built, has to hand over Admin first.

**Step 2 as built**

- **API:** `feed.*` and `share-draft.ts` in `backend/src/modules/clubs/`, `sql/011_club_feed.sql`, and the media store in `backend/src/shared/media/store.ts`.
  - **Uploads** are two steps: `requestClubUpload` checks the type, size and video length and returns a signed link; the post, comment or club photo then claims the file, and the API checks it really arrived within the limits. Each upload can be attached once.
  - **Limits:** photos 10 MB; member videos 30 s and 50 MB; coach video posts 60 s and 100 MB (the spec gave the length, not the size); coach video replies 30 s.
  - **Posting to several clubs** copies the file into each club's folder.
  - **Coaches' access** goes through one check, `requireCoachOf`. They see logs from the member's join date, and access ends when either one leaves. Clubs reads workouts and activities only through `tracking.service` functions.
  - **Wins filter:** posts with a heaviest-set or estimated-1RM PR, progress posts, and challenge wins.
  - **Reports** notify App staff by push and appear in the console, where staff remove the post or leave it up. Admins can delete any post or comment, but only authors can edit their own.
- **Web:**
  - The club page has three tabs. **Feed** has filters, New post and older pages. **Members** gives coaches each member's last four weeks and a link to their log at `/clubs/:id/members/:userId`. **Club** has the share setting, the club photo (Admins), and leaving, with the option to delete your posts.
  - Posts open at `/clubs/:id/posts/:postId`, with the full workout, comments, and coach video replies.
  - **The share prompt** appears in the "Workout done" sheet and after logging cardio or a sport (`web/src/app/clubs/ShareCard.tsx`). Warm-ups, mobility and abs finishers don't ask.
- **Not in this step:**
  - **Comment notifications.** The spec doesn't ask for them, so nobody is notified of comments or reactions yet.
  - **Editing a post's photo.** Edits change the text only; to change the photo, delete the post and post again.
  - **Video length** is measured on the device. The server enforces size, but it can't read a video's length cheaply.

**Step 3 as built**

- **API:** `routines.*` and `routine-schedule.ts` in `backend/src/modules/clubs/`, and `sql/012_club_routines.sql`.
  - **Admins** create, edit and end routines. The 5-active limit is checked under the club row lock, and a routine can't switch between activity and workout once made.
  - **Activity routines** have a type (such as running) and an optional minimum distance and minutes. They aren't stored as done: they're worked out from the member's activity log whenever they're shown, so deleting the run unticks the routine. A distance within 10 m of the bar counts, for watch rounding.
  - **Workout routines** list catalogue exercises with sets and reps. Logging one creates a normal workout session ("Club routine: <name>" in its notes) and records it as done, once per person per day, for today or yesterday.
  - **Streaks** count the routine's days in a row that were done. Today only counts once it's done, so an unfinished day never breaks a streak. Days before the routine started, or before the member joined, don't count.
- **Web:**
  - **Routines tab** on the club page, and the routine page at `/clubs/:id/routines/:routineId`. The page shows who did it: this week first, then the five before, with each person's streak.
  - **Today** shows "Club routines today" for club members. "Log activity" opens the activity sheet already set to the routine's activity type; "Log it" opens the workout routine's exercises with optional weights and time.
- **Not in this step:** reminders for routine days, and routines on the coaches' Members page.

**Step 4 as built**

- **API:** `challenges.*` and `challenge-schedule.ts` in `backend/src/modules/clubs/`, and `sql/013_club_challenges.sql`.
  - **The cap:** 3 per coach per week, counted by the week the challenge is set (Monday to Sunday in the club's time zone) and checked under the club row lock. Ended challenges still count, so ending one doesn't free a slot. Each coach has their own 3.
  - **Dates:** a challenge starts today or within 28 days, and runs for up to 4 weeks. By default it runs from today to Sunday.
  - **Proof:** one photo or video for each day (daily) or each Monday-to-Sunday week (weekly), uploaded with the new `PROOF` purpose. A weekly challenge's first and last weeks are cut to its own dates. Proof can go in for today or the two days before.
  - **Checks against the log:**
    - **Activity:** the logged activity must be that day's, of the right type, and meet the distance or time.
    - **Water:** the day's logged total must reach the amount.
    - **Food from the list:** a matching food must be logged that day.
    - **Typed-in food:** rests on the photo, since it isn't in the food list.
    - **Workout:** a time over the limit is turned away. Each entry also logs a normal workout session ("Club challenge: <name>").
  - **Finishing:** when the last day (or week) has proof, the member is offered a win post. It goes to the feed with a copy of their latest proof, so deleting the post leaves the proof on the challenge's page. One win per person per challenge.
  - **Taking part:** "Not for me" stops the pop-up offering it. A member can still take it on from its page later, but can't drop out once they've sent proof.
  - **Ending:** the coach who set it, or an Admin, can end it. It leaves Today and the pop-up, and its page stays.
  - **Push:** goes to the club's other members when a coach sets a challenge. It's on by default and switched off under Reminders ("New club challenges", `clubChallenges` in `reminder_prefs`).
- **Web:**
  - **Club page:** a **Challenges** tab, with the coach's form (kind, dates, rules and an optional video of up to 60 seconds). Each challenge has a page at `/clubs/:id/challenges/:challengeId` with details, everyone's progress and proof, and comments.
  - **Today:** the pop-up on the first visit each day (remembered on the device) and a **Your challenges** card.
  - **Where joined challenges show up:**
    - **Workout:** a block after the planned exercises in the session, with a countdown when there's a time limit.
    - **Activity:** "Log for this challenge?" in the activity sheet.
    - **Food:** "Challenge: …" options in the food sheet.
    - **Water:** the target and "Send proof" on the water card.
  - **Coaches' Members page:** shows challenges taken and finished.
- **Not in this step:** reminders to send proof, and editing a challenge once it's set (end it and set another).

### Approved defaults

Signed off by the App Owner in November 2026, in addition to the decisions written into the sections above:

1. Coaches see logs from the day a member joined the club, not their full history.
2. A join link expires after 7 days.
3. A club holds up to 50 members, for now.
4. Each post has one photo or one video. Member videos are up to 30 s, coach videos up to 60 s.
5. Coaches' own workouts are visible to the club's other coaches.
6. A water challenge's amount is the day's total logged water, not water on top of the daily target.
7. Only coaches set challenges. An Admin who wants to set one gives themselves the Coach role.
8. A club can have up to 5 active routines.
9. Posts stay when a member leaves, unless they choose to delete them.
10. App Admins can't see club content, except posts reported to them.
11. Resend is the email provider, using the App Owner's existing account with TrackFit added as a domain.
12. App Owner and App Admins can be members of clubs, with club roles granted the same way as for anyone else.

## Clubs spec (planned)

**Status: draft for later releases, nothing here is built.** The first release is [Clubs v1](#clubs-v1-first-release), which replaces the access gate, club creation and coach visibility described here. Build on the `feature/social-clubs` branch, not `main`, because a push to `main` redeploys the API. Items marked **(proposed)** are defaults filling gaps in the brief; agreed and open choices are listed under [Decisions](#decisions). Prices and percentages are starting points to test.

### Goal

Let people train together in clubs and give clubs a way to run personal training. Clubs give users a reason to keep logging. Coaching could later be TrackFit's biggest earner, but its pricing is on hold until the app has users.

### Access: invite-only at first

Only selected people get Clubs until it opens to everyone. Build this first, so Clubs can merge to `main` and deploy while staying invisible to everyone else.

**Approach:** an access list in Postgres, checked by the API on every request. Hiding the tab alone isn't protection, because anyone signed in can call the API directly.

```sql
CREATE TABLE identity.feature_access (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature     TEXT NOT NULL,          -- 'clubs'
  user_id     UUID REFERENCES identity.users(id) ON DELETE CASCADE,
  email       TEXT,                   -- for someone who hasn't signed up yet
  source      TEXT NOT NULL,          -- 'manual' or the pilot code used
  note        TEXT,                   -- why they were let in
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at  TIMESTAMPTZ,
  CHECK (user_id IS NOT NULL OR email IS NOT NULL)
);
```

- **API:** add `requireFeature(context, "clubs")` next to `requireUser` in `backend/src/shared/auth/context.ts`, and call it in every Clubs resolver. It returns a `FORBIDDEN` error otherwise. An integration test runs every Clubs operation as a user who isn't on the list and expects rejection, so a new resolver can't slip through.
- **Web:** add `features: [String!]!` to the `User` type, returned by `me`. The Clubs tab and `/clubs` routes appear only when it includes `clubs`. Everyone else keeps seeing the current "Clubs join this menu" note, and `/clubs` redirects them to `/today`.
- **First users:** friends and testers, added one by one. Pilot codes come in when a gym joins.
- **Granting access:** a script, `npm run access:grant -- person@example.com clubs "Tester"`, run against Neon the same way as `db:migrate`. There's also `access:revoke` and `access:list`. An admin screen can wait. Revoking takes effect on the person's next request, and their club data is kept.
- **Grants by email need a verified address.** Email/password accounts can sign up with an address they don't own, so an email grant only counts when `context.auth.emailVerified` is true. Google sign-ins are already verified.
- **Pilot codes for whole groups:** a gym can't list 40 emails by hand. A code has a use limit and an expiry date, and redeeming it adds that person to the list and to the pilot club. Only you can create codes, by script. An ordinary club invite does not grant access, or the feature would spread on its own.
- **Launch switch:** an API setting, `CLUBS_ACCESS=off|allowlist|everyone`, defaults to `off`. `off` also works as an emergency stop, and `everyone` opens Clubs without another web release, since the web app only reads `features`.
- **Waitlist (proposed):** later, the Clubs note can gain a "Request access" button, which shows who wants the feature and which gyms to approach.

The same check can serve Premium: `features` would include `premium` for a paying user, and a manual grant gives testers Premium free.

### Who uses it

| Use case | What they get from a club |
|---|---|
| **Gyms** | A members' feed, targets, trainer videos and tracked clients |
| **Independent and online trainers** | A client base without a gym; likely the quickest paying group |
| **Community keep-fit and walking groups** | Group targets and shared timelines |
| **Running and cycling clubs** | Race preparation with a dated target |
| **Companies** | Staff wellness challenges, paid for by the employer |
| **Universities and halls** | Inter-hall or inter-department challenges |
| **Sports teams and school alumni groups** | Pre-season conditioning, with the coach as trainer |
| **Friends and accountability groups** | A small private club; this is what spreads the app |
| **Dietitians** | Food and water tracking with a client's consent (needs a "nutrition coach" role later) |
| **Physio and rehab clinics** | Later only: medical data raises the legal risk |

### Roles and rules

A person can hold several roles in a club, for example admin and trainer.

| Action | Member | Trainer | Admin | Owner |
|---|---|---|---|---|
| Post metrics, goals smashed, PRs and achievements | Yes | Yes | Yes | Yes |
| Request personal training | Yes | Yes | Yes | Yes |
| Post training videos | | Yes | | |
| See data from clients who consented | | Own clients only | | |
| Post club targets and timelines | | | Yes | Yes |
| Appoint or remove trainers | | | Yes | Yes |
| Moderate posts and remove members (proposed) | | | Yes | Yes |
| Appoint or remove admins, edit or close the club | | | | Yes |

**Admin rules**

- The creator becomes the owner, who is also an admin. They can add at most 2 more admins, so a club has at most 3.
- A club always has at least one admin, and the last admin cannot leave.
- **If the owner leaves (proposed):** they name another admin as owner. If there is no other admin, they promote a member first. If nobody else is in the club, leaving closes it.
- **Admins can step down (proposed)** unless they are the last one. The owner can remove co-admins, but co-admins cannot remove the owner.
- **Enforce these in Postgres as well as in the service.** Lock the club row (`SELECT ... FOR UPDATE`) in the transaction, or two admins leaving at the same moment could both pass the check. Add a test for that race.
- **Account deletion must follow the same rule.** The app has no delete-account flow yet, and tables use `ON DELETE CASCADE` from `identity.users`, so a future deletion could silently leave a club with no admin. Reference users from club tables with `ON DELETE RESTRICT`, and make the flow hand over ownership first.
- **Abandoned clubs (proposed):** if no admin is active for 90 days, support can promote a member who asks.

**Joining (proposed)**

- Clubs are public (found by search, join at once) or private (invite code or link, admin approves). Gyms will mostly want private.
- An invite link must survive onboarding: a new user who follows it, takes the quiz and signs up lands in the club.
- Clubs sit behind sign-in, not `RequirePlan`. That guard sends anyone without a plan to onboarding, and the health gate stops plan generation, so a screened-out gym member could otherwise never reach their club. They can read the feed, but can't request training until cleared.
- Clubs are 18+, matching the age check in onboarding (`identity.intake_profiles`).

### Feed and sharing

| Post type | Who posts | Content |
|---|---|---|
| Daily or weekly metrics | Members | A summary card built from their logs; the member picks which numbers appear |
| Goal smashed | Members | Goal plus optional note |
| New PR | Members | Exercise and value, from `tracking.milestones` |
| Achievement | Members | Text and optional photo, optionally linked to a club target |
| Club target | Admins | Title, measure, start and end date |
| Training video | Trainers | Title, description, level, video |

- **Nothing is shared without the member's action.** Sharing is opt-in per post; a member can turn on auto-share per club. Weight, food and photos are never in the default card.
- **Auto-shared PRs use `HEAVIEST_SET` and `ESTIMATED_1RM` only.** `MOST_REPS_AT_WEIGHT` is noisy (see Known limitations) and would fill the feed with false PRs.
- **`shareToClubs` needs extending.** The column and `WorkoutLogged` event exist, but only the MVP 1 `WorkoutsPage` sets it; the live `SessionPage` doesn't.
- **Targets show progress:** members can join a target, see a countdown, and post towards it. A leaderboard should be optional, because weight-loss rankings can encourage unhealthy behaviour; rank on consistency by default.
- **Moderation is required from day one:** report a post, block a member, admin removal, and support review. Reactions are in scope; comments and direct messages are not in the first release.

### Trainers

- Admins appoint trainers from club members. A person can train in several clubs.
- **"Certified" must be honest.** Admins appoint and vouch, and the profile shows the certificate name, issuer and year as "Club-appointed". A separate "TrackFit verified" badge appears only after we check a document. Showing "certified" unverified exposes us if someone is hurt.
- Removing a trainer, or the trainer leaving, ends client access immediately. Clients go back to the admin for reassignment, and the trainer keeps no copies of their data in the app.

**Trainers work through video only.** Everyone follows the plan the app generates, and trainers can't write, edit or replace it. There are no trainer-written routines.

**Training videos**

| Type | Purpose | Who sees it | How it's delivered (proposed) |
|---|---|---|---|
| **Form demo** | Shows how an exercise is done properly | All club members, or the trainer's clients | YouTube or Vimeo link, free and handles streaming |
| **Correction** | Corrects one client's technique | That client only | Recorded or uploaded in the app, as a short clip (up to 60 s) |
| **Form check** | The client films themselves doing an exercise | The client's trainer only | Recorded or uploaded in the app, up to 30 s, using the current upload limits |

- **Link each video to an exercise** in `tracking.exercises`, so it can appear in that exercise's guide during a live session. A short caption is allowed.
- **Corrections and form checks are private,** so an unlisted link isn't good enough. Store them in Firebase Storage under new paths, read only through short-lived signed URLs from the API, as with client photos below. The storage rules need to let a trainer upload corrections, and a client upload form checks, to those paths only. A form check is shared only with the trainer it's sent to, whatever the photo consent says.
- **Keep long videos out of Firebase Storage.** It has no transcoding, so they'd be slow on mobile data and costly to serve.
- **When paid video starts:** move to a video service such as Mux or Cloudflare Stream with signed playback, because unlisted links can be passed around.

### Personal training flow

1. **Request:** the member picks one of their club's trainers, or "anyone". Coaching happens only inside a shared club; independent trainers create their own.
2. **Questionnaire:** goals, training history, availability, equipment, injuries and limits. Prefill what `identity.intake_profiles` already holds so the member only confirms it.
3. **Consent:** the member chooses whether to share (see below). Declining doesn't block the request; the trainer simply works from the questionnaire.
4. **Assignment:** the chosen trainer accepts or declines within 72 hours. On a decline, a timeout or "anyone", it goes to the admins to assign. Trainers can set a client limit.
5. **Payment:** on hold. Coaching is free while TrackFit gains users, and its pricing will be specced later.
6. **Follow-up:** the client keeps following their generated plan and logging as usual, and can send form checks. The trainer reviews the client page, then sends correction videos and points the client to form demos.
7. **End:** either side can end it; access stops immediately.

**The plan doesn't change.** The client's plan still progresses only through the week-6 check-in. After cycle 1, a free user gets logging only, so a coached client without Premium would have no plan for their trainer to work from (see [Adaptive plans](#adaptive-plans-the-lead-premium-feature)). So an active coaching relationship includes Premium, and it ends when coaching ends.

### Data sharing and consent

Consent is per trainer, and the member can change or withdraw it at any time.

| Data | Source | Default on "agree" |
|---|---|---|
| Summary since joining the app | Computed (sessions, consistency, best lifts, weight trend, nutrition adherence) | On |
| Current plan, read-only | `tracking.generated_programs`, `nutrition.nutrition_plans` | On |
| Workouts and activities | `tracking.workout_sessions`, `set_logs`, `activity_logs` | On |
| Weight | `tracking.weight_entries` | On |
| Food log and water | `nutrition.food_logs`, `meal_entries`, `water_days` | On |
| Progress photos and videos | Firebase Storage | **Off, separate opt-in** |
| Health screening flags | `identity.health_screenings` | **Off, separate opt-in** |

- **One "agree" shares the logs and summary.** Photos and health flags each need their own opt-in, because they're far more sensitive than logs, and a single switch would push some people to refuse all sharing.
- **Consent is checked on the server for every read.** Everything goes through one function (`assertTrainerAccess(trainerId, clientId, scope)`), and each grant, change and withdrawal is recorded. A trainer's views of client data are logged too, and the member can see that log.
- **Admins and gym owners get no access** to a client's data just by running the club.
- **Photos need new plumbing.** `web/storage.rules` allows only the owner, and that should stay. Don't hand trainers Firebase download URLs: they keep working after access is withdrawn. Instead the API checks consent, then returns a short-lived signed URL using the Firebase Admin SDK, which needs a `FIREBASE_STORAGE_BUCKET` setting. `tracking.progress_photos` has no cycle number, so list a client's files from Storage under `users/{firebaseUid}/progress/`.
- **Injury notes and health flags** are special personal data. The app keeps screening to yes/no flags on purpose, so keep questionnaire injury fields separate from them, and show only what the member opted to share.
- **Trainer page:** a client list sorted by who needs attention (missed sessions, no logs lately), the summary, logs by day, and a photo comparison reusing the Progress screen's comparison.

### Payments

What's for sale and at what price is in [Paid features](#paid-features-planned). This covers how money moves.

- **Tips:** only clients with an active trainer relationship can tip that trainer, as in the brief. "Buy a coffee" is a preset tip amount; there's no separate product. Tips go through the same payment path.
- **Example, GHS 20 coffee at 5%:** Paystack takes 0.39 (1.95%), TrackFit keeps 1.00, the trainer receives 18.61. Show this to the tipper and the trainer in the app.
- **Trainer earnings at gyms:** the trainer receives them by default. On Club Pro, a gym can set a split with its trainers.
- **Market:** Ghana first, in GHS with mobile money.
- **Provider:** Paystack, because Ghanaian users expect mobile money and its split payments can pay a trainer's share automatically. Stripe's support for Ghanaian merchants is unclear, so don't plan around it.
- **Don't hold users' money.** Use split settlement rather than an in-app wallet, which could bring payment-licensing rules into play.
- **Trainers need a checked payout account** (mobile money or bank) before they can accept payment.
- **Record money in an append-only ledger:** amounts in pesewas as integers, with currency and the fee rate copied onto each row, so a later rate change never rewrites history (as `nutrition.food_logs` does with food numbers).
- **Webhooks are the source of truth:** verify the signature and handle repeats safely. Don't drive money through the in-process event bus, since it loses events on restart.
- **Refund rule (proposed):** tips are final except for fraud. Coaching can be cancelled at any time, effective at the end of the paid period.

### Technical plan

- **New modules, following the current pattern:** `backend/src/modules/clubs` (Postgres schema `clubs`) and `backend/src/modules/payments` (schema `payments`), each with repository, service, resolvers and schema files, composed in `backend/src/graphql/schema.ts`. Add migrations from `010_` on and mirror them in `schema.prisma`.
- **Reading other modules:** the trainer summary calls `tracking` and `nutrition` through service functions, with no direct table access from `clubs`.
- **Events:** the bus already emits `WorkoutLogged` and `MilestoneAchieved`; `clubs` subscribes to make auto-share posts.
- **Notifications:** `notifications.reminder_log` allows one send per user, kind and day, which suits reminders but not social events (several trainer notes in a day). Add a separate in-app notification table and send through the existing push code.
- **Web:** add a Clubs tab to `TABS` in `web/src/app/AppLayout.tsx`, shown only with access and replacing the "Clubs join this menu" note, with lazy-loaded pages under `web/src/app/clubs/`.

**Tables**

| Schema | Tables |
|---|---|
| `identity` | `feature_access`, `pilot_codes` |
| `clubs` | `clubs`, `memberships` (role flags, status), `invites`, `posts`, `reactions`, `reports`, `targets`, `target_participants`, `trainer_profiles`, `videos` (type, exercise, optional client), `form_checks` |
| `clubs` (coaching) | `coaching_requests`, `questionnaire_answers`, `coaching_relationships`, `data_consents`, `consent_events`, `trainer_access_log` |
| `payments` | `payout_accounts`, `plans`, `subscriptions`, `transactions`, `ledger_entries`, `webhook_events` |
| `notifications` | `in_app_notifications` |

**Infrastructure that must change first**

- **API hosting:** the free Render plan sleeps after 15 idle minutes, so the app is slow to answer after a break, including for payment webhooks. Move to a paid plan before real money flows, which ends the "no card on file" setup.
- **Email:** Resend is in place (Deploying step 7). Receipts will need their own templates.
- **Mobile apps:** the web app is unaffected by app-store billing. Before the Flutter build, check Apple's in-app purchase rules for Premium, tips, videos and coaching, which may need Apple's payment system and fee. Fitness training in real time is treated differently from content, and correction videos are not real time.

### Phases

Each phase is shippable alone, with tests in `integration.test.ts`.

| Phase | Scope | Done when |
|---|---|---|
| **0. Access gate** | `feature_access`, `requireFeature`, grant scripts, `CLUBS_ACCESS`, hidden tab | A user who isn't listed sees no Clubs tab, and the API rejects them |
| **1. Club core** | Create, join, invites, roles, admin rules, feed, sharing, moderation | A group can run a club, and the last admin can't leave, even in a race |
| **2. Targets and trainers** | Targets, achievements, trainer appointment, form demo videos, notifications | An admin can run a dated target; a trainer can post a form demo |
| **3. Coaching, free pilot** | Request, questionnaire, consent, assignment, trainer page, correction videos, form checks, signed photos | Testers run real coaching, and withdrawing consent cuts access at once |
| **4. Payments** | Paystack, ledger, payout accounts, tips. Coaching subscriptions once their pricing is specced | A tip reaches a trainer, and the ledger matches Paystack's records |
| **5. Premium and Pro** | Plan limits, Club Pro, Premium features, paid programs | Limits are enforced on the server |

Phase 3 comes before payments on purpose: a free pilot tests the coaching before payment work begins. Adaptive Premium doesn't depend on Clubs and could ship earlier (see [Paid features](#paid-features-planned)).

### Before charging anyone

These need a person, not code, and some take time:

- Register a Ghanaian business and GHS bank account for Paystack (eligibility per third-party guides; confirm with Paystack).
- Register with Ghana's Data Protection Commission under the Data Protection Act, 2012 (Act 843). Consent rules for special personal data apply to health information.
- Get legal advice on trainer terms, liability for injury, tax on trainer earnings, and whether commissions or tips bring any Bank of Ghana rules into play.
- Publish terms, a privacy policy and community rules, and add a delete-account flow.

### Decisions

**Agreed (November 2026)**

| Question | Decision |
|---|---|
| Is coaching paid through the app? | On hold. Coaching is free for now; pricing gets specced after gaining users |
| Who receives a gym trainer's earnings? | The trainer by default; a gym on Club Pro can set a split |
| Which market comes first? | Ghana, GHS and mobile money |
| How does a member get a trainer? | The member picks, and admins assign on a decline, a 72-hour timeout or "anyone" |
| How is "certified" shown? | "Club-appointed" first; a "TrackFit verified" badge later, after a document check |
| Can a trainer from another club coach someone? | No, coaching happens only inside a shared club |
| Can clients send clips for correction? | Yes: private form checks of up to 30 s, seen only by their trainer |
| Who gets Clubs first? | Friends and testers, added by hand |
| What do free users get after cycle 1? | Logging only, with no plan until they pay |
| Do existing users get their next cycle free? | Yes, one free cycle |
| How granular is data-sharing consent? | One "agree" for logs and summary; photos and health flags are separate opt-ins, off by default |
| Who builds and changes plans? | Only the app. Trainers work through videos and can't edit plans |
| Do coached clients get Premium? | Yes, while the coaching relationship is active, so their trainer always has a plan to work from. Revisit when coaching pricing is specced |

**Open**

- **Coaching pricing:** monthly price, commission and the "included" option for gym members, once there are users.

### Sources to re-check

Checked November 2026, partly from third-party pages. Confirm these before committing to them:

- Paystack: [transaction pricing](https://support.paystack.com/en/articles/2130306) and [transfer pricing](https://support.paystack.com/en/articles/2130370). Split settlement to mobile money wasn't confirmed.
- Ghana: [Data Protection Commission](https://dataprotection.org.gh/?p=7797) and [DLA Piper's summary](https://www.dlapiperdataprotection.com/?t=law&c=GH).
- Apple: [developer forum discussion of guideline 3.1.3(d)](https://developer.apple.com/forums/thread/704984). Read the live guidelines too.

## Paid features (planned)

**Status: nothing here is built.** All prices and percentages are starting points to test. Paying through the app needs the payment setup under [Payments](#payments) and the checks under [Before charging anyone](#before-charging-anyone).

**Principle:** keep logging free and charge for what the logs make possible. Trainers and adaptive plans are only useful if people keep logging, so it must never be paywalled.

### Adaptive plans: the lead Premium feature

The first 6-week cycle is free. Getting a next cycle built from the person's own results is Premium. People pay after they've seen results, and the app already has all the logic (`backend/src/modules/planning/engine/checkin.ts`).

| Part of the journey | Free | Premium |
|---|---|---|
| Quiz, plan reveal and the first 6-week cycle, with its reminders | Yes | Yes |
| Logging: workouts, activities, food, water, weight, photos | Yes, always | Yes |
| Exercise guides | Yes, always | Yes |
| Day-40 results: weight against pace, sessions done, best lift | Yes | Yes |
| Next cycle built from results: recalculated calories, ±150 kcal correction, set changes, rotated accessories, new starting weights | | Yes |
| After cycle 1 | Logging only, no plan | A new cycle every 6 weeks |

- **Show the results free.** They are the reason to pay, and the paywall appears right after them, on the step that builds the next cycle.
- **Free users keep logging after cycle 1, but get no plan.** They keep their logs, history and photos, and can still log workouts from their own templates (`/templates`). There's no planned session, meal plan or plan-based reminders (training day, missed session) until they pay.
- **"Logging only" needs a defined state in the app.** Today `RequirePlan` sends anyone without an active plan back to onboarding, which would loop a free user into the quiz and then the paywall. The ended cycle should stay as the user's record so the guard passes, with Today and Train showing "Cycle done", an upgrade card and the free logging tools.
- **Be upfront.** The plan reveal and welcome email should say the first 6 weeks are free and later adaptive cycles are Premium. The `CHECKIN_READY` reminders in `reminders.ts` promise a next cycle after two minutes, so they need rewording for free users.
- **Existing users:** anyone already on a cycle at launch gets their next cycle free, to keep faith with what they signed up for.
- **Coached clients get Premium** while the coaching relationship is active, since trainers can't change a plan. Grant it through the same `features` check, ending when coaching ends.

**Holes to close, enforced on the server**

- `completeCheckin` must require Premium, and only the API's check counts.
- `completeOnboarding` is a free way around the paywall: retaking the quiz archives the active program and builds a new cycle. Proposed: free users can redo it once, within the first 14 days of cycle 1, for wrong answers. After that it's Premium.
- `setStartDate` moves a cycle's dates, so a free user could keep shifting it. Limit it to before the cycle's first logged session, or similar.
- **Safety changes stay free.** A new injury or health change must always be able to update a plan, even for someone who hasn't paid.

**Pricing to test**

- **Cycle pass, about GHS 40 per 6 weeks:** a prepaid purchase that matches how the product runs, and needs no card on file. Confirm whether Paystack supports recurring mobile money billing. If it doesn't, passes are the way to serve mobile money users.
- **Yearly, about GHS 250:** about 8.7 cycles' worth for the price of about 6.
- **Monthly** is a poor fit, since the value arrives every 6 weeks.

**What to measure**

- Share of new users who reach day 40. This limits everything, because only they see the offer.
- Share of those who pay, and share who renew at the next check-in.
- Share of free users still logging 8 weeks after declining.

### Everything that can earn money

Rough order of priority. "Exists" means how much is already built.

| Feature | Who pays | Model | Exists |
|---|---|---|---|
| **Adaptive plans** (above) | Members | Cycle pass or yearly | Logic built, paywall isn't |
| **Coaching subscriptions** | Client, price set by trainer | Likely a commission, around 10-15% | On hold until there are users |
| **Club Pro** | Gyms, companies, big clubs | Monthly fee by member count | Spec only |
| **Premium insight:** deeper strength and nutrition trends, exports | Members | Part of Premium | Basic trends built |
| **Premium history:** photo and video history beyond the first cycle, and any-two comparison | Members | Part of Premium | Built; applying this to existing photos needs care |
| **Premium convenience:** grocery lists from the meal plan, barcode scanning | Members | Part of Premium | Not built |
| **Paid video series** | Client, one-off | 15-20% commission | Spec only |
| **Paid challenges** | Participants | Entry fee, 10-15% commission | Spec only. Avoid pooled cash prizes, which may count as gambling |
| **Tips and "buy a coffee"** | Clients | 5% | Spec only |
| **Corporate wellness** | Employers | Per employee, with only anonymised group reports | Not built |
| **Nutrition coaching** | Client | Same commission as coaching | Not built; needs a dietitian role |
| **Partner gym listings** | Gyms | Referral fee or listing, later; needs location data | Not built |
| **Sponsored challenges** | Brands | Per campaign, later with scale | Not built |

Tips alone won't carry this, which is why coaching pricing is worth specifying once there are users. As an illustration, 1,000 GHS 20 coffees earn GHS 1,000 at 5%, while 100 clients on a GHS 300 monthly plan would earn GHS 3,600 **every month** at 12%.

**Club limits by plan (proposed)**

| Feature | Free | Member Premium | Club Pro |
|---|---|---|---|
| Join clubs, feed, post, targets | Up to 2 clubs | Unlimited | Included |
| Create a club | 1 club, up to 30 members, 1 trainer | Up to 3 clubs | Larger limits, several trainers |
| Request a trainer and tip | Yes (we earn on it) | Yes | Yes |
| Club branding, member import, analytics, announcements | | | Yes |
| Trainer tools (client limits, video library, reports) | Basic | | Full |

**Never charge for or sell:** health data, ads targeted using it, the health gate, or basic logging.

### Order to launch

1. **Adaptive plans first.** It's the only stream that needs neither Clubs nor trainer payouts, so it tests whether people will pay at all, using a single Paystack integration.
2. **Tips,** after the free coaching pilot in Clubs phase 3. Coaching subscriptions follow once their pricing is specced.
3. **Club Pro,** once a pilot gym shows what it would pay for.
4. **The rest,** based on what paying users ask for.
