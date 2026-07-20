-- Beoordeling (1-10) per speler per wedstrijd, en een herbruikbare bibliotheek met warming-ups
-- die per wedstrijd in de voorbereiding gekozen kan worden.

alter table match_stats add column if not exists rating int check (rating between 1 and 10);

create table if not exists warmups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text
);

alter table match_preparations add column if not exists warmup_id uuid references warmups(id) on delete set null;

alter table warmups enable row level security;
drop policy if exists "authenticated full access" on warmups;
create policy "authenticated full access" on warmups for all to authenticated using (true) with check (true);
