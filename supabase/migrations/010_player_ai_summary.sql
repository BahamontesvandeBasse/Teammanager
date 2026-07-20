-- AI-samenvatting per speler (statistieken + belasting + video-observaties gecombineerd).

alter table players add column if not exists ai_summary text;
alter table players add column if not exists ai_summary_generated_at timestamptz;
