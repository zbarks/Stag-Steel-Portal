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

    // Service code: only send one if you've EXPLICITLY set RM_SERVICE_CODE.
    // Otherwise omit it and let your ChannelShipper account's default postage /
    // shipping rule apply the service (set that to Tracked 48). Guessing codes
    // gets them rejected, so by default we don't.
    const serviceCode = process.env.RM_SERVICE_CODE || null;
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
            packages: [{
                weightInGrams: weight,
                packageFormatIdentifier: process.env.RM_PACKAGE_FORMAT || 'Parcel',
            }],
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

    const rawKey = process.env.ROYAL_MAIL_API_KEY || '';
    const body = JSON.stringify(payload);

    async function post(authValue) {
        return fetch(BASE_URL + '/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': authValue },
            body,
        });
    }

    // ChannelShipper docs just say "pass the auth key in the header" without
    // being explicit about a Bearer prefix. Try the raw key first; if that's
    // rejected as unauthorised, retry with "Bearer " — so either form works.
    let resp = await post(rawKey);
    if (resp.status === 401 || resp.status === 403) {
        resp = await post(/^bearer /i.test(rawKey) ? rawKey : ('Bearer ' + rawKey));
    }

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
        const msg = (data && (data.message || (data.errors && data.errors[0] && data.errors[0].errorMessage)))
            || ('Royal Mail API error ' + resp.status);
        throw new Error(msg);
    }

    // Royal Mail can return HTTP 200 but still FAIL the order (validation etc.).
    // Detect that and surface the real reason instead of silently "succeeding".
    const createdList = data.createdOrders || [];
    const failedList = data.failedOrders || [];
    if (!createdList.length) {
        const f = failedList[0] || {};
        const reason =
            (f.errors && f.errors[0] && (f.errors[0].errorMessage || f.errors[0].message))
            || f.errorMessage || f.message || data.message
            || 'Royal Mail rejected the order (no detail returned).';
        throw new Error('Royal Mail: ' + reason);
    }

    const created = createdList[0] || {};
    const trackingNumber = created.trackingNumber
        || (created.packages && created.packages[0] && created.packages[0].trackingNumber)
        || null;

    // ChannelShipper can return the label. It may arrive as a URL or as base64
    // under a few possible field names — capture whatever we get.
    const label = created.label || {};
    const labelUrl = label.url || label.labelUrl || null;
    const labelBase64 = label.pdf || label.labelPdf || label.document || label.base64
        || (typeof label === 'string' ? label : null) || null;

    return {
        orderIdentifier: created.orderIdentifier || null,
        trackingNumber,
        labelUrl,
        labelBase64,
        raw: created,
    };
}

module.exports = { createLabel, serviceLabel, isConfigured, SERVICE_CODES, SERVICE_LABELS };
