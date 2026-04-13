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
