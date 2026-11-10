import { pool } from "../../shared/db/pool.js";

export interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type ReminderKind = "TRAINING_DAY" | "PLAN_START_EVE" | "WEIGH_IN" | "PROGRESS_PHOTO" | "MISSED_SESSION" | "CHECKIN_READY";

export interface ReminderPrefsRow { weighIn: boolean; progressPhotos: boolean; missedSession: boolean; clubChallenges: boolean }

/** No row means everything is on. */
export async function getReminderPrefs(userId: string): Promise<ReminderPrefsRow> {
  const { rows } = await pool.query(`SELECT weigh_in, progress_photos, missed_session, club_challenges FROM notifications.reminder_prefs WHERE user_id = $1`, [userId]);
  const r = rows[0];
  return r
    ? { weighIn: r.weigh_in, progressPhotos: r.progress_photos, missedSession: r.missed_session, clubChallenges: r.club_challenges }
    : { weighIn: true, progressPhotos: true, missedSession: true, clubChallenges: true };
}

export async function setReminderPrefs(userId: string, p: ReminderPrefsRow) {
  await pool.query(
    `INSERT INTO notifications.reminder_prefs (user_id, weigh_in, progress_photos, missed_session, club_challenges) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE SET weigh_in = $2, progress_photos = $3, missed_session = $4, club_challenges = $5, updated_at = now()`,
    [userId, p.weighIn, p.progressPhotos, p.missedSession, p.clubChallenges],
  );
}

/** Of these users, those who want a push when a coach sets a club challenge (on unless turned off). */
export async function usersWantingChallengePush(userIds: string[]): Promise<string[]> {
  if (!userIds.length) return [];
  const { rows } = await pool.query(
    `SELECT u.id FROM unnest($1::uuid[]) AS u(id)
       LEFT JOIN notifications.reminder_prefs p ON p.user_id = u.id
      WHERE COALESCE(p.club_challenges, true)`,
    [userIds],
  );
  return rows.map((r) => r.id);
}

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
  cycleNumber: number;
  startDate: string;
  endDate: string;
  prefs: ReminderPrefsRow;
}

/** Users who could get a reminder at all: a device to send to, a time zone and an active plan. */
export async function listReminderCandidates(): Promise<ReminderCandidate[]> {
  const { rows } = await pool.query(
    `SELECT u.id AS user_id, u.time_zone, i.reminder_time, p.id AS program_id, p.cycle_number,
            to_char(p.start_date, 'YYYY-MM-DD') AS start_date, to_char(p.end_date, 'YYYY-MM-DD') AS end_date,
            COALESCE(rp.weigh_in, true) AS weigh_in, COALESCE(rp.progress_photos, true) AS progress_photos,
            COALESCE(rp.missed_session, true) AS missed_session
       FROM identity.users u
       JOIN tracking.generated_programs p ON p.user_id = u.id AND p.status = 'ACTIVE'
       LEFT JOIN identity.intake_profiles i ON i.user_id = u.id
       LEFT JOIN notifications.reminder_prefs rp ON rp.user_id = u.id
      WHERE u.time_zone IS NOT NULL
        AND EXISTS (SELECT 1 FROM notifications.push_subscriptions s WHERE s.user_id = u.id)`,
  );
  return rows.map((r) => ({
    userId: r.user_id, timeZone: r.time_zone, reminderTime: r.reminder_time,
    programId: r.program_id, cycleNumber: r.cycle_number, startDate: r.start_date, endDate: r.end_date,
    prefs: { weighIn: r.weigh_in, progressPhotos: r.progress_photos, missedSession: r.missed_session, clubChallenges: r.club_challenges ?? true },
  }));
}

export interface ReminderFacts {
  loggedToday: boolean;
  loggedYesterday: boolean;
  weighedRecently: boolean;
  /** Photo slots ("Week 3", "Week 6") holding a photo saved on or after the plan's start date. */
  photosThisCycle: string[];
}

/**
 * What the user already did, by their local calendar: workouts today/yesterday,
 * a weigh-in in the last 3 days, photos taken this cycle.
 */
export async function reminderFacts(userId: string, timeZone: string, localDate: string, startDate: string): Promise<ReminderFacts> {
  const { rows } = await pool.query(
    `SELECT
       EXISTS (SELECT 1 FROM tracking.workout_sessions WHERE user_id = $1 AND (started_at AT TIME ZONE $2)::date = $3::date) AS logged_today,
       EXISTS (SELECT 1 FROM tracking.workout_sessions WHERE user_id = $1 AND (started_at AT TIME ZONE $2)::date = $3::date - 1) AS logged_yesterday,
       EXISTS (SELECT 1 FROM tracking.weight_entries WHERE user_id = $1 AND (recorded_at AT TIME ZONE $2)::date BETWEEN $3::date - 2 AND $3::date) AS weighed_recently,
       ARRAY(SELECT slot FROM tracking.progress_photos WHERE user_id = $1 AND (saved_at AT TIME ZONE $2)::date >= $4::date) AS photos`,
    [userId, timeZone, localDate, startDate],
  );
  return { loggedToday: rows[0].logged_today, loggedYesterday: rows[0].logged_yesterday, weighedRecently: rows[0].weighed_recently, photosThisCycle: rows[0].photos };
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
