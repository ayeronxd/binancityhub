-- =================================================================================
-- COMMUNITY ANNOUNCEMENTS: INTERACTIVE SOCIAL REVISION
-- This creates the likes and comments tables, plus appropriate policies.
-- Run this script in the Supabase SQL Editor.
-- =================================================================================

-- Drop existing tables if re-applying
DROP TABLE IF EXISTS public.announcement_likes;
DROP TABLE IF EXISTS public.announcement_comments;

-- 1. Create announcement_likes table
CREATE TABLE public.announcement_likes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    announcement_id UUID REFERENCES public.announcements(id) ON DELETE CASCADE,
    resident_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(announcement_id, resident_id) -- A user can only like an announcement once
);

-- 2. Create announcement_comments table
CREATE TABLE public.announcement_comments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    announcement_id UUID REFERENCES public.announcements(id) ON DELETE CASCADE,
    resident_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL CHECK (char_length(content) > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- =================================================================================
-- RLS POLICIES FOR LIKES
-- =================================================================================
ALTER TABLE public.announcement_likes ENABLE ROW LEVEL SECURITY;

-- Anyone can read likes
CREATE POLICY "Likes are viewable by everyone" ON public.announcement_likes
    FOR SELECT TO public USING (true);

-- Only authenticated users can insert a like for themselves
CREATE POLICY "Authenticated users can insert likes" ON public.announcement_likes
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = resident_id);

-- Only authenticated users can delete their own like
CREATE POLICY "Users can delete their own likes" ON public.announcement_likes
    FOR DELETE TO authenticated USING (auth.uid() = resident_id);

-- =================================================================================
-- RLS POLICIES FOR COMMENTS
-- =================================================================================
ALTER TABLE public.announcement_comments ENABLE ROW LEVEL SECURITY;

-- Anyone can read comments
CREATE POLICY "Comments are viewable by everyone" ON public.announcement_comments
    FOR SELECT TO public USING (true);

-- Only authenticated users can insert comments for themselves
CREATE POLICY "Authenticated users can insert comments" ON public.announcement_comments
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = resident_id);

-- Users can delete their own comments
CREATE POLICY "Users can delete their own comments" ON public.announcement_comments
    FOR DELETE TO authenticated USING (auth.uid() = resident_id);
