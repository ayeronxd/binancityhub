/* ===================================================================== */
/* BARANGAY HUB - MASTER INITIALIZATION SCRIPT                         */
/* ===================================================================== */
/* This script contains the entire database schema, storage buckets,     */
/* RLS policies, triggers, and functions required to initialize the      */
/* Barangay Hub system from scratch.                                     */
/* ===================================================================== */




/* ===================================================================== */
/* FILE: supabase-schema.sql */
/* ===================================================================== */

-- ================================================
-- BARANGAY HUB - SUPABASE SCHEMA (Production)
-- ================================================

create extension if not exists pgcrypto;

-- Roles
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'portal_role') THEN
    CREATE TYPE portal_role AS ENUM ('resident', 'barangay_admin', 'super_admin');
  END IF;
END$$;

-- Core tables
create table if not exists public.barangays (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  captain text,
  status text not null default 'pending' check (status in ('active','pending')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  phone text,
  age integer,
  role portal_role not null default 'resident',
  barangay text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  service_category text not null,
  category text not null default 'blue-collar' check (category in ('blue-collar','white-collar')),
  barangay text not null,
  contact_phone text,
  contact_email text,
  rating_avg numeric(3,2) not null default 0,
  reviews_count int not null default 0,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  category text,
  media_url text,
  media_type text check (media_type in ('image', 'video')),
  barangay_scope text not null default 'City-Wide',
  published_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_requests (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.profiles(id) on delete cascade,
  barangay text not null,
  request_type text not null,
  purpose text not null,
  status text not null default 'submitted' check (status in ('submitted','reviewing','approved','rejected','completed')),
  processed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.issue_reports (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.profiles(id) on delete cascade,
  barangay text,
  category text not null,
  location text not null,
  description text not null,
  status text not null default 'pending' check (status in ('pending','processing','resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trigger helper
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_barangays_touch on public.barangays;
create trigger trg_barangays_touch before update on public.barangays for each row execute function public.touch_updated_at();
drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
drop trigger if exists trg_workers_touch on public.workers;
create trigger trg_workers_touch before update on public.workers for each row execute function public.touch_updated_at();
drop trigger if exists trg_announcements_touch on public.announcements;
create trigger trg_announcements_touch before update on public.announcements for each row execute function public.touch_updated_at();
drop trigger if exists trg_doc_requests_touch on public.document_requests;
create trigger trg_doc_requests_touch before update on public.document_requests for each row execute function public.touch_updated_at();
drop trigger if exists trg_issue_reports_touch on public.issue_reports;
create trigger trg_issue_reports_touch before update on public.issue_reports for each row execute function public.touch_updated_at();

-- Auto profile creation after signup
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  full_name_value text;
  barangay_value text;
begin
  full_name_value := coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email,'@',1));
  barangay_value := coalesce(new.raw_user_meta_data ->> 'barangay', 'Barangay Poblacion');

  insert into public.profiles (id, full_name, email, phone, age, role, barangay)
  values (
    new.id,
    full_name_value,
    new.email,
    new.raw_user_meta_data ->> 'phone',
    (new.raw_user_meta_data ->> 'age')::integer,
    'resident',
    barangay_value
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    email = excluded.email,
    phone = excluded.phone,
    age = excluded.age,
    barangay = excluded.barangay,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user_profile();

-- Analytics view used by both index and admin pages
create or replace view public.v_barangay_analytics as
select
  b.id,
  b.name,
  b.captain,
  b.status,
  b.notes,
  b.created_at,
  coalesce(pr.resident_count, 0) as residents,
  coalesce(dr.doc_count, 0) as docs,
  coalesce(wr.worker_count, 0) as workers
from public.barangays b
left join (
  select barangay, count(*) as resident_count
  from public.profiles
  where role = 'resident'
  group by barangay
) pr on pr.barangay = b.name
left join (
  select barangay, count(*) as doc_count
  from public.document_requests
  group by barangay
) dr on dr.barangay = b.name
left join (
  select barangay, count(*) as worker_count
  from public.workers
  where is_active = true
  group by barangay
) wr on wr.barangay = b.name;

-- RLS
alter table public.barangays enable row level security;
alter table public.profiles enable row level security;
alter table public.workers enable row level security;
alter table public.announcements enable row level security;
alter table public.document_requests enable row level security;
alter table public.issue_reports enable row level security;

-- Public read-only portal data
drop policy if exists "public_read_workers" on public.workers;
create policy "public_read_workers" on public.workers for select using (is_active = true);

drop policy if exists "public_read_announcements" on public.announcements;
create policy "public_read_announcements" on public.announcements for select using (true);

drop policy if exists "public_read_barangays" on public.barangays;
create policy "public_read_barangays" on public.barangays for select using (true);

drop policy if exists "public_read_profiles" on public.profiles;
create policy "public_read_profiles" on public.profiles for select using (true);

drop policy if exists "public_read_document_requests" on public.document_requests;
create policy "public_read_document_requests" on public.document_requests for select using (true);

drop policy if exists "public_read_issue_reports" on public.issue_reports;
create policy "public_read_issue_reports" on public.issue_reports for select using (true);

-- Profiles
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated using (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Security definer function to safely check role without causing infinite recursion
create or replace function public.is_super_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles 
    where id = auth.uid() and role = 'super_admin'
  );
$$ language sql security definer;

-- admin_view_profiles is strictly redundant since public_read_profiles is using (true).
drop policy if exists "admin_view_profiles" on public.profiles;

drop policy if exists "super_admin_manage_profiles" on public.profiles;
create policy "super_admin_manage_profiles" on public.profiles for all to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());
-- Resident verification support for barangay admins
alter table public.profiles add column if not exists is_verified boolean not null default false;

drop policy if exists barangay_admin_verify_residents on public.profiles;
create policy "barangay_admin_verify_residents" on public.profiles for update to authenticated
using (
  role = 'resident'
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'barangay_admin'
      and p.barangay = public.profiles.barangay
  )
)
with check (
  role = 'resident'
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'barangay_admin'
      and p.barangay = public.profiles.barangay
  )
);

-- Document requests
drop policy if exists "resident_insert_own_doc_requests" on public.document_requests;
create policy "resident_insert_own_doc_requests" on public.document_requests for insert to authenticated
with check (
  resident_id = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'resident'
      and p.barangay = public.document_requests.barangay
  )
);

drop policy if exists "resident_select_own_doc_requests" on public.document_requests;
create policy "resident_select_own_doc_requests" on public.document_requests for select to authenticated
using (resident_id = auth.uid());

drop policy if exists "admin_select_doc_requests" on public.document_requests;
create policy "admin_select_doc_requests" on public.document_requests for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'super_admin'
        or (p.role = 'barangay_admin' and p.barangay = public.document_requests.barangay)
      )
  )
);

