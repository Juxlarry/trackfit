# TrackFit

Fitness tracker with a personalised onboarding quiz, a generated 6-week training program and meal plan, and tracking for workouts, activities, meals, weight and progress photos. The web app (React + TypeScript) is backed by a GraphQL API (Node.js + TypeScript, Apollo Server). Flutter mobile and the social layer (Clubs, see the [spec](#clubs-spec-planned)) are planned but not built yet.

## What's in MVP 2

- **Onboarding quiz** at `/start` (45 screens across 6 stages: You, Goal, Training, Lifestyle, Fuel, Mindset). Answers stay on the device until the account exists, so nothing is lost on refresh.
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
  - `nutrition`: recipes, nutrition plans, meal entries, food logs, custom foods, water.
  - The `planning` module orchestrates onboarding and owns no tables of its own.
- **Plan engine**: `backend/src/modules/planning/engine` is pure TypeScript with no I/O. The backend uses it to generate plans. The web app imports the same code through the `@engine` Vite alias for live previews in the quiz, so the rules exist once. The seed SQL for exercises and recipes is generated from its catalogue.
- **Auth**: Firebase Authentication with Google and email/password. The backend verifies ID tokens.
- **Week-6 check-in**: from day 40 of a cycle, `/checkin` shows what the cycle did (weight against planned pace, sessions done, best lift), asks three questions and builds the next cycle: calories recalculated and corrected ±150 kcal against the pace, day count, set changes, rotated accessories and starting weights from weeks 5-6. Rules: `backend/src/modules/planning/engine/checkin.ts`; history in `tracking.cycle_checkins`.
- **Log any food** on Fuel: search about 140 foods, Ghanaian dishes first, with local names (`backend/src/modules/planning/engine/foods.ts`, searched on the device), pick a household portion or grams and the meal. Foods not in the list can be quick-added and are kept in "My foods". A food logged "instead of" a planned meal stops that meal counting. The daily totals combine ticked meals and logged foods, and the week-6 check-in pre-answers its eating question from them. Optional water tracking uses sachet and Voltic/Bel-Aqua bottle sizes, with a target of about 35 ml/kg (+500 ml on training days).
- **Notifications**: reminders as Web Push (VAPID, `web-push`): training days, the evening before each cycle starts, weekly weigh-ins, Week 3/6 photo slots (skipped once that slot has a photo from this cycle; the app reports filled slots to `tracking.progress_photos`), missed sessions (those three switchable, `notifications.reminder_prefs`) and the week-6 check-in on days 40-42. Rules and times are at the top of `backend/src/modules/notifications/reminders.ts`. A job checks every few minutes for reminders due in each user's time zone and logs each one so it is sent once. See "Reminders" under Deploying.
- **Email**: a `Mailer` interface. Only `MAIL_PROVIDER=console` (logs the email) exists so far; a real provider is an open item.
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

- **Email provider**: welcome emails only go to the console until a provider is chosen (for example Resend or SES).
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

## Clubs spec (planned)

**Status: draft, nothing here is built.** Build on the `feature/social-clubs` branch, not `main`, because a push to `main` redeploys the API. Items marked **(proposed)** are defaults filling gaps in the brief; agreed and open choices are listed under [Decisions](#decisions). Prices and percentages are starting points to test.

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

**The plan doesn't change.** The client's plan still progresses only through the week-6 check-in. After cycle 1, a free user gets logging only, so a coached client without Premium would have no plan for their trainer to work from (see [Adaptive plans](#adaptive-plans-the-lead-premium-feature)). Proposed: an active coaching relationship includes Premium. This is open decision A.

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
- **Email:** only `MAIL_PROVIDER=console` exists, so a real provider is needed for invites and receipts.
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

**Open**

- **A. Do coached clients get Premium?** With logging only after cycle 1, a coached client without Premium has no plan for their trainer to work from. Proposed: an active coaching relationship includes Premium, revisited when coaching pricing is specced.
- **B. Coaching pricing:** monthly price, commission and the "included" option for gym members, once there are users.

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
- **Coached clients:** whether coaching includes Premium is [open decision A](#decisions).

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
