-- ============================================================
-- GRODT – avatars-bucketen blir privat.
-- Appen serverar profilbilder via signerade URL:er (genereras
-- server-side i app-layouten). Kör denna EFTER att koden som
-- signerar URL:er är driftsatt, annars slutar bilderna visas.
-- ============================================================
update storage.buckets set public = false where id = 'avatars';
