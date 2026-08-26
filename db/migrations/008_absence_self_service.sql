-- Spelers kunnen voortaan zelf toekomstige afwezigheid melden (via
-- app/api/absences/self), mits minstens 7 dagen van tevoren. De staf blijft
-- ook gewoon zelf afwezigheid kunnen invoeren (reported_by 'staff', direct
-- 'acknowledged' — die hoeft nergens nog "gezien" te worden).

alter table absences add column if not exists reported_by text not null default 'staff' check (reported_by in ('staff', 'player'));
alter table absences add column if not exists acknowledged boolean not null default true;
