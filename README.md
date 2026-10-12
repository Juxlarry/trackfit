# TrackFit

Fitness tracker — weight tracking, gym/workout logging, exercises, workout
templates, and automatic PR/milestone detection. MVP1 is the web app
(React + TypeScript) backed by a GraphQL API (Node.js + TypeScript, Apollo
Server). Flutter mobile and the social/community layer (friend-finding,
gym clubs, location discovery) are scoped in the architecture but **not**
part of MVP1.

## Architecture at a glance

- **API**: GraphQL (Apollo Server v5), modular monolith with two active
  domain modules for MVP1 — `identity` (users/auth) and `tracking`
  (weight, exercises, workout templates, workout sessions, milestones).
  `nutrition`, `goals`, `social`, and `notifications` are designed into the
  schema but not built yet.
- **Database**: Postgres. Each module owns its own schema (`identity.*`,
  `tracking.*`) so a future service split doesn't require a data migration.
- **Auth**: Firebase Authentication (real phone number + OTP). The backend
  verifies Firebase ID tokens; it never sees a password or OTP itself.
- **Web**: Vite + React + TypeScript, Apollo Client, react-router, Recharts.
- **Long-term target**: AWS (eu-west-2 / London). For MVP1 we're using
  free-tier infrastructure instead (see **Deploying MVP1** below) so there's
  no cost and no card on file before this is validated.

## Repo layout

```
backend/   GraphQL API (Node.js + TypeScript)
  sql/           hand-written schema + seed data (see "About Prisma" below)
  prisma/        schema.prisma — kept as documentation of the data model
  src/modules/   identity/, tracking/ — each with repository/service/schema/resolvers
  src/graphql/   schema composition (merges module typeDefs + resolvers)
  src/shared/    db pool, auth (Firebase + dev bypass), domain event bus
web/       React web app
  src/pages/      Dashboard, Weight, Workouts, Templates, sign-in
  src/components/ AppShell (nav), WeightChart
  src/auth/       AuthContext (Firebase user or dev-bypass user)
```

## Running it locally

### 1. Backend

Requires Postgres 16+ running locally (or point `DATABASE_URL` at any
Postgres instance).

```bash
cd backend
npm install
psql "$DATABASE_URL" -f sql/001_init.sql
psql "$DATABASE_URL" -f sql/seed_exercises.sql
cp .env.example .env   # fill in DATABASE_URL at minimum
npm run dev
```

The API listens on `http://localhost:4000/` by default (`PORT` in `.env`).

### 2. Web app

```bash
cd web
npm install
cp .env.example .env   # VITE_API_URL should point at the backend above
npm run dev
```

Open the printed `localhost` URL. With `DEV_AUTH_BYPASS` / `VITE_DEV_AUTH_BYPASS`
set to `"true"` (the `.env.example` default), the sign-in screen is a
"type a display name" shortcut instead of real phone auth — useful for
local development and testing without a live Firebase project. **Never set
either bypass flag to `"true"` in a deployed environment** — it skips
authentication entirely.

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

## Known MVP1 limitations

- **`MOST_REPS_AT_WEIGHT` milestones can be noisy.** It fires on the first
  time you log a given weight for an exercise, even if that weight is lower
  than a heavier set you've already done (e.g. squatting 90kg for the first
  time after already hitting 100kg still "wins" a 90kg rep PR). This matches
  the literal spec but may read as confusing — worth revisiting once there's
  real usage to look at.
- **N+1 queries** in a few nested resolvers (e.g. exercise lookups inside
  workout history) are an accepted simplification for MVP1's data volumes,
  flagged in code comments where they occur.
- **No automated tests yet** — everything above was verified by hand
  (direct GraphQL queries against the running backend, and a scripted
  Playwright pass through every screen in the web app). Worth adding before
  this grows past MVP1.
- The production JS bundle is a single ~270KB gzipped chunk (Vite warns
  past 500KB raw); fine for MVP1, but route-based code-splitting is an easy
  win if load time becomes a concern.

## Deploying MVP1 (no-cost path)

This stack was chosen specifically to avoid putting a card on file before
the product is validated:

| Piece | Service | Notes |
|---|---|---|
| Postgres | [Neon](https://neon.tech) free tier | Run `sql/001_init.sql` and `sql/seed_exercises.sql` against it once provisioned |
| Auth | Firebase Authentication | Enable **Phone** sign-in in the Firebase console |
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
