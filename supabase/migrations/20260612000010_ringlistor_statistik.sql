-- ============================================================
-- GRODT – ringlistor och säljarstatistik
--
-- Ringlistor: ett sparat urval ur bolagslistan som teamet betar av
-- tillsammans – varje rad bockas av med vem som ringde och när.
-- Säljarstatistik: aktivitet per säljare aggregerad ur audit-loggen
-- (statusbyten, anteckningar, avklarade uppföljningar) plus intjänat
-- per säljare ur kundintäkterna.
-- ============================================================

-- ---------- Ringlistor ----------
create table public.call_lists (
  id uuid primary key default gen_random_uuid(),
  namn text not null check (char_length(namn) between 1 and 80),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.call_list_items (
  id bigint generated always as identity primary key,
  list_id uuid not null references public.call_lists (id) on delete cascade,
  lead_id uuid not null references public.leads (id) on delete cascade,
  position integer not null default 0,
  called_at timestamptz,
  called_by uuid references public.profiles (id) on delete set null,
  unique (list_id, lead_id)
);

create index idx_call_lists_created_by on public.call_lists (created_by);
create index idx_call_list_items_list on public.call_list_items (list_id);
create index idx_call_list_items_lead on public.call_list_items (lead_id);
create index idx_call_list_items_called_by on public.call_list_items (called_by);

-- RLS: delade arbetslistor – alla aktiva läser, skapar och bockar av.
-- Själva listan raderas endast av den som skapade den eller av admin.
alter table public.call_lists enable row level security;
alter table public.call_list_items enable row level security;

create policy call_lists_select on public.call_lists
  for select to authenticated using (public.is_active_user());
create policy call_lists_insert on public.call_lists
  for insert to authenticated
  with check (public.is_active_user() and created_by = auth.uid());
create policy call_lists_delete on public.call_lists
  for delete to authenticated
  using (public.is_active_user() and (created_by = auth.uid() or public.is_admin()));

create policy call_list_items_select on public.call_list_items
  for select to authenticated using (public.is_active_user());
create policy call_list_items_insert on public.call_list_items
  for insert to authenticated with check (public.is_active_user());
create policy call_list_items_update on public.call_list_items
  for update to authenticated
  using (public.is_active_user()) with check (public.is_active_user());
create policy call_list_items_delete on public.call_list_items
  for delete to authenticated using (public.is_active_user());

-- ---------- RPC: ringlistor med framsteg ----------
create or replace function public.call_list_overview()
returns table (
  id uuid,
  namn text,
  created_by uuid,
  created_by_namn text,
  created_at timestamptz,
  antal bigint,
  ringda bigint
)
language sql stable
set search_path = public
as $$
  select
    cl.id,
    cl.namn,
    cl.created_by,
    p.namn,
    cl.created_at,
    count(i.id),
    count(i.id) filter (where i.called_at is not null)
  from public.call_lists cl
  left join public.profiles p on p.id = cl.created_by
  left join public.call_list_items i on i.list_id = cl.id
  group by cl.id, cl.namn, cl.created_by, p.namn, cl.created_at
  order by cl.created_at desc;
$$;

-- ---------- RPC: pipeline-nuläge per säljare ----------
create or replace function public.lead_owner_status_counts()
returns table (owner_id uuid, status public.lead_status, antal bigint)
language sql stable
set search_path = public
as $$
  select l.owner_id, l.status, count(*)
  from public.leads l
  group by l.owner_id, l.status;
$$;

-- ---------- RPC: säljarstatistik för en period ----------
-- security definer eftersom activities endast är läsbar för admin via
-- RLS, men lagstatistiken (aggregat utan detaljer) ska vara synlig för
-- hela teamet. is_active_user-vakten stoppar inaktiva konton.
create or replace function public.seller_stats(p_from timestamptz, p_to timestamptz)
returns table (
  user_id uuid,
  namn text,
  roll text,
  kontaktade bigint,
  dialoger bigint,
  moten bigint,
  vunna bigint,
  forlorade bigint,
  anteckningar bigint,
  uppfoljningar_klara bigint,
  ringda bigint,
  aktiviteter bigint,
  intjanat bigint
)
language sql stable security definer
set search_path = public
as $$
  with act as (
    select
      a.actor_id,
      count(*) filter (where a.action = 'status_andrad' and a.payload->>'till' = 'kontaktad') as kontaktade,
      count(*) filter (where a.action = 'status_andrad' and a.payload->>'till' = 'dialog') as dialoger,
      count(*) filter (where a.action = 'status_andrad' and a.payload->>'till' = 'mote') as moten,
      count(*) filter (where a.action = 'status_andrad' and a.payload->>'till' = 'kund') as vunna,
      count(*) filter (where a.action = 'status_andrad' and a.payload->>'till' = 'forlorad') as forlorade,
      count(*) filter (where a.action = 'anteckning') as anteckningar,
      count(*) filter (where a.action = 'uppfoljning_klar') as uppfoljningar_klara,
      count(*) filter (where a.action = 'ringlista_ringd') as ringda,
      count(*) as aktiviteter
    from public.activities a
    where a.actor_id is not null
      and a.entity_type in ('lead', 'kund')
      and a.created_at >= p_from
      and a.created_at < p_to
    group by a.actor_id
  ),
  rev as (
    select cu.saljare_id, sum(r.amount_sek)::bigint as intjanat
    from public.customer_revenues r
    join public.customers cu on cu.id = r.customer_id
    where cu.saljare_id is not null
      and r.datum >= (p_from at time zone 'Europe/Stockholm')::date
      and r.datum <= (p_to at time zone 'Europe/Stockholm')::date
    group by cu.saljare_id
  )
  select
    p.id,
    p.namn,
    p.roll,
    coalesce(act.kontaktade, 0),
    coalesce(act.dialoger, 0),
    coalesce(act.moten, 0),
    coalesce(act.vunna, 0),
    coalesce(act.forlorade, 0),
    coalesce(act.anteckningar, 0),
    coalesce(act.uppfoljningar_klara, 0),
    coalesce(act.ringda, 0),
    coalesce(act.aktiviteter, 0),
    coalesce(rev.intjanat, 0)
  from public.profiles p
  left join act on act.actor_id = p.id
  left join rev on rev.saljare_id = p.id
  where p.aktiv
    and public.is_active_user()
  order by p.namn collate "sv-x-icu";
$$;

-- ---------- Behörigheter (samma härdning som övriga funktioner) ----------
revoke execute on function public.call_list_overview() from public, anon;
revoke execute on function public.lead_owner_status_counts() from public, anon;
revoke execute on function public.seller_stats(timestamptz, timestamptz) from public, anon;
grant execute on function public.call_list_overview() to authenticated, service_role;
grant execute on function public.lead_owner_status_counts() to authenticated, service_role;
grant execute on function public.seller_stats(timestamptz, timestamptz) to authenticated, service_role;
