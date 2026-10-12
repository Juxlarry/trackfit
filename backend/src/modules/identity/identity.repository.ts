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
