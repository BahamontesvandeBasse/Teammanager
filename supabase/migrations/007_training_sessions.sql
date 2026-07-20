-- Traininginhoud per trainingsmoment: vaste fase-opbouw (warming up, oriëntatie,
-- tussenvorm, oefenleerfase, toepassingsfase), gekoppeld aan een schedule_items-rij.

create table if not exists training_sessions (
  id uuid primary key default gen_random_uuid(),
  schedule_item_id uuid not null unique references schedule_items(id) on delete cascade,
  phases jsonb not null default '[]'::jsonb
);

alter table training_sessions enable row level security;
drop policy if exists "authenticated full access" on training_sessions;
create policy "authenticated full access" on training_sessions for all to authenticated using (true) with check (true);
