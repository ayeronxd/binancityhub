-- ================================================
-- BINAN CITY HUB - SUPABASE SCHEMA (Production)
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

  insert into public.profiles (id, full_name, email, phone, role, barangay)
  values (
    new.id,
    full_name_value,
    new.email,
    new.raw_user_meta_data ->> 'phone',
    'resident',
    barangay_value
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    email = excluded.email,
    phone = excluded.phone,
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
create policy "public_read_workers" on public.workers for select using (is_active = true);
create policy "public_read_announcements" on public.announcements for select using (true);
create policy "public_read_barangays" on public.barangays for select using (true);

-- Profiles
create policy "profiles_select_own" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles_update_own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "admin_view_profiles" on public.profiles for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'super_admin'
        or (p.role = 'barangay_admin' and p.barangay = public.profiles.barangay)
      )
  )
);

create policy "super_admin_manage_profiles" on public.profiles for all to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'));

-- Document requests
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

create policy "resident_select_own_doc_requests" on public.document_requests for select to authenticated
using (resident_id = auth.uid());

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
create policy "resident_insert_issue_reports" on public.issue_reports for insert to authenticated
with check (resident_id = auth.uid());

create policy "resident_select_own_issue_reports" on public.issue_reports for select to authenticated
using (resident_id = auth.uid());

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

-- Workers and announcements management
create policy "admin_manage_workers" on public.workers for all to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('super_admin','barangay_admin')))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('super_admin','barangay_admin')));

create policy "admin_manage_announcements" on public.announcements for all to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('super_admin','barangay_admin')))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('super_admin','barangay_admin')));

create policy "admin_manage_barangays" on public.barangays for all to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'));

-- Allow reading analytics view
grant select on public.v_barangay_analytics to anon, authenticated;

-- Seed 24 barangays
insert into public.barangays (name, status)
values
('Barangay Poblacion','active'),
('Barangay San Antonio','active'),
('Barangay Biñan','active'),
('Barangay Canlalay','active'),
('Barangay Dela Paz Norte','active'),
('Barangay Dela Paz Sur','active'),
('Barangay Ganado','active'),
('Barangay Langkiwa','active'),
('Barangay Loma','active'),
('Barangay Santo Tomas','active'),
('Barangay Malamig','active'),
('Barangay Casile','active'),
('Barangay Zapote','active'),
('Barangay Tubigan','active'),
('Barangay Bungahan','active'),
('Barangay Soro-Soro','active'),
('Barangay Timbao','active'),
('Barangay Platero','active'),
('Barangay San Francisco','active'),
('Barangay Mamplasan','active'),
('Barangay Sto. Niño','active'),
('Barangay Langgam','active'),
('Barangay Macabling','active'),
('Barangay San Vicente','active')
on conflict (name) do nothing;


