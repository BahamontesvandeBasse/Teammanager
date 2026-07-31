-- Forceert een wachtwoordwijziging bij de eerstvolgende login voor accounts
-- waarvan een beheerder het wachtwoord heeft ingesteld (aanmaken of resetten) —
-- zie lib/auth/users.ts (createUser/updateUserPassword) en app/wachtwoord-wijzigen.
alter table users add column if not exists must_change_password boolean not null default false;
