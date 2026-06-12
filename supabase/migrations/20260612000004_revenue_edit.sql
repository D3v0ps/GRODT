-- ============================================================
-- GRODT – redigerbara intäktsposter
--
-- Felregistreringar ska kunna rättas: den som skapade posten (eller
-- admin) får ändra och ta bort den. Varje ändring audit-loggas med
-- före/efter-belopp, så att totalsiffrorna alltid går att förklara.
-- ============================================================

drop policy customer_revenues_delete on public.customer_revenues;

create policy customer_revenues_update on public.customer_revenues
  for update to authenticated
  using (public.is_active_user() and (created_by = auth.uid() or public.is_admin()))
  with check (public.is_active_user() and (created_by = auth.uid() or public.is_admin()));

create policy customer_revenues_delete on public.customer_revenues
  for delete to authenticated
  using (public.is_active_user() and (created_by = auth.uid() or public.is_admin()));
