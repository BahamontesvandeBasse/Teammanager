-- Adres per club, gebruikt om de reistijd automatisch op te halen via Google Maps.
alter table clubs add column if not exists address text;
