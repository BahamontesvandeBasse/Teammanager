-- Wedstrijdanalyses: AI-advies op video_links, gegenereerd door Claude op basis van video_notes.

alter table video_links add column if not exists ai_advice text;
alter table video_links add column if not exists ai_advice_generated_at timestamptz;
