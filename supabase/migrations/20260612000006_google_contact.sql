-- ============================================================
-- GRODT – källmärkning av kontaktuppgifter (Google Places)
--
-- Telefon/hemsida kan berikas från Google Places. Sådana värden måste
-- alltid kunna särskiljas (växelnummer ur Googles företagsprofil ≠
-- teamets verifierade direktnummer), därför lagras källan per fält.
-- null = ursprungskälla (CSV/manuell), 'google' = hämtat från Places.
-- Google fyller endast TOMMA fält – skriver aldrig över befintliga.
-- ============================================================

alter table public.companies
  add column telefon_kalla text,
  add column hemsida_kalla text;