drop policy if exists "admin_update_doc_requests" on public.document_requests;
create policy "admin_update_doc_requests" on public.document_requests for update to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'super_admin'
        or (p.role = 'barangay_admin' and p.barangay = public.document_requests.barangay)
      )
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'super_admin'
        or (p.role = 'barangay_admin' and p.barangay = public.document_requests.barangay)
      )
  )
);

-- Issue reports
drop policy if exists "resident_insert_issue_reports" on public.issue_reports;
create policy "resident_insert_issue_reports" on public.issue_reports for insert to authenticated
with check (resident_id = auth.uid());

drop policy if exists "resident_select_own_issue_reports" on public.issue_reports;
create policy "resident_select_own_issue_reports" on public.issue_reports for select to authenticated
using (resident_id = auth.uid());

drop policy if exists "admin_select_issue_reports" on public.issue_reports;
create policy "admin_select_issue_reports" on public.issue_reports for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'super_admin'
        or (p.role = 'barangay_admin' and p.barangay = coalesce(public.issue_reports.barangay, p.barangay))
      )
  )
);


-- Only assigned barangay admins can update issue status in their own barangay.
drop policy if exists barangay_admin_update_issue_reports on public.issue_reports;
create policy "barangay_admin_update_issue_reports" on public.issue_reports for update to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'barangay_admin'
      and p.barangay = coalesce(public.issue_reports.barangay, p.barangay)
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'barangay_admin'
      and p.barangay = coalesce(public.issue_reports.barangay, p.barangay)
  )
);
-- Workers and announcements management
drop policy if exists admin_manage_workers on public.workers;
drop policy if exists super_admin_manage_workers on public.workers;
drop policy if exists barangay_admin_manage_workers on public.workers;

create policy "super_admin_manage_workers" on public.workers for all to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'super_admin'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'super_admin'
  )
);

create policy "barangay_admin_manage_workers" on public.workers for all to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'barangay_admin'
      and p.barangay = coalesce(public.workers.barangay, p.barangay)
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'barangay_admin'
      and p.barangay = coalesce(public.workers.barangay, p.barangay)
  )
);

drop policy if exists "admin_manage_announcements" on public.announcements;
create policy "admin_manage_announcements" on public.announcements for all to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('super_admin','barangay_admin')))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('super_admin','barangay_admin')));

drop policy if exists "admin_manage_barangays" on public.barangays;
create policy "admin_manage_barangays" on public.barangays for all to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'));
-- Allow reading analytics view
grant select on public.v_barangay_analytics to anon, authenticated;




-- Resolved issue cleanup policies
DROP POLICY IF EXISTS super_admin_delete_resolved_issue_reports ON public.issue_reports;
CREATE POLICY "super_admin_delete_resolved_issue_reports" ON public.issue_reports FOR DELETE TO authenticated
USING (
  status = 'resolved'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'super_admin'
  )
);

DROP POLICY IF EXISTS barangay_admin_delete_resolved_issue_reports ON public.issue_reports;
CREATE POLICY "barangay_admin_delete_resolved_issue_reports" ON public.issue_reports FOR DELETE TO authenticated
USING (
  status = 'resolved'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'barangay_admin'
      AND p.barangay = coalesce(public.issue_reports.barangay, p.barangay)
  )
);

