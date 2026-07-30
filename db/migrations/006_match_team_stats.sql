-- Teamstatistieken per wedstrijd (balbezit, schoten, corners, overtredingen),
-- zodat het AI-wedstrijdadvies méér kan gebruiken dan alleen de observaties en
-- de eindstand. Alles optioneel: alleen ingevuld als de staf dit bijhoudt.
alter table matches add column if not exists possession_pct int;
alter table matches add column if not exists shots_for int;
alter table matches add column if not exists shots_against int;
alter table matches add column if not exists shots_on_target_for int;
alter table matches add column if not exists shots_on_target_against int;
alter table matches add column if not exists corners_for int;
alter table matches add column if not exists corners_against int;
alter table matches add column if not exists fouls_for int;
alter table matches add column if not exists fouls_against int;
