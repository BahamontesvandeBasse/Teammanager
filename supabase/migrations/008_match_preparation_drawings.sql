-- Tekenbord per onderdeel van de wedstrijdvoorbereiding (team/linie/standaardsituaties),
-- vergelijkbaar met KNVB Rinus: pijlen en vrije lijnen op een digitaal veld.

alter table match_preparations add column if not exists drawings jsonb not null default '{}'::jsonb;
