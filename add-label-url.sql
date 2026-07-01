-- Run this ONCE in Supabase (SQL editor) if you already created the orders
-- table before the "print label" feature was added.
alter table public.orders add column if not exists label_url text;
