import { neon, types } from "@neondatabase/serverless";

// Eén Neon Postgres-verbinding voor de hele server. De browser krijgt deze
// connection string nooit te zien — alle databasetoegang loopt via Next.js
// server-side code (API-routes, server components).

// Zonder deze override parseert de driver `date`-kolommen (OID 1082) naar
// JS Date-objecten, die bij het JSON-serialiseren van de API-respons
// omslaan naar een volledige ISO-timestamp met tijdzone-verschuiving (bv.
// "2026-08-14T22:00:00.000Z" i.p.v. "2026-08-15") — dat breekt overal in de
// app waar met platte "YYYY-MM-DD"-strings wordt vergeleken/gesorteerd.
// Houd de ruwe string aan, exact zoals de lokale JSON-store en de eerdere
// Supabase/PostgREST-laag die ook altijd teruggaven.
types.setTypeParser(1082, (value: string) => value);

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
