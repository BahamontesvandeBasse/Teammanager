// Maakt een trainersaccount aan (e-mail/wachtwoord-login). Er is geen
// registratiepagina — dit script is de enige manier om accounts toe te voegen.
// Uitvoeren: node scripts/create-user.mjs
// Vraagt interactief om e-mailadres, naam en wachtwoord (wachtwoord komt
// nooit in de terminal-history of in een bestand terecht, alleen de hash).
import { promises as fs } from "fs";
import path from "path";
import readline from "readline";
import bcrypt from "bcryptjs";
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

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
  await loadEnvLocal();

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL ontbreekt in .env.local — vul eerst de Neon-connection string in.");
    process.exit(1);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const email = (await ask(rl, "E-mailadres: ")).trim();
  const name = (await ask(rl, "Naam: ")).trim();
  const password = await ask(rl, "Wachtwoord (min. 8 tekens): ");
  rl.close();

  if (!email || !name || password.length < 8) {
    console.error("Ongeldige invoer: e-mail/naam mogen niet leeg zijn en het wachtwoord moet minstens 8 tekens hebben.");
    process.exit(1);
  }

  const sql = neon(process.env.DATABASE_URL);
  const passwordHash = await bcrypt.hash(password, 12);

  try {
    await sql.query(
      `insert into users (email, name, password_hash) values ($1, $2, $3)`,
      [email.toLowerCase(), name, passwordHash]
    );
    console.log(`\nAccount aangemaakt voor ${email}. Je kunt nu inloggen op /login.`);
  } catch (err) {
    if (err?.message?.includes("duplicate key")) {
      console.error(`\nEr bestaat al een account met ${email}.`);
    } else {
      console.error("\nAanmaken mislukt:", err?.message ?? err);
    }
    process.exit(1);
  }
}

main();
