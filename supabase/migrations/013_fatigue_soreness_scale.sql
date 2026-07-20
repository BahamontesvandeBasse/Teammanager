-- Vermoeidheid/spierpijn gaan van 1-5 naar 1-10, gelijk aan de RPE-schaal.
-- Bestaande waarden (1-5) worden verdubbeld zodat de relatieve positie op de schaal gelijk blijft.

update load_entries set fatigue = fatigue * 2 where fatigue is not null and fatigue <= 5;
update load_entries set soreness = soreness * 2 where soreness is not null and soreness <= 5;

alter table load_entries drop constraint if exists load_entries_fatigue_check;
alter table load_entries drop constraint if exists load_entries_soreness_check;
alter table load_entries add constraint load_entries_fatigue_check check (fatigue between 1 and 10);
alter table load_entries add constraint load_entries_soreness_check check (soreness between 1 and 10);