-- Storage buckets initialization
insert into storage.buckets (id, name, public) 
values ('announcements-media', 'announcements-media', true)
on conflict (id) do nothing;

create policy "Public Access to Announcements Media"
on storage.objects for select
to public
using ( bucket_id = 'announcements-media' );

create policy "Admins Can Upload Announcements Media"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'announcements-media'
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('super_admin', 'barangay_admin'))
);


/* ===================================================================== */
/* FILE: supabase-trigger-update.sql */
/* ===================================================================== */

-- ================================================
-- BARANGAY HUB - Trigger Update for Verification
-- ================================================
-- We must extract the verification_doc_url from the auth metadata
-- because the user is not authenticated yet when email confirmation is ON.

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  full_name_value text;
  barangay_value text;
begin
  full_name_value := coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email,'@',1));
  barangay_value := coalesce(new.raw_user_meta_data ->> 'barangay', 'Barangay Poblacion');

  insert into public.profiles (id, full_name, email, phone, age, role, barangay, verification_doc_url)
  values (
    new.id,
    full_name_value,
    new.email,
    new.raw_user_meta_data ->> 'phone',
    (new.raw_user_meta_data ->> 'age')::integer,
    'resident',
    barangay_value,
    new.raw_user_meta_data ->> 'verification_doc_url'
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    email = excluded.email,
    phone = excluded.phone,
    age = excluded.age,
    barangay = excluded.barangay,
    verification_doc_url = excluded.verification_doc_url,
    updated_at = now();

  return new;
end;
$$;


/* ===================================================================== */
/* FILE: supabase-delete-permissions.sql */
/* ===================================================================== */

-- ============================================================
-- document_requests DELETE permissions & Foreign Key Fix
-- Allows admins to delete processed document requests
-- ============================================================

-- First, fix the foreign key constraint that blocks deletion.
-- If admin_messages was created without ON DELETE CASCADE, it prevents deleting the request.
ALTER TABLE public.admin_messages
  DROP CONSTRAINT IF EXISTS admin_messages_document_request_id_fkey;

ALTER TABLE public.admin_messages
  ADD CONSTRAINT admin_messages_document_request_id_fkey
  FOREIGN KEY (document_request_id)
  REFERENCES public.document_requests(id)
  ON DELETE CASCADE;

-- Drop if already exists to avoid conflict
DROP POLICY IF EXISTS "admin_delete_doc_requests" ON public.document_requests;

-- Allow Super Admins and Barangay Admins to delete document requests
-- (Barangay Admins can only delete requests within their own Barangay)
CREATE POLICY "admin_delete_doc_requests" ON public.document_requests
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role = 'super_admin'
        OR (p.role = 'barangay_admin' AND p.barangay = public.document_requests.barangay)
      )
  )
);


/* ===================================================================== */
/* FILE: supabase-profanity-filter.sql */
/* ===================================================================== */

-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- PROFANITY FILTER â€” Database Layer 2 (Server-Side Trigger)
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- This trigger runs BEFORE every INSERT or UPDATE on the
-- announcement_comments table. It censors prohibited words by
-- replacing them with asterisks directly inside the database.
--
-- This is bulletproof: even if someone bypasses the JavaScript
-- client-side filter by calling Supabase directly (e.g. Postman,
-- a custom script), this trigger will still sanitize the content.
--
-- HOW TO RUN:
--   Paste this entire script into your Supabase SQL Editor and
--   click "Run". No other setup is needed.
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•


-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Step 1: Create the function that does the actual censoring
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE OR REPLACE FUNCTION censor_profanity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  bad_words TEXT[] := ARRAY[
    -- Multi-word Filipino phrases first (longest first for correct replacement)
    'anak ng puta', 'anakng puta',
    'putang ina', 'tang ina', 'hayop ka',
    'kingina mo', 'ina mo',
    -- Single Filipino words
    'putangina', 'tanginamo', 'amputa', 'ampota',
    'hinayupak', 'tarantado', 'kingina',
    'putang', 'tangina',
    'puta', 'gago', 'gaga', 'bobo', 'boba',
    'tanga', 'ulol', 'inutil', 'lintik',
    'leche', 'letse', 'putik', 'hayop',
    'pakyu', 'pak yu', 'pakyo', 'hudas',
    'shet',
    -- English words
    'fucking', 'fucker', 'fucked', 'bullshit', 'bitches',
    'asshole', 'faggot', 'nigger', 'nigga', 'retard',
    'shitty', 'bastard',
    'fuck', 'shit', 'bitch', 'cunt', 'dick',
    'cock', 'pussy', 'whore', 'slut', 'damn',
    'crap', 'ass', 'fag', 'moron', 'idiot',
    'stupid'
  ];
  word TEXT;
  cleaned TEXT;
