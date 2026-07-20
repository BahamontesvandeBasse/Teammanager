// Eenmalige migratie: lokale data/db.json van `position` (string) naar `positions` (string[]).
// Uitvoeren: npx tsx scripts/migrate-positions.ts
import { promises as fs } from "fs";
import path from "path";
import { parsePositions } from "../lib/positions";

const DB_FILE = path.join(process.cwd(), "data", "db.json");

async function main() {
  const raw = await fs.readFile(DB_FILE, "utf-8");
  const db = JSON.parse(raw);
  let migrated = 0;
  db.players = (db.players ?? []).map((p: Record<string, unknown>) => {
    if ("position" in p) {
      const { position, ...rest } = p;
      migrated++;
      return { ...rest, positions: typeof position === "string" ? parsePositions(position) : [] };
    }
    if (!("positions" in p)) return { ...p, positions: [] };
    return p;
  });
  await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
  console.log(`Gemigreerd: ${migrated} spelers.`);
}

main();
