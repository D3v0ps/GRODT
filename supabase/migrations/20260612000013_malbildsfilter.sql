-- ============================================================
-- GRODT – målbildsfilter (SNI-baserat)
--
-- Bolag utanför målgruppen (t.ex. personaluthyrning, SNI 78.200) ska
-- inte ligga som säljbara leads. Filtret bygger på den STRUKTURERADE
-- SNI-koden från Bolagsverket – inte fritextbeskrivningen, som är för
-- otillförlitlig ("Nordisk Bemanning AB" är SNI 78.100 men beskriver sig
-- som "rekrytering och uthyrning av personal").
--
-- Mekanik: ett lead kan flyttas UT ur målbilden (off_target_at sätts).
-- Utflyttade leads döljs som standard ur listor, pipeline, dashboard,
-- statistik, ringlist-källan och sök – men raderas aldrig och kan
-- återställas. target_kept = användaren har gjort ett manuellt val
-- (behåll/uteslut) som automatiken inte får skriva över.
-- ============================================================

alter table public.leads
  add column off_target_at timestamptz,
  add column off_target_sni text,
  add column target_kept boolean not null default false;

create index idx_leads_off_target on public.leads (off_target_at)
  where off_target_at is not null;

-- ---------- Backfill: befintliga leads vars bolag är känt off-target ----------
-- Läser målbildens SNI-koder ur app_settings (faller tillbaka på 78.100).
with target as (
  select coalesce(
    (
      select array_agg(replace(code, '.', ''))
      from app_settings s,
           lateral jsonb_array_elements_text(s.value -> 'sni_codes') as code
      where s.key = 'sync_filter'
    ),
    array['78100']
  ) as codes
)
-- Endast kalla leads (status 'ny') flyttas ut automatiskt – bolag som
-- teamet redan bearbetat (kontaktad/dialog/möte/kund) lämnas orörda.
update public.leads l
set off_target_at = now(),
    off_target_sni = c.sni_kod
from public.companies c, target t
where l.orgnr = c.orgnr
  and l.status = 'ny'
  and c.sni_kod is not null
  and replace(c.sni_kod, '.', '') <> all (t.codes)
  and l.off_target_at is null
  and not l.target_kept;

-- ---------- list_leads v8: döljer off-target som standard ----------
drop function public.list_leads(text, text, text, uuid, boolean, bigint, bigint, integer, integer, integer, integer, numeric, text, text, integer, integer);

create or replace function public.list_leads(
  p_search text default null,
  p_status text default null,
  p_ort text default null,
  p_owner uuid default null,
  p_only_unassigned boolean default false,
  p_include_off_target boolean default false,
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
  off_target_at timestamptz,
  off_target_sni text,
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
      l.off_target_at,
      l.off_target_sni,
      l.updated_at
    from public.leads l
    join public.companies c on c.orgnr = l.orgnr
    left join public.profiles p on p.id = l.owner_id
    left join public.company_financials f1 on f1.orgnr = c.orgnr and f1.year = p_year1
    left join public.company_financials f2 on f2.orgnr = c.orgnr and f2.year = p_year2
    left join public.company_financials f3 on f3.orgnr = c.orgnr and f3.year = p_year3
    left join public.company_financials f4 on f4.orgnr = c.orgnr and f4.year = p_year4
    where
      (p_include_off_target or l.off_target_at is null)
      and (p_search is null or p_search = ''
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

revoke execute on function public.list_leads(text, text, text, uuid, boolean, boolean, bigint, bigint, integer, integer, integer, integer, numeric, text, text, integer, integer) from public, anon;
grant execute on function public.list_leads(text, text, text, uuid, boolean, boolean, bigint, bigint, integer, integer, integer, integer, numeric, text, text, integer, integer) to authenticated, service_role;

-- ---------- lead_status_counts: aktiva (inom målbild) ----------
create or replace function public.lead_status_counts()
returns table (status public.lead_status, antal bigint)
language sql stable
set search_path = public
as $$
  select l.status, count(*)
  from public.leads l
  where l.off_target_at is null
  group by l.status;
$$;

-- ---------- lead_owner_status_counts v3: exkludera off-target ----------
drop function public.lead_owner_status_counts();

create or replace function public.lead_owner_status_counts()
returns table (owner_id uuid, status public.lead_status, antal bigint, varde bigint)
language sql stable
set search_path = public
as $$
  select l.owner_id, l.status, count(*), coalesce(sum(l.deal_value_sek), 0)::bigint
  from public.leads l
  where l.off_target_at is null
  group by l.owner_id, l.status;
$$;

revoke execute on function public.lead_owner_status_counts() from public, anon;
grant execute on function public.lead_owner_status_counts() to authenticated, service_role;

-- ---------- lead_orter: bara orter med aktiva leads ----------
create or replace function public.lead_orter()
returns setof text
language sql stable
set search_path = public
as $$
  select ort from (
    select distinct c.ort
    from public.leads l
    join public.companies c on c.orgnr = l.orgnr
    where c.ort is not null and l.off_target_at is null
  ) t
  order by ort collate "sv-x-icu";
$$;