BEGIN
  cleaned := NEW.content;

  FOREACH word IN ARRAY bad_words LOOP
    -- Replace each bad word with asterisks, case-insensitive
    -- \m and \M are PostgreSQL word boundary markers
    cleaned := regexp_replace(
      cleaned,
      '(?i)' || regexp_replace(word, '([.+*?^${}()|[\]\\])', '\\\1', 'g'),
      repeat('*', length(word)),
      'gi'
    );
  END LOOP;

  NEW.content := cleaned;
  RETURN NEW;
END;
$$;


-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Step 2: Drop the trigger if it already exists (safe re-run)
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
DROP TRIGGER IF EXISTS trg_censor_comments ON announcement_comments;


-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Step 3: Attach the trigger to the table
-- Fires BEFORE every INSERT and UPDATE so the content is
-- cleaned before it is ever written to disk.
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TRIGGER trg_censor_comments
  BEFORE INSERT OR UPDATE OF content ON announcement_comments
  FOR EACH ROW
  EXECUTE FUNCTION censor_profanity();


-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Step 4: Quick sanity test (optional â€” comment out after use)
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- SELECT censor_profanity_test('putang ina mo gago ka talaga');
-- Expected: '********** ** ** **** ** talaga'
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


/* ===================================================================== */
/* FILE: supabase-address.sql */
/* ===================================================================== */

ALTER TABLE public.document_requests ADD COLUMN address text;


/* ===================================================================== */
/* FILE: supabase-admin-invites.sql */
/* ===================================================================== */

-- ============================================================
-- BARANGAY ADMIN INVITE SYSTEM
-- Purpose: Pre-approve an email address as a barangay admin.
--          When the person signs up normally, a trigger
--          automatically promotes their profile to role='barangay_admin'
--          and assigns the correct barangay. No manual editing needed.
--
-- Run this ONCE in the Supabase SQL Editor.
-- ============================================================


-- â”€â”€ 1. ADMIN INVITES TABLE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Holds pre-approved emails and their assigned barangay.
-- 'used_at' is NULL until the person actually signs up.

CREATE TABLE IF NOT EXISTS public.admin_invites (
    id          UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
    email       TEXT          NOT NULL UNIQUE,
    barangay    TEXT          NOT NULL,
    note        TEXT,         -- optional memo (e.g. "Brgy Sta. Cruz admin - Juan Dela Cruz")
    created_at  TIMESTAMPTZ   DEFAULT timezone('utc', now()) NOT NULL,
    used_at     TIMESTAMPTZ   -- NULL = pending, set when account is created
);

-- Restrict all public access â€” only Postgres / service-role can touch this table.
ALTER TABLE public.admin_invites ENABLE ROW LEVEL SECURITY;

-- Super-admins (role = 'super_admin') can view the invite list inside admin.html.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'admin_invites' AND policyname = 'Superadmins can view invites'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Superadmins can view invites"
        ON public.admin_invites
        FOR SELECT TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'super_admin'
          )
        );
    $policy$;
  END IF;
END $$;

-- Super-admins can INSERT new invites.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'admin_invites' AND policyname = 'Superadmins can create invites'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Superadmins can create invites"
        ON public.admin_invites
        FOR INSERT TO authenticated
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'super_admin'
          )
        );
    $policy$;
  END IF;
END $$;

-- Super-admins can DELETE (cancel) pending invites.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'admin_invites' AND policyname = 'Superadmins can delete invites'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Superadmins can delete invites"
        ON public.admin_invites
        FOR DELETE TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'super_admin'
          )
        );
    $policy$;
  END IF;
END $$;


-- â”€â”€ 2. TRIGGER FUNCTION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Runs BEFORE every new profile row is inserted.
-- If the new user's email matches an unused invite, their role and barangay
-- are set automatically (modifying NEW before it hits the table).

CREATE OR REPLACE FUNCTION public.fn_apply_admin_invite()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER   -- runs as the DB owner, bypassing RLS on admin_invites
SET search_path = public
AS $$
DECLARE
    v_invite public.admin_invites%ROWTYPE;
BEGIN
    -- Look for a pending invite matching this email (case-insensitive)
    SELECT *
      INTO v_invite
      FROM public.admin_invites
     WHERE lower(email) = lower(NEW.email)
       AND used_at IS NULL
     LIMIT 1;

    IF FOUND THEN
        -- Promote the profile before it is written to disk
        -- IMPORTANT: must match the exact portal_role enum value
        NEW.role     := 'barangay_admin';
        NEW.barangay := v_invite.barangay;

        -- Mark the invite as consumed so it cannot be reused
        UPDATE public.admin_invites
           SET used_at = timezone('utc', now())
         WHERE id = v_invite.id;
    END IF;

    RETURN NEW;
END;
$$;


-- â”€â”€ 3. ATTACH TRIGGER TO PROFILES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- BEFORE INSERT lets us modify NEW.role / NEW.barangay before the row is saved.

DROP TRIGGER IF EXISTS trg_apply_admin_invite ON public.profiles;

CREATE TRIGGER trg_apply_admin_invite
    BEFORE INSERT ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_apply_admin_invite();


