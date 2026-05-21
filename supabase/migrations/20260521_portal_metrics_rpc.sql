-- Consolidates portal/admin dashboard counts into one RPC call and adds
-- indexes for the filters used most often by the Vercel frontend.

create index if not exists idx_profiles_role_created_at
  on public.profiles (role, created_at);

create index if not exists idx_profiles_barangay_role
  on public.profiles (barangay, role);

create index if not exists idx_document_requests_status_created_at
  on public.document_requests (status, created_at);

create index if not exists idx_document_requests_barangay_created_at
  on public.document_requests (barangay, created_at desc);

create index if not exists idx_issue_reports_status_created_at
  on public.issue_reports (status, created_at);

create index if not exists idx_issue_reports_barangay_created_at
  on public.issue_reports (barangay, created_at desc);

create index if not exists idx_workers_active_created_at
  on public.workers (is_active, created_at);

create index if not exists idx_workers_barangay_active
  on public.workers (barangay, is_active);

create or replace function public.get_portal_metrics(p_barangay text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with bounds as (
  select
    date_trunc('month', now()) as current_start,
    date_trunc('month', now()) - interval '1 month' as previous_start,
    date_trunc('month', now()) + interval '1 month' as next_start
),
barangay_rows as (
  select name, residents, docs, workers, status
  from public.v_barangay_analytics
  where p_barangay is null or name = p_barangay
  order by name
),
totals as (
  select
    (select count(*) from public.profiles p
      where p.role = 'resident'
        and (p_barangay is null or p.barangay = p_barangay)) as residents,
    (select count(*) from public.document_requests d
      where d.status in ('approved', 'completed', 'archived')
        and (p_barangay is null or d.barangay = p_barangay)) as docs,
    (select count(*) from public.workers w
      where w.is_active = true
        and (p_barangay is null or w.barangay = p_barangay)) as workers,
    (select count(*) from public.issue_reports i
      where i.status <> 'resolved'
        and (p_barangay is null or i.barangay = p_barangay)) as unresolved_reports,
    (select count(*) from barangay_rows) as barangays
),
trends as (
  select
    (select count(*) from public.profiles p, bounds b
      where p.role = 'resident'
        and p.created_at >= b.current_start
        and p.created_at < b.next_start
        and (p_barangay is null or p.barangay = p_barangay)) as residents_current_month,
    (select count(*) from public.profiles p, bounds b
      where p.role = 'resident'
        and p.created_at >= b.previous_start
        and p.created_at < b.current_start
        and (p_barangay is null or p.barangay = p_barangay)) as residents_previous_month,
    (select count(*) from public.document_requests d, bounds b
      where d.status in ('approved', 'completed', 'archived')
        and d.created_at >= b.current_start
        and d.created_at < b.next_start
        and (p_barangay is null or d.barangay = p_barangay)) as docs_current_month,
    (select count(*) from public.document_requests d, bounds b
      where d.status in ('approved', 'completed', 'archived')
        and d.created_at >= b.previous_start
        and d.created_at < b.current_start
        and (p_barangay is null or d.barangay = p_barangay)) as docs_previous_month,
    (select count(*) from public.workers w, bounds b
      where w.is_active = true
        and w.created_at >= b.current_start
        and w.created_at < b.next_start
        and (p_barangay is null or w.barangay = p_barangay)) as workers_current_month,
    (select count(*) from public.workers w, bounds b
      where w.is_active = true
        and w.created_at >= b.previous_start
        and w.created_at < b.current_start
        and (p_barangay is null or w.barangay = p_barangay)) as workers_previous_month,
    (select count(*) from public.issue_reports i, bounds b
      where i.created_at >= b.current_start
        and i.created_at < b.next_start
        and (p_barangay is null or i.barangay = p_barangay)) as issues_current_month,
    (select count(*) from public.issue_reports i, bounds b
      where i.created_at >= b.previous_start
        and i.created_at < b.current_start
        and (p_barangay is null or i.barangay = p_barangay)) as issues_previous_month
)
select jsonb_build_object(
  'barangays',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'name', name,
            'residents', residents,
            'docs', docs,
            'workers', workers,
            'status', status
          )
          order by name
        )
        from barangay_rows
      ),
      '[]'::jsonb
    ),
  'totals',
    (select jsonb_build_object(
      'residents', residents,
      'docs', docs,
      'workers', workers,
      'unresolvedReports', unresolved_reports,
      'barangays', barangays
    ) from totals),
  'trends',
    (select jsonb_build_object(
      'residentsCurrentMonth', residents_current_month,
      'residentsPreviousMonth', residents_previous_month,
      'docsCurrentMonth', docs_current_month,
      'docsPreviousMonth', docs_previous_month,
      'workersCurrentMonth', workers_current_month,
      'workersPreviousMonth', workers_previous_month,
      'issuesCurrentMonth', issues_current_month,
      'issuesPreviousMonth', issues_previous_month
    ) from trends)
);
$$;

grant execute on function public.get_portal_metrics(text) to anon, authenticated;
