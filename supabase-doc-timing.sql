-- ================================================
-- BARANGAY HUB - DOCUMENT PROCESSING TIMESTAMPS
-- ================================================
-- Adds processed_at and notified_at to track how
-- fast each barangay admin handles document requests.
-- ================================================

alter table public.document_requests
  add column if not exists processed_at timestamptz,   -- when admin clicked "Process"
  add column if not exists notified_at  timestamptz;   -- when admin sent a message to resident
