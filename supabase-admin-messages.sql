-- ============================================================
-- admin_messages table
-- Stores messages sent by barangay admins to residents about
-- their document requests. Used by:
--   admin.js  → sendMessageToResident() inserts rows
--   main.js   → loadNotifications() & loadTrackMessages() reads rows
-- ============================================================

-- Create table if it doesn't exist yet
CREATE TABLE IF NOT EXISTS public.admin_messages (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_request_id uuid REFERENCES public.document_requests(id) ON DELETE SET NULL,
    recipient_email     text NOT NULL,
    subject             text,
    message             text,
    sent_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at          timestamptz DEFAULT now(),
    read_at             timestamptz DEFAULT NULL   -- NULL = unread, set when resident views notification
);

-- Add read_at column if the table already exists but the column is missing
ALTER TABLE public.admin_messages
    ADD COLUMN IF NOT EXISTS read_at timestamptz DEFAULT NULL;

-- Make sure the document_request_id column is present
-- (some earlier versions may have used a different column name)
ALTER TABLE public.admin_messages
    ADD COLUMN IF NOT EXISTS document_request_id uuid REFERENCES public.document_requests(id) ON DELETE SET NULL;

-- ──────────────────────────────────────────────────────────────
-- Row Level Security
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.admin_messages ENABLE ROW LEVEL SECURITY;

-- Residents can read only their own messages (matched by email)
DROP POLICY IF EXISTS "residents_read_own_messages" ON public.admin_messages;
CREATE POLICY "residents_read_own_messages"
    ON public.admin_messages
    FOR SELECT
    USING (recipient_email = auth.jwt() ->> 'email');

-- Residents can mark their own messages as read
DROP POLICY IF EXISTS "residents_update_read_at" ON public.admin_messages;
CREATE POLICY "residents_update_read_at"
    ON public.admin_messages
    FOR UPDATE
    USING (recipient_email = auth.jwt() ->> 'email')
    WITH CHECK (recipient_email = auth.jwt() ->> 'email');

-- Admins (barangay_admin, super_admin) can insert messages
DROP POLICY IF EXISTS "admins_insert_messages" ON public.admin_messages;
CREATE POLICY "admins_insert_messages"
    ON public.admin_messages
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
              AND role IN ('barangay_admin', 'super_admin')
        )
    );

-- Admins can read all messages they sent
DROP POLICY IF EXISTS "admins_read_messages" ON public.admin_messages;
CREATE POLICY "admins_read_messages"
    ON public.admin_messages
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
              AND role IN ('barangay_admin', 'super_admin')
        )
    );
