// api/debug.js — TEMPORARY. Delete this file once login works.
// Reports whether env vars are REACHING the function. Never returns values.
// Visit: https://your-portal.vercel.app/api/debug?check=1
module.exports = async (req, res) => {
    if (req.query.check !== '1') {
        return res.status(404).json({ error: 'not found' });
    }
    const show = (v) => ({
        present: typeof v === 'string' && v.length > 0,
        length: typeof v === 'string' ? v.length : 0,
        // first/last char help spot stray spaces or a chopped-off symbol
        firstChar: v ? v[0] : null,
        lastChar: v ? v[v.length - 1] : null,
    });
    res.status(200).json({
        note: 'lengths/edges only, no secret values. delete this file after debugging.',
        PORTAL_USERNAME: show(process.env.PORTAL_USERNAME),
        PORTAL_PASSWORD: show(process.env.PORTAL_PASSWORD),
        AUTH_SECRET: show(process.env.AUTH_SECRET),
        SUPABASE_URL: show(process.env.SUPABASE_URL),
        SUPABASE_SERVICE_ROLE_KEY: show(process.env.SUPABASE_SERVICE_ROLE_KEY),
        STRIPE_SECRET_KEY: show(process.env.STRIPE_SECRET_KEY),
    });
};
