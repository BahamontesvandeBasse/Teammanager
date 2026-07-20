-- Teammanager schema — uitvoeren in de Supabase SQL editor (of via supabase db push).

create extension if not exists "pgcrypto";

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
  contact text
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
  check ((player_id is not null) <> (staff_id is not null))
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
  fatigue int check (fatigue between 1 and 5),
  soreness int check (soreness between 1 and 5),
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

-- Wedstrijdvoorbereiding: opstelling, tactische notities en standaardsituaties (1 per wedstrijd).
create table if not exists match_preparations (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null unique references matches(id) on delete cascade,
  formation text,
  lineup jsonb not null default '[]'::jsonb,
  substitutes jsonb not null default '[]'::jsonb,
  tactical_notes jsonb,
  corners_notes text,
  freekicks_notes text,
  throwins_notes text,
  drawings jsonb not null default '{}'::jsonb
);

-- Fase 2 (video-analyse) alvast klaargezet:
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

-- RLS: alleen ingelogde gebruikers (trainers/begeleiding) mogen alles lezen/schrijven.
do $$
declare t text;
begin
  foreach t in array array['players','staff','clubs','matches','wash_duty','carpool_duty','match_stats','load_entries','individual_trainings','messages','match_preparations','video_links','video_notes','schedule_items','training_sessions','absences']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "authenticated full access" on %I', t);
    execute format('create policy "authenticated full access" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
