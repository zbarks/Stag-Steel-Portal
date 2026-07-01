# Stag & Steel — Orders Portal

A private, password-protected dashboard for the Stag & Steel shop. It reads
orders straight from Supabase (written by the storefront's Stripe webhook) and
shows revenue, units sold, per-product breakdown, and a dispatch queue. Optional
live Stripe balance panel on top.

This is a **separate Vercel project** from the storefront. Same lightweight
stack (static front-end + Vercel serverless functions) — no Next.js, no PostHog.

---

## Login

I set these for you (change any time — update here *and* in Vercel):

```
Username:  stagadmin
Password:  Redwood-5337664529#
```

Login is a signed, httpOnly cookie (`ss_session`, 8-hour expiry). Credentials
are checked with a constant-time compare against the env vars below, so nothing
is hard-coded in the shipped files.

---

## Environment variables (Vercel → Portal project → Settings → Env Vars)

| Var | What it is | Required |
|-----|-----------|----------|
| `PORTAL_USERNAME` | Login username | ✅ |
| `PORTAL_PASSWORD` | Login password | ✅ |
| `AUTH_SECRET` | Long random string that signs the login cookie | ✅ |
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
