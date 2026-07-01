// lib/supabase.js
// Server-side Supabase client using the service-role key.
// This key bypasses row-level security, so it must NEVER be exposed to the
// browser — only ever imported inside /api serverless functions.

const { createClient } = require('@supabase/supabase-js');

let cached = null;

function getSupabase() {
    if (cached) return cached;
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
    }
    cached = createClient(url, key, { auth: { persistSession: false } });
    return cached;
}

module.exports = { getSupabase };
