// lib/auth.js
// Dead-simple system-password auth. No cookies, no tokens, nothing to expire.
// The password lives ONLY in the PORTAL_PASSWORD env var (server-side).
// The browser sends it as an `x-portal-key` header on every request; each
// protected endpoint checks it here. Over HTTPS this is perfectly fine for a
// single-admin internal tool.

const crypto = require('crypto');

// Constant-time compare that won't throw on length mismatch.
function safeEqual(a, b) {
    const ab = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    if (ab.length !== bb.length) {
        crypto.timingSafeEqual(ab, ab); // keep timing flat
        return false;
    }
    return crypto.timingSafeEqual(ab, bb);
}

// True if the supplied password matches PORTAL_PASSWORD.
function checkPassword(password) {
    const P = process.env.PORTAL_PASSWORD;
    if (!P) return false;
    return safeEqual(password || '', P);
}

// Reads the password from either the x-portal-key header (normal API calls)
// or a JSON body { password } (the login call).
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

// Guard for data endpoints. Returns true if OK, else sends 401 and returns false.
function requireAuth(req, res) {
    if (checkPassword(keyFromRequest(req))) return true;
    res.status(401).json({ error: 'Not authorised' });
    return false;
}

module.exports = { checkPassword, keyFromRequest, requireAuth, safeEqual };
