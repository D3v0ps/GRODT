-- ============================================================
-- GRODT – krypterat hemlighetsvalv (Supabase Vault)
--
-- API-nycklar (t.ex. Bolagsverkets client id/secret) kan lagras
-- krypterat i databasen som alternativ till miljövariabler i Vercel.
-- Miljövariabler har alltid företräde i koden; valvet är reservväg.
--
-- Läsning sker ENDAST via service role genom get_secret() –
-- anon/authenticated har ingen åtkomst alls, och vault-schemat
-- exponeras aldrig via PostgREST.
-- ============================================================

create or replace function public.get_secret(secret_name text)
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = secret_name
  limit 1;
$$;

revoke execute on function public.get_secret(text) from public, anon, authenticated;
grant execute on function public.get_secret(text) to service_role;
