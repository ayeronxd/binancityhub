-- ================================================
-- BARANGAY HUB - Resident Identity Verification
-- ================================================
-- Purpose:
--   1. Create a private storage bucket for resident verification documents.
--   2. Add gov_id_url and proof_of_billing_url columns to the profiles table.
--   3. Set RLS policies so residents can upload only to their own folder,
--      and admins can read any document for verification review.
-- Run this in the Supabase SQL Editor ONCE after the main schema is set up.

-- ── Step 1: Storage Bucket ──────────────────────────────────────────────────
-- Creates a PRIVATE bucket (public = false) so document URLs are never
-- directly accessible. Admins view them via short-lived signed URLs only.
insert into storage.buckets (id, name, public)
values ('resident-verification-docs', 'resident-verification-docs', false)
on conflict (id) do nothing;

-- ── Step 2: Storage RLS Policies ────────────────────────────────────────────

-- Allow authenticated residents to upload their own documents.
-- Path convention: {userId}/gov_id.{ext} and {userId}/billing.{ext}
drop policy if exists "residents_upload_own_docs" on storage.objects;
create policy "residents_upload_own_docs"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'resident-verification-docs'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated residents to update (overwrite) their own documents.
drop policy if exists "residents_update_own_docs" on storage.objects;
create policy "residents_update_own_docs"
on storage.objects for update to authenticated
using (
  bucket_id = 'resident-verification-docs'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow admins (super_admin, barangay_admin) to read any document for review.
-- Uses a signed URL so files are never publicly exposed.
drop policy if exists "admins_read_verification_docs" on storage.objects;
create policy "admins_read_verification_docs"
on storage.objects for select to authenticated
using (
  bucket_id = 'resident-verification-docs'
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('super_admin', 'barangay_admin')
  )
);

-- ── Step 3: Profile Column ──────────────────────────────────────────────────
-- Store a single path for whichever document the resident uploads:
-- Government ID OR Proof of Billing/Address.
alter table public.profiles
  add column if not exists verification_doc_url text;
