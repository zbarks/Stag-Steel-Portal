// api/login.js — POST { password } → { ok } if it matches PORTAL_PASSWORD.
// No cookie is set; the browser keeps the password and sends it as a header
// (x-portal-key) on subsequent requests.
const { checkPassword, keyFromRequest } = require('../lib/auth');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed' });
    }
    if (!checkPassword(keyFromRequest(req))) {
        return res.status(401).json({ error: 'Incorrect password' });
    }
    return res.status(200).json({ ok: true });
};
