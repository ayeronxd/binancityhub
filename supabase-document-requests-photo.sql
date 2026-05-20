-- Add photo_url column to the document_requests table
ALTER TABLE public.document_requests
ADD COLUMN IF NOT EXISTS photo_url text;
