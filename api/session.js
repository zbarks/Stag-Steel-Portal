// api/session.js — GET with x-portal-key header → { authed: boolean }.
// Lets the front-end confirm a stored password is still valid on load.
const { checkPassword, keyFromRequest } = require('../lib/auth');

module.exports = async (req, res) => {
    return res.status(200).json({ authed: checkPassword(keyFromRequest(req)) });
};
