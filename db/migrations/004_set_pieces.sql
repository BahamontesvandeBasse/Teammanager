-- Spelhervattingenbank: los van de wedstrijdvoorbereiding. Spelers en staf
-- kunnen een spelhervatting voorstellen (approved = false); de staf keurt
-- goed of verwijdert 'm. Alleen goedgekeurde spelhervattingen zijn te kiezen
-- bij een wedstrijdvoorbereiding.
create table if not exists set_pieces (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('corner', 'vrije_trap_schot', 'vrije_trap_voorzet', 'aftrap', 'inworp', 'keeperbal')),
  side text not null check (side in ('attacking', 'defending')),
  title text not null,
  description text not null default '',
  drawing jsonb not null default '[]'::jsonb,
  approved boolean not null default false,
  suggested_by text not null default 'staff' check (suggested_by in ('staff', 'player')),
  suggested_by_player_id uuid references players(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Koppelt gekozen spelhervattingen aan een specifieke wedstrijdvoorbereiding.
-- De oude corners_notes/freekicks_notes/throwins_notes-tekstvelden op
-- match_preparations blijven ongebruikt in de database staan (geen dataverlies
-- voor eerder ingevulde wedstrijden) maar worden niet meer gelezen/geschreven
-- door de app.
alter table match_preparations add column if not exists set_piece_ids jsonb not null default '[]'::jsonb;
