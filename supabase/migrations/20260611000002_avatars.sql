-- ============================================================
-- GRODT – profilbilder
--
-- Bilder lagras i en publik storage-bucket ('avatars') med
-- oförutsägbara sökvägar ({userId}/{timestamp}.jpg). All skrivning
-- sker server-side via service role (klienter har inga
-- storage-policies), så uppladdning/borttagning går alltid genom
-- validerade, audit-loggade server actions.
-- ============================================================

alter table public.profiles add column avatar_url text;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;
