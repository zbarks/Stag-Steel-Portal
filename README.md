# Stag & Steel — Orders Portal

A private, password-protected dashboard for the Stag & Steel shop. It reads
orders straight from Supabase (written by the storefront's Stripe webhook) and
shows revenue, units sold, per-product breakdown, and a dispatch queue. Optional
live Stripe balance panel on top.

This is a **separate Vercel project** from the storefront. Same lightweight
stack (static front-end + Vercel serverless functions) — no Next.js, no PostHog.

---

## Access

No login. The dashboard loads as soon as you open the portal URL.

The data endpoints still carry a built-in access key (hardcoded in `lib/auth.js`
and `portal.js`, currently `stagsteel`) so `/api/orders` isn't wide open to
anyone who guesses the URL — but this is light protection, not real security.
Since the orders table holds customer names and addresses, **keep the repo
private and don't share the portal URL.** If you ever want a real login back,
say the word.

## Environment variables (Vercel → Portal project → Settings → Env Vars)

| Var | What it is | Required |
|-----|-----------|----------|
| `PORTAL_PASSWORD` | The one login password | ✅ |
| `SUPABASE_URL` | Your Supabase project URL — **same project as the storefront** | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key (server-side only) | ✅ |
| `STRIPE_SECRET_KEY` | Only for the live balance panel (read-only). Leave out to hide it | ⬜ |
| `ROYAL_MAIL_API_KEY` | Not used yet — dispatch labels, next step | ⬜ |
| `ROYAL_MAIL_ACCOUNT_ID` | Not used yet | ⬜ |

Defaults for the three I picked are in `.env.example`.

---

## Setup

1. **Supabase** — if you haven't already for the storefront, create a project
   and run `supabase-schema.sql` (in this repo, also shipped with the storefront)
   in the SQL editor. Both projects share this one database.
2. **Deploy** this folder as a new Vercel project.
3. Add the env vars above.
4. Visit the deployment URL → log in.

The portal and storefront both point at the **same Supabase project**. The
storefront's webhook writes orders; the portal reads and updates them.

---

## Pages

- **Overview** — revenue, orders, units, awaiting-dispatch, sold-by-product, 14-day chart, live Stripe balance. A green **Live** pill shows the store connection is active; the dashboard auto-refreshes every 20s.
- **Orders** — every order; click one to see the customer/address/items and dispatch it.
- **Custom order** — create a bespoke/off-site order by hand; it then behaves like any other order (you can print a label for it).

## Dispatch & Royal Mail

Open an order → choose a service + weight → **Print shipping label**. You're asked
to confirm (labels are paid), then the portal calls the Royal Mail Click & Drop
API, saves the tracking number, opens the label PDF, and marks the order sent.
There's a "enter tracking by hand" fallback too. Needs `ROYAL_MAIL_API_KEY` — see
setup. Incoming orders are NEVER auto-labelled; nothing is bought until you press
the button and confirm.

## What it shows

- **Revenue**, total orders, units sold, and how many are **awaiting dispatch**
- **Sold by product** — units + revenue per SKU
- **14-day sparkline** of daily revenue
- **Live Stripe balance** (if `STRIPE_SECRET_KEY` is set)
- **Orders table** — filter by all / paid / shipped; click a row for full detail
  (customer, address, line items) and to mark it shipped

## Marking an order shipped

Open an order → enter a Royal Mail service + tracking number → **Mark shipped**.
Right now this saves the tracking number to Supabase and flips the order to
`shipped`. It does **not** yet buy a label or email the customer — that's the
next step (see below). You can un-ship an order if you make a mistake.

---

## Royal Mail — deferred (next step)

`lib/royalmail.js` is a stub. The ship form is fully wired end-to-end into
Supabase, but the actual label-buying call is a TODO. When you send me your
Royal Mail Click & Drop / Shipping API details (`ROYAL_MAIL_API_KEY`,
`ROYAL_MAIL_ACCOUNT_ID`), I'll drop the real call into that one file — nothing
else has to change. A customer "your order's shipped" email can go in at the
same time (Resend, like Hepple).

---

## Files

```
api/
  login.js     POST — checks credentials, sets session cookie
  logout.js    POST — clears session
  session.js   GET  — am I logged in?
  stats.js     GET  — revenue / units / awaiting-dispatch / per-SKU / sparkline / Stripe balance
  orders.js    GET  — order list (most recent first)
  ship.js      POST — mark shipped (via royalmail stub) / un-ship
lib/
  auth.js      Signed-cookie sessions, constant-time credential check
  supabase.js  Cached service-role client
  royalmail.js STUB — dispatch labels go here next
index.html     Login screen + dashboard
portal.css     Styling (brand palette)
portal.js      Front-end logic
supabase-schema.sql   Run once in Supabase (shared with storefront)
```
