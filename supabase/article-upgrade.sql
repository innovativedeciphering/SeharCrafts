-- Run on existing stores in Supabase SQL Editor. Safe to rerun.
begin;
alter table public.products
  add column if not exists article text not null default ''
  check (length(article) <= 80);
notify pgrst, 'reload schema';
commit;
