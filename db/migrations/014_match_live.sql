-- Live-wedstrijdmodus: de staf start de wedstrijd op telefoon/tablet/laptop,
-- legt tijdens de wedstrijd goals/assists/wissels/kaarten en observaties vast,
-- en gebruikt die direct voor de rustbespreking en de nabespreking.

-- Klokstatus, gedeeld tussen alle apparaten van de staf:
-- { phase: "pre"|"h1"|"ht"|"h2"|"ft", half_minutes, h1_start, h1_end, h2_start, h2_end }
alter table matches add column if not exists live_clock jsonb;
-- Rustpraatje (kernpunten voor in de kleedkamer) en nabespreking.
alter table matches add column if not exists halftime_talk text;
alter table matches add column if not exists review_went_well text;
alter table matches add column if not exists review_improve text;
alter table matches add column if not exists review_training text;

create table if not exists match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  half int not null default 1 check (half in (1, 2)),
  minute int not null default 0,
  -- goal_for | goal_against | substitution | card_yellow | card_red | observation
  type text not null,
  player_id uuid references players(id) on delete set null,          -- scorer / speler erin / speler met kaart / speler bij observatie
  related_player_id uuid references players(id) on delete set null,  -- assist / speler eruit
  moment text,     -- KNVB-moment of "standaard"/"overig", alleen bij observaties
  sentiment text,  -- "plus" | "min", alleen bij observaties
  note text,
  for_halftime boolean not null default false,
  for_review boolean not null default false,
  created_by_name text,
  created_at timestamptz not null default now()
);
create index if not exists match_events_match_idx on match_events (match_id);
