-- ================================================
-- BINAN CITY HUB - ROLE UPGRADE (SAFE MIGRATION)
-- Run this on EXISTING projects (idempotent)
-- ================================================

-- 1) Resident verification column
alter table public.profiles
add column if not exists is_verified boolean not null default false;

-- 2) Allow barangay admins to verify ONLY residents in their barangay
-- Drop first so reruns do not fail.
drop policy if exists barangay_admin_verify_residents on public.profiles;
create policy "barangay_admin_verify_residents"
on public.profiles
for update
to authenticated
using (
  role = 'resident'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'barangay_admin'
      and p.barangay = public.profiles.barangay
  )
)
with check (
  role = 'resident'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'barangay_admin'
      and p.barangay = public.profiles.barangay
  )
);

-- 3) Optional checks
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'profiles'
  and column_name = 'is_verified';

select policyname
from pg_policies
where schemaname = 'public'
  and tablename = 'profiles'
  and policyname = 'barangay_admin_verify_residents';

-- 4) Restrict issue status updates to assigned barangay admin only
drop policy if exists barangay_admin_update_issue_reports on public.issue_reports;
create policy "barangay_admin_update_issue_reports"
on public.issue_reports
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'barangay_admin'
      and p.barangay = coalesce(public.issue_reports.barangay, p.barangay)
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'barangay_admin'
      and p.barangay = coalesce(public.issue_reports.barangay, p.barangay)
  )
);

-- 5) Allow deleting only resolved issues to keep queue clean
-- Super Admin can delete any resolved issue
DROP POLICY IF EXISTS super_admin_delete_resolved_issue_reports ON public.issue_reports;
CREATE POLICY "super_admin_delete_resolved_issue_reports"
ON public.issue_reports
FOR DELETE
TO authenticated
USING (
  status = 'resolved'
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'super_admin'
  )
);

-- Barangay Admin can delete resolved issues in their assigned barangay only
DROP POLICY IF EXISTS barangay_admin_delete_resolved_issue_reports ON public.issue_reports;
CREATE POLICY "barangay_admin_delete_resolved_issue_reports"
ON public.issue_reports
FOR DELETE
TO authenticated
USING (
  status = 'resolved'
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'barangay_admin'
      AND p.barangay = coalesce(public.issue_reports.barangay, p.barangay)
  )
);

-- 6) Restrict worker management by role scope
-- Super Admin: can manage workers across all barangays
DROP POLICY IF EXISTS admin_manage_workers ON public.workers;
DROP POLICY IF EXISTS super_admin_manage_workers ON public.workers;
DROP POLICY IF EXISTS barangay_admin_manage_workers ON public.workers;

CREATE POLICY "super_admin_manage_workers"
ON public.workers
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'super_admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'super_admin'
  )
);

-- Barangay Admin: can manage only workers in assigned barangay
CREATE POLICY "barangay_admin_manage_workers"
ON public.workers
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'barangay_admin'
      AND p.barangay = COALESCE(public.workers.barangay, p.barangay)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'barangay_admin'
      AND p.barangay = COALESCE(public.workers.barangay, p.barangay)
  )
);
