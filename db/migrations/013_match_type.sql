-- Onderscheid competitie-/oefenwedstrijd, nodig om statistieken te kunnen
-- filteren op wedstrijdtype. Bestaande wedstrijden zijn overwegend
-- competitiewedstrijden; oefenwedstrijden worden er handmatig tussenuit gehaald.
alter table matches add column if not exists type text not null default 'competitie'
  check (type in ('competitie', 'oefenwedstrijd'));
