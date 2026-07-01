-- Run ONCE in Supabase (SQL editor). Lets you flag freebie/gift orders so they
-- don't count toward revenue.
alter table public.orders add column if not exists exclude_from_revenue boolean not null default false;
