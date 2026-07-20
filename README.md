# ⚽ Teammanager — Sv Steenwijkerwold JO19-1

Digitale assistent-trainer: spelerslijst en speelprogramma importeren, automatisch was- en rijschema genereren, aanwezig/vertrektijden berekenen, spelerstatistieken en fysieke belasting bijhouden, en individuele trainingsopdrachten uitzetten.

## Pagina's

| Pagina | Wat je er doet |
| --- | --- |
| **Dashboard** | Eerstvolgende wedstrijd met wasbeurt, rijders en aanwezig/vertrektijd |
| **Spelers** | Spelerslijst importeren (Excel uit Sportlink) of handmatig beheren |
| **Programma** | Speelprogramma importeren (plakken vanaf voetbal.nl of Excel/CSV) + reistijden per club |
| **Was & rijden** | Automatisch gegenereerd was- en rijschema, handmatig aan te passen |
| **Statistieken** | Goals, assists en minuten per wedstrijd + seizoensranglijst |
| **Belasting** | Minuten + RPE per training/wedstrijd, weekbelasting-trend per speler, overzicht van spelers-zelfinvoer en berichten met spelers |
| **Training** | Individuele trainingsopdrachten per speler met streefdatum en status |

## Mobiel invulscherm voor spelers (`/mijn/[token]`)

Elke speler heeft een eigen linkje (te kopiëren op de Spelers-pagina, kolom "Mobiel invulscherm") naar een mobielvriendelijk scherm zónder inloggen:

- Na training/wedstrijd: RPE (hoe zwaar was het), vermoeidheid, spierpijn, slaapkwaliteit en optioneel een blessuremelding + vrije notitie.
- Tweerichtingsberichten met de staf (WhatsApp-achtige chat), zichtbaar op zowel het spelersscherm als op de Belasting-pagina (staf kan er reageren).

Deel het linkje gewoon als tekst via de bestaande teams-WhatsAppgroep of 1-op-1 — er is geen speciale WhatsApp-koppeling nodig. De toegangscode is geen wachtwoord-sterke beveiliging, maar een drempelloze, plakbare link — passend bij niet-gevoelige teamdata binnen een besloten groep.

## Spelregels (zoals afgesproken)

- **Aanwezig**: 1 uur vóór de aftrap op de wedstrijdlocatie (thuis én uit).
- **Vertrek** (uitwedstrijden): aanwezig-tijd − reistijd. Reistijd vul je éénmalig per club in op de Programma-pagina.
- **Wasbeurt**: 1 speler per wedstrijd brengt de tas naar de wasvrouw; eerlijk rouleren over de actieve selectie.
- **Rijden**: 1 auto per 4 spelers (naar boven afgerond), alleen bij uitwedstrijden; iedereen komt even vaak aan de beurt.

## Lokaal draaien

De app werkt direct **zonder database** (lokale modus): data wordt opgeslagen in `data/db.json` en er is geen login.

```bash
npm install
npm run dev
```

Open daarna http://localhost:3000.

> Node.js staat op deze machine als portable versie in `%LOCALAPPDATA%\nodejs-portable\node-v22.21.1-win-x64`. Voeg die map toe aan je PATH of gebruik het volledige pad naar `npm.cmd`.

## Online zetten (Neon + Vercel)

Nog te doen door de beheerder — daarna verzorgt Claude de koppeling:

1. **Neon-project aanmaken** (gratis): https://console.neon.tech → New project.
2. In het Neon-dashboard → **SQL Editor** → voer de inhoud van `db/migrations/001_schema.sql` uit.
3. Kopieer `.env.local.example` naar `.env.local` en vul in:
   - `DATABASE_URL` — Connect → "pooled connection" string (inclusief wachtwoord); geheim houden
   - `AUTH_SECRET` — willekeurige waarde, zie het commentaar in `.env.local.example` voor het genereer-commando; geheim houden
4. **Trainersaccounts aanmaken** (geen registratiepagina — alleen via dit script, één keer per trainer/begeleider):
   ```bash
   node scripts/create-user.mjs
   ```
   Vraagt interactief om e-mailadres, naam en wachtwoord.
5. **Vercel** (gratis): https://vercel.com → project importeren vanuit een GitHub-repo met deze code, en dezelfde twee env-variabelen instellen bij Settings → Environment Variables.

Zodra de env-variabelen zijn ingevuld schakelt de app automatisch over van lokale modus naar Neon, en is de login actief.

**Let op (lokale modus):** `data/db.json` is niet gedeeld — die staat alleen op deze computer. Gedeeld werken met meerdere trainers werkt pas na de Neon-koppeling. Lokale data overzetten naar Neon: `node scripts/migrate-to-neon.mjs` (zie hieronder).

## Structuur

- `lib/schedule.ts` — rotatie-algoritme (was/rijden) en tijdberekeningen
- `lib/parse.ts` — flexibele Excel/tekst-parsers voor spelers en programma
- `lib/db/` — datalaag: Neon óf lokale JSON-store (automatische keuze op basis van `DATABASE_URL`)
- `lib/auth.ts`, `lib/auth/` — eigen e-mail/wachtwoord-login (Auth.js) voor trainers/begeleiding
- `db/migrations/001_schema.sql` — databaseschema (incl. `users`-tabel voor login)
- `app/(app)/…` — de pagina's; `app/api/…` — CRUD- en generatie-endpoints
- Fase 2 (nog niet gebouwd): video-analyse met VEO-links — tabellen staan al klaar in het schema.
