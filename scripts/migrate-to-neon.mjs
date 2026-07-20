// Eenmalige migratie: lokale data/db.json → Neon (na het uitvoeren van
// db/migrations/001_schema.sql tegen de Neon-database).
// Uitvoeren: node scripts/migrate-to-neon.mjs
import { promises as fs } from "fs";
import path from "path";
import { neon } from "@neondatabase/serverless";

// .env.local handmatig inlezen (dit script draait buiten Next.js, dat het normaal automatisch doet).
async function loadEnvLocal() {
  const file = path.join(process.cwd(), ".env.local");
  const raw = await fs.readFile(file, "utf-8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

// Volgorde respecteert foreign-key-afhankelijkheden.
const ORDER = [
  "players",
  "staff",
  "clubs",
  "matches",
  "schedule_items",
  "training_sessions",
  "absences",
  "wash_duty",
  "carpool_duty",
  "match_stats",
  "load_entries",
  "messages",
  "individual_trainings",
  "warmups",
  "match_preparations",
  "exercises",
  "video_links",
  "video_notes",
];

function quoteIdent(name) {
  return `"${name.replace(/"/g, '""')}"`;
}

function prepareValue(v) {
  if (v !== null && typeof v === "object") return JSON.stringify(v);
  return v;
}

async function main() {
  await loadEnvLocal();

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL ontbreekt in .env.local.");
    process.exit(1);
  }

  const sql = neon(process.env.DATABASE_URL);

  const dbPath = path.join(process.cwd(), "data", "db.json");
  const db = JSON.parse(await fs.readFile(dbPath, "utf-8"));

  let totalErrors = 0;

  for (const entity of ORDER) {
    const rows = db[entity] ?? [];
    if (rows.length === 0) {
      console.log(`- ${entity}: 0 rijen, overgeslagen`);
      continue;
    }

    // Normaliseer fatigue/soreness naar de huidige 1-10-schaal (oude lokale data kan nog 1-5 zijn).
    // Normaliseer tactical_notes: oudere wedstrijdvoorbereidingen hebben dit nog als platte
    // tekst opgeslagen (van vóór de gestructureerde vorm) — behoud de tekst in het huidige format.
    const prepared = rows.map((r) => {
      const row = { ...r };
      if (entity === "load_entries") {
        for (const field of ["fatigue", "soreness"]) {
          const v = row[field];
          if (typeof v === "number" && v <= 5) row[field] = v * 2;
        }
      }
      if (entity === "match_preparations" && typeof row.tactical_notes === "string") {
        const emptyMoments = () => ({
          attacking: "",
          defending: "",
          transition_to_attack: "",
          transition_to_defense: "",
        });
        row.tactical_notes = {
          team: { ...emptyMoments(), attacking: row.tactical_notes },
          line: { verdediging: emptyMoments(), middenveld: emptyMoments(), aanval: emptyMoments() },
        };
      }
      return row;
    });

    let count = 0;
    try {
      for (const row of prepared) {
        const keys = Object.keys(row);
        const cols = keys.map(quoteIdent).join(", ");
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
        const values = keys.map((k) => prepareValue(row[k]));
        const text = `insert into ${quoteIdent(entity)} (${cols}) values (${placeholders}) on conflict (id) do update set ${keys
          .filter((k) => k !== "id")
          .map((k) => `${quoteIdent(k)} = excluded.${quoteIdent(k)}`)
          .join(", ")}`;
        await sql.query(text, values);
        count++;
      }
      console.log(`✓ ${entity}: ${count} rijen gemigreerd`);
    } catch (err) {
      console.error(`✗ ${entity}: FOUT na ${count} rijen — ${err?.message ?? err}`);
      totalErrors++;
    }
  }

  if (totalErrors > 0) {
    console.log(`\n${totalErrors} tabel(len) met fouten — zie hierboven.`);
    process.exit(1);
  }
  console.log("\nAlles gemigreerd ✅");
}

main();
