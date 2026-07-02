-- ============================================================
-- GRODT – omställning blir en egen målgruppsklass
--
-- Teamet säljer även till omställningsbolag (outplacement, Rusta och
-- matcha, arbetsmarknadstjänster). Bedömningen får därför en fjärde
-- klass: 'omstallning'. Målgruppen är arbetsformedling + omstallning –
-- båda visas i pipelinen och markeras med lågan i UI:t.
-- ============================================================

alter table public.companies drop constraint companies_bransch_klass_check;
alter table public.companies
  add constraint companies_bransch_klass_check
  check (bransch_klass in ('arbetsformedling', 'omstallning', 'personaluthyrning', 'annat'));