-- â”€â”€ 4. EXAMPLE: HOW TO ADD AN INVITE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Run a statement like this whenever you want to pre-approve a new admin:
--
--   INSERT INTO public.admin_invites (email, barangay, note)
--   VALUES (
--       'juan.delacruz@gmail.com',
--       'Barangay Sta. Cruz',
--       'Assigned admin for Sta. Cruz â€” contact: 09XXXXXXXXX'
--   );
--
-- After that, the person just signs up normally via your login page.
-- Their account will automatically have role = 'barangay_admin' and the correct barangay.
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


-- â”€â”€ 5. USEFUL QUERIES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

-- View all pending (unused) invites:
-- SELECT email, barangay, note, created_at FROM public.admin_invites WHERE used_at IS NULL;

-- View all invites that have been used:
-- SELECT email, barangay, used_at FROM public.admin_invites WHERE used_at IS NOT NULL;

-- Cancel / remove an invite before the person signs up:
-- DELETE FROM public.admin_invites WHERE email = 'juan.delacruz@gmail.com';
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


/* ===================================================================== */
/* FILE: supabase-admin-messages.sql */
/* ===================================================================== */

-- ============================================================
-- admin_messages table
-- Stores messages sent by barangay admins to residents about
-- their document requests. Used by:
--   admin.js  â†’ sendMessageToResident() inserts rows
--   main.js   â†’ loadNotifications() & loadTrackMessages() reads rows
-- ============================================================

-- Create table if it doesn't exist yet
CREATE TABLE IF NOT EXISTS public.admin_messages (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_request_id uuid REFERENCES public.document_requests(id) ON DELETE SET NULL,
    recipient_email     text NOT NULL,
    subject             text,
    message             text,
    sent_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at          timestamptz DEFAULT now(),
    read_at             timestamptz DEFAULT NULL   -- NULL = unread, set when resident views notification
);

-- Add read_at column if the table already exists but the column is missing
ALTER TABLE public.admin_messages
    ADD COLUMN IF NOT EXISTS read_at timestamptz DEFAULT NULL;

-- Make sure the document_request_id column is present
-- (some earlier versions may have used a different column name)
ALTER TABLE public.admin_messages
    ADD COLUMN IF NOT EXISTS document_request_id uuid REFERENCES public.document_requests(id) ON DELETE SET NULL;

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Row Level Security
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ALTER TABLE public.admin_messages ENABLE ROW LEVEL SECURITY;

-- Residents can read only their own messages (matched by email)
DROP POLICY IF EXISTS "residents_read_own_messages" ON public.admin_messages;
CREATE POLICY "residents_read_own_messages"
    ON public.admin_messages
    FOR SELECT
    USING (recipient_email = auth.jwt() ->> 'email');

-- Residents can mark their own messages as read
DROP POLICY IF EXISTS "residents_update_read_at" ON public.admin_messages;
CREATE POLICY "residents_update_read_at"
    ON public.admin_messages
    FOR UPDATE
    USING (recipient_email = auth.jwt() ->> 'email')
    WITH CHECK (recipient_email = auth.jwt() ->> 'email');

-- Admins (barangay_admin, super_admin) can insert messages
DROP POLICY IF EXISTS "admins_insert_messages" ON public.admin_messages;
CREATE POLICY "admins_insert_messages"
    ON public.admin_messages
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
              AND role IN ('barangay_admin', 'super_admin')
        )
    );

-- Admins can read all messages they sent
DROP POLICY IF EXISTS "admins_read_messages" ON public.admin_messages;
CREATE POLICY "admins_read_messages"
    ON public.admin_messages
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
              AND role IN ('barangay_admin', 'super_admin')
        )
    );


/* ===================================================================== */
/* FILE: supabase-announcement-media.sql */
/* ===================================================================== */

-- 1. Add Media columns to announcements table
ALTER TABLE public.announcements 
ADD COLUMN IF NOT EXISTS media_url text,
ADD COLUMN IF NOT EXISTS media_type text CHECK (media_type in ('image', 'video'));

-- 2. Create the Storage Bucket for media
INSERT INTO storage.buckets (id, name, public) 
VALUES ('announcements-media', 'announcements-media', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Policy: Allow anyone (public) to view the media
CREATE POLICY "Public Access to Announcements Media"
ON storage.objects FOR SELECT
TO public
USING ( bucket_id = 'announcements-media' );

-- 4. Policy: Allow only admins to upload media
CREATE POLICY "Admins Can Upload Announcements Media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'announcements-media'
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'barangay_admin'))
);


/* ===================================================================== */
/* FILE: supabase-announcements-social.sql */
/* ===================================================================== */

-- =================================================================================
-- COMMUNITY ANNOUNCEMENTS: INTERACTIVE SOCIAL REVISION
-- This creates the likes and comments tables, plus appropriate policies.
-- Run this script in the Supabase SQL Editor.
-- =================================================================================

-- Drop existing tables if re-applying
DROP TABLE IF EXISTS public.announcement_likes;
DROP TABLE IF EXISTS public.announcement_comments;

