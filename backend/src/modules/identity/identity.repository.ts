import { pool } from "../../shared/db/pool.js";

export type UnitsPreference = "METRIC" | "IMPERIAL";

export interface UserRow {
  id: string;
  firebaseUid: string;
  displayName: string;
  phoneNumber: string | null;
  email: string | null;
  units: UnitsPreference;
  createdAt: Date;
  updatedAt: Date;
}

function mapRow(row: any): UserRow {
  return {
    id: row.id,
    firebaseUid: row.firebase_uid,
    displayName: row.display_name,
    phoneNumber: row.phone_number,
    email: row.email,
    units: row.units,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function findUserByFirebaseUid(firebaseUid: string): Promise<UserRow | null> {
  const { rows } = await pool.query(`SELECT * FROM identity.users WHERE firebase_uid = $1`, [
    firebaseUid,
  ]);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function findUserById(id: string): Promise<UserRow | null> {
  const { rows } = await pool.query(`SELECT * FROM identity.users WHERE id = $1`, [id]);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function createUser(params: {
  firebaseUid: string;
  displayName: string;
  phoneNumber?: string | null;
  email?: string | null;
}): Promise<UserRow> {
  const { rows } = await pool.query(
    `INSERT INTO identity.users (firebase_uid, display_name, phone_number, email)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [params.firebaseUid, params.displayName, params.phoneNumber ?? null, params.email ?? null],
  );
  return mapRow(rows[0]);
}

export async function updateUserProfile(
  id: string,
  updates: { displayName?: string; units?: UnitsPreference },
): Promise<UserRow> {
  const { rows } = await pool.query(
    `UPDATE identity.users
     SET display_name = COALESCE($2, display_name),
         units = COALESCE($3, units),
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [id, updates.displayName ?? null, updates.units ?? null],
  );
  return mapRow(rows[0]);
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const { rows } = await pool.query(`SELECT * FROM identity.users WHERE lower(email) = lower($1)`, [email]);
  return rows[0] ? mapRow(rows[0]) : null;
}

// ── App roles (identity.app_roles) ──────────────────────────────────────

export type AppRole = "OWNER" | "ADMIN";

export interface AppStaffRow {
  userId: string;
  displayName: string;
  email: string | null;
  role: AppRole;
  grantedAt: Date;
}

export async function getAppRole(userId: string): Promise<AppRole | null> {
  const { rows } = await pool.query(`SELECT role FROM identity.app_roles WHERE user_id = $1`, [userId]);
  return rows[0]?.role ?? null;
}

/** The owner first, then admins in the order they were added. */
export async function listAppStaff(): Promise<AppStaffRow[]> {
  const { rows } = await pool.query(
    `SELECT r.user_id, u.display_name, u.email, r.role, r.granted_at
       FROM identity.app_roles r JOIN identity.users u ON u.id = r.user_id
      ORDER BY r.role = 'OWNER' DESC, r.granted_at`,
  );
  return rows.map((r) => ({ userId: r.user_id, displayName: r.display_name, email: r.email, role: r.role, grantedAt: r.granted_at }));
}

/** Adds an App Admin. Leaves an existing role (including the owner's) alone; false if there was one. */
export async function addAppAdmin(userId: string, grantedBy: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `INSERT INTO identity.app_roles (user_id, role, granted_by) VALUES ($1, 'ADMIN', $2) ON CONFLICT (user_id) DO NOTHING`,
    [userId, grantedBy],
  );
  return rowCount === 1;
}

export async function removeAppAdmin(userId: string): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM identity.app_roles WHERE user_id = $1 AND role = 'ADMIN'`, [userId]);
  return rowCount === 1;
}
