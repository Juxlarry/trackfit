import { Pool } from "pg";

/**
 * Shared Postgres connection pool.
 *
 * Note: this backend talks to Postgres directly via `pg` rather than through
 * the generated Prisma Client. `prisma/schema.prisma` is still the
 * authoritative, documented data model (kept in sync with this SQL by hand
 * for now) — see backend/README.md for why this sandbox can't run
 * `prisma generate`/`migrate` (its engine download is blocked by network
 * policy here). On a normal machine, swapping this file for `@prisma/client`
 * calls is a drop-in replacement; the module boundaries and schema
 * don't change.
 */
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("Unexpected Postgres pool error", err);
});
