-- Säkerhetshärdning enligt Supabase-lintern:
-- 1) Lås search_path på alla funktioner (lint 0011).
-- 2) RLS-hjälparna ska inte kunna anropas av anon/public via PostgREST
--    (lint 0028). authenticated behåller EXECUTE – det krävs för att
--    RLS-policies som anropar funktionerna ska fungera.

alter function public.set_updated_at() set search_path = public;
alter function public.list_leads(text, text, text, uuid, bigint, bigint, integer, integer, text, text, integer, integer) set search_path = public;
alter function public.lead_orter() set search_path = public;
alter function public.lead_status_counts() set search_path = public;
alter function public.is_admin() set search_path = public;
alter function public.is_active_user() set search_path = public;

revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_active_user() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.is_active_user() to authenticated, service_role;

revoke execute on function public.list_leads(text, text, text, uuid, bigint, bigint, integer, integer, text, text, integer, integer) from public, anon;
revoke execute on function public.lead_orter() from public, anon;
revoke execute on function public.lead_status_counts() from public, anon;
grant execute on function public.list_leads(text, text, text, uuid, bigint, bigint, integer, integer, text, text, integer, integer) to authenticated, service_role;
grant execute on function public.lead_orter() to authenticated, service_role;
grant execute on function public.lead_status_counts() to authenticated, service_role;
