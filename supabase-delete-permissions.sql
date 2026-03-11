-- ============================================================
-- document_requests DELETE permissions & Foreign Key Fix
-- Allows admins to delete processed document requests
-- ============================================================

-- First, fix the foreign key constraint that blocks deletion.
-- If admin_messages was created without ON DELETE CASCADE, it prevents deleting the request.
ALTER TABLE public.admin_messages
  DROP CONSTRAINT IF EXISTS admin_messages_document_request_id_fkey;

ALTER TABLE public.admin_messages
  ADD CONSTRAINT admin_messages_document_request_id_fkey
  FOREIGN KEY (document_request_id)
  REFERENCES public.document_requests(id)
  ON DELETE CASCADE;

-- Drop if already exists to avoid conflict
DROP POLICY IF EXISTS "admin_delete_doc_requests" ON public.document_requests;

-- Allow Super Admins and Barangay Admins to delete document requests
-- (Barangay Admins can only delete requests within their own Barangay)
CREATE POLICY "admin_delete_doc_requests" ON public.document_requests
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role = 'super_admin'
        OR (p.role = 'barangay_admin' AND p.barangay = public.document_requests.barangay)
      )
  )
);
