-- Afwezigheid (van–tot) als losstaande, herbruikbare registratie i.p.v. vrije tekst
-- op schedule_items. Precies één van player_id/staff_id is gezet.

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

alter table absences enable row level security;
drop policy if exists "authenticated full access" on absences;
create policy "authenticated full access" on absences for all to authenticated using (true) with check (true);

-- Vrije-tekstveld vervalt: afwezigheid loopt nu via de absences-tabel.
alter table schedule_items drop column if exists absent;
