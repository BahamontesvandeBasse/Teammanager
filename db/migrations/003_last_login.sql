-- Laatste succesvolle login per account, te zien in het gebruikersbeheer.
alter table users add column if not exists last_login_at timestamptz;
