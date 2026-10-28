# TrackFit

Fitness tracker with a personalised onboarding quiz, a generated 6-week training program and meal plan, and tracking for workouts, activities, meals, weight and progress photos. The web app (React + TypeScript) is backed by a GraphQL API (Node.js + TypeScript, Apollo Server). Flutter mobile and the social layer (Clubs) are planned but not built yet.

## What's in MVP 2

- **Onboarding quiz** at `/start` (45 screens across 6 stages: You, Goal, Training, Lifestyle, Fuel, Mindset). Answers stay on the device until the account exists, so nothing is lost on refresh.
- **Health gate**: any screening flag stops plan generation and points to safer next steps.
- **Plan generation** in one step: 6-week program (split, warm-ups, abs & core in every session, optional full-body day, injury swaps) plus a nutrition plan from the user's favourite dishes (2 meals + snack up to 3 meals + 2 snacks).
- **±1 training days** after rollout, anchored to the onboarding answer (`max(2, n-1)` to `min(6, n+1)`), on the plan reveal, the Train tab and the profile sheet.
- **Sign-up at the peak** (after the reveal): Google or email/password via Firebase, with email typo suggestions and live password rules. The backend sends a welcome email with the start date and a plan link.
- **App tabs**: Today, Train, Fuel, Progress (a slot is reserved for Clubs). Includes live sessions with rest timer and last-time column, activity logging (cardio distance, calories, heart rate, MET estimates), meal ticks and swaps, a weight trend, a consistency heat map, strength trends and progress photos/videos (10 MB photos, 30 s / 50 MB videos).
- **Animated exercise form figures** with a correct form vs common mistake view, and illustrated body types with a gauge toggle.
- MVP 1 screens (custom templates, history, weight log) are still reachable from Train at `/templates`, `/workouts` and `/weight`.

## Architecture at a glance

- **API**: GraphQL (Apollo Server 5), modular monolith. Each module has its own Postgres schema:
  - `identity`: users, auth, health screening, intake;
  - `tracking`: weight, exercises, templates, sessions, milestones, generated programs, activities;
  - `nutrition`: recipes, nutrition plans, meal entries.
  - The `planning` module orchestrates onboarding and owns no tables of its own.
- **Plan engine**: `backend/src/modules/planning/engine` is pure TypeScript with no I/O. The backend uses it to generate plans. The web app imports the same code through the `@engine` Vite alias for live previews in the quiz, so the rules exist once. The seed SQL for exercises and recipes is generated from its catalogue.
- **Auth**: Firebase Authentication with Google and email/password. The backend verifies ID tokens.
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
- **Media storage**: progress photos and videos stay in the browser (IndexedDB) on the device that took them. The UI says so. Moving them to cloud storage needs an upload API and a bucket.
- **Reminders**: the reminder time is saved, but no push or email sender runs yet.
- **Cycle check-in** (week 6) is shown in the app but not built.
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

## Deploying MVP1 (no-cost path)

This stack was chosen specifically to avoid putting a card on file before
the product is validated:

| Piece | Service | Notes |
|---|---|---|
| Postgres | [Neon](https://neon.tech) free tier | Run `npm run db:migrate` with `DATABASE_URL` pointing at it |
| Auth | Firebase Authentication | Enable **Google** and **Email/Password** sign-in in the Firebase console |
| Backend hosting | Render or Fly.io free tier | Build `backend/`, run `npm run build && npm start` |
| Web hosting | Firebase Hosting free tier | `npm run build` in `web/`, deploy the `dist/` folder |

Backend environment variables to set on the host (see `backend/.env.example`):
`DATABASE_URL` (Neon connection string), `FIREBASE_PROJECT_ID`,
`FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (from a Firebase service
account), `PORT`. **Leave `DEV_AUTH_BYPASS` unset.**

Web environment variables (see `web/.env.example`): `VITE_API_URL` (the
deployed backend URL), `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
`VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` (from the Firebase web
app config). **Leave `VITE_DEV_AUTH_BYPASS` unset.**

When the product outgrows the free tiers, the modular monolith and
schema-per-module design are meant to make a move to AWS eu-west-2 (RDS
Postgres + PostGIS, ECS or similar) a configuration change rather than a
rewrite.

## Source control

This repo was built in a sandboxed environment with no authenticated GitHub
access (`gh auth status` fails there), so it's being delivered as a local
git repository (already initialized, with history) rather than pushed to a
remote. To push it:

```bash
git remote add origin <your-repo-url>
git push -u origin main
```
