-- ============================================================
-- STAG & STEEL — Supabase schema
-- Run this once in the Supabase SQL editor (SQL → New query → Run).
-- Used by BOTH projects:
--   • Storefront  /api/webhook.js  writes a row per completed checkout
--   • Portal      reads + updates rows (dispatch)
-- ============================================================

create table if not exists public.orders (
    id                      uuid primary key default gen_random_uuid(),

    -- Stripe references
    stripe_session_id       text unique not null,
    stripe_payment_intent   text,

    -- Customer
    customer_email          text,
    customer_name           text,

    -- Money (all in pence, GBP)
    amount_total            integer,   -- incl. shipping
    amount_subtotal         integer,   -- ex shipping
    shipping_total          integer default 0,
    currency                text default 'gbp',

    -- What sold
    items                   jsonb default '[]'::jsonb,  -- [{name, quantity, amount_total, currency}]
    skus                    jsonb default '{}'::jsonb,  -- {"tine-opener":2,"corkscrew":1}

    -- Delivery
    shipping_name           text,
    shipping_address        jsonb,     -- {line1,line2,city,postal_code,country,state}

    -- Fulfilment
    status                  text default 'paid',  -- 'paid' → 'shipped'
    shipping_service        text,      -- e.g. 'rm-tracked-48'
    tracking_number         text,
    label_url          text,
    exclude_from_revenue boolean not null default false,
    shipped_at              timestamptz,

    created_at              timestamptz default now()
);

create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_status_idx    on public.orders (status);

-- ------------------------------------------------------------
-- Row Level Security
-- Both projects connect with the SERVICE ROLE key, which bypasses RLS.
-- We enable RLS with NO public policies so nothing is readable with the
-- anon/public key. (If you ever add a public read use-case, add a policy.)
-- ------------------------------------------------------------
alter table public.orders enable row level security;

-- ------------------------------------------------------------
-- Convenience view: units sold per SKU (optional — the portal also
-- computes this in code, but handy for ad-hoc queries in Supabase).
-- ------------------------------------------------------------
create or replace view public.product_sales as
select
    sku,
    sum((qty)::int) as units_sold
from public.orders o,
     lateral jsonb_each_text(coalesce(o.skus, '{}'::jsonb)) as s(sku, qty)
group by sku
order by units_sold desc;
