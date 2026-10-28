/**
 * Minimal SQL migration runner: applies sql/*.sql in filename order, once each,
 * recording them in public.schema_migrations.
 *
 * MVP 1 databases were set up by hand with psql (001_init.sql + seed_exercises.sql).
 * If identity.users already exists but nothing is recorded yet, those two files
 * are marked as applied instead of re-run.
 *
 *   npm run db:migrate
 */
import "dotenv/config";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";

const dir = fileURLToPath(new URL("../sql/", import.meta.url));
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort((a, b) => {
  // seed_exercises.sql belongs right after 001_init.sql
  const rank = (f: string) => (f === "seed_exercises.sql" ? "001_z" : f);
  return rank(a).localeCompare(rank(b));
});

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query(`CREATE TABLE IF NOT EXISTS public.schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const { rows } = await client.query(`SELECT filename FROM public.schema_migrations`);
  const applied = new Set(rows.map((r) => r.filename as string));
  if (applied.size === 0) {
    const { rows: t } = await client.query(`SELECT to_regclass('identity.users') AS t`);
    if (t[0].t) {
      for (const f of ["001_init.sql", "seed_exercises.sql"]) {
        await client.query(`INSERT INTO public.schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING`, [f]);
        applied.add(f);
      }
      console.log("Existing MVP 1 database detected: marked 001_init.sql and seed_exercises.sql as applied.");
    }
  }
  for (const f of files) {
    if (applied.has(f)) continue;
    const sql = readFileSync(dir + f, "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(`INSERT INTO public.schema_migrations (filename) VALUES ($1)`, [f]);
      await client.query("COMMIT");
      console.log(`Applied ${f}`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(`Migration ${f} failed: ${(err as Error).message}`);
    }
  }
  console.log("Database is up to date.");
} finally {
  await client.end();
}
