-- ============================================================
-- COMMENT EDIT & SOFT-DELETE FEATURES
-- Run this in the Supabase SQL Editor AFTER running
-- supabase-announcements-social.sql and supabase-interactive-comments.sql
-- ============================================================

-- 1. Soft-delete flag (replies are preserved; content is hidden)
ALTER TABLE public.announcement_comments
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;

-- 2. Track when a comment was last edited
ALTER TABLE public.announcement_comments
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP WITH TIME ZONE;

-- 3. JSONB array of { content, edited_at } objects — old versions history
ALTER TABLE public.announcement_comments
  ADD COLUMN IF NOT EXISTS edit_history JSONB DEFAULT '[]'::jsonb;

-- 4. Expose resident_id in select (needed for ownership check on frontend)
--    resident_id already exists; no ALTER needed.

-- 5. RLS: allow users to update ONLY their own comments
--    (The RLS on the table is already enabled from the social SQL)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'announcement_comments'
      AND policyname = 'Users can update their own comments'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Users can update their own comments"
        ON public.announcement_comments
        FOR UPDATE TO authenticated
        USING  (auth.uid() = resident_id)
        WITH CHECK (auth.uid() = resident_id);
    $policy$;
  END IF;
END $$;