-- 1. Create announcement_likes table
CREATE TABLE public.announcement_likes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    announcement_id UUID REFERENCES public.announcements(id) ON DELETE CASCADE,
    resident_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(announcement_id, resident_id) -- A user can only like an announcement once
);

-- 2. Create announcement_comments table
CREATE TABLE public.announcement_comments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    announcement_id UUID REFERENCES public.announcements(id) ON DELETE CASCADE,
    resident_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL CHECK (char_length(content) > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- =================================================================================
-- RLS POLICIES FOR LIKES
-- =================================================================================
ALTER TABLE public.announcement_likes ENABLE ROW LEVEL SECURITY;

-- Anyone can read likes
CREATE POLICY "Likes are viewable by everyone" ON public.announcement_likes
    FOR SELECT TO public USING (true);

-- Only authenticated users can insert a like for themselves
CREATE POLICY "Authenticated users can insert likes" ON public.announcement_likes
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = resident_id);

-- Only authenticated users can delete their own like
CREATE POLICY "Users can delete their own likes" ON public.announcement_likes
    FOR DELETE TO authenticated USING (auth.uid() = resident_id);

-- =================================================================================
-- RLS POLICIES FOR COMMENTS
-- =================================================================================
ALTER TABLE public.announcement_comments ENABLE ROW LEVEL SECURITY;

-- Anyone can read comments
CREATE POLICY "Comments are viewable by everyone" ON public.announcement_comments
    FOR SELECT TO public USING (true);

-- Only authenticated users can insert comments for themselves
CREATE POLICY "Authenticated users can insert comments" ON public.announcement_comments
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = resident_id);

-- Users can delete their own comments
CREATE POLICY "Users can delete their own comments" ON public.announcement_comments
    FOR DELETE TO authenticated USING (auth.uid() = resident_id);


/* ===================================================================== */
/* FILE: supabase-comment-edit-delete.sql */
/* ===================================================================== */

-- ============================================================
-- COMMENT EDIT & SOFT-DELETE FEATURES
-- Run this in the Supabase SQL Editor AFTER running
-- supabase-announcements-social.sql and supabase-interactive-comments.sql
-- ============================================================

-- 1. Soft-delete flag (replies are preserved; content is hidden)
ALTER TABLE public.announcement_comments
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;

-- 2. Track when a comment was last edited
ALTER TABLE public.announcement_comments
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP WITH TIME ZONE;

-- 3. JSONB array of { content, edited_at } objects â€” old versions history
ALTER TABLE public.announcement_comments
  ADD COLUMN IF NOT EXISTS edit_history JSONB DEFAULT '[]'::jsonb;

-- 4. Expose resident_id in select (needed for ownership check on frontend)
--    resident_id already exists; no ALTER needed.

-- 5. RLS: allow users to update ONLY their own comments
--    (The RLS on the table is already enabled from the social SQL)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'announcement_comments'
      AND policyname = 'Users can update their own comments'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Users can update their own comments"
        ON public.announcement_comments
        FOR UPDATE TO authenticated
        USING  (auth.uid() = resident_id)
        WITH CHECK (auth.uid() = resident_id);
    $policy$;
  END IF;
END $$;


/* ===================================================================== */
/* FILE: supabase-doc-timing.sql */
/* ===================================================================== */

-- ================================================
-- BARANGAY HUB - DOCUMENT PROCESSING TIMESTAMPS
-- ================================================
-- Adds processed_at and notified_at to track how
-- fast each barangay admin handles document requests.
-- ================================================

alter table public.document_requests
  add column if not exists processed_at timestamptz,   -- when admin clicked "Process"
  add column if not exists notified_at  timestamptz;   -- when admin sent a message to resident


/* ===================================================================== */
/* FILE: supabase-document-templates.sql */
/* ===================================================================== */

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

-- â”€â”€ Row Level Security â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€ Storage Bucket Policies â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- These set RLS on storage.objects for the "document-templates" bucket.
-- Run AFTER creating the bucket in Supabase Dashboard â†’ Storage.

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


/* ===================================================================== */
/* FILE: supabase-interactive-comments.sql */
/* ===================================================================== */

ALTER TABLE public.announcement_comments
ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.announcement_comments(id) ON DELETE CASCADE;


/* ===================================================================== */
/* FILE: supabase-issue-reports-media.sql */
/* ===================================================================== */

-- 1. Add photo column to the issue_reports table
ALTER TABLE public.issue_reports
ADD COLUMN IF NOT EXISTS photo_url text;

-- 2. Create the Storage Bucket for issue photos
INSERT INTO storage.buckets (id, name, public) 
VALUES ('issue-reports', 'issue-reports', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Policy: Allow anyone (public) to view the issue photos from this bucket
CREATE POLICY "Public Access to Issue Reports"
ON storage.objects FOR SELECT
TO public
USING ( bucket_id = 'issue-reports' );

-- 4. Policy: Allow authenticated residents to upload photos to this bucket
CREATE POLICY "Residents Can Upload Issue Reports"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'issue-reports'
);


/* ===================================================================== */
/* FILE: supabase-portal-settings.sql */
/* ===================================================================== */

