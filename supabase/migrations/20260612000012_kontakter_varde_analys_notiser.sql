-- ============================================================
-- GRODT – kontaktpersoner, affärsvärde, säljanalys och notiser
--
-- Kontaktpersoner: vem ni pratar med per bolag. Manuellt inlagda nu;
-- kalla-kolumnen är förberedd för framtida API-berikning (samma
-- mönster som telefon_kalla på companies).
-- Affärsvärde: förväntat värde per lead → pipeline i kronor.
-- Säljanalys: förlustorsaker och tid per pipelinesteg ur audit-loggen.
-- Notiser: personliga händelser ("du fick ett lead") med läst-status.
-- ============================================================

-- ---------- Kontaktpersoner per bolag ----------
create table public.company_contacts (
  id uuid primary key default gen_random_uuid(),
  orgnr text not null references public.companies (orgnr) on delete cascade,
  namn text not null check (char_length(namn) between 1 and 120),
  titel text,
  telefon text,
  epost text,
  anteckning text,
  -- null = manuellt inlagd; berikningskällor märker sig här.
  kalla text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_company_contacts_orgnr on public.company_contacts (orgnr);
create index idx_company_contacts_created_by on public.company_contacts (created_by);

create trigger company_contacts_set_updated_at
before update on public.company_contacts
for each row execute function public.set_updated_at();

-- Delad datakvalitet: alla aktiva får lägga till, rätta och ta bort –
-- varje ändring audit-loggas server-side.
alter table public.company_contacts enable row level security;
create policy company_contacts_select on public.company_contacts
  for select to authenticated using (public.is_active_user());
create policy company_contacts_insert on public.company_contacts
  for insert to authenticated
  with check (public.is_active_user() and created_by = auth.uid());
create policy company_contacts_update on public.company_contacts
  for update to authenticated
  using (public.is_active_user()) with check (public.is_active_user());
create policy company_contacts_delete on public.company_contacts
  for delete to authenticated using (public.is_active_user());

-- ---------- Affärsvärde på leads ----------
alter table public.leads add column deal_value_sek bigint
  check (deal_value_sek is null or deal_value_sek >= 0);

-- ---------- Notiser ----------
create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  text text not null,
  href text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index idx_notifications_user_unread on public.notifications (user_id)
  where read_at is null;
create index idx_notifications_user_created on public.notifications (user_id, created_at desc);

-- Läses och kvitteras av mottagaren själv; skrivs endast server-side
-- (ingen insert-policy).
alter table public.notifications enable row level security;
create policy notifications_select on public.notifications
  for select to authenticated using (user_id = auth.uid() and public.is_active_user());
create policy notifications_update on public.notifications
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- list_leads v7: affärsvärdet följer med ----------
drop function public.list_leads(text, text, text, uuid, boolean, bigint, bigint, integer, integer, integer, integer, numeric, text, text, integer, integer);

create or replace function public.list_leads(
  p_search text default null,
  p_status text default null,
  p_ort text default null,
  p_owner uuid default null,
  p_only_unassigned boolean default false,
  p_rev_min bigint default null,
  p_rev_max bigint default null,
  p_year1 integer default 2021,
  p_year2 integer default 2022,
  p_year3 integer default 2023,
  p_year4 integer default 2024,
  p_tillvaxt_min numeric default null,
  p_sort text default 'namn',
  p_dir text default 'asc',
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  lead_id uuid,
  orgnr text,
  namn text,
  ort text,
  sni_kod text,
  antal_anstallda integer,
  status public.lead_status,
  owner_id uuid,
  owner_namn text,
  oms1 bigint,
  oms2 bigint,
  oms3 bigint,
  oms4 bigint,
  anst1 integer,
  anst2 integer,
  oms_tillvaxt_pct numeric,
  avregistrerad boolean,
  reklamsparr boolean,
  follow_up_at date,
  deal_value_sek bigint,
  updated_at timestamptz,
  total_count bigint
)
language sql stable
set search_path = public
as $$
  with base as (
    select
      l.id as lead_id,
      c.orgnr,
      c.namn,
      c.ort,
      c.sni_kod,
      c.antal_anstallda,
      l.status,
      l.owner_id,
      p.namn as owner_namn,
      f1.revenue_sek as oms1,
      f2.revenue_sek as oms2,
      f3.revenue_sek as oms3,
      f4.revenue_sek as oms4,
      f3.employees as anst1,
      f4.employees as anst2,
      case
        when f3.revenue_sek is not null and f3.revenue_sek > 0 and f4.revenue_sek is not null
        then round((f4.revenue_sek - f3.revenue_sek)::numeric / f3.revenue_sek * 100, 1)
        else null
      end as oms_tillvaxt_pct,
      (c.avregistrerad_datum is not null) as avregistrerad,
      c.reklamsparr,
      l.follow_up_at,
      l.deal_value_sek,
      l.updated_at
    from public.leads l
    join public.companies c on c.orgnr = l.orgnr
    left join public.profiles p on p.id = l.owner_id
    left join public.company_financials f1 on f1.orgnr = c.orgnr and f1.year = p_year1
    left join public.company_financials f2 on f2.orgnr = c.orgnr and f2.year = p_year2
    left join public.company_financials f3 on f3.orgnr = c.orgnr and f3.year = p_year3
    left join public.company_financials f4 on f4.orgnr = c.orgnr and f4.year = p_year4
    where
      (p_search is null or p_search = ''
        or c.namn ilike '%' || p_search || '%'
        or replace(c.orgnr, '-', '') like '%' || replace(p_search, '-', '') || '%'
        or c.ort ilike '%' || p_search || '%')
      and (p_status is null or p_status = '' or l.status = p_status::public.lead_status)
      and (p_ort is null or p_ort = '' or c.ort = p_ort)
      and (p_owner is null or l.owner_id = p_owner)
      and (not p_only_unassigned or l.owner_id is null)
      and (p_rev_min is null or greatest(
        coalesce(f1.revenue_sek, 0), coalesce(f2.revenue_sek, 0),
        coalesce(f3.revenue_sek, 0), coalesce(f4.revenue_sek, 0)) >= p_rev_min)
      and (p_rev_max is null or greatest(
        coalesce(f1.revenue_sek, 0), coalesce(f2.revenue_sek, 0),
        coalesce(f3.revenue_sek, 0), coalesce(f4.revenue_sek, 0)) <= p_rev_max)
  ),
  filtered as (
    select * from base b
    where p_tillvaxt_min is null or b.oms_tillvaxt_pct >= p_tillvaxt_min
  )
  select f.*, count(*) over () as total_count
  from filtered f
  order by
    case when p_sort = 'namn' and p_dir = 'asc' then f.namn collate "sv-x-icu" end asc,
    case when p_sort = 'namn' and p_dir = 'desc' then f.namn collate "sv-x-icu" end desc,
    case when p_sort = 'ort' and p_dir = 'asc' then f.ort collate "sv-x-icu" end asc nulls last,
    case when p_sort = 'ort' and p_dir = 'desc' then f.ort collate "sv-x-icu" end desc nulls last,
    case when p_sort = 'oms1' and p_dir = 'asc' then f.oms1 end asc nulls first,
    case when p_sort = 'oms1' and p_dir = 'desc' then f.oms1 end desc nulls last,
    case when p_sort = 'oms2' and p_dir = 'asc' then f.oms2 end asc nulls first,
    case when p_sort = 'oms2' and p_dir = 'desc' then f.oms2 end desc nulls last,
    case when p_sort = 'oms3' and p_dir = 'asc' then f.oms3 end asc nulls first,
    case when p_sort = 'oms3' and p_dir = 'desc' then f.oms3 end desc nulls last,
    case when p_sort = 'oms4' and p_dir = 'asc' then f.oms4 end asc nulls first,
    case when p_sort = 'oms4' and p_dir = 'desc' then f.oms4 end desc nulls last,
    case when p_sort = 'anst' and p_dir = 'asc' then f.antal_anstallda end asc nulls first,
    case when p_sort = 'anst' and p_dir = 'desc' then f.antal_anstallda end desc nulls last,
    case when p_sort = 'tillvaxt' and p_dir = 'asc' then f.oms_tillvaxt_pct end asc nulls last,
    case when p_sort = 'tillvaxt' and p_dir = 'desc' then f.oms_tillvaxt_pct end desc nulls last,
    f.namn collate "sv-x-icu" asc
  limit p_limit offset p_offset;
$$;

revoke execute on function public.list_leads(text, text, text, uuid, boolean, bigint, bigint, integer, integer, integer, integer, numeric, text, text, integer, integer) from public, anon;
grant execute on function public.list_leads(text, text, text, uuid, boolean, bigint, bigint, integer, integer, integer, integer, numeric, text, text, integer, integer) to authenticated, service_role;

-- ---------- lead_owner_status_counts v2: pipelinevärde ----------
drop function public.lead_owner_status_counts();

create or replace function public.lead_owner_status_counts()
returns table (owner_id uuid, status public.lead_status, antal bigint, varde bigint)
language sql stable
set search_path = public
as $$
  select l.owner_id, l.status, count(*), coalesce(sum(l.deal_value_sek), 0)::bigint
  from public.leads l
  group by l.owner_id, l.status;
$$;

revoke execute on function public.lead_owner_status_counts() from public, anon;
grant execute on function public.lead_owner_status_counts() to authenticated, service_role;

-- ---------- Säljanalys: förlustorsaker ----------
-- security definer av samma skäl som seller_stats: aggregat ur den
-- admin-låsta loggen, gated med is_active_user.
create or replace function public.loss_reasons(p_from timestamptz, p_to timestamptz)
returns table (orsak text, antal bigint)
language sql stable security definer
set search_path = public
as $$
  select
    coalesce(nullif(trim(a.payload->>'orsak'), ''), 'Ingen orsak angiven') as orsak,
    count(*) as antal
  from public.activities a
  where a.action = 'status_andrad'
    and a.payload->>'till' = 'forlorad'
    and a.created_at >= p_from
    and a.created_at < p_to
    and public.is_active_user()
  group by 1
  order by 2 desc, 1
  limit 8;
$$;

-- ---------- Säljanalys: tid per pipelinesteg ----------
-- Varje statusbyte avslutar steget i payload->>'fran'; tiden i steget är
-- avståndet till föregående loggade händelse för samma lead. Perioden
-- filtrerar när steget AVSLUTADES (lag-fönstret ser hela historiken).
create or replace function public.stage_durations(p_from timestamptz, p_to timestamptz)
returns table (steg text, snitt_dagar numeric, antal bigint)
language sql stable security definer
set search_path = public
as $$
  with events as (
    select
      a.entity_id,
      a.id,
      a.created_at,
      a.action,
      a.payload->>'fran' as fran,
      lag(a.created_at) over (partition by a.entity_id order by a.created_at, a.id) as prev_at
    from public.activities a
    where a.entity_type = 'lead'
      and a.action in ('lead_skapad', 'status_andrad')
  )
  select
    e.fran as steg,
    round((avg(extract(epoch from (e.created_at - e.prev_at)) / 86400))::numeric, 1) as snitt_dagar,
    count(*) as antal
  from events e
  where e.action = 'status_andrad'
    and e.prev_at is not null
    and e.fran is not null and e.fran <> ''
    and e.created_at >= p_from
    and e.created_at < p_to
    and public.is_active_user()
  group by e.fran;
$$;

revoke execute on function public.loss_reasons(timestamptz, timestamptz) from public, anon;
revoke execute on function public.stage_durations(timestamptz, timestamptz) from public, anon;
grant execute on function public.loss_reasons(timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.stage_durations(timestamptz, timestamptz) to authenticated, service_role;
