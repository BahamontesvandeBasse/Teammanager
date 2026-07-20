-- Uitslag bij gespeelde wedstrijden.

alter table matches add column if not exists score_for int;
alter table matches add column if not exists score_against int;
