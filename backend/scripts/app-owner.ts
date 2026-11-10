/**
 * Sets the App Owner: the one account that can add App Admins in the console.
 * The person must have signed in to TrackFit once, so their account exists.
 *
 *   npm run app:owner -- you@example.com
 *   npm run app:owner -- you@example.com --replace   # hand over to someone else
 *
 * With --replace, the previous owner stays on as an App Admin.
 */
import "dotenv/config";
import pg from "pg";

const args = process.argv.slice(2);
const email = args.find((a) => !a.startsWith("--"));
const replace = args.includes("--replace");
if (!email) {
  console.error("Usage: npm run app:owner -- <email> [--replace]");
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const { rows: users } = await client.query(`SELECT id, display_name FROM identity.users WHERE lower(email) = lower($1)`, [email]);
  if (!users[0]) throw new Error(`No account with ${email}. Sign in to TrackFit with it once, then run this again.`);
  const user = users[0];
  const { rows: owners } = await client.query(`SELECT user_id FROM identity.app_roles WHERE role = 'OWNER'`);
  const current = owners[0]?.user_id as string | undefined;
  if (current === user.id) {
    console.log(`${email} is already the App Owner.`);
  } else {
    if (current && !replace) throw new Error("There is already an App Owner. Add --replace to hand over; they stay on as an App Admin.");
    await client.query("BEGIN");
    if (current) await client.query(`UPDATE identity.app_roles SET role = 'ADMIN' WHERE user_id = $1`, [current]);
    await client.query(
      `INSERT INTO identity.app_roles (user_id, role) VALUES ($1, 'OWNER')
       ON CONFLICT (user_id) DO UPDATE SET role = 'OWNER', granted_at = now()`,
      [user.id],
    );
    await client.query("COMMIT");
    console.log(`${user.display_name} (${email}) is now the App Owner.`);
  }
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await client.end();
}
