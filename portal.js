/* ============================================================
   STAG & STEEL — Orders portal (front-end)
   ============================================================ */
(function () {
    'use strict';

    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

    let ORDERS = [];
    let FILTER = 'all';

    const SERVICES = {
        'rm-tracked-48': 'Royal Mail Tracked 48',
        'rm-tracked-24': 'Royal Mail Tracked 24',
        'rm-signed-1st': 'Royal Mail Signed For 1st Class',
        'rm-signed-2nd': 'Royal Mail Signed For 2nd Class',
        'rm-special': 'Royal Mail Special Delivery',
        'other': 'Other / manual',
    };

    // ---------- helpers ----------
    const gbp = (pence) => '£' + ((pence || 0) / 100).toFixed(2);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    function fmtDate(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) +
            ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    }
    function fmtDay(iso) {
        const d = new Date(iso + 'T00:00:00');
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    }

    function toast(msg, isError) {
        const t = $('#toast');
        t.textContent = msg;
        t.classList.toggle('error', !!isError);
        t.hidden = false;
        requestAnimationFrame(() => t.classList.add('show'));
        clearTimeout(toast._t);
        toast._t = setTimeout(() => {
            t.classList.remove('show');
            setTimeout(() => { t.hidden = true; }, 300);
        }, 3200);
    }

    // Built-in access key — baked in, sent automatically on every request.
    // Matches the value in lib/auth.js. No login screen, no password prompt.
    const KEY = 'stagsteel';

    async function api(path, opts) {
        const o = Object.assign({ headers: {} }, opts);
        o.headers = Object.assign({ 'Content-Type': 'application/json', 'x-portal-key': KEY }, o.headers);
        const res = await fetch(path, o);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const err = new Error(data.error || ('HTTP ' + res.status));
            err.status = res.status;
            throw err;
        }
        return data;
    }

    // ---------- screens ----------
    function showApp() { $('#app').hidden = false; }

    // No login flow — the dashboard loads directly.

    // ---------- routing ----------
    function route() {
        const hash = (location.hash || '#/overview').replace('#/', '');
        const view = ['overview', 'orders', 'custom'].includes(hash) ? hash : 'overview';
        ['overview', 'orders', 'custom'].forEach((v) => {
            const el = document.getElementById('view-' + v);
            if (el) el.hidden = (v !== view);
        });
        $$('.navlink').forEach((a) => a.classList.toggle('is-active', a.dataset.nav === view));
    }

    // ---------- live status ----------
    function setLive(state) {
        const pill = document.getElementById('livePill');
        if (!pill) return;
        pill.classList.remove('is-live', 'is-down');
        const txt = pill.querySelector('.live-text');
        if (state === 'live') { pill.classList.add('is-live'); txt.textContent = 'Live'; }
        else if (state === 'down') { pill.classList.add('is-down'); txt.textContent = 'Offline'; }
        else { txt.textContent = 'Connecting…'; }
    }

    // ---------- custom order ----------
    async function createCustomOrder() {
        const btn = document.getElementById('createOrderBtn');
        const err = document.getElementById('customError');
        err.hidden = true;
        const val = (id) => (document.getElementById(id).value || '').trim();
        const name = val('cName');
        if (!name) { err.textContent = 'Add a customer name.'; err.hidden = false; return; }
        const toPence = (v) => Math.round((parseFloat(v) || 0) * 100);
        const payload = {
            customer_name: name,
            customer_email: val('cEmail') || null,
            items_text: val('cItems'),
            amount_total: toPence(val('cTotal')),
            shipping_total: toPence(val('cShip')),
            shipping_address: {
                line1: val('cA1'), line2: val('cA2') || null,
                city: val('cCity'), postal_code: val('cPost'), country: 'GB',
            },
        };
        btn.disabled = true; btn.textContent = 'Creating…';
        try {
            await api('/api/create-order', { method: 'POST', body: JSON.stringify(payload) });
            toast('Custom order created');
            ['cName', 'cEmail', 'cItems', 'cTotal', 'cShip', 'cA1', 'cA2', 'cCity', 'cPost']
                .forEach((id) => { document.getElementById(id).value = ''; });
            await loadDashboard();
            location.hash = '#/orders';
        } catch (e) {
            err.textContent = e.message || 'Could not create order';
            err.hidden = false;
        } finally {
            btn.disabled = false; btn.textContent = 'Create order';
        }
    }

    function showBanner(msg) {
        let b = document.getElementById('dataBanner');
        if (!b) {
            b = document.createElement('div');
            b.id = 'dataBanner';
            b.style.cssText = 'margin:0 0 16px;padding:12px 16px;border-radius:8px;'
                + 'background:#f8ece1;color:#8a4b2f;'
                + 'border:1px solid #e2c3ad;font-size:14px;';
            const app = document.getElementById('app');
            app.insertBefore(b, app.firstChild);
        }
        b.textContent = msg;
        b.hidden = false;
    }
    function clearBanner() { const b = document.getElementById('dataBanner'); if (b) b.hidden = true; }

    // ---------- dashboard ----------
    async function loadDashboard() {
        try {
            const [stats, ordersRes] = await Promise.all([api('/api/stats'), api('/api/orders')]);
            clearBanner();
            setLive('live');
            ORDERS = ordersRes.orders || [];
            renderStats(stats);
            renderProducts(stats.products);
            renderSparkline(stats.sparkline);
            renderStripe(stats.stripeBalance);
            renderOrders();
        } catch (e) {
            setLive('down');
            if (e.status === 401) {
                showBanner('Data request was rejected (401). Check the access key in lib/auth.js matches portal.js, then redeploy.');
            } else {
                showBanner('Couldn’t load orders: ' + (e.message || 'unknown error')
                    + '. If this mentions a missing table, run supabase-schema.sql in Supabase.');
            }
        }
    }

    function renderStats(s) {
        const cards = [
            { label: 'Revenue', value: gbp(s.revenuePence), serif: true },
            { label: 'Orders', value: s.orders },
            { label: 'Units sold', value: s.unitsSold },
            { label: 'Awaiting dispatch', value: s.awaitingDispatch, attention: s.awaitingDispatch > 0 },
        ];
        $('#statCards').innerHTML = cards.map((c) => `
            <div class="stat${c.attention ? ' attention' : ''}">
                <div class="label">${c.label}</div>
                <div class="value">${c.value}</div>
            </div>`).join('');
    }

    function renderProducts(products) {
        const el = $('#productTable');
        if (!products || !products.length) {
            el.innerHTML = '<div class="mini-row"><span class="name" style="color:var(--mist)">Nothing sold yet.</span></div>';
            return;
        }
        el.innerHTML = products.map((p) => `
            <div class="mini-row">
                <span class="name">${esc(p.name)}</span>
                <span class="count">${p.units}<small>sold</small></span>
            </div>`).join('');
    }

    function renderSparkline(spark) {
        const el = $('#sparkline');
        if (!spark || !spark.length) { el.innerHTML = ''; return; }
        const max = Math.max(1, ...spark.map((d) => d.count));
        el.innerHTML = spark.map((d) => {
            const h = Math.round((d.count / max) * 100);
            return `<div class="spark-bar${d.count ? ' has-orders' : ''}" style="height:${Math.max(3, h)}%" title="${fmtDay(d.date)}: ${d.count} order${d.count === 1 ? '' : 's'}"></div>`;
        }).join('');
        // labels (first + last)
        const labels = document.createElement('div');
        labels.className = 'spark-labels';
        labels.innerHTML = `<span>${fmtDay(spark[0].date)}</span><span>${fmtDay(spark[spark.length - 1].date)}</span>`;
        el.after(labels);
        // avoid stacking labels on refresh
        const prev = el.parentNode.querySelectorAll('.spark-labels');
        if (prev.length > 1) prev[0].remove();
    }

    function renderStripe(bal) {
        const el = $('#stripeBalance');
        if (!bal) { el.innerHTML = '<span>Connect Stripe to show your live balance here.</span>'; return; }
        el.innerHTML = `
            <span>Stripe available <b>${gbp(bal.available)}</b></span>
            <span>Pending <b>${gbp(bal.pending)}</b></span>`;
    }

    function itemsSummary(o) {
        const items = Array.isArray(o.items) ? o.items : [];
        if (!items.length) return '—';
        return items.map((i) => `${i.quantity}× ${esc(i.name)}`).join(', ');
    }

    function renderOrders() {
        const rows = ORDERS.filter((o) => FILTER === 'all' ? true : (o.status === FILTER));
        const table = $('#ordersTable');
        const empty = $('#ordersEmpty');
        if (!rows.length) {
            table.innerHTML = '';
            empty.hidden = false;
            empty.textContent = ORDERS.length
                ? 'No orders match this filter.'
                : "No orders yet. They'll appear here the moment a checkout completes.";
            return;
        }
        empty.hidden = true;
        table.innerHTML = rows.map((o) => `
            <div class="order-row" data-id="${esc(o.id)}">
                <span class="o-date">${fmtDate(o.created_at)}</span>
                <span class="o-cust">
                    <span class="name">${esc(o.customer_name || o.shipping_name || 'Customer')}</span><br>
                    <span class="email">${esc(o.customer_email || '')}</span>
                </span>
                <span class="o-items">${itemsSummary(o)}</span>
                <span class="o-total">${gbp(o.amount_total)}</span>
                <span class="o-status ${o.status === 'shipped' ? 'shipped' : 'paid'}">${o.status === 'shipped' ? 'Shipped' : 'To send'}</span>
            </div>`).join('');
        $$('.order-row', table).forEach((row) => {
            row.addEventListener('click', () => openDrawer(row.dataset.id));
        });
    }

    // ---------- drawer ----------
    function openDrawer(id) {
        const o = ORDERS.find((x) => String(x.id) === String(id));
        if (!o) return;
        const addr = o.shipping_address || {};
        const addrLines = [
            o.shipping_name || o.customer_name,
            addr.line1, addr.line2,
            [addr.city, addr.postal_code].filter(Boolean).join(' '),
            addr.country,
        ].filter(Boolean).map(esc).join('<br>');

        const items = Array.isArray(o.items) ? o.items : [];
        const itemsHtml = items.map((i) => `
            <div class="d-line"><span>${i.quantity}× ${esc(i.name)}</span><span>${gbp(i.amount_total)}</span></div>`).join('')
            || '<div class="d-line"><span style="color:var(--mist)">No line items recorded</span></div>';

        const stripeLink = o.stripe_payment_intent
            ? `<a class="stripe-link" href="https://dashboard.stripe.com/payments/${esc(o.stripe_payment_intent)}" target="_blank" rel="noopener">View payment in Stripe ↗</a>`
            : '';

        let shipSection;
        if (o.status === 'shipped') {
            shipSection = `
                <div class="shipped-badge">
                    <div>
                        Shipped ${o.shipped_at ? esc(fmtDate(o.shipped_at)) : ''}<br>
                        <span class="track">${esc(SERVICES[o.shipping_service] || o.shipping_service || 'Dispatched')}${o.tracking_number ? ' · ' + esc(o.tracking_number) : ''}</span>
                    </div>
                </div>
                <button class="link-btn" data-unship="${esc(o.id)}">Mark as not sent</button>`;
        } else {
            const opts = Object.entries(SERVICES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
            shipSection = `
                <div class="ship-form">
                    <div class="field">
                        <label for="svc">Royal Mail service</label>
                        <select id="svc">${opts}</select>
                    </div>
                    <div class="field">
                        <label for="wt">Parcel weight (grams)</label>
                        <input id="wt" type="number" min="0" step="10" placeholder="e.g. 250">
                    </div>
                    <button class="btn-primary" data-label="${esc(o.id)}">Print shipping label</button>
                    <p class="ship-note">Creates a <b>paid</b> Royal Mail label via the API, marks the order as sent, and gives you the label PDF to print. You'll be asked to confirm first.</p>
                    <details class="manual-ship">
                        <summary>Enter tracking by hand instead</summary>
                        <div class="field">
                            <label for="trk">Tracking number</label>
                            <input id="trk" type="text" placeholder="Paste from Royal Mail">
                        </div>
                        <button class="link-btn" data-ship="${esc(o.id)}">Mark as sent (no label)</button>
                    </details>
                </div>`;
        }

        $('#drawerBody').innerHTML = `
            <h2 class="d-title">${esc(o.customer_name || o.shipping_name || 'Order')}</h2>
            <p class="d-meta">${fmtDate(o.created_at)} · ${esc(o.customer_email || '')}</p>

            <div class="d-block">
                <h3>Items</h3>
                ${itemsHtml}
                <div class="d-total"><span>Total (incl. shipping)</span><span class="amt">${gbp(o.amount_total)}</span></div>
            </div>

            <div class="d-block">
                <h3>Ship to</h3>
                <div class="d-address">${addrLines || '<span style="color:var(--mist)">No address recorded</span>'}</div>
                ${stripeLink}
            </div>

            <div class="d-block">
                <h3>Dispatch</h3>
                ${shipSection}
            </div>`;

        const shipBtn = $('#drawerBody [data-ship]');
        if (shipBtn) shipBtn.addEventListener('click', () => markShipped(o.id));
        const labelBtn = $('#drawerBody [data-label]');
        if (labelBtn) labelBtn.addEventListener('click', () => printLabel(o.id));
        const unshipBtn = $('#drawerBody [data-unship]');
        if (unshipBtn) unshipBtn.addEventListener('click', () => unship(o.id));

        const d = $('#drawer');
        d.hidden = false;
        requestAnimationFrame(() => d.classList.add('open'));
    }

    function closeDrawer() {
        const d = $('#drawer');
        d.classList.remove('open');
        setTimeout(() => { d.hidden = true; }, 400);
    }

    async function printLabel(id) {
        const service = $('#svc').value;
        const weightGrams = $('#wt').value.trim();
        const svcName = SERVICES[service] || service;
        const ok = window.confirm(
            `Create a PAID Royal Mail label?\n\nService: ${svcName}\n`
            + `${weightGrams ? 'Weight: ' + weightGrams + 'g\n' : ''}`
            + `\nThis buys postage on your Royal Mail account and marks the order as sent.`
        );
        if (!ok) return;
        const btn = $('#drawerBody [data-label]');
        if (btn) { btn.disabled = true; btn.textContent = 'Creating label…'; }
        try {
            const r = await api('/api/label', { method: 'POST', body: JSON.stringify({ id, service, weightGrams }) });
            if (r.labelUrl) {
                window.open(r.labelUrl, '_blank', 'noopener');
                toast('Label created — order marked as sent');
            } else {
                toast('Order sent to Click & Drop — generate the label there');
            }
            closeDrawer();
            await loadDashboard();
        } catch (e) {
            toast(e.message || 'Label failed', true);
            if (btn) { btn.disabled = false; btn.textContent = 'Print shipping label'; }
        }
    }

    async function markShipped(id) {
        const btn = $('#drawerBody [data-ship]');
        const service = $('#svc').value;
        const tracking = $('#trk').value.trim();
        const weightGrams = $('#wt').value.trim();
        if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
        try {
            await api('/api/ship', {
                method: 'POST',
                body: JSON.stringify({ id, service, tracking, weightGrams }),
            });
            toast('Order marked as sent');
            closeDrawer();
            await loadDashboard();
        } catch (e) {
            toast(e.message, true);
            if (btn) { btn.disabled = false; btn.textContent = 'Mark as sent (no label)'; }
        }
    }

    async function unship(id) {
        try {
            await api('/api/ship', { method: 'POST', body: JSON.stringify({ id, action: 'unship' }) });
            toast('Reverted to awaiting dispatch');
            closeDrawer();
            await loadDashboard();
        } catch (e) { toast(e.message, true); }
    }

    // ---------- wire up ----------
    function init() {
        document.getElementById('createOrderBtn').addEventListener('click', createCustomOrder);
        $$('[data-close]').forEach((el) => el.addEventListener('click', closeDrawer));
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && $('#drawer').classList.contains('open')) closeDrawer();
        });
        $$('#filters .chip').forEach((chip) => {
            chip.addEventListener('click', () => {
                $$('#filters .chip').forEach((c) => c.classList.remove('is-active'));
                chip.classList.add('is-active');
                FILTER = chip.dataset.filter;
                renderOrders();
            });
        });

        window.addEventListener('hashchange', route);
        route();

        // No login — straight to the dashboard.
        showApp();
        loadDashboard();

        // Keep it live: refresh from the store every 20s.
        setInterval(() => { loadDashboard(); }, 20000);
    }

    document.addEventListener('DOMContentLoaded', init);
})();
