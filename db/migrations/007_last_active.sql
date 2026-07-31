-- Laatst actief (elke pagina-load terwijl ingelogd, met een korte throttle),
-- los van last_login_at (dat alleen bijwerkt bij een echte inlog-actie).
alter table users add column if not exists last_active_at timestamptz;
