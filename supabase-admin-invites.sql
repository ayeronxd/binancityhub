-- ============================================================
-- BARANGAY ADMIN INVITE SYSTEM
-- Purpose: Pre-approve an email address as a barangay admin.
--          When the person signs up normally, a trigger
--          automatically promotes their profile to role='barangay_admin'
--          and assigns the correct barangay. No manual editing needed.
--
-- Run this ONCE in the Supabase SQL Editor.
-- ============================================================


-- ── 1. ADMIN INVITES TABLE ────────────────────────────────────────────────────
-- Holds pre-approved emails and their assigned barangay.
-- 'used_at' is NULL until the person actually signs up.

CREATE TABLE IF NOT EXISTS public.admin_invites (
    id          UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
    email       TEXT          NOT NULL UNIQUE,
    barangay    TEXT          NOT NULL,
    note        TEXT,         -- optional memo (e.g. "Brgy Sta. Cruz admin - Juan Dela Cruz")
    created_at  TIMESTAMPTZ   DEFAULT timezone('utc', now()) NOT NULL,
    used_at     TIMESTAMPTZ   -- NULL = pending, set when account is created
);

-- Restrict all public access — only Postgres / service-role can touch this table.
ALTER TABLE public.admin_invites ENABLE ROW LEVEL SECURITY;

-- Super-admins (role = 'super_admin') can view the invite list inside admin.html.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'admin_invites' AND policyname = 'Superadmins can view invites'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Superadmins can view invites"
        ON public.admin_invites
        FOR SELECT TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'super_admin'
          )
        );
    $policy$;
  END IF;
END $$;

-- Super-admins can INSERT new invites.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'admin_invites' AND policyname = 'Superadmins can create invites'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Superadmins can create invites"
        ON public.admin_invites
        FOR INSERT TO authenticated
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'super_admin'
          )
        );
    $policy$;
  END IF;
END $$;

-- Super-admins can DELETE (cancel) pending invites.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'admin_invites' AND policyname = 'Superadmins can delete invites'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Superadmins can delete invites"
        ON public.admin_invites
        FOR DELETE TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'super_admin'
          )
        );
    $policy$;
  END IF;
END $$;


-- ── 2. TRIGGER FUNCTION ───────────────────────────────────────────────────────
-- Runs BEFORE every new profile row is inserted.
-- If the new user's email matches an unused invite, their role and barangay
-- are set automatically (modifying NEW before it hits the table).

CREATE OR REPLACE FUNCTION public.fn_apply_admin_invite()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER   -- runs as the DB owner, bypassing RLS on admin_invites
SET search_path = public
AS $$
DECLARE
    v_invite public.admin_invites%ROWTYPE;
BEGIN
    -- Look for a pending invite matching this email (case-insensitive)
    SELECT *
      INTO v_invite
      FROM public.admin_invites
     WHERE lower(email) = lower(NEW.email)
       AND used_at IS NULL
     LIMIT 1;

    IF FOUND THEN
        -- Promote the profile before it is written to disk
        -- IMPORTANT: must match the exact portal_role enum value
        NEW.role     := 'barangay_admin';
        NEW.barangay := v_invite.barangay;

        -- Mark the invite as consumed so it cannot be reused
        UPDATE public.admin_invites
           SET used_at = timezone('utc', now())
         WHERE id = v_invite.id;
    END IF;

    RETURN NEW;
END;
$$;


-- ── 3. ATTACH TRIGGER TO PROFILES ────────────────────────────────────────────
-- BEFORE INSERT lets us modify NEW.role / NEW.barangay before the row is saved.

DROP TRIGGER IF EXISTS trg_apply_admin_invite ON public.profiles;

CREATE TRIGGER trg_apply_admin_invite
    BEFORE INSERT ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_apply_admin_invite();


-- ── 4. EXAMPLE: HOW TO ADD AN INVITE ─────────────────────────────────────────
-- Run a statement like this whenever you want to pre-approve a new admin:
--
--   INSERT INTO public.admin_invites (email, barangay, note)
--   VALUES (
--       'juan.delacruz@gmail.com',
--       'Barangay Sta. Cruz',
--       'Assigned admin for Sta. Cruz — contact: 09XXXXXXXXX'
--   );
--
-- After that, the person just signs up normally via your login page.
-- Their account will automatically have role = 'barangay_admin' and the correct barangay.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 5. USEFUL QUERIES ─────────────────────────────────────────────────────────

-- View all pending (unused) invites:
-- SELECT email, barangay, note, created_at FROM public.admin_invites WHERE used_at IS NULL;

-- View all invites that have been used:
-- SELECT email, barangay, used_at FROM public.admin_invites WHERE used_at IS NOT NULL;

-- Cancel / remove an invite before the person signs up:
-- DELETE FROM public.admin_invites WHERE email = 'juan.delacruz@gmail.com';
-- ─────────────────────────────────────────────────────────────────────────────
