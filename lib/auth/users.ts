import { sql } from "@/lib/db/neonClient";
import { Role } from "@/lib/auth/roles";

export type AuthUser = {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: Role;
  player_id: string | null;
};

export type PublicUser = Omit<AuthUser, "password_hash">;

const SELECT_FIELDS = "id, email, password_hash, name, role, player_id";
const PUBLIC_FIELDS = "id, email, name, role, player_id";

export async function findUserByEmail(email: string): Promise<AuthUser | null> {
  const rows = await sql().query(`select ${SELECT_FIELDS} from users where email = $1`, [
    email.trim().toLowerCase(),
  ]);
  return ((rows as unknown as AuthUser[])[0] as AuthUser) ?? null;
}

export async function getUser(id: string): Promise<PublicUser | null> {
  const rows = await sql().query(`select ${PUBLIC_FIELDS} from users where id = $1`, [id]);
  return ((rows as unknown as PublicUser[])[0] as PublicUser) ?? null;
}

export async function listUsers(): Promise<PublicUser[]> {
  const rows = await sql().query(`select ${PUBLIC_FIELDS} from users order by created_at`);
  return rows as unknown as PublicUser[];
}

export async function createUser(
  email: string,
  name: string,
  passwordHash: string,
  role: Role = "staf",
  playerId: string | null = null
): Promise<PublicUser> {
  const rows = await sql().query(
    `insert into users (email, name, password_hash, role, player_id) values ($1, $2, $3, $4, $5) returning ${PUBLIC_FIELDS}`,
    [email.trim().toLowerCase(), name, passwordHash, role, playerId]
  );
  return (rows as unknown as PublicUser[])[0];
}

export async function updateUser(
  id: string,
  patch: { role?: Role; player_id?: string | null }
): Promise<PublicUser | null> {
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  if (keys.length === 0) {
    return getUser(id);
  }
  const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  const values = [id, ...keys.map((k) => patch[k])];
  const rows = await sql().query(
    `update users set ${setClause} where id = $1 returning ${PUBLIC_FIELDS}`,
    values
  );
  return ((rows as unknown as PublicUser[])[0] as PublicUser) ?? null;
}

export async function deleteUser(id: string): Promise<void> {
  await sql().query(`delete from users where id = $1`, [id]);
}
