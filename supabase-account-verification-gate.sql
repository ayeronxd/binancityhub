-- ================================================
-- BARANGAY HUB - Account Verification Gate (Option B)
-- ================================================
-- Purpose:
--   Enforce is_verified = true at the RLS / database level so that
--   unverified residents cannot perform any meaningful action even if
--   they somehow bypass the frontend login gate in auth.js.
--
-- Run this ONCE in the Supabase SQL Editor AFTER supabase-schema.sql.
-- The `is_verified` column is already added by supabase-schema.sql:
--   ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false;
-- ================================================

-- ── 1. Profiles: residents may only read their own row when verified ──────────
-- (Admins are exempt — their is_verified defaults to false too on first insert
--  but they are checked by role, not is_verified.)
DROP POLICY IF EXISTS "resident_read_own_profile_verified" ON public.profiles;
CREATE POLICY "resident_read_own_profile_verified"
ON public.profiles FOR SELECT TO authenticated
USING (
  id = auth.uid()
  AND (
    -- Verified residents can read themselves
    is_verified = true
    -- Admins can always read themselves regardless of is_verified
    OR role IN ('barangay_admin', 'super_admin')
  )
);

-- ── 2. Document requests: only verified residents may insert ──────────────────
DROP POLICY IF EXISTS "verified_resident_insert_doc_requests" ON public.document_requests;
CREATE POLICY "verified_resident_insert_doc_requests"
ON public.document_requests FOR INSERT TO authenticated
WITH CHECK (
  resident_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'resident'
      AND p.is_verified = true
      AND p.barangay = public.document_requests.barangay
  )
);

-- Drop the old unverified-resident insert policy (replaced above)
DROP POLICY IF EXISTS "resident_insert_own_doc_requests" ON public.document_requests;

-- ── 3. Issue reports: only verified residents may insert ──────────────────────
DROP POLICY IF EXISTS "verified_resident_insert_issue_reports" ON public.issue_reports;
CREATE POLICY "verified_resident_insert_issue_reports"
ON public.issue_reports FOR INSERT TO authenticated
WITH CHECK (
  resident_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'resident'
      AND p.is_verified = true
  )
);

-- Drop the old unrestricted-resident insert policy (replaced above)
DROP POLICY IF EXISTS "resident_insert_issue_reports" ON public.issue_reports;

-- ── 4. Admin: allow deleting unverified resident profiles (Reject action) ─────
-- The barangay_admin_verify_residents UPDATE policy already exists.
-- We add a scoped DELETE policy so admins can reject (delete) accounts.
DROP POLICY IF EXISTS "barangay_admin_delete_unverified_residents" ON public.profiles;
CREATE POLICY "barangay_admin_delete_unverified_residents"
ON public.profiles FOR DELETE TO authenticated
USING (
  -- Only unverified residents can be deleted this way
  role = 'resident'
  AND is_verified = false
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role = 'super_admin'
        OR (p.role = 'barangay_admin' AND p.barangay = public.profiles.barangay)
      )
  )
);
