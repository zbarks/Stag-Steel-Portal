// api/session.js — GET → { authed: boolean, username? }.
// Used by the front-end on load to decide login screen vs dashboard.
const { getSession } = require('../lib/auth');

module.exports = async (req, res) => {
    const session = getSession(req);
    if (!session) return res.status(200).json({ authed: false });
    return res.status(200).json({ authed: true, username: session.u });
};
