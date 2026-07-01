// api/login.js — POST { username, password } → sets the session cookie.
const { checkCredentials, makeSessionToken, setSessionCookie } = require('../lib/auth');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed' });
    }
    const body = req.body && typeof req.body === 'object'
        ? req.body
        : JSON.parse(req.body || '{}');

    const { username, password } = body;

    if (!checkCredentials(username, password)) {
        // Deliberately vague — don't reveal which field was wrong.
        return res.status(401).json({ error: 'Incorrect username or password' });
    }

    const token = makeSessionToken(username);
    setSessionCookie(req, res, token);
    return res.status(200).json({ ok: true });
};