-- Portal settings backing table for admin Settings panel
create table if not exists public.portal_settings (
  id integer primary key,
  city_name text not null default 'Biñan City',
  province text not null default 'Laguna',
  contact_email text,
  contact_phone text,
  primary_barangay text,
  launch_date date,
  project_status text not null default 'Active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.portal_settings (id, city_name, province, contact_email, contact_phone, primary_barangay, launch_date, project_status)
values (1, 'Biñan City', 'Laguna', 'hub@binan.gov.ph', '(049) 123-4567', 'Barangay Poblacion', date '2026-01-01', 'Active')
on conflict (id) do nothing;

alter table public.portal_settings enable row level security;

-- Public can read portal info (for non-sensitive city details)
drop policy if exists portal_settings_public_select on public.portal_settings;
create policy portal_settings_public_select
on public.portal_settings
for select
using (true);

-- Only super admins can write portal settings
drop policy if exists portal_settings_super_admin_manage on public.portal_settings;
create policy portal_settings_super_admin_manage
on public.portal_settings
for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());


/* ===================================================================== */
/* FILE: supabase-resident-verification.sql */
/* ===================================================================== */

-- ================================================
-- BARANGAY HUB - Resident Identity Verification
-- ================================================
-- Purpose:
--   1. Create a private storage bucket for resident verification documents.
--   2. Add gov_id_url and proof_of_billing_url columns to the profiles table.
--   3. Set RLS policies so residents can upload only to their own folder,
--      and admins can read any document for verification review.
-- Run this in the Supabase SQL Editor ONCE after the main schema is set up.

-- â”€â”€ Step 1: Storage Bucket â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Creates a PRIVATE bucket (public = false) so document URLs are never
-- directly accessible. Admins view them via short-lived signed URLs only.
insert into storage.buckets (id, name, public)
values ('resident-verification-docs', 'resident-verification-docs', false)
on conflict (id) do nothing;

-- â”€â”€ Step 2: Storage RLS Policies â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

-- Allow authenticated residents to upload their own documents.
-- Path convention: {userId}/gov_id.{ext} and {userId}/billing.{ext}
drop policy if exists "residents_upload_own_docs" on storage.objects;
create policy "residents_upload_own_docs"
on storage.objects for insert to public
with check (
  bucket_id = 'resident-verification-docs'
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

-- â”€â”€ Step 3: Profile Column â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Store a single path for whichever document the resident uploads:
-- Government ID OR Proof of Billing/Address.
alter table public.profiles
  add column if not exists verification_doc_url text;


/* ===================================================================== */
/* FILE: supabase-role-upgrade.sql */
/* ===================================================================== */

-- ================================================
-- BARANGAY HUB - ROLE UPGRADE (SAFE MIGRATION)
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


/* ===================================================================== */
/* FILE: supabase-service-records.sql */
/* ===================================================================== */

-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- SERVICE RECORDS â€” Verified Rating System (Option B)
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Run this entire script in your Supabase SQL Editor.
--
-- What this does:
--   1. Creates a `service_records` table. Admins log a completed
--      service linking a resident to a worker.
--   2. Drops and replaces the old open RLS policy on worker_ratings
--      so that only residents with a completed service record can rate.
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•


-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Step 1: Create service_records table
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS service_records (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id     uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  resident_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  service_date  date NOT NULL DEFAULT CURRENT_DATE,
  description   text,
  logged_by     uuid REFERENCES profiles(id),  -- the admin who logged it
  created_at    timestamptz DEFAULT now(),
  UNIQUE (worker_id, resident_id)  -- one record per resident per worker
);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Step 2: RLS for service_records
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ALTER TABLE service_records ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first so the script is safely re-runnable
DROP POLICY IF EXISTS "Residents can view own service records" ON service_records;
DROP POLICY IF EXISTS "Admins can insert service records" ON service_records;
DROP POLICY IF EXISTS "Admins can delete service records" ON service_records;
DROP POLICY IF EXISTS "Admins can view all service records" ON service_records;
DROP POLICY IF EXISTS "Admins can update service records" ON service_records;

-- Residents can only view their own
CREATE POLICY "Residents can view own service records"
  ON service_records FOR SELECT
  USING (auth.uid() = resident_id);

-- Admins can view all (required for upsert to return the row)
CREATE POLICY "Admins can view all service records"
  ON service_records FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'barangay_admin')
    )
  );

-- Admins can insert
CREATE POLICY "Admins can insert service records"
  ON service_records FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'barangay_admin')
    )
  );

-- Admins can update (required for upsert)
CREATE POLICY "Admins can update service records"
  ON service_records FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'barangay_admin')
    )
  );

-- Admins can delete
CREATE POLICY "Admins can delete service records"
  ON service_records FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'barangay_admin')
    )
  );


-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Step 3: Replace old open INSERT policy on worker_ratings
--         with a verified-service-only policy
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
DROP POLICY IF EXISTS "Resident can rate" ON worker_ratings;
DROP POLICY IF EXISTS "Resident can update own rating" ON worker_ratings;
DROP POLICY IF EXISTS "Verified resident can rate" ON worker_ratings;
DROP POLICY IF EXISTS "Verified resident can update own rating" ON worker_ratings;

