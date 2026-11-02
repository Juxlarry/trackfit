import { pool } from "../../shared/db/pool.js";

export interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type ReminderKind = "TRAINING_DAY" | "PLAN_START_EVE";

/** A device can only belong to one account: signing in as someone else moves it. */
export async function upsertPushSubscription(userId: string, s: { endpoint: string; p256dh: string; auth: string; userAgent: string | null }) {
  await pool.query(
    `INSERT INTO notifications.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = $1, p256dh = $3, auth = $4, user_agent = $5`,
    [userId, s.endpoint, s.p256dh, s.auth, s.userAgent],
  );
}

export async function deletePushSubscription(userId: string, endpoint: string) {
  await pool.query(`DELETE FROM notifications.push_subscriptions WHERE user_id = $1 AND endpoint = $2`, [userId, endpoint]);
}

/** The push service said this subscription is gone (unsubscribed, uninstalled). */
export async function deletePushSubscriptionById(id: string) {
  await pool.query(`DELETE FROM notifications.push_subscriptions WHERE id = $1`, [id]);
}

export async function listPushSubscriptions(userId: string): Promise<PushSubscriptionRow[]> {
  const { rows } = await pool.query(`SELECT id, endpoint, p256dh, auth FROM notifications.push_subscriptions WHERE user_id = $1`, [userId]);
  return rows;
}

export async function markPushSent(id: string) {
  await pool.query(`UPDATE notifications.push_subscriptions SET last_sent_at = now() WHERE id = $1`, [id]);
}

export async function setUserTimeZone(userId: string, timeZone: string) {
  await pool.query(`UPDATE identity.users SET time_zone = $2 WHERE id = $1 AND time_zone IS DISTINCT FROM $2`, [userId, timeZone]);
}

export interface ReminderCandidate {
  userId: string;
  timeZone: string;
  reminderTime: string | null;
  programId: string;
  startDate: string;
  endDate: string;
}

/** Users who could get a reminder at all: a device to send to, a time zone and an active plan. */
export async function listReminderCandidates(): Promise<ReminderCandidate[]> {
  const { rows } = await pool.query(
    `SELECT u.id AS user_id, u.time_zone, i.reminder_time, p.id AS program_id,
            to_char(p.start_date, 'YYYY-MM-DD') AS start_date, to_char(p.end_date, 'YYYY-MM-DD') AS end_date
       FROM identity.users u
       JOIN tracking.generated_programs p ON p.user_id = u.id AND p.status = 'ACTIVE'
       LEFT JOIN identity.intake_profiles i ON i.user_id = u.id
      WHERE u.time_zone IS NOT NULL
        AND EXISTS (SELECT 1 FROM notifications.push_subscriptions s WHERE s.user_id = u.id)`,
  );
  return rows.map((r) => ({
    userId: r.user_id, timeZone: r.time_zone, reminderTime: r.reminder_time,
    programId: r.program_id, startDate: r.start_date, endDate: r.end_date,
  }));
}

export async function workoutLoggedOn(userId: string, timeZone: string, localDate: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM tracking.workout_sessions WHERE user_id = $1 AND (started_at AT TIME ZONE $2)::date = $3::date LIMIT 1`,
    [userId, timeZone, localDate],
  );
  return rows.length > 0;
}

/** Records the reminder before sending. False when another run already claimed it. */
export async function claimReminder(userId: string, kind: ReminderKind, localDate: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `INSERT INTO notifications.reminder_log (user_id, kind, local_date) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [userId, kind, localDate],
  );
  return rowCount === 1;
}

/** Undo a claim when nothing could be delivered, so the next run retries. */
export async function releaseReminder(userId: string, kind: ReminderKind, localDate: string) {
  await pool.query(`DELETE FROM notifications.reminder_log WHERE user_id = $1 AND kind = $2 AND local_date = $3`, [userId, kind, localDate]);
}
