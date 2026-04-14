-- ============================================================
-- WORKER RATINGS
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Ratings table (one per resident per worker)
CREATE TABLE IF NOT EXISTS worker_ratings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id     uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  resident_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating        smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at    timestamptz DEFAULT now(),
  UNIQUE (worker_id, resident_id)   -- one rating per resident per worker
);

-- 2. RLS: anyone can read, only the owner can insert/update their own rating
ALTER TABLE worker_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read worker_ratings"
  ON worker_ratings FOR SELECT USING (true);

CREATE POLICY "Resident can rate"
  ON worker_ratings FOR INSERT
  WITH CHECK (auth.uid() = resident_id);

CREATE POLICY "Resident can update own rating"
  ON worker_ratings FOR UPDATE
  USING (auth.uid() = resident_id);

-- 3. Function: recalculate avg + count on the workers table
CREATE OR REPLACE FUNCTION sync_worker_rating_stats()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE workers
  SET
    rating_avg    = (SELECT ROUND(AVG(rating)::numeric, 2) FROM worker_ratings WHERE worker_id = COALESCE(NEW.worker_id, OLD.worker_id)),
    reviews_count = (SELECT COUNT(*) FROM worker_ratings WHERE worker_id = COALESCE(NEW.worker_id, OLD.worker_id))
  WHERE id = COALESCE(NEW.worker_id, OLD.worker_id);
  RETURN NEW;
END;
$$;

-- 4. Trigger fires after every insert / update on worker_ratings
DROP TRIGGER IF EXISTS trg_sync_worker_rating ON worker_ratings;
CREATE TRIGGER trg_sync_worker_rating
  AFTER INSERT OR UPDATE ON worker_ratings
  FOR EACH ROW EXECUTE FUNCTION sync_worker_rating_stats();
