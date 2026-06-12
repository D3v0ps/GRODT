-- ============================================================
-- GRODT – serverförda importtotaler och livstecken.
-- progress_at stämplas av varje batch så att zombievakten inte
-- avbryter långa men levande CSV-importer; leads_created gör att
-- totalerna ackumuleras server-side i stället för att litas på
-- från klienten.
-- ============================================================
alter table public.import_runs
  add column progress_at timestamptz not null default now(),
  add column leads_created integer not null default 0;
