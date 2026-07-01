// api/debug.js — TEMPORARY. Delete once everything works.
// Confirms the Supabase/Stripe env vars are reaching the function.
module.exports = async (req, res) => {
    if (req.query.check !== '1') return res.status(404).json({ error: 'not found' });
    const show = (v) => ({ present: typeof v === 'string' && v.length > 0, length: v ? v.length : 0 });
    res.status(200).json({
        note: 'lengths only, no values. delete this file after debugging.',
        SUPABASE_URL: show(process.env.SUPABASE_URL),
        SUPABASE_SERVICE_ROLE_KEY: show(process.env.SUPABASE_SERVICE_ROLE_KEY),
        STRIPE_SECRET_KEY: show(process.env.STRIPE_SECRET_KEY),
    });
};
