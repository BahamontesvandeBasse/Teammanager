// Zet de rol van een bestaand account. Vooral bedoeld om het allereerste
// account (aangemaakt via create-user.mjs, standaard 'staf') te promoveren
// tot 'admin' — daarna kan verder gebruikersbeheer via het beheerscherm
// in de app zelf (/admin/gebruikers, alleen zichtbaar voor admins).
// Uitvoeren: node scripts/set-role.mjs <email> <admin|staf|toeschouwer|speler>
import { promises as fs } from "fs";
import path from "path";
import { neon } from "@neondatabase/serverless";

const ROLES = ["admin", "staf", "toeschouwer", "speler"];

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

async function main() {
  const [email, role] = process.argv.slice(2);
  if (!email || !role || !ROLES.includes(role)) {
    console.error(`Gebruik: node scripts/set-role.mjs <email> <${ROLES.join("|")}>`);
    process.exit(1);
  }

  await loadEnvLocal();
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL ontbreekt in .env.local.");
    process.exit(1);
  }

  const sql = neon(process.env.DATABASE_URL);
  try {
    const rows = await sql.query(
      `update users set role = $1 where email = $2 returning email, name, role`,
      [role, email.trim().toLowerCase()]
    );
    if (rows.length === 0) {
      console.error(`Geen account gevonden met e-mailadres ${email}.`);
      process.exit(1);
    }
    console.log(`✅ ${rows[0].email} (${rows[0].name}) is nu: ${rows[0].role}`);
  } catch (err) {
    if (err?.message?.includes("users_single_admin")) {
      console.error("Er bestaat al een admin-account — er kan er maar één tegelijk zijn.");
    } else {
      console.error("Mislukt:", err?.message ?? err);
    }
    process.exit(1);
  }
}

main();
