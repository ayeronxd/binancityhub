ALTER TABLE public.announcement_comments
ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.announcement_comments(id) ON DELETE CASCADE;
