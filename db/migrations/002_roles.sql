-- Rollen voor trainersaccounts: admin (precies 1), staf (volledig), toeschouwer
-- (alleen-lezen), speler (alleen-lezen met beperkingen, zie lib/auth/access.ts).
alter table users add column if not exists role text not null default 'staf'
  check (role in ('admin', 'staf', 'toeschouwer', 'speler'));

-- Koppelt een 'speler'-account aan de bijbehorende rij in players (voor
-- toekomstig gebruik/overzicht in het beheerscherm).
alter table users add column if not exists player_id uuid references players(id) on delete set null;

-- Zorgt dat er nooit meer dan één admin-account tegelijk bestaat.
create unique index if not exists users_single_admin on users ((true)) where role = 'admin';
