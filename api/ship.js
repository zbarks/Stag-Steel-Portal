// api/ship.js — POST → mark an order shipped / un-shipped. Auth required.
//
// Body:
//   { id, service, tracking, weightGrams }   → mark shipped
//   { id, action: 'unship' }                 → revert to paid
//
// The Royal Mail label API is stubbed (see lib/royalmail.js). For now the
// tracking number you type is saved as-is and the order flips to "shipped".

const { requireAuth } = require('../lib/auth');
const { getSupabase } = require('../lib/supabase');
const royalmail = require('../lib/royalmail');

module.exports = async (req, res) => {
    if (!requireAuth(req, res)) return;
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const body = req.body && typeof req.body === 'object'
        ? req.body
        : JSON.parse(req.body || '{}');

    const { id, action, service, tracking, weightGrams } = body;
    if (!id) return res.status(400).json({ error: 'Missing order id' });

    try {
        const supabase = getSupabase();

        // Revert to unshipped
        if (action === 'unship') {
            const { data, error } = await supabase
                .from('orders')
                .update({ status: 'paid', shipped_at: null, tracking_number: null, shipping_service: null })
                .eq('id', id)
                .select()
                .single();
            if (error) throw error;
            return res.status(200).json({ ok: true, order: data });
        }

        // Mark shipped — grab the order for the address/weight
        const { data: order, error: fetchErr } = await supabase
            .from('orders').select('*').eq('id', id).single();
        if (fetchErr) throw fetchErr;
        if (!order) return res.status(404).json({ error: 'Order not found' });

        // Royal Mail (stubbed — passes the manual tracking straight through)
        const shipment = await royalmail.createShipment({
            order,
            service,
            weightGrams: Number(weightGrams) || null,
            manualTracking: tracking || null,
        });

        const { data, error } = await supabase
            .from('orders')
            .update({
                status: 'shipped',
                shipped_at: new Date().toISOString(),
                tracking_number: shipment.tracking || tracking || null,
                shipping_service: service || null,
            })
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;

        return res.status(200).json({ ok: true, order: data, royalMailStub: !!shipment.stub });
    } catch (err) {
        console.error('ship error:', err);
        return res.status(500).json({ error: err.message || 'Failed to update order' });
    }
};
