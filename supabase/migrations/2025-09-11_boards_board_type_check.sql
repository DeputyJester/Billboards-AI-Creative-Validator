-- Widen board_type whitelist (NULL still allowed)
ALTER TABLE public.boards
  DROP CONSTRAINT IF EXISTS boards_board_type_check;

ALTER TABLE public.boards
  ADD CONSTRAINT boards_board_type_check
  CHECK (
    board_type IS NULL
    OR board_type IN ('Bulletin','Poster','Digital','Static','Wallscape','Transit','Mobile')
  );
