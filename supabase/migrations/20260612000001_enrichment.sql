-- ============================================================
-- GRODT – utökad berikning: tillväxtsignaler, datahygien, hälsotal
--
-- Nya fält fylls av Bolagsverket-berikningen. Tillväxt beräknas i
-- list_leads-RPC:n ur befintliga bokslutsrader (inget extra API-anrop).
-- ============================================================

-- ---------- Bolagsfält från Bolagsverket ----------
alter table public.companies
  add column verksamhetsbeskrivning text,
  add column registreringsdatum date,
  add column bolagsform text,
  -- null = aktivt bolag; datum = avregistrerat hos Bolagsverket
  add column avregistrerad_datum date,
  add column reklamsparr boolean not null default false;

-- ---------- Soliditet (procent) ur årsredovisningen ----------
alter table public.company_financials
  add column soliditet numeric(6, 2);

-- ---------- list_leads v2: tillväxt, SNI och hygienflaggor ----------
drop function public.list_leads(text, text, text, uuid, bigint, bigint, integer, integer, text, text, integer, integer);

create or replace function public.list_leads(
  p_search text default null,
  p_status text default null,
  p_ort text default null,
  p_owner uuid default null,
  p_rev_min bigint default null,
  p_rev_max bigint default null,
  p_year1 integer default 2023,
  p_year2 integer default 2024,
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
  anst1 integer,
  anst2 integer,
  oms_tillvaxt_pct numeric,
  avregistrerad boolean,
  reklamsparr boolean,
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
      f1.employees as anst1,
      f2.employees as anst2,
      case
        when f1.revenue_sek is not null and f1.revenue_sek > 0 and f2.revenue_sek is not null
        then round((f2.revenue_sek - f1.revenue_sek)::numeric / f1.revenue_sek * 100, 1)
        else null
      end as oms_tillvaxt_pct,
      (c.avregistrerad_datum is not null) as avregistrerad,
      c.reklamsparr,
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
    case when p_sort = 'anst' and p_dir = 'asc' then f.antal_anstallda end asc nulls first,
    case when p_sort = 'anst' and p_dir = 'desc' then f.antal_anstallda end desc nulls last,
    case when p_sort = 'tillvaxt' and p_dir = 'asc' then f.oms_tillvaxt_pct end asc nulls last,
    case when p_sort = 'tillvaxt' and p_dir = 'desc' then f.oms_tillvaxt_pct end desc nulls last,
    f.namn collate "sv-x-icu" asc
  limit p_limit offset p_offset;
$$;

revoke execute on function public.list_leads(text, text, text, uuid, bigint, bigint, integer, integer, numeric, text, text, integer, integer) from public, anon;
grant execute on function public.list_leads(text, text, text, uuid, bigint, bigint, integer, integer, numeric, text, text, integer, integer) to authenticated, service_role;
