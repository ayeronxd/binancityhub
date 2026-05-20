-- 1. Add priority column to the issue_reports table
ALTER TABLE public.issue_reports
ADD COLUMN IF NOT EXISTS priority text CHECK (priority IN ('low', 'medium', 'high')) DEFAULT 'medium';
