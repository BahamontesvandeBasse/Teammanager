-- Seizoensplanning (trainingen, wedstrijden, toernooien) — uitvoeren na 001_schema.sql.

create table if not exists schedule_items (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  activity text not null,
  kickoff_time text,
  home_away text check (home_away in ('home', 'away')),
  travel_time_minutes int,
  absent text,
  notes text
);

alter table schedule_items enable row level security;
drop policy if exists "authenticated full access" on schedule_items;
create policy "authenticated full access" on schedule_items for all to authenticated using (true) with check (true);
