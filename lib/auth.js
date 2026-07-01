// lib/auth.js
// Tiny stateless session: an HMAC-signed cookie. No database, no dependencies.
//
// Env vars:
//   PORTAL_USERNAME   the login username
//   PORTAL_PASSWORD   the login password
//   AUTH_SECRET       a long random string used to sign the session cookie

const crypto = require('crypto');

const COOKIE_NAME = 'ss_session';
const MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours

function secret() {
    return process.env.AUTH_SECRET || 'dev-only-insecure-secret-change-me';
}

// Constant-time string compare that won't throw on length mismatch.
function safeEqual(a, b) {
    const ab = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    if (ab.length !== bb.length) {
        // Compare against self so timing stays flat, then fail.
        crypto.timingSafeEqual(ab, ab);
        return false;
    }
    return crypto.timingSafeEqual(ab, bb);
}

function checkCredentials(username, password) {
    const U = process.env.PORTAL_USERNAME;
    const P = process.env.PORTAL_PASSWORD;
    if (!U || !P) return false;
    // Evaluate both so a wrong username doesn't return faster than a wrong password.
    const okU = safeEqual(username || '', U);
    const okP = safeEqual(password || '', P);
    return okU && okP;
}

function sign(payloadObj) {
    const payload = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
    const mac = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
    return `${payload}.${mac}`;
}

function verify(token) {
    if (!token || typeof token !== 'string' || !token.includes('.')) return null;
    const [payload, mac] = token.split('.');
    const expected = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
    if (!safeEqual(mac, expected)) return null;
    let data;
    try { data = JSON.parse(Buffer.from(payload, 'base64url').toString()); }
    catch (_) { return null; }
    if (!data || typeof data.exp !== 'number' || Date.now() > data.exp) return null;
    return data;
}

function makeSessionToken(username) {
    return sign({ u: username, exp: Date.now() + MAX_AGE_SECONDS * 1000 });
}

function parseCookies(req) {
    const header = req.headers.cookie || '';
    const out = {};
    header.split(';').forEach((pair) => {
        const i = pair.indexOf('=');
        if (i > -1) out[pair.slice(0, i).trim()] = decodeURIComponent(pair.slice(i + 1).trim());
    });
    return out;
}

function isHttps(req) {
    return (req.headers['x-forwarded-proto'] || '').split(',')[0] === 'https';
}

function setSessionCookie(req, res, token) {
    const parts = [
        `${COOKIE_NAME}=${token}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        `Max-Age=${MAX_AGE_SECONDS}`,
    ];
    if (isHttps(req)) parts.push('Secure');
    res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(req, res) {
    const parts = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
    if (isHttps(req)) parts.push('Secure');
    res.setHeader('Set-Cookie', parts.join('; '));
}

function getSession(req) {
    const cookies = parseCookies(req);
    return verify(cookies[COOKIE_NAME]);
}

// Guard for data endpoints. Returns the session, or sends 401 and returns null.
function requireAuth(req, res) {
    const session = getSession(req);
    if (!session) {
        res.status(401).json({ error: 'Not authenticated' });
        return null;
    }
    return session;
}

module.exports = {
    COOKIE_NAME,
    checkCredentials,
    makeSessionToken,
    setSessionCookie,
    clearSessionCookie,
    getSession,
    requireAuth,
};
