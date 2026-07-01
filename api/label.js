// api/label.js — POST { id, service, weightGrams } → create a Royal Mail
// label for the order, save tracking + mark it shipped.
const { requireAuth } = require('../lib/auth');
const { getSupabase } = require('../lib/supabase');
const { createLabel, serviceLabel } = require('../lib/royalmail');

module.exports = async (req, res) => {
    if (!requireAuth(req, res)) return;

    const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    const { id, service, weightGrams } = body;
    if (!id) return res.status(400).json({ error: 'Missing order id' });

    try {
        const supabase = getSupabase();

        const { data: order, error: getErr } = await supabase
            .from('orders').select('*').eq('id', id).single();
        if (getErr || !order) throw new Error('Order not found');

        // Buy the label from Royal Mail.
        const result = await createLabel(order, service, weightGrams);

        // Mark shipped + store tracking/label.
        const { error: upErr } = await supabase.from('orders').update({
            status: 'shipped',
            shipping_service: service,
            tracking_number: result.trackingNumber,
            label_url: result.labelUrl || null,
            shipped_at: new Date().toISOString(),
        }).eq('id', id);
        if (upErr) throw upErr;

        return res.status(200).json({
            ok: true,
            trackingNumber: result.trackingNumber,
            labelUrl: result.labelUrl,
            labelBase64: result.labelBase64,
            service: serviceLabel(service),
        });
    } catch (err) {
        console.error('label error:', err);
        // Order made it into ChannelShipper but the API couldn't generate the
        // paid label (e.g. account not permitted / no postage billing yet).
        // That's not a hard failure — return 200 so the portal shows a calm
        // "go finish in ChannelShipper" message instead of a red error.
        if (err.orderImported) {
            return res.status(200).json({
                ok: true,
                imported: true,
                labelGenerated: false,
                trackingNumber: err.trackingNumber || null,
                message: err.message,
            });
        }
        const code = err.notConfigured ? 400 : 500;
        return res.status(code).json({ error: err.message || 'Could not create label' });
    }
};
