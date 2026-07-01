// api/orders.js — GET → recent orders (full detail). Auth required.
const { requireAuth } = require('../lib/auth');
const { getSupabase } = require('../lib/supabase');

module.exports = async (req, res) => {
    if (!requireAuth(req, res)) return;

    try {
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(500);

        if (error) throw error;
        return res.status(200).json({ orders: data || [] });
    } catch (err) {
        console.error('orders error:', err);
        return res.status(500).json({ error: err.message || 'Failed to load orders' });
    }
};
