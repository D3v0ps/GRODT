-- ============================================================
-- GRODT – RPC-funktioner för server-side paginering/filter/sortering.
-- security invoker (default): RLS gäller fullt ut.
-- ============================================================

-- Bolagslistan: leads + bolag + omsättning för de två konfigurerade
-- räkenskapsåren. total_count gör att klienten slipper en extra COUNT-fråga.
create or replace function public.list_leads(
  p_search text default null,
  p_status text default null,
  p_ort text default null,
  p_owner uuid default null,
  p_rev_min bigint default null,
  p_rev_max bigint default null,
  p_year1 integer default 2021,
  p_year2 integer default 2022,
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
  antal_anstallda integer,
  status public.lead_status,
  owner_id uuid,
  owner_namn text,
  oms1 bigint,
  oms2 bigint,
  updated_at timestamptz,
  total_count bigint
)
language sql stable
as $$
  with base as (
    select
      l.id as lead_id,
      c.orgnr,
      c.namn,
      c.ort,
      c.antal_anstallda,
      l.status,
      l.owner_id,
      p.namn as owner_namn,
      f1.revenue_sek as oms1,
      f2.revenue_sek as oms2,
      l.updated_at
    from public.leads l
    join public.companies c on c.orgnr = l.orgnr
    left join public.profiles p on p.id = l.owner_id
    left join public.company_financials f1 on f1.orgnr = c.orgnr and f1.year = p_year1
    left join public.company_financials f2 on f2.orgnr = c.orgnr and f2.year = p_year2
    where
      (p_search is null or p_search = ''
        or c.namn ilike '%' || p_search || '%'
        or replace(c.orgnr, '-', '') like '%' || replace(p_search, '-', '') || '%'
        or c.ort ilike '%' || p_search || '%')
      and (p_status is null or p_status = '' or l.status = p_status::public.lead_status)
      and (p_ort is null or p_ort = '' or c.ort = p_ort)
      and (p_owner is null or l.owner_id = p_owner)
      and (p_rev_min is null
        or greatest(coalesce(f1.revenue_sek, 0), coalesce(f2.revenue_sek, 0)) >= p_rev_min)
      and (p_rev_max is null
        or greatest(coalesce(f1.revenue_sek, 0), coalesce(f2.revenue_sek, 0)) <= p_rev_max)
  )
  select b.*, count(*) over () as total_count
  from base b
  order by
    case when p_sort = 'namn' and p_dir = 'asc' then b.namn collate "sv-x-icu" end asc,
    case when p_sort = 'namn' and p_dir = 'desc' then b.namn collate "sv-x-icu" end desc,
    case when p_sort = 'ort' and p_dir = 'asc' then b.ort collate "sv-x-icu" end asc nulls last,
    case when p_sort = 'ort' and p_dir = 'desc' then b.ort collate "sv-x-icu" end desc nulls last,
    case when p_sort = 'oms1' and p_dir = 'asc' then b.oms1 end asc nulls first,
    case when p_sort = 'oms1' and p_dir = 'desc' then b.oms1 end desc nulls last,
    case when p_sort = 'oms2' and p_dir = 'asc' then b.oms2 end asc nulls first,
    case when p_sort = 'oms2' and p_dir = 'desc' then b.oms2 end desc nulls last,
    case when p_sort = 'anst' and p_dir = 'asc' then b.antal_anstallda end asc nulls first,
    case when p_sort = 'anst' and p_dir = 'desc' then b.antal_anstallda end desc nulls last,
    b.namn collate "sv-x-icu" asc
  limit p_limit offset p_offset;
$$;

-- Distinkta orter bland leads (till filtret i bolagslistan).
create or replace function public.lead_orter()
returns setof text
language sql stable
as $$
  select ort from (
    select distinct c.ort
    from public.leads l
    join public.companies c on c.orgnr = l.orgnr
    where c.ort is not null
  ) t
  order by ort collate "sv-x-icu";
$$;

-- Antal leads per status (dashboard + kanban-räknare).
create or replace function public.lead_status_counts()
returns table (status public.lead_status, antal bigint)
language sql stable
as $$
  select l.status, count(*)
  from public.leads l
  group by l.status;
$$;
