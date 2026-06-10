-- ============================================================
-- GRODT – kundmodul, roller och intäktsspårning
--
-- Flöde: när en säljare vunnit ett bolag (lead med status 'kund')
-- lämnas det över till en controller som arbetar vidare med kunden.
-- Intäkter loggas per kund och kommentarer delas av hela teamet.
-- ============================================================

-- ---------- Roller: user ersätts av saljare/controller ----------
alter table public.profiles drop constraint profiles_roll_check;
update public.profiles set roll = 'saljare' where roll = 'user';
alter table public.profiles
  add constraint profiles_roll_check check (roll in ('admin', 'saljare', 'controller'));

-- ---------- Kundstatus ----------
create type public.kund_status as enum ('overlamnad', 'pagaende', 'klar');

-- ---------- Tabeller ----------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  orgnr text not null unique references public.companies (orgnr) on delete cascade,
  lead_id uuid references public.leads (id) on delete set null,
  status public.kund_status not null default 'overlamnad',
  -- Säljaren som vann affären och lämnade över.
  saljare_id uuid references public.profiles (id) on delete set null,
  -- Controllern som arbetar med kunden.
  controller_id uuid references public.profiles (id) on delete set null,
  overlamnad_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Intäkter per kund: flera poster över tid, belopp i SEK som heltal.
create table public.customer_revenues (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  amount_sek bigint not null check (amount_sek > 0),
  beskrivning text,
  datum date not null default current_date,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Kommentarer på kunder – synliga för hela teamet, med författare.
create table public.customer_notes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create index idx_customers_status on public.customers (status);
create index idx_customers_controller on public.customers (controller_id);
create index idx_customers_saljare on public.customers (saljare_id);
create index idx_customer_revenues_customer on public.customer_revenues (customer_id);
create index idx_customer_notes_customer on public.customer_notes (customer_id);

create trigger customers_set_updated_at
before update on public.customers
for each row execute function public.set_updated_at();

-- ---------- RLS ----------
-- Internt verktyg: alla aktiva inloggade läser och arbetar med kunder;
-- varje mutation audit-loggas server-side. Endast admin kan radera
-- felregistrerade intäktsposter.
alter table public.customers enable row level security;
alter table public.customer_revenues enable row level security;
alter table public.customer_notes enable row level security;

create policy customers_select on public.customers
  for select to authenticated using (public.is_active_user());
create policy customers_insert on public.customers
  for insert to authenticated with check (public.is_active_user());
create policy customers_update on public.customers
  for update to authenticated using (public.is_active_user()) with check (public.is_active_user());

create policy customer_revenues_select on public.customer_revenues
  for select to authenticated using (public.is_active_user());
create policy customer_revenues_insert on public.customer_revenues
  for insert to authenticated with check (public.is_active_user() and created_by = auth.uid());
create policy customer_revenues_delete on public.customer_revenues
  for delete to authenticated using (public.is_admin());

create policy customer_notes_select on public.customer_notes
  for select to authenticated using (public.is_active_user());
create policy customer_notes_insert on public.customer_notes
  for insert to authenticated with check (public.is_active_user() and author_id = auth.uid());

-- ---------- RPC: kundlistan ----------
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
  with base as (
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
      coalesce((
        select sum(r.amount_sek)
        from public.customer_revenues r
        where r.customer_id = cu.id
      ), 0)::bigint as intjanat,
      cu.overlamnad_at,
      cu.updated_at
    from public.customers cu
    join public.companies c on c.orgnr = cu.orgnr
    left join public.profiles ps on ps.id = cu.saljare_id
    left join public.profiles pc on pc.id = cu.controller_id
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

-- ---------- RPC: kund-KPI:er ----------
create or replace function public.customer_stats()
returns table (
  totalt bigint,
  overlamnade bigint,
  pagaende bigint,
  klara bigint,
  intjanat_totalt bigint
)
language sql stable
set search_path = public
as $$
  select
    count(*),
    count(*) filter (where status = 'overlamnad'),
    count(*) filter (where status = 'pagaende'),
    count(*) filter (where status = 'klar'),
    coalesce((select sum(amount_sek) from public.customer_revenues), 0)::bigint
  from public.customers;
$$;

-- ---------- RPC: topplistan (intjänat per säljare) ----------
create or replace function public.customer_leaderboard()
returns table (
  saljare_id uuid,
  namn text,
  antal_kunder bigint,
  intjanat bigint
)
language sql stable
set search_path = public
as $$
  select
    p.id,
    p.namn,
    count(distinct cu.id),
    coalesce(sum(r.amount_sek), 0)::bigint
  from public.customers cu
  join public.profiles p on p.id = cu.saljare_id
  left join public.customer_revenues r on r.customer_id = cu.id
  group by p.id, p.namn
  order by 4 desc, 3 desc
  limit 10;
$$;

-- ---------- Behörigheter (samma härdning som övriga funktioner) ----------
revoke execute on function public.list_customers(text, text, uuid, text, text, integer, integer) from public, anon;
revoke execute on function public.customer_stats() from public, anon;
revoke execute on function public.customer_leaderboard() from public, anon;
grant execute on function public.list_customers(text, text, uuid, text, text, integer, integer) to authenticated, service_role;
grant execute on function public.customer_stats() to authenticated, service_role;
grant execute on function public.customer_leaderboard() to authenticated, service_role;
