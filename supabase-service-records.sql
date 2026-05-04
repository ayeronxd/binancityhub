-- ═══════════════════════════════════════════════════════════════════
-- SERVICE RECORDS — Verified Rating System (Option B)
-- ───────────────────────────────────────────────────────────────────
-- Run this entire script in your Supabase SQL Editor.
--
-- What this does:
--   1. Creates a `service_records` table. Admins log a completed
--      service linking a resident to a worker.
--   2. Drops and replaces the old open RLS policy on worker_ratings
--      so that only residents with a completed service record can rate.
-- ═══════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- Step 1: Create service_records table
-- ─────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────
-- Step 2: RLS for service_records
-- ─────────────────────────────────────────────────────────────
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


-- ─────────────────────────────────────────────────────────────
-- Step 3: Replace old open INSERT policy on worker_ratings
--         with a verified-service-only policy
-- ─────────────────────────────────────────────────────────────
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
