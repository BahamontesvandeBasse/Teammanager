-- Contactgegevens per staflid (telefoon/e-mail), te zien op het stafprofiel.

alter table staff add column if not exists contact text;
