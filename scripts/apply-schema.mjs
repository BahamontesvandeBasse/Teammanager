// Past een migratiebestand uit db/migrations/ toe op de Neon-database.
// Uitvoeren: node scripts/apply-schema.mjs [bestandsnaam.sql]  (standaard: 001_schema.sql)
import { promises as fs } from "fs";
import path from "path";
import { neon } from "@neondatabase/serverless";

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

// Splitst op ';' aan het eind van een regel — het schema bevat geen
// dollar-quoted blocks of string literals met een puntkomma erin.
function splitStatements(sqlText) {
  const withoutComments = sqlText
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  return withoutComments
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function main() {
  await loadEnvLocal();
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL ontbreekt in .env.local.");
    process.exit(1);
  }

  const sql = neon(process.env.DATABASE_URL);
  const fileName = process.argv[2] || "001_schema.sql";
  const filePath = path.join(process.cwd(), "db", "migrations", fileName);
  const statements = splitStatements(await fs.readFile(filePath, "utf-8"));

  let ok = 0;
  for (const stmt of statements) {
    try {
      await sql.query(stmt);
      ok++;
    } catch (err) {
      console.error(`✗ Fout bij statement:\n${stmt.slice(0, 120)}...\n  → ${err?.message ?? err}`);
      process.exit(1);
    }
  }
  console.log(`✅ ${fileName} toegepast (${ok} statements uitgevoerd).`);
}

main();
