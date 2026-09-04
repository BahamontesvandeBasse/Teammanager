-- Ernst van een gemelde blessure/pijntje — zonder dit werd elke aangevinkte
-- blessure (ook een lichte kneuzing waarmee gewoon gespeeld/getraind kan
-- worden) meteen behandeld als "rustig aan", wat het advies onbetrouwbaar
-- maakte voor de veelvoorkomende lichte gevallen.
alter table load_entries add column if not exists injury_severity text
  check (injury_severity in ('licht', 'matig', 'ernstig'));
