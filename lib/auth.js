// lib/auth.js
// System-password auth, DELIBERATELY hardcoded so there is no env var to get
// wrong. The password below is the whole gate. To change it, edit this one
// line and redeploy. No cookies, no tokens, no PORTAL_PASSWORD variable.

const crypto = require('crypto');

// ── THE PASSWORD ─────────────────────────────────────────────────────
const PASSWORD = 'stagsteel';
// ─────────────────────────────────────────────────────────────────────

function safeEqual(a, b) {
    const ab = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    if (ab.length !== bb.length) { crypto.timingSafeEqual(ab, ab); return false; }
    return crypto.timingSafeEqual(ab, bb);
}

function checkPassword(password) {
    return safeEqual(password || '', PASSWORD);
}

function keyFromRequest(req) {
    const hdr = req.headers['x-portal-key'];
    if (hdr) return hdr;
    if (req.body) {
        const body = typeof req.body === 'object' ? req.body
            : (() => { try { return JSON.parse(req.body); } catch (_) { return {}; } })();
        if (body && body.password) return body.password;
    }
    return '';
}

function requireAuth(req, res) {
    if (checkPassword(keyFromRequest(req))) return true;
    res.status(401).json({ error: 'Not authorised' });
    return false;
}

module.exports = { checkPassword, keyFromRequest, requireAuth, safeEqual, PASSWORD };
