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
