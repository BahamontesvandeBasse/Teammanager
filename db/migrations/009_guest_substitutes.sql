-- Gast-wisselspelers (bv. spelers van een ander team die alleen op de bank
-- staan) — los van substitutes (bestaande spelers via player_id), want gasten
-- hebben geen player_id. Simpele lijst met namen, net als guest_name bij een
-- gastspeler in de basisopstelling.
alter table match_preparations add column if not exists guest_substitutes jsonb not null default '[]'::jsonb;
