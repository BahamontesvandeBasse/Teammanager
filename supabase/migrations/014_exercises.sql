-- Oefeningenbank: herbruikbare oefeningen per trainingsfase (warming-up, oriëntatie,
-- oefenleerfase, toepassingsfase, tussenvorm), om trainingen mee samen te stellen.
-- Wordt zelf opgebouwd: handmatig, met AI gegenereerd, of overgetypt uit Rinus/Feeton.

create table if not exists exercises (
  id uuid primary key default gen_random_uuid(),
  phase text not null check (phase in ('warming_up', 'orientatie', 'oefenleerfase', 'toepassingsfase', 'tussenvorm')),
  subcategory text not null,
  title text not null,
  description text not null default '',
  duration_minutes int not null default 10,
  source text not null default 'handmatig' check (source in ('handmatig', 'ai', 'rinus', 'feeton')),
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table exercises enable row level security;
drop policy if exists "authenticated full access" on exercises;
create policy "authenticated full access" on exercises for all to authenticated using (true) with check (true);
