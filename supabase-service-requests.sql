-- ═══════════════════════════════════════════════════════════════════
-- SERVICE REQUESTS — Resident-Initiated Job Completion Requests
-- ───────────────────────────────────────────────────────────────────
-- Run this in your Supabase SQL Editor.
--
-- What this does:
--   1. Creates a `service_requests` table where residents can flag that
--      a job is done and request admin verification.
--   2. Sets up RLS so residents can only create/view their own requests,
--      and admins can read and update all of them.
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- Step 1: Create service_requests table
-- ─────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────
-- Step 2: RLS
-- ─────────────────────────────────────────────────────────────
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

