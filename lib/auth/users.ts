import { sql } from "@/lib/db/neonClient";

export type AuthUser = {
  id: string;
  email: string;
  password_hash: string;
  name: string;
};

export async function findUserByEmail(email: string): Promise<AuthUser | null> {
  const rows = await sql().query(
    `select id, email, password_hash, name from users where email = $1`,
    [email.trim().toLowerCase()]
  );
  return ((rows as unknown as AuthUser[])[0] as AuthUser) ?? null;
}

export async function createUser(email: string, name: string, passwordHash: string): Promise<AuthUser> {
  const rows = await sql().query(
    `insert into users (email, name, password_hash) values ($1, $2, $3) returning id, email, password_hash, name`,
    [email.trim().toLowerCase(), name, passwordHash]
  );
  return (rows as unknown as AuthUser[])[0];
}
