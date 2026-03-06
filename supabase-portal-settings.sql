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
