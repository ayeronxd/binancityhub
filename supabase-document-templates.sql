-- ================================================
-- BARANGAY HUB - DOCUMENT TEMPLATES MIGRATION
-- ================================================
-- Run this in the Supabase SQL Editor AFTER creating
-- the "document-templates" Storage bucket.
-- ================================================

-- Document templates table: one .docx template per barangay per document type
create table if not exists public.document_templates (
  id                uuid primary key default gen_random_uuid(),
  barangay_id       uuid not null references public.barangays(id) on delete cascade,
  barangay_name     text not null,
  document_type     text not null,        -- e.g. "Barangay Clearance"
  template_file_url text not null,        -- Supabase Storage public URL
  template_file_path text,               -- Storage path for deletion
  template_file_name text,               -- original filename shown in UI
  created_by        uuid references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Unique: one template per barangay per document type (upsert-friendly)
create unique index if not exists uq_template_brgy_doctype
  on public.document_templates (barangay_id, document_type);

-- Auto-update timestamp
drop trigger if exists trg_doc_templates_touch on public.document_templates;
create trigger trg_doc_templates_touch
  before update on public.document_templates
  for each row execute function public.touch_updated_at();

-- ── Row Level Security ──────────────────────────────────────────────────────
alter table public.document_templates enable row level security;

-- Anyone authenticated can read templates (needed to fetch template for filling)
drop policy if exists "read_doc_templates" on public.document_templates;
create policy "read_doc_templates" on public.document_templates
  for select to authenticated
  using (true);

-- Barangay admins manage only their own barangay's templates
drop policy if exists "barangay_admin_manage_templates" on public.document_templates;
create policy "barangay_admin_manage_templates" on public.document_templates
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'barangay_admin'
        and p.barangay = public.document_templates.barangay_name
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'barangay_admin'
        and p.barangay = public.document_templates.barangay_name
    )
  );

-- Super admin can manage all templates
drop policy if exists "super_admin_manage_templates" on public.document_templates;
create policy "super_admin_manage_templates" on public.document_templates
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- ── Storage Bucket Policies ─────────────────────────────────────────────────
-- These set RLS on storage.objects for the "document-templates" bucket.
-- Run AFTER creating the bucket in Supabase Dashboard → Storage.

-- Allow anyone to read/download template files (public bucket)
drop policy if exists "Templates public read" on storage.objects;
create policy "Templates public read"
  on storage.objects for select
  using (bucket_id = 'document-templates');

-- Allow authenticated users (admins) to upload files
drop policy if exists "Admin upload templates" on storage.objects;
create policy "Admin upload templates"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'document-templates');

-- Allow authenticated users to update/replace files
drop policy if exists "Admin update templates" on storage.objects;
create policy "Admin update templates"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'document-templates');

-- Allow authenticated users to delete files
drop policy if exists "Admin delete templates" on storage.objects;
create policy "Admin delete templates"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'document-templates');
