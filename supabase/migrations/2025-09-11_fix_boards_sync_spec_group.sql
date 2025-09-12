-- Persist current working version of boards_sync_spec_group()
CREATE OR REPLACE FUNCTION public.boards_sync_spec_group()
RETURNS trigger
LANGUAGE plpgsql
AS \\$
DECLARE
  v_id uuid;
  v_cnt int;
BEGIN
  -- If user provided a spec_group string, find/create exact (org + name + size)
  IF NEW.spec_group IS NOT NULL AND trim(NEW.spec_group) <> '' THEN
    SELECT id INTO v_id
    FROM public.spec_groups
    WHERE organization_id = NEW.organization_id
      AND name = NEW.spec_group
      AND COALESCE(width_px,-1) = COALESCE(NEW.width_px,-1)
      AND COALESCE(height_px,-1)= COALESCE(NEW.height_px,-1)
    LIMIT 1;

    IF v_id IS NULL THEN
      INSERT INTO public.spec_groups (name, width_px, height_px, organization_id, board_type)
      VALUES (NEW.spec_group, NEW.width_px, NEW.height_px, NEW.organization_id, NEW.board_type)
      ON CONFLICT (organization_id, name, width_px, height_px) DO NOTHING
      RETURNING id INTO v_id;

      IF v_id IS NULL THEN
        SELECT id INTO v_id
        FROM public.spec_groups
        WHERE organization_id = NEW.organization_id
          AND name = NEW.spec_group
          AND COALESCE(width_px,-1) = COALESCE(NEW.width_px,-1)
          AND COALESCE(height_px,-1)= COALESCE(NEW.height_px,-1)
        LIMIT 1;
      END IF;
    END IF;

    NEW.spec_group_id := v_id;

    -- If the catalog has a board_type and NEW.board_type is empty, copy it down
    IF NEW.board_type IS NULL THEN
      SELECT board_type INTO NEW.board_type FROM public.spec_groups WHERE id = NEW.spec_group_id;
    END IF;

  ELSIF NEW.spec_group_id IS NOT NULL THEN
    -- Mirror text & type from referenced catalog row
    SELECT name, board_type INTO NEW.spec_group, NEW.board_type
    FROM public.spec_groups WHERE id = NEW.spec_group_id;

  ELSE
    -- No spec_group provided: try a unique match by (org + size + board_type)
    IF NEW.board_type IS NOT NULL THEN
      SELECT COUNT(*), MIN(id) INTO v_cnt, v_id
      FROM public.spec_groups
      WHERE organization_id = NEW.organization_id
        AND COALESCE(width_px,-1)  = COALESCE(NEW.width_px,-1)
        AND COALESCE(height_px,-1) = COALESCE(NEW.height_px,-1)
        AND board_type = NEW.board_type;

      IF v_cnt = 1 THEN
        NEW.spec_group_id := v_id;
        SELECT name INTO NEW.spec_group FROM public.spec_groups WHERE id = v_id;
      END IF;
    ELSE
      -- Fallback: only if exactly one mapping exists for that size
      SELECT COUNT(*), MIN(id) INTO v_cnt, v_id
      FROM public.spec_groups
      WHERE organization_id = NEW.organization_id
        AND COALESCE(width_px,-1)  = COALESCE(NEW.width_px,-1)
        AND COALESCE(height_px,-1) = COALESCE(NEW.height_px,-1);

      IF v_cnt = 1 THEN
        NEW.spec_group_id := v_id;
        SELECT name, board_type INTO NEW.spec_group, NEW.board_type
        FROM public.spec_groups WHERE id = v_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
\\$;
