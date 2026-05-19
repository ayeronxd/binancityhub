-- ============================================================
-- FILE: supabase-health-schedules.sql
-- DESCRIPTION: Creates the health_schedules table for storing
--              per-barangay health center activity schedules.
--              These schedules are displayed on the resident
--              portal's Announcements page sidebar and can be
--              managed by barangay admins from the Admin Dashboard.
--
-- HOW TO RUN:
--   1. Go to your Supabase project → SQL Editor
--   2. Paste this entire file and click "Run"
--
-- CREATED: 2026-05-19
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- STEP 1: Create the health_schedules table
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS health_schedules (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  barangay     TEXT        NOT NULL,
  day_of_week  TEXT        NOT NULL,
  activity     TEXT        NOT NULL,
  sort_order   INTEGER     DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT now()
);


-- ────────────────────────────────────────────────────────────
-- STEP 2: Enable Row Level Security
-- ────────────────────────────────────────────────────────────
ALTER TABLE health_schedules ENABLE ROW LEVEL SECURITY;


-- ────────────────────────────────────────────────────────────
-- STEP 3: RLS Policies
-- ────────────────────────────────────────────────────────────

-- Anyone (including guests) can read schedules on the portal
CREATE POLICY "Public read health_schedules"
  ON health_schedules
  FOR SELECT
  USING (true);

-- Only authenticated admins can insert, update, or delete
CREATE POLICY "Admin write health_schedules"
  ON health_schedules
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('barangay_admin', 'super_admin')
    )
  );


-- ────────────────────────────────────────────────────────────
-- STEP 4: Optional — Seed sample data for demonstration
--         Remove or comment out before going to production.
-- ────────────────────────────────────────────────────────────
INSERT INTO health_schedules (barangay, day_of_week, activity, sort_order) VALUES
  ('Barangay Poblacion', 'Monday',    'Baby Immunization & Vaccines',        1),
  ('Barangay Poblacion', 'Wednesday', 'Pre-natal & Maternity Checkups',      2),
  ('Barangay Poblacion', 'Friday',    'Senior Citizen Wellness & Meds',      3),

  ('Barangay San Isidro', 'Tuesday',   'General Checkups & Consultations',   1),
  ('Barangay San Isidro', 'Thursday',  'Baby Immunization & Vaccines',       2),
  ('Barangay San Isidro', 'Saturday',  'Dental Mission (1st Sat of month)',  3),

  ('Barangay San Jose', 'Monday',    'Senior Citizen Wellness',              1),
  ('Barangay San Jose', 'Wednesday', 'Baby Immunization',                   2),
  ('Barangay San Jose', 'Friday',    'Family Planning & Counseling',         3);
