-- ============================================================
-- GRODT – initialt schema
-- Leadverktyg för svenska bolag inom SNI 78.100.
-- Alla belopp lagras i SEK som heltal (kr, inte tkr).
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Enum ----------
create type public.lead_status as enum ('ny', 'kontaktad', 'dialog', 'mote', 'kund', 'forlorad');

-- ---------- Tabeller ----------

-- Användarprofiler (1:1 mot auth.users). Konton skapas endast av admin.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  namn text not null,
  roll text not null default 'user' check (roll in ('admin', 'user')),
  aktiv boolean not null default true,
  created_at timestamptz not null default now()
);

-- Bolag hämtade från dataleverantören. Dedupe sker på orgnr (PK).
create table public.companies (
  orgnr text primary key,
  namn text not null,
  sni_kod text,
  ort text,
  adress text,
  antal_anstallda integer,
  hemsida text,
  telefon text,
  kalla text,
  first_seen_at timestamptz not null default now(),
  last_synced_at timestamptz
);

-- Bokslutssiffror per år. Alla tillgängliga år sparas oavsett filter –
-- filtret avgör bara om bolaget blir lead.
create table public.company_financials (
  id bigint generated always as identity primary key,
  orgnr text not null references public.companies (orgnr) on delete cascade,
  year integer not null,
  revenue_sek bigint,
  profit_sek bigint,
  employees integer,
  unique (orgnr, year)
);

-- Leads: ett per kvalificerat bolag (orgnr UNIQUE garanterar inga dubbletter).
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  orgnr text not null unique references public.companies (orgnr) on delete cascade,
  status public.lead_status not null default 'ny',
  owner_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

-- Global audit log. Skrivs endast server-side (service role).
create table public.activities (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  entity_type text not null,
  entity_id text not null,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.import_runs (
  id uuid primary key default gen_random_uuid(),
  started_by uuid references public.profiles (id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'ok', 'fel')),
  -- Datakälla för körningen: 'tic' | 'mock' | 'uc-allabolag' | 'csv'.
  source text not null default 'tic',
  -- Hur körningen startades: manuellt i UI:t eller via Vercel Cron.
  trigger text not null default 'manuell' check (trigger in ('manuell', 'cron')),
  fetched integer not null default 0,
  created integer not null default 0,
  updated integer not null default 0,
  errors jsonb not null default '[]'::jsonb
);

create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------- Index ----------
create index idx_financials_orgnr on public.company_financials (orgnr);
create index idx_leads_status on public.leads (status);
create index idx_leads_owner on public.leads (owner_id);
create index idx_notes_lead on public.notes (lead_id);
create index idx_activities_entity on public.activities (entity_type, entity_id);
create index idx_activities_actor on public.activities (actor_id);
create index idx_activities_created on public.activities (created_at desc);
create index idx_import_runs_started on public.import_runs (started_at desc);
create index idx_companies_ort on public.companies (ort);

-- ---------- Trigger: updated_at ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger leads_set_updated_at
before update on public.leads
for each row execute function public.set_updated_at();

-- ---------- Hjälpfunktioner för RLS ----------
-- security definer för att undvika rekursiv RLS mot profiles.
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and roll = 'admin' and aktiv
  );
$$;

create or replace function public.is_active_user()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and aktiv
  );
$$;

-- ---------- Row Level Security ----------
-- Ingen publik åtkomst alls: alla policies kräver authenticated + aktiv profil.
alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.company_financials enable row level security;
alter table public.leads enable row level security;
alter table public.notes enable row level security;
alter table public.activities enable row level security;
alter table public.import_runs enable row level security;
alter table public.app_settings enable row level security;

-- profiles: alla aktiva inloggade läser (namn/avatarer i UI), endast admin skriver.
create policy profiles_select on public.profiles
  for select to authenticated using (public.is_active_user());
create policy profiles_insert on public.profiles
  for insert to authenticated with check (public.is_admin());
create policy profiles_update on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- companies/financials: läses av aktiva inloggade, skrivs endast server-side (service role).
create policy companies_select on public.companies
  for select to authenticated using (public.is_active_user());
create policy financials_select on public.company_financials
  for select to authenticated using (public.is_active_user());

-- leads: läses, skapas och uppdateras av aktiva inloggade.
create policy leads_select on public.leads
  for select to authenticated using (public.is_active_user());
create policy leads_insert on public.leads
  for insert to authenticated with check (public.is_active_user());
create policy leads_update on public.leads
  for update to authenticated using (public.is_active_user()) with check (public.is_active_user());

-- notes: läses av aktiva inloggade; skapas av aktiva inloggade i eget namn.
create policy notes_select on public.notes
  for select to authenticated using (public.is_active_user());
create policy notes_insert on public.notes
  for insert to authenticated with check (public.is_active_user() and author_id = auth.uid());

-- activities: skrivs endast server-side (ingen insert-policy), läses endast av admin.
create policy activities_select on public.activities
  for select to authenticated using (public.is_admin());

-- import_runs: läses av aktiva inloggade (synk-vyn), skrivs endast server-side.
create policy import_runs_select on public.import_runs
  for select to authenticated using (public.is_active_user());

-- app_settings: läses av aktiva inloggade, skrivs endast av admin.
create policy app_settings_select on public.app_settings
  for select to authenticated using (public.is_active_user());
create policy app_settings_insert on public.app_settings
  for insert to authenticated with check (public.is_admin());
create policy app_settings_update on public.app_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- Standardinställningar ----------
insert into public.app_settings (key, value) values
  ('sync_filter', jsonb_build_object(
    'sni_codes', jsonb_build_array('78.100'),
    'revenue_min_sek', 5000000,
    'revenue_years', jsonb_build_array(2021, 2022)
  )),
  ('auto_sync', jsonb_build_object('enabled', true))
on conflict (key) do nothing;
