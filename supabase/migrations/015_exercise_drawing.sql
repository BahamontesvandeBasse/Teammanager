-- Tekening op het tactiekbord per oefening (zelfde tekentool als bij de wedstrijdvoorbereiding).

alter table exercises add column if not exists drawing jsonb not null default '[]'::jsonb;
