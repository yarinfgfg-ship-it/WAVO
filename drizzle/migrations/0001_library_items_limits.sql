ALTER TABLE public.library_items
  ADD CONSTRAINT library_items_kind_chk CHECK (kind IN ('song','artist','liked','playlist')) NOT VALID,
  ADD CONSTRAINT library_items_key_len_chk CHECK (char_length(item_key) BETWEEN 1 AND 300) NOT VALID,
  ADD CONSTRAINT library_items_data_size_chk CHECK (pg_column_size(data) < 400000) NOT VALID;