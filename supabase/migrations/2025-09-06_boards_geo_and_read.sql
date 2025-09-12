-- 1) Add new columns on boards
ALTER TABLE public.boards
  ADD COLUMN IF NOT EXISTS face_direction text,              -- e.g., N, NE, E, SE, S, SW, W, NW
  ADD COLUMN IF NOT EXISTS face_read text,                    -- e.g., LHR/RHR or “left/right read”
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS zipcode text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS county text,
  ADD COLUMN IF NOT EXISTS geopath_id text;

-- 2) (Optional) Create a usable point for mapping (if you want)
--    You can add PostGIS later; keeping it simple with numeric lat/lng for now.

-- 3) Helpful indexes (fast lookups & dedupe support)
CREATE INDEX IF NOT EXISTS boards_org_geopath_idx ON public.boards (organization_id, geopath_id);
CREATE INDEX IF NOT EXISTS boards_city_state_idx ON public.boards (state, city);
CREATE INDEX IF NOT EXISTS boards_lat_idx ON public.boards (latitude);
CREATE INDEX IF NOT EXISTS boards_lng_idx ON public.boards (longitude);

-- 4) (Optional) Basic sanity checks you can add later:
-- ALTER TABLE public.boards
--   ADD CONSTRAINT latitude_range CHECK (latitude BETWEEN -90 AND 90),
--   ADD CONSTRAINT longitude_range CHECK (longitude BETWEEN -180 AND 180);
