// api/logout.js — no server state to clear; the browser forgets the password.
module.exports = async (req, res) => res.status(200).json({ ok: true });
