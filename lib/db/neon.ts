import { randomUUID } from "crypto";
import { EntityName } from "@/lib/types";
import { sql } from "@/lib/db/neonClient";

// Generieke Postgres-store voor Neon: bouwt dynamische, geparametriseerde SQL
// op basis van de sleutels van het meegegeven object. Entiteitsnamen komen
// altijd uit de gevalideerde ENTITIES-lijst (isValidEntity); kolomnamen komen
// uit onze eigen applicatiecode. Identifiers worden hoe dan ook veilig
// gequote, zodat de kolommen 1-op-1 matchen met de tabeldefinities in
// db/migrations/001_schema.sql (net als voorheen bij de Supabase REST-laag).

type Row = Record<string, unknown> & { id: string };

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

// jsonb-kolommen accepteren een JSON-string via impliciete cast; alle andere
// kolommen krijgen hun waarde ongewijzigd mee.
function prepareValue(v: unknown): unknown {
  if (v !== null && typeof v === "object") return JSON.stringify(v);
  return v;
}

export const neonStore = {
  async list(entity: EntityName): Promise<Row[]> {
    const rows = await sql().query(`select * from ${quoteIdent(entity)}`);
    return rows as unknown as Row[];
  },

  async insert(entity: EntityName, rows: Record<string, unknown>[]): Promise<Row[]> {
    const inserted: Row[] = [];
    for (const row of rows) {
      const withId: Record<string, unknown> = { ...row, id: (row.id as string) || randomUUID() };
      const keys = Object.keys(withId);
      const cols = keys.map(quoteIdent).join(", ");
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
      const values = keys.map((k) => prepareValue(withId[k]));
      const text = `insert into ${quoteIdent(entity)} (${cols}) values (${placeholders}) returning *`;
      const result = await sql().query(text, values);
      inserted.push((result as unknown as Row[])[0]);
    }
    return inserted;
  },

  async update(entity: EntityName, id: string, patch: Record<string, unknown>): Promise<Row | null> {
    const keys = Object.keys(patch).filter((k) => k !== "id");
    if (keys.length === 0) {
      const rows = await sql().query(`select * from ${quoteIdent(entity)} where id = $1`, [id]);
      return ((rows as unknown as Row[])[0] as Row) ?? null;
    }
    const setClause = keys.map((k, i) => `${quoteIdent(k)} = $${i + 2}`).join(", ");
    const values = [id, ...keys.map((k) => prepareValue(patch[k]))];
    const text = `update ${quoteIdent(entity)} set ${setClause} where id = $1 returning *`;
    const rows = await sql().query(text, values);
    return ((rows as unknown as Row[])[0] as Row) ?? null;
  },

  async remove(entity: EntityName, id: string): Promise<void> {
    await sql().query(`delete from ${quoteIdent(entity)} where id = $1`, [id]);
  },

  async clear(entity: EntityName): Promise<void> {
    await sql().query(`delete from ${quoteIdent(entity)}`);
  },
};
