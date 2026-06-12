-- ============================================================
-- GRODT – leveranskedja på kunder
--
-- Kundstatusen växer från Överlämnad/Pågående/Klar till hela
-- leveransflödet: Överlämnad → Första sållningen → Andra sållningen →
-- 50 % klar → 75 % klar → Leverans klar → Faktura skickad →
-- Faktura betald. Befintliga 'pagaende' flyttas till 'sallning1'
-- (arbetet hade påbörjats – första steget i nya kedjan).
-- ============================================================

alter type public.kund_status rename to kund_status_old;

create type public.kund_status as enum (
  'overlamnad',
  'sallning1',
  'sallning2',
  'klar50',
  'klar75',
  'klar',
  'fakturerad',
  'betald'
);

-- Funktioner som returnerar gamla typen måste bort innan kolumnbytet.
drop function public.list_customers(text, text, uuid, text, text, integer, integer);
drop function public.customer_stats();

alter table public.customers alter column status drop default;
alter table public.customers
  alter column status type public.kund_status
  using (case status::text when 'pagaende' then 'sallning1' else status::text end)::public.kund_status;
alter table public.customers alter column status set default 'overlamnad';

drop type public.kund_status_old;

-- ---------- list_customers v3 (oförändrad logik, ny enumtyp) ----------
create or replace function public.list_customers(
  p_search text default null,
  p_status text default null,
  p_controller uuid default null,
  p_sort text default 'namn',
  p_dir text default 'asc',
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  customer_id uuid,
  orgnr text,
  namn text,
  ort text,
  status public.kund_status,
  saljare_id uuid,
  saljare_namn text,
  controller_id uuid,
  controller_namn text,
  intjanat bigint,
  overlamnad_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
language sql stable
set search_path = public
as $$
  with summor as (
    select customer_id, sum(amount_sek)::bigint as intjanat
    from public.customer_revenues
    group by customer_id
  ),
  base as (
    select
      cu.id as customer_id,
      c.orgnr,
      c.namn,
      c.ort,
      cu.status,
      cu.saljare_id,
      ps.namn as saljare_namn,
      cu.controller_id,
      pc.namn as controller_namn,
      coalesce(s.intjanat, 0) as intjanat,
      cu.overlamnad_at,
      cu.updated_at
    from public.customers cu
    join public.companies c on c.orgnr = cu.orgnr
    left join public.profiles ps on ps.id = cu.saljare_id
    left join public.profiles pc on pc.id = cu.controller_id
    left join summor s on s.customer_id = cu.id
    where
      (p_search is null or p_search = ''
        or c.namn ilike '%' || p_search || '%'
        or replace(c.orgnr, '-', '') like '%' || replace(p_search, '-', '') || '%'
        or c.ort ilike '%' || p_search || '%')
      and (p_status is null or p_status = '' or cu.status = p_status::public.kund_status)
      and (p_controller is null or cu.controller_id = p_controller)
  )
  select b.*, count(*) over () as total_count
  from base b
  order by
    case when p_sort = 'namn' and p_dir = 'asc' then b.namn collate "sv-x-icu" end asc,
    case when p_sort = 'namn' and p_dir = 'desc' then b.namn collate "sv-x-icu" end desc,
    case when p_sort = 'intjanat' and p_dir = 'asc' then b.intjanat end asc,
    case when p_sort = 'intjanat' and p_dir = 'desc' then b.intjanat end desc,
    case when p_sort = 'overlamnad' and p_dir = 'asc' then b.overlamnad_at end asc,
    case when p_sort = 'overlamnad' and p_dir = 'desc' then b.overlamnad_at end desc,
    b.namn collate "sv-x-icu" asc
  limit p_limit offset p_offset;
$$;

-- ---------- customer_stats v2: leveransläget ----------
-- totalt/intjanat_totalt behåller sina namn (dashboarden läser dem).
create or replace function public.customer_stats()
returns table (
  totalt bigint,
  i_leverans bigint,
  levererade bigint,
  fakturerade bigint,
  betalda bigint,
  intjanat_totalt bigint
)
language sql stable
set search_path = public
as $$
  select
    count(*),
    count(*) filter (where status in ('overlamnad', 'sallning1', 'sallning2', 'klar50', 'klar75')),
    count(*) filter (where status = 'klar'),
    count(*) filter (where status = 'fakturerad'),
    count(*) filter (where status = 'betald'),
    coalesce((select sum(amount_sek) from public.customer_revenues), 0)::bigint
  from public.customers;
$$;

-- ---------- Behörigheter ----------
revoke execute on function public.list_customers(text, text, uuid, text, text, integer, integer) from public, anon;
revoke execute on function public.customer_stats() from public, anon;
grant execute on function public.list_customers(text, text, uuid, text, text, integer, integer) to authenticated, service_role;
grant execute on function public.customer_stats() to authenticated, service_role;
