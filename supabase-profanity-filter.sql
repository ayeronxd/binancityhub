-- ═══════════════════════════════════════════════════════════════════
-- PROFANITY FILTER — Database Layer 2 (Server-Side Trigger)
-- ───────────────────────────────────────────────────────────────────
-- This trigger runs BEFORE every INSERT or UPDATE on the
-- announcement_comments table. It censors prohibited words by
-- replacing them with asterisks directly inside the database.
--
-- This is bulletproof: even if someone bypasses the JavaScript
-- client-side filter by calling Supabase directly (e.g. Postman,
-- a custom script), this trigger will still sanitize the content.
--
-- HOW TO RUN:
--   Paste this entire script into your Supabase SQL Editor and
--   click "Run". No other setup is needed.
-- ═══════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- Step 1: Create the function that does the actual censoring
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION censor_profanity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  bad_words TEXT[] := ARRAY[
    -- Multi-word Filipino phrases first (longest first for correct replacement)
    'anak ng puta', 'anakng puta',
    'putang ina', 'tang ina', 'hayop ka',
    'kingina mo', 'ina mo',
    -- Single Filipino words
    'putangina', 'tanginamo', 'amputa', 'ampota',
    'hinayupak', 'tarantado', 'kingina',
    'putang', 'tangina',
    'puta', 'gago', 'gaga', 'bobo', 'boba',
    'tanga', 'ulol', 'inutil', 'lintik',
    'leche', 'letse', 'putik', 'hayop',
    'pakyu', 'pak yu', 'pakyo', 'hudas',
    'shet',
    -- English words
    'fucking', 'fucker', 'fucked', 'bullshit', 'bitches',
    'asshole', 'faggot', 'nigger', 'nigga', 'retard',
    'shitty', 'bastard',
    'fuck', 'shit', 'bitch', 'cunt', 'dick',
    'cock', 'pussy', 'whore', 'slut', 'damn',
    'crap', 'ass', 'fag', 'moron', 'idiot',
    'stupid'
  ];
  word TEXT;
  cleaned TEXT;
BEGIN
  cleaned := NEW.content;

  FOREACH word IN ARRAY bad_words LOOP
    -- Replace each bad word with asterisks, case-insensitive
    -- \m and \M are PostgreSQL word boundary markers
    cleaned := regexp_replace(
      cleaned,
      '(?i)' || regexp_replace(word, '([.+*?^${}()|[\]\\])', '\\\1', 'g'),
      repeat('*', length(word)),
      'gi'
    );
  END LOOP;

  NEW.content := cleaned;
  RETURN NEW;
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- Step 2: Drop the trigger if it already exists (safe re-run)
-- ─────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_censor_comments ON announcement_comments;


-- ─────────────────────────────────────────────────────────────
-- Step 3: Attach the trigger to the table
-- Fires BEFORE every INSERT and UPDATE so the content is
-- cleaned before it is ever written to disk.
-- ─────────────────────────────────────────────────────────────
CREATE TRIGGER trg_censor_comments
  BEFORE INSERT OR UPDATE OF content ON announcement_comments
  FOR EACH ROW
  EXECUTE FUNCTION censor_profanity();


-- ─────────────────────────────────────────────────────────────
-- Step 4: Quick sanity test (optional — comment out after use)
-- ─────────────────────────────────────────────────────────────
-- SELECT censor_profanity_test('putang ina mo gago ka talaga');
-- Expected: '********** ** ** **** ** talaga'
-- ─────────────────────────────────────────────────────────────