-- New: INSERT only allowed if a completed service record exists
CREATE POLICY "Verified resident can rate"
  ON worker_ratings FOR INSERT
  WITH CHECK (
    auth.uid() = resident_id
    AND EXISTS (
      SELECT 1 FROM service_records
      WHERE service_records.worker_id   = worker_ratings.worker_id
        AND service_records.resident_id = auth.uid()
    )
  );

-- New: UPDATE only allowed if the same condition holds
CREATE POLICY "Verified resident can update own rating"
  ON worker_ratings FOR UPDATE
  USING (auth.uid() = resident_id)
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM service_records
      WHERE service_records.worker_id   = worker_ratings.worker_id
        AND service_records.resident_id = auth.uid()
    )
  );


/* ===================================================================== */
/* FILE: supabase-service-requests.sql */
/* ===================================================================== */

-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- SERVICE REQUESTS â€” Resident-Initiated Job Completion Requests
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Run this in your Supabase SQL Editor.
--
-- What this does:
--   1. Creates a `service_requests` table where residents can flag that
--      a job is done and request admin verification.
--   2. Sets up RLS so residents can only create/view their own requests,
--      and admins can read and update all of them.
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Step 1: Create service_requests table
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS service_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id    uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  resident_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  worker_name  text,           -- denormalized for quick admin display
  resident_name text,          -- denormalized for quick admin display
  note         text,           -- optional note from resident
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by  uuid REFERENCES profiles(id),
  created_at   timestamptz DEFAULT now(),
  reviewed_at  timestamptz,
  UNIQUE (worker_id, resident_id)  -- one pending request per pair
);

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Step 2: RLS
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ALTER TABLE service_requests ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first so the script is safely re-runnable
DROP POLICY IF EXISTS "Resident can view own service requests"     ON service_requests;
DROP POLICY IF EXISTS "Resident can submit service request"        ON service_requests;
DROP POLICY IF EXISTS "Resident can cancel own pending request"    ON service_requests;
DROP POLICY IF EXISTS "Admins can view all service requests"       ON service_requests;
DROP POLICY IF EXISTS "Admins can update service requests"         ON service_requests;

-- Residents can see their own requests
CREATE POLICY "Resident can view own service requests"
  ON service_requests FOR SELECT
  USING (auth.uid() = resident_id);

-- Residents can submit a request (INSERT)
CREATE POLICY "Resident can submit service request"
  ON service_requests FOR INSERT
  WITH CHECK (auth.uid() = resident_id);

-- Residents can delete their own pending requests (cancel)
CREATE POLICY "Resident can cancel own pending request"
  ON service_requests FOR DELETE
  USING (auth.uid() = resident_id AND status = 'pending');

-- Admins can view all requests
CREATE POLICY "Admins can view all service requests"
  ON service_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'barangay_admin')
    )
  );

-- Admins can update (approve/reject)
CREATE POLICY "Admins can update service requests"
  ON service_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'barangay_admin')
    )
  );



/* ===================================================================== */
/* FILE: supabase-worker-ratings.sql */
/* ===================================================================== */

-- ============================================================
-- WORKER RATINGS
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Ratings table (one per resident per worker)
CREATE TABLE IF NOT EXISTS worker_ratings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id     uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  resident_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating        smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at    timestamptz DEFAULT now(),
  UNIQUE (worker_id, resident_id)   -- one rating per resident per worker
);

-- 2. RLS: anyone can read, only the owner can insert/update their own rating
ALTER TABLE worker_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read worker_ratings"
  ON worker_ratings FOR SELECT USING (true);

CREATE POLICY "Resident can rate"
  ON worker_ratings FOR INSERT
  WITH CHECK (auth.uid() = resident_id);

CREATE POLICY "Resident can update own rating"
  ON worker_ratings FOR UPDATE
  USING (auth.uid() = resident_id);

-- 3. Function: recalculate avg + count on the workers table
CREATE OR REPLACE FUNCTION sync_worker_rating_stats()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE workers
  SET
    rating_avg    = (SELECT ROUND(AVG(rating)::numeric, 2) FROM worker_ratings WHERE worker_id = COALESCE(NEW.worker_id, OLD.worker_id)),
    reviews_count = (SELECT COUNT(*) FROM worker_ratings WHERE worker_id = COALESCE(NEW.worker_id, OLD.worker_id))
  WHERE id = COALESCE(NEW.worker_id, OLD.worker_id);
  RETURN NEW;
END;
$$;

-- 4. Trigger fires after every insert / update on worker_ratings
DROP TRIGGER IF EXISTS trg_sync_worker_rating ON worker_ratings;
CREATE TRIGGER trg_sync_worker_rating
  AFTER INSERT OR UPDATE ON worker_ratings
  FOR EACH ROW EXECUTE FUNCTION sync_worker_rating_stats();
