-- ============================================================
-- GRODT – kontaktuppgifter på kunder
--
-- Teamets egna, verifierade kontaktvägar ("numret man faktiskt når
-- kunden på") – kompletterar myndighetsdatan som saknar kontaktinfo.
-- ============================================================

alter table public.customers
  add column kontaktperson text,
  add column kontakt_telefon text,
  add column kontakt_epost text;
