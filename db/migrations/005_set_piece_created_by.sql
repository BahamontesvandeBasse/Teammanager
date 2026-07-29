-- Naam van het staflid dat een spelhervatting heeft toegevoegd, zodat de
-- staf (net als bij spelersvoorstellen) altijd kan zien wie 'm heeft
-- aangemaakt. Wordt server-side gezet uit de sessie, niet door de client.
alter table set_pieces add column if not exists created_by_name text;
