-- Geboortedatum per staflid, te zien op de stafkaart/tegel.

alter table staff add column if not exists birthdate date;
