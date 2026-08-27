-- Corvee: 3 spelers per week (ballen oppompen, bidons vullen voor de training,
-- kleedkamer en spullen checken) — een losse, wekelijkse rotatie naast het
-- was-/rijschema (dat per wedstrijd loopt). week_start = maandag van die week.
create table if not exists corvee_duty (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  player_id uuid not null references players(id) on delete cascade,
  unique (week_start, player_id)
);
