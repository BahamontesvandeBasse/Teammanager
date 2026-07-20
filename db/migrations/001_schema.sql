-- Teammanager schema — uitvoeren tegen de Neon-database (bv. via de Neon SQL
-- Editor in het dashboard, of psql/een migratietool naar keuze).

create extension if not exists "pgcrypto";

-- Trainers-/begeleidingsaccounts (eigen e-mail/wachtwoord-login via Auth.js,
-- geen open registratie — accounts worden aangemaakt via scripts/create-user.mjs).
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  shirt_number int,
  positions jsonb not null default '[]'::jsonb,
  birthdate date,
  parent_contact text,
  active boolean not null default true,
  token text unique,
  ai_summary text,
  ai_summary_generated_at timestamptz
);

create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text,
  contact text,
  birthdate date
);

create table if not exists clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  address text,
  travel_time_minutes int
);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  kickoff_time text not null,
  home_away text not null check (home_away in ('home', 'away')),
  opponent text not null,
  competition text,
  notes text,
  score_for int,
  score_against int
);

-- Seizoensplanning: trainingen en toernooien (wedstrijden staan in `matches`).
create table if not exists schedule_items (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  activity text not null,
  kickoff_time text,
  home_away text check (home_away in ('home', 'away')),
  travel_time_minutes int,
  notes text
);

-- Vaste fase-opbouw per training (koppeling 1-op-1 met schedule_items).
create table if not exists training_sessions (
  id uuid primary key default gen_random_uuid(),
  schedule_item_id uuid not null unique references schedule_items(id) on delete cascade,
  phases jsonb not null default '[]'::jsonb
);

-- Afwezigheid van spelers/staf (precies één van player_id/staff_id is gezet).
create table if not exists absences (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade,
  staff_id uuid references staff(id) on delete cascade,
  "from" date not null,
  until date not null,
  reason text,
  constraint absences_exactly_one_person check (
    (player_id is not null and staff_id is null) or
    (player_id is null and staff_id is not null)
  ),
  constraint absences_valid_range check (until >= "from")
);

create table if not exists wash_duty (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade
);

create table if not exists carpool_duty (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade
);

create table if not exists match_stats (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  goals int not null default 0,
  assists int not null default 0,
  minutes_played int not null default 0,
  rating int check (rating between 1 and 10),
  unique (match_id, player_id)
);

create table if not exists load_entries (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  date date not null,
  session_type text not null check (session_type in ('training', 'wedstrijd')),
  absent boolean not null default false,
  minutes int,
  rpe int check (rpe between 1 and 10),
  notes text,
  fatigue int check (fatigue between 1 and 10),
  soreness int check (soreness between 1 and 10),
  injury_flag boolean not null default false,
  reported_by text not null default 'staff' check (reported_by in ('staff', 'player'))
);

-- Berichten tussen staf en een individuele speler (mobiel spelersscherm).
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  sender text not null check (sender in ('staff', 'player')),
  sender_name text,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists individual_trainings (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  title text not null,
  description text,
  target_date date,
  status text not null default 'open' check (status in ('open', 'voltooid')),
  notes text,
  created_at timestamptz not null default now(),
  created_by text not null default 'staff' check (created_by in ('staff', 'player'))
);

-- Herbruikbare warming-up routines, te kiezen bij de wedstrijdvoorbereiding.
create table if not exists warmups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text
);

-- Wedstrijdvoorbereiding: opstelling, tactische notities en standaardsituaties (1 per wedstrijd).
create table if not exists match_preparations (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null unique references matches(id) on delete cascade,
  formation text,
  warmup_id uuid references warmups(id) on delete set null,
  lineup jsonb not null default '[]'::jsonb,
  substitutes jsonb not null default '[]'::jsonb,
  tactical_notes jsonb not null default '{}'::jsonb,
  corners_notes text,
  freekicks_notes text,
  throwins_notes text,
  drawings jsonb not null default '{}'::jsonb
);

-- Oefeningenbank: herbruikbare oefeningen per trainingsfase.
create table if not exists exercises (
  id uuid primary key default gen_random_uuid(),
  phase text not null check (phase in ('warming_up', 'orientatie', 'oefenleerfase', 'toepassingsfase', 'tussenvorm')),
  subcategory text not null,
  title text not null,
  description text not null default '',
  duration_minutes int not null default 10,
  source text not null default 'handmatig' check (source in ('handmatig', 'ai', 'rinus', 'feeton')),
  tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  drawing jsonb not null default '[]'::jsonb
);

-- Fase 2 (video-analyse):
create table if not exists video_links (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  veo_url text not null,
  title text,
  ai_advice text,
  ai_advice_generated_at timestamptz
);

create table if not exists video_notes (
  id uuid primary key default gen_random_uuid(),
  video_link_id uuid not null references video_links(id) on delete cascade,
  timestamp_seconds int not null,
  player_id uuid references players(id) on delete set null,
  note text not null
);

-- Idempotente patch: vult kolommen aan op tabellen die mogelijk al bestonden
-- van een eerdere (onvolledige) versie van dit schema. Veilig om altijd mee te draaien.
alter table match_stats add column if not exists rating int check (rating between 1 and 10);
alter table staff add column if not exists birthdate date;
alter table match_preparations add column if not exists warmup_id uuid references warmups(id) on delete set null;

-- Geen RLS-policies: alle toegang loopt via de Next.js-server met één
-- vertrouwde databaseverbinding (connection string, nooit blootgesteld aan de
-- browser). Toegangscontrole (staf moet ingelogd zijn, spelers alleen via hun
-- eigen token) wordt afgedwongen in de applicatiecode (proxy.ts / API-routes),
-- niet door de database.
