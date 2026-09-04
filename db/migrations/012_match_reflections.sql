-- Zelfreflectie van een speler op een gespeelde wedstrijd (positief punt,
-- negatief punt, eigen beoordeling 1-10). Alleen de speler zelf en de staf
-- kunnen dit terugzien (afgedwongen in lib/auth/access.ts, niet hier — Neon
-- heeft geen RLS-laag, alle toegang loopt via de vertrouwde serverconnectie).
create table if not exists match_reflections (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  positive text,
  negative text,
  self_rating int check (self_rating between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, player_id)
);
