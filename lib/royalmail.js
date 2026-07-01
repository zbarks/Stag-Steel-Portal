// lib/royalmail.js — Royal Mail Click & Drop API integration.
//
// Creates an order in Click & Drop and (where the account supports it)
// generates a shipping label PDF, returning the tracking number + label.
//
// Docs: https://api.parcel.royalmail.com/api/v1  (Click & Drop API v1)
// Auth: an API key from Click & Drop → Settings → Integrations → your
//       integration → "authentication key". Sent as an Authorization header.
//
// IMPORTANT — label PDFs via the API:
//   Creating the ORDER works on any Click & Drop account. Getting the LABEL
//   PDF back in the API response requires a label-enabled account tier
//   (ChannelShipper, or Pro Shipping for higher volume). If your account can't
//   return the PDF, the order is still created in Click & Drop and you generate
//   the label there with one click. See the walkthrough for account setup.
//
// Env vars (portal project):
//   ROYAL_MAIL_API_KEY   the Click & Drop integration auth key
//   RM_SENDER_NAME, RM_SENDER_LINE1, RM_SENDER_CITY, RM_SENDER_POSTCODE (optional
//     — used as the order/trading reference; return address is set by the
//     trading name on your Click & Drop account)

const BASE_URL = 'https://api.parcel.royalmail.com/api/v1';

// Portal service code → Royal Mail Click & Drop service code.
const SERVICE_CODES = {
    'rm-tracked-24': 'TPN24',   // Tracked 24
    'rm-tracked-48': 'TPS48',   // Tracked 48
    'rm-signed-1st': 'BPL1',    // 1st Class Signed For
    'rm-signed-2nd': 'BPR2',    // 2nd Class Signed For
    'rm-special':    'SD1',     // Special Delivery Guaranteed by 1pm
};

const SERVICE_LABELS = {
    'rm-tracked-24': 'Royal Mail Tracked 24',
    'rm-tracked-48': 'Royal Mail Tracked 48',
    'rm-signed-1st': 'Royal Mail Signed For 1st Class',
    'rm-signed-2nd': 'Royal Mail Signed For 2nd Class',
    'rm-special': 'Royal Mail Special Delivery',
    'other': 'Other / manual',
};
function serviceLabel(code) { return SERVICE_LABELS[code] || code; }

function isConfigured() { return !!process.env.ROYAL_MAIL_API_KEY; }

// Create a shipment/label for one order.
// order: the Supabase order row. serviceKey: portal service code. weightGrams: number|string.
// Returns { trackingNumber, labelUrl|null, orderIdentifier }.
async function createLabel(order, serviceKey, weightGrams) {
    if (!isConfigured()) {
        const err = new Error('Royal Mail isn’t linked yet. Add ROYAL_MAIL_API_KEY to finish setup.');
        err.notConfigured = true;
        throw err;
    }

    const addr = order.shipping_address || {};
    const weight = Math.max(1, parseInt(weightGrams, 10) || 250);
    const pounds = (p) => Math.round((p || 0)) / 100;

    // Service code: prefer an explicit env override, else the mapping, else
    // omit entirely and let the Click & Drop integration's DEFAULT POSTAGE
    // (set to Tracked 48 in the C&D UI) decide. Omitting avoids wrong-code
    // rejections and is the reliable pattern for a single-service shop.
    const serviceCode = process.env.RM_SERVICE_CODE || SERVICE_CODES[serviceKey] || null;
    const postageDetails = { sendNotificationsTo: 'sender' };
    if (serviceCode) postageDetails.serviceCode = serviceCode;

    const payload = {
        items: [{
            orderReference: String(order.id || order.stripe_session_id || Date.now()),
            recipient: {
                address: {
                    fullName: order.shipping_name || order.customer_name || 'Customer',
                    addressLine1: addr.line1 || '',
                    addressLine2: addr.line2 || '',
                    city: addr.city || '',
                    postcode: addr.postal_code || '',
                    countryCode: (addr.country || 'GB'),
                },
                emailAddress: order.customer_email || undefined,
            },
            billing: {
                address: {
                    fullName: order.shipping_name || order.customer_name || 'Customer',
                    addressLine1: addr.line1 || '',
                    city: addr.city || '',
                    postcode: addr.postal_code || '',
                    countryCode: (addr.country || 'GB'),
                },
            },
            packages: [{ weightInGrams: weight, packageFormatIdentifier: 'parcel' }],
            orderDate: new Date().toISOString(),
            subtotal: pounds(order.amount_subtotal != null ? order.amount_subtotal : order.amount_total),
            shippingCostCharged: pounds(order.shipping_total),
            total: pounds(order.amount_total),
            currencyCode: 'GBP',
            postageDetails,
            // Ask C&D to include the label if the account supports it (ChannelShipper).
            label: { includeLabelInResponse: true, includeCN: false, includeReturnsLabel: false },
        }],
    };

    const resp = await fetch(BASE_URL + '/orders', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': process.env.ROYAL_MAIL_API_KEY,
        },
        body: JSON.stringify(payload),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
        const msg = (data && (data.message || (data.errors && data.errors[0] && data.errors[0].errorMessage)))
            || ('Royal Mail API error ' + resp.status);
        throw new Error(msg);
    }

    const created = (data.createdOrders && data.createdOrders[0]) || {};
    const trackingNumber = created.trackingNumber
        || (created.packages && created.packages[0] && created.packages[0].trackingNumber)
        || null;
    // Some accounts return the label as base64/URL; expose whatever we get.
    const labelUrl = created.label && (created.label.url || null);

    return {
        orderIdentifier: created.orderIdentifier || null,
        trackingNumber,
        labelUrl,
        raw: created,
    };
}

module.exports = { createLabel, serviceLabel, isConfigured, SERVICE_CODES, SERVICE_LABELS };
