// lib/royalmail.js — Royal Mail / ChannelShipper Click & Drop API.
//
// Full auto flow (ChannelShipper accounts):
//   1. POST /orders                     → import the order (ChannelShipper
//                                          Shipping Rules apply Tracked 48 postage)
//   2. GET  /orders/{id}/label          → generate label + APPLY (pay) postage,
//                                          returns the label PDF
//   3. GET  /orders/{id}                → read back the tracking number
//
// REQUIREMENT: in ChannelShipper, set a Shipping Rule (Settings → Shipping Rules)
// that applies "Royal Mail Tracked 48" + the "Parcel" package format to imported
// orders. Without applied postage, step 2 can't generate a label.
//
// Env: ROYAL_MAIL_API_KEY (required). RM_PACKAGE_FORMAT (default "Parcel").
//      RM_SERVICE_CODE (optional; normally leave blank and use a Shipping Rule).

const BASE_URL = 'https://api.parcel.royalmail.com/api/v1';

const SERVICE_LABELS = {
    'rm-tracked-48': 'Royal Mail Tracked 48',
    'rm-tracked-24': 'Royal Mail Tracked 24',
    'rm-signed-1st': 'Royal Mail Signed For 1st Class',
    'rm-signed-2nd': 'Royal Mail Signed For 2nd Class',
    'rm-special': 'Royal Mail Special Delivery',
    'other': 'Other / manual',
};
function serviceLabel(code) { return SERVICE_LABELS[code] || code; }
function isConfigured() { return !!process.env.ROYAL_MAIL_API_KEY; }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Fetch that tries the raw key, then a Bearer prefix if unauthorised.
async function rmFetch(path, options = {}) {
    const rawKey = process.env.ROYAL_MAIL_API_KEY || '';
    const call = (auth) => fetch(BASE_URL + path, {
        ...options,
        headers: { ...(options.headers || {}), Authorization: auth },
    });
    let resp = await call(rawKey);
    if (resp.status === 401 || resp.status === 403) {
        resp = await call(/^bearer /i.test(rawKey) ? rawKey : ('Bearer ' + rawKey));
    }
    return resp;
}

async function createLabel(order, serviceKey, weightGrams) {
    if (!isConfigured()) {
        const err = new Error('Royal Mail isn’t linked yet. Add ROYAL_MAIL_API_KEY to finish setup.');
        err.notConfigured = true;
        throw err;
    }

    const addr = order.shipping_address || {};
    const weight = Math.max(1, parseInt(weightGrams, 10) || 250);
    const pounds = (p) => Math.round((p || 0)) / 100;

    const serviceCode = process.env.RM_SERVICE_CODE || null; // usually blank → Shipping Rule decides
    const postageDetails = { sendNotificationsTo: 'sender' };
    if (serviceCode) postageDetails.serviceCode = serviceCode;

    // ── 1) Create the order (NO inline label — that errors; we fetch it next) ──
    const payload = {
        items: [{
            orderReference: String(order.id || order.stripe_session_id || Date.now()),
            recipient: {
                address: {
                    fullName: order.shipping_name || order.customer_name || 'Customer',
                    addressLine1: addr.line1 || '',
                    addressLine2: addr.line2 || '',
                    city: addr.city || '',
                    postcode: (addr.postal_code || '').toUpperCase(),
                    countryCode: (addr.country || 'GB'),
                },
                emailAddress: order.customer_email || undefined,
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
        }],
    };

    const createResp = await rmFetch('/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    const createData = await createResp.json().catch(() => ({}));
    if (!createResp.ok) {
        throw new Error(topError(createData) || ('Royal Mail API error ' + createResp.status));
    }
    const created = (createData.createdOrders || [])[0];
    if (!created) {
        const f = (createData.failedOrders || [])[0] || {};
        throw new Error('Royal Mail: ' + (fieldError(f) || 'order was rejected.'));
    }
    const orderId = created.orderIdentifier;

    // ── 2) Generate + pay the label, retrying briefly while the Shipping Rule
    //        applies postage to the freshly-imported order. ──
    let labelBase64 = null;
    let lastLabelErr = null;
    for (let attempt = 0; attempt < 4; attempt++) {
        if (attempt) await sleep(1500);
        const labelResp = await rmFetch(
            `/orders/${orderId}/label?documentType=postageLabel&includeReturnsLabel=false`,
            { headers: { Accept: 'application/pdf' } }
        );
        if (labelResp.ok) {
            const buf = Buffer.from(await labelResp.arrayBuffer());
            // Guard against a JSON error body sneaking through as ok.
            if (buf.slice(0, 4).toString() === '%PDF') {
                labelBase64 = buf.toString('base64');
                break;
            }
            try { lastLabelErr = topError(JSON.parse(buf.toString())); } catch (_) { lastLabelErr = null; }
        } else {
            const t = await labelResp.text().catch(() => '');
            try { lastLabelErr = topError(JSON.parse(t)); } catch (_) { lastLabelErr = t; }
        }
    }

    // ── 3) Read tracking number back from the order. ──
    let trackingNumber = created.trackingNumber || null;
    try {
        const detResp = await rmFetch(`/orders/${orderId}`);
        if (detResp.ok) {
            const det = await detResp.json().catch(() => ({}));
            const o = Array.isArray(det) ? det[0] : (det.orders ? det.orders[0] : det);
            trackingNumber = (o && (o.trackingNumber
                || (o.packages && o.packages[0] && o.packages[0].trackingNumber))) || trackingNumber;
        }
    } catch (_) { /* best effort */ }

    if (!labelBase64) {
        const e = new Error('Order imported to ChannelShipper, but the label couldn’t be generated'
            + (lastLabelErr ? ' (' + lastLabelErr + ')' : '')
            + '. Check a Shipping Rule applies Tracked 48 postage on import.');
        e.orderImported = true;
        e.orderIdentifier = orderId;
        e.trackingNumber = trackingNumber;
        throw e;
    }

    return { orderIdentifier: orderId, trackingNumber, labelBase64, labelUrl: null };
}

function topError(data) {
    if (!data) return null;
    if (data.message) return data.message;
    if (data.errors && data.errors[0]) return data.errors[0].errorMessage || data.errors[0].message;
    return null;
}
function fieldError(f) {
    if (!f) return null;
    if (f.errors && f.errors[0]) return f.errors[0].errorMessage || f.errors[0].message;
    return f.errorMessage || f.message || null;
}

module.exports = { createLabel, serviceLabel, isConfigured, SERVICE_LABELS };
