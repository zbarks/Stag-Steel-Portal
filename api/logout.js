// api/logout.js — POST → clears the session cookie.
const { clearSessionCookie } = require('../lib/auth');

module.exports = async (req, res) => {
    clearSessionCookie(req, res);
    return res.status(200).json({ ok: true });
};
