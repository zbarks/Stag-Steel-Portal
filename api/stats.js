// api/stats.js — GET → dashboard summary. Auth required.
//
// Primary numbers come from Supabase (the orders the webhook stored).
// If STRIPE_SECRET_KEY is set, we also attach the live Stripe balance.

const { requireAuth } = require('../lib/auth');
const { getSupabase } = require('../lib/supabase');

// Friendly names for the SKUs the storefront sells.
const SKU_NAMES = {
    'tine-opener': 'The Tine Opener',
    'stem-opener': 'The Stem Opener',
    'corkscrew': 'The Corkscrew',
    'the-set': 'The Set',
};

module.exports = async (req, res) => {
    if (!requireAuth(req, res)) return;

    try {
        const supabase = getSupabase();
        const { data: orders, error } = await supabase
            .from('orders')
            .select('amount_total, amount_subtotal, shipping_total, currency, skus, status, created_at')
            .order('created_at', { ascending: false });

        if (error) throw error;

        const rows = orders || [];

        let revenuePence = 0;      // gross, incl. shipping
        let productRevenue = 0;    // ex shipping
        let unitsSold = 0;
        let awaitingDispatch = 0;
        const perSku = {};         // sku -> { units, revenuePence }
        const byDay = {};          // 'YYYY-MM-DD' -> orders count (last 14 days)

        // last 14 days buckets
        const today = new Date();
        for (let i = 13; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);
            byDay[d.toISOString().slice(0, 10)] = 0;
        }

        for (const o of rows) {
            revenuePence += o.amount_total || 0;
            productRevenue += (o.amount_subtotal != null ? o.amount_subtotal : (o.amount_total || 0));
            if (o.status !== 'shipped') awaitingDispatch += 1;

            const day = (o.created_at || '').slice(0, 10);
            if (day in byDay) byDay[day] += 1;

            const skus = o.skus && typeof o.skus === 'object' ? o.skus : {};
            for (const [sku, qty] of Object.entries(skus)) {
                const q = Number(qty) || 0;
                unitsSold += q;
                if (!perSku[sku]) perSku[sku] = { units: 0 };
                perSku[sku].units += q;
            }
        }

        const products = Object.entries(perSku)
            .map(([sku, v]) => ({ sku, name: SKU_NAMES[sku] || sku, units: v.units }))
            .sort((a, b) => b.units - a.units);

        const sparkline = Object.entries(byDay).map(([date, count]) => ({ date, count }));

        // Optional: live Stripe balance
        let stripeBalance = null;
        if (process.env.STRIPE_SECRET_KEY) {
            try {
                const Stripe = require('stripe');
                const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
                const bal = await stripe.balance.retrieve();
                const sum = (arr) => (arr || []).reduce((s, b) => s + (b.amount || 0), 0);
                stripeBalance = {
                    available: sum(bal.available),
                    pending: sum(bal.pending),
                    currency: (bal.available && bal.available[0] && bal.available[0].currency) || 'gbp',
                };
            } catch (e) {
                // Non-fatal — dashboard still works without it.
                stripeBalance = null;
            }
        }

        return res.status(200).json({
            currency: 'gbp',
            revenuePence,
            productRevenuePence: productRevenue,
            orders: rows.length,
            unitsSold,
            awaitingDispatch,
            products,
            sparkline,
            stripeBalance,
        });
    } catch (err) {
        console.error('stats error:', err);
        return res.status(500).json({ error: err.message || 'Failed to load stats' });
    }
};
