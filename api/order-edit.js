// api/order-edit.js — POST { id, action } → admin actions on an order.
//   action: 'delete'          → remove the order
//   action: 'exclude'         → set exclude_from_revenue = value (true/false)
const { requireAuth } = require('../lib/auth');
const { getSupabase } = require('../lib/supabase');

module.exports = async (req, res) => {
    if (!requireAuth(req, res)) return;

    const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    const { id, action, value } = body;
    if (!id) return res.status(400).json({ error: 'Missing order id' });

    try {
        const supabase = getSupabase();

        if (action === 'delete') {
            const { error } = await supabase.from('orders').delete().eq('id', id);
            if (error) throw error;
            return res.status(200).json({ ok: true, deleted: true });
        }

        if (action === 'exclude') {
            const { error } = await supabase
                .from('orders')
                .update({ exclude_from_revenue: !!value })
                .eq('id', id);
            if (error) throw error;
            return res.status(200).json({ ok: true, exclude_from_revenue: !!value });
        }

        return res.status(400).json({ error: 'Unknown action' });
    } catch (err) {
        console.error('order-edit error:', err);
        return res.status(500).json({ error: err.message || 'Could not update order' });
    }
};
