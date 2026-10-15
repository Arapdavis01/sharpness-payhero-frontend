/* =========================================================
   Eagle Master - Payment Page
   Reads config from window.RUNTIME_CONFIG (defined in index.html)
   ========================================================= */

(function () {
    'use strict';

    // ---------- Config ----------
    const config = window.RUNTIME_CONFIG || {};
    const API_BASE = config.API_BASE || '';
    const CHANNEL_ID = config.CHANNEL_ID || '';

    if (!API_BASE) {
        console.error('RUNTIME_CONFIG.API_BASE is not set in index.html');
    }

    const INITIATE_URL = API_BASE + '/api/payments/initiate';
    const CALLBACK_URL = API_BASE + '/api/payments/callback';
    const SUCCESS_URL = window.location.origin + window.location.pathname + '?status=success';
    const FAIL_URL = window.location.origin + window.location.pathname + '?status=fail';

    // ---------- DOM refs ----------
    const phoneInput = document.getElementById('phoneInput');
    const amountInput = document.getElementById('amountInput');
    const nameInput = document.getElementById('nameInput');
    const stkBtn = document.getElementById('stkBtn');
    const cardBtn = document.getElementById('cardBtn');
    const statusEl = document.getElementById('statusMessage');
    const statusText = document.getElementById('statusText');

    const modalOverlay = document.getElementById('confirmModal');
    const modalPhone = document.getElementById('modalPhone');
    const modalAmount = document.getElementById('modalAmount');
    const modalProvider = document.getElementById('modalProvider');
    const modalCancel = document.getElementById('modalCancel');
    const modalConfirm = document.getElementById('modalConfirm');

    // ---------- Helpers ----------
    function showStatus(message, type) {
        statusEl.className = 'status show ' + type;
        statusText.textContent = message;

        const icon = statusEl.querySelector('i');
        const icons = {
            success: 'fa-circle-check',
            error: 'fa-circle-exclamation',
            info: 'fa-circle-info'
        };
        icon.className = 'fas ' + (icons[type] || 'fa-circle-info');
    }

    function hideStatus() {
        statusEl.className = 'status';
    }

    function formatPhone(raw) {
        const cleaned = raw.replace(/\D/g, '');
        const normalized = cleaned.startsWith('254') ? cleaned : '254' + cleaned;
        const groups = normalized.slice(3).match(/.{1,3}/g) || [];
        const display = '+' + normalized.slice(0, 3) + ' ' + groups.join(' ');
        return { raw: normalized, display };
    }

    function formatCurrency(amount) {
        const num = parseFloat(amount);
        return isNaN(num) || num < 0 ? '0.00' : num.toFixed(2);
    }

    function generateReference() {
        const time = Date.now().toString(36).toUpperCase();
        const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
        return 'EM-' + time + '-' + rand;
    }

    function setLoading(btn, loading) {
        btn.classList.toggle('loading', loading);
        btn.disabled = loading;
    }

    function validateInputs() {
        const rawPhone = phoneInput.value.trim();
        const rawAmount = amountInput.value.trim();
        const phoneDigits = rawPhone.replace(/\D/g, '');
        const amountNum = parseFloat(rawAmount);

        if (phoneDigits.length < 9 || phoneDigits.length > 12) {
            showStatus('Please enter a valid phone number (e.g., 712345678).', 'error');
            phoneInput.focus();
            return null;
        }
        if (isNaN(amountNum) || amountNum <= 0) {
            showStatus('Please enter a valid amount greater than 0.', 'error');
            amountInput.focus();
            return null;
        }
        return { phone: rawPhone, amount: rawAmount };
    }

    // ---------- STK Push flow ----------
    stkBtn.addEventListener('click', function (e) {
        e.preventDefault();
        hideStatus();

        const data = validateInputs();
        if (!data) return;

        const phoneInfo = formatPhone(data.phone);
        const formattedAmount = formatCurrency(data.amount);
        const customerName = nameInput.value.trim();

        modalPhone.textContent = phoneInfo.display;
        modalAmount.textContent = 'KES ' + formattedAmount;
        modalProvider.textContent = 'M-Pesa / Airtel (STK)';

        modalConfirm.dataset.phone = phoneInfo.raw;
        modalConfirm.dataset.amount = formattedAmount;
        modalConfirm.dataset.provider = 'm-pesa';
        modalConfirm.dataset.name = customerName;

        modalOverlay.classList.add('active');
    });

    modalConfirm.addEventListener('click', async function () {
        const phone = modalConfirm.dataset.phone;
        const amount = modalConfirm.dataset.amount;
        const provider = modalConfirm.dataset.provider || 'm-pesa';
        const name = modalConfirm.dataset.name || '';

        modalOverlay.classList.remove('active');
        setLoading(stkBtn, true);
        hideStatus();
        showStatus('Initiating payment. Please check your phone for the STK prompt.', 'info');

        try {
            const response = await fetch(INITIATE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, amount, provider, name })
            });

            const text = await response.text();
            let payload;
            try { payload = JSON.parse(text); }
            catch { payload = { message: text || 'Unknown error' }; }

            if (!response.ok) {
                throw new Error(payload.message || 'HTTP ' + response.status);
            }

            const reference = payload.data?.reference || payload.data?.external_reference || 'N/A';
            showStatus('Payment initiated. Reference: ' + reference, 'success');

            phoneInput.value = '';
            amountInput.value = '';
            nameInput.value = '';
        } catch (err) {
            console.error('STK error:', err);
            showStatus(err.message || 'Payment failed. Please try again.', 'error');
        } finally {
            setLoading(stkBtn, false);
        }
    });

    // ---------- Card flow ----------
    cardBtn.addEventListener('click', function (e) {
        e.preventDefault();
        hideStatus();

        const data = validateInputs();
        if (!data) return;

        const phoneInfo = formatPhone(data.phone);
        const amountNum = parseFloat(data.amount);
        const name = nameInput.value.trim() || 'Customer';

        const checkoutBase = 'https://payhero.co.ke/checkout';
        const params = new URLSearchParams({
            channel_id: CHANNEL_ID,
            amount: amountNum.toFixed(2),
            phone: phoneInfo.raw,
            name: name,
            reference: generateReference(),
            success_url: SUCCESS_URL,
            fail_url: FAIL_URL,
            callback_url: CALLBACK_URL
        });

        window.open(checkoutBase + '?' + params.toString(), '_blank');
        showStatus('Redirecting to secure card payment.', 'info');
    });

    // ---------- Modal close handlers ----------
    modalCancel.addEventListener('click', function () {
        modalOverlay.classList.remove('active');
        hideStatus();
    });

    modalOverlay.addEventListener('click', function (e) {
        if (e.target === modalOverlay) modalCancel.click();
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && modalOverlay.classList.contains('active')) {
            modalCancel.click();
        }
    });

    // ---------- Handle URL status on load ----------
    const urlParams = new URLSearchParams(window.location.search);
    const statusParam = urlParams.get('status');
    const refParam = urlParams.get('reference');

    if (statusParam === 'success' && refParam) {
        showStatus('Payment successful. Reference: ' + refParam, 'success');
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (statusParam === 'fail') {
        showStatus('Payment failed or was cancelled. Please try again.', 'error');
        window.history.replaceState({}, document.title, window.location.pathname);
    } else {
        showStatus('Fill in the details and choose a payment method.', 'info');
    }

    // ---------- Input sanitization ----------
    phoneInput.addEventListener('input', function () {
        this.value = this.value.replace(/\D/g, '').slice(0, 15);
    });

    amountInput.addEventListener('input', function () {
        let val = this.value.replace(/[^0-9.]/g, '');
        const parts = val.split('.');
        if (parts.length > 2) {
            val = parts[0] + '.' + parts.slice(1).join('');
        }
        if (val.startsWith('0') && !val.startsWith('0.')) {
            val = val.replace(/^0+/, '');
        }
        this.value = val;
    });

    // ---------- Initial focus ----------
    amountInput.focus();
})();
