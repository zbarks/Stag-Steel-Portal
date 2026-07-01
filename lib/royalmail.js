// lib/royalmail.js
// ────────────────────────────────────────────────────────────────────────────
// STUB — NOT WIRED YET.
//
// Right now this does NOT talk to Royal Mail. It just returns a placeholder so
// the "Mark as shipped" flow works end to end: the tracking number you type in
// the portal is saved to Supabase, and the order flips to "shipped".
//
// NEXT STEP (once you've given me the Royal Mail details):
//   - Royal Mail Click & Drop "Shipping API" (or the OBA API) needs an API key.
//   - We'll create a shipment/order from the address + weight + service, get
//     back a tracking number + a label PDF URL, and store those instead of the
//     manually-typed tracking number.
//
// Expected env vars (placeholders for now — add when we wire it):
//   ROYAL_MAIL_API_KEY
//   ROYAL_MAIL_ACCOUNT_ID   (if required by the chosen API)
// ────────────────────────────────────────────────────────────────────────────

const SERVICES = {
    'rm-tracked-24': 'Royal Mail Tracked 24',
    'rm-tracked-48': 'Royal Mail Tracked 48',
    'rm-signed-1st': 'Royal Mail Signed For 1st Class',
    'rm-signed-2nd': 'Royal Mail Signed For 2nd Class',
    'rm-special':    'Royal Mail Special Delivery',
    'other':         'Other / manual',
};

function serviceLabel(code) {
    return SERVICES[code] || code || 'Royal Mail';
}

/**
 * createShipment — placeholder.
 * @returns {Promise<{ok:boolean, stub:boolean, tracking:(string|null), labelUrl:(string|null)}>}
 */
async function createShipment({ order, service, weightGrams, manualTracking }) {
    // TODO(next): real Royal Mail API call here.
    // For now we simply pass through whatever tracking number was typed in.
    return {
        ok: true,
        stub: true,
        tracking: manualTracking || null,
        labelUrl: null,
    };
}

module.exports = { createShipment, serviceLabel, SERVICES };
