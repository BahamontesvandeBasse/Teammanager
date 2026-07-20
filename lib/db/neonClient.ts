import { neon } from "@neondatabase/serverless";

// Eén Neon Postgres-verbinding voor de hele server. De browser krijgt deze
// connection string nooit te zien — alle databasetoegang loopt via Next.js
// server-side code (API-routes, server components).

export function neonConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

let cached: ReturnType<typeof neon> | null = null;

export function sql() {
  if (!cached) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL ontbreekt — kan geen Neon-verbinding opzetten.");
    }
    cached = neon(process.env.DATABASE_URL);
  }
  return cached;
}
