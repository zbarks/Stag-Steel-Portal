// api/create-order.js — POST → create a manual/custom order in Supabase.
// Used by the "Custom order" page for bespoke pieces or off-site sales.
const { requireAuth } = require('../lib/auth');
const { getSupabase } = require('../lib/supabase');

module.exports = async (req, res) => {
    if (!requireAuth(req, res)) return;

    const body = req.body && typeof req.body === 'object'
        ? req.body
        : JSON.parse(req.body || '{}');

    const name = (body.customer_name || '').trim();
    if (!name) return res.status(400).json({ error: 'Customer name is required.' });

    const itemsText = (body.items_text || '').trim();
    const items = itemsText ? [{ name: itemsText, quantity: 1, amount_total: body.amount_total || 0 }] : [];

    const order = {
        // A stable synthetic id so custom orders don't collide with Stripe ones.
        stripe_session_id: 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        stripe_payment_intent: null,
        customer_email: body.customer_email || null,
        customer_name: name,
        amount_total: Number(body.amount_total) || 0,
        amount_subtotal: Math.max(0, (Number(body.amount_total) || 0) - (Number(body.shipping_total) || 0)),
        shipping_total: Number(body.shipping_total) || 0,
        currency: 'gbp',
        items,
        skus: {},
        shipping_name: name,
        shipping_address: body.shipping_address || null,
        status: 'paid', // awaiting dispatch
        exclude_from_revenue: !!body.exclude_from_revenue,
    };

    try {
        const supabase = getSupabase();
        const { data, error } = await supabase.from('orders').insert(order).select().single();
        if (error) throw error;
        return res.status(200).json({ ok: true, order: data });
    } catch (err) {
        console.error('create-order error:', err);
        return res.status(500).json({ error: err.message || 'Could not create order' });
    }
};
