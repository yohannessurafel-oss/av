/* ═══════════════════════════════════════════════════════════
   Africa Village Microfinance — 15 Loan Repayment / Collection
   loan-repayment-collection.js  v1.2 — PATCHED

   PATCHES APPLIED:
   • Double-post guard on Post Payment (prevents duplicate ledger/GL rows)
   • Ref batch collision fix (timestamp + random suffix)
   • All existing functionality preserved
═══════════════════════════════════════════════════════════ */

'use strict';

const SUPABASE_URL = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';

/* ── HTTP helper ────────────────────────────────────────── */
async function sbFetch(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    }
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(txt || `HTTP ${res.status}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

/* ── Toast ─────────────────────────────────────────────── */
const toastEl = document.getElementById('toastNotification');
let _toastTimer = null;
function toast(msg, type = '', duration = 3200) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.className = `toast show ${type}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { toastEl.className = 'toast'; }, duration);
}

/* ── System date ───────────────────────────────────────── */
(function initDate() {
  const el = document.getElementById('systemDate');
  if (el) el.textContent = new Date().toLocaleDateString('en-ET', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
  });
})();

/* ── Format helper ──────────────────────────────────────── */
const fmt = n => parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ── State ──────────────────────────────────────────────── */
let _record = null;
let _lastLedgerRow = null;
let _schedule = [];

/* ── Double-post guard state ────────────────────────────── */
let _repaymentInFlight = false;

/* ── Load loan for repayment ────────────────────────────── */
async function loadLoanForRepayment() {
  const appId = document.getElementById('repayAppId')?.value?.trim();
  if (!appId) { toast('Enter an Application ID.', 'warning'); return; }

  try {
    const rows = await sbFetch(
      `loanmasterrecords?application_id=eq.${encodeURIComponent(appId)}&limit=1`
    );
    if (!rows || !rows[0]) {
      toast(`Application ${appId} not found.`, 'error');
      return;
    }
    _record = rows[0];

    if (_record.application_status !== 'Disbursed') {
      toast(`Loan status is ${_record.application_status}. Only Disbursed loans can receive repayments.`, 'warning');
      return;
    }

    /* Load latest ledger row */
    const ledger = await sbFetch(
      `loan_ledger?application_id=eq.${encodeURIComponent(appId)}&order=id.desc&limit=1`
    );
    _lastLedgerRow = ledger?.[0] || null;

    /* Load amortization schedule */
    const sched = await sbFetch(
      `amortization_schedules?application_id=eq.${encodeURIComponent(appId)}&order=installment_number.asc`
    );
    _schedule = sched || [];

    populateRepaymentForm(_record, _lastLedgerRow, _schedule);
    toast(`Loan ${appId} loaded — balance: ETB ${fmt(_lastLedgerRow?.running_balance || 0)}.`, 'success');
  } catch (e) {
    toast('Load error: ' + e.message, 'error');
  }
}

function populateRepaymentForm(rec, ledger, schedule) {
  document.getElementById('repayClientName') && (document.getElementById('repayClientName').value = rec.client_name || '');
  document.getElementById('repayProductId') && (document.getElementById('repayProductId').value = rec.product_id || '');
  document.getElementById('repayBranchId') && (document.getElementById('repayBranchId').value = rec.branch_id || '');
  document.getElementById('repayPrincipal') && (document.getElementById('repayPrincipal').value = fmt(rec.approved_amount));
  document.getElementById('repayCurrentBalance') && (document.getElementById('repayCurrentBalance').value = fmt(ledger?.running_balance || 0));

  /* Compute total due from schedule */
  let totalDue = 0;
  let totalInterestDue = 0;
  let totalPrincipalDue = 0;
  schedule.forEach(s => {
    if (s.payment_status === 'UNPAID' || s.payment_status === 'PARTIAL') {
      totalDue += parseFloat(s.installment_amount || 0);
      totalInterestDue += parseFloat(s.interest_amount || 0);
      totalPrincipalDue += parseFloat(s.principal_amount || 0);
    }
  });
  document.getElementById('repayTotalDue') && (document.getElementById('repayTotalDue').value = fmt(totalDue));
  document.getElementById('repayInterestDue') && (document.getElementById('repayInterestDue').value = fmt(totalInterestDue));
  document.getElementById('repayPrincipalDue') && (document.getElementById('repayPrincipalDue').value = fmt(totalPrincipalDue));

  /* ── PATCH: Generate collision-resistant ref batch ── */
  const appId = rec.application_id;
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  document.getElementById('fRefBatch') && (document.getElementById('fRefBatch').value = `RCPT-${appId}-${stamp}-${rand}`);
}

/* ── Post payment ───────────────────────────────────────── */
async function postPayment() {
  if (!_record || !_lastLedgerRow) {
    toast('Load a loan first.', 'warning');
    return;
  }

  /* ── PATCH: Double-post guard ── */
  if (_repaymentInFlight) {
    console.warn('Repayment already in progress — ignoring duplicate click.');
    return;
  }
  _repaymentInFlight = true;
  const postBtn = document.getElementById('btnPost');
  if (postBtn) postBtn.disabled = true;

  try {
    const amountReceived = parseFloat(document.getElementById('fAmountReceived')?.value) || 0;
    const penaltyCollected = parseFloat(document.getElementById('fPenaltyCollected')?.value) || 0;
    const refBatch = document.getElementById('fRefBatch')?.value?.trim() || '';
    const narration = document.getElementById('fNarration')?.value?.trim() || 'Loan repayment';
    const txDate = document.getElementById('fTxDate')?.value || new Date().toISOString().slice(0, 10);

    if (amountReceived <= 0) {
      toast('Amount received must be greater than 0.', 'warning');
      return;
    }

    /* Confirm before posting */
    if (!confirm(
      `Post repayment?\n\n` +
      `Application: ${_record.application_id}\n` +
      `Amount: ETB ${fmt(amountReceived)}\n` +
      `Penalty: ETB ${fmt(penaltyCollected)}\n` +
      `Ref: ${refBatch}\n\n` +
      `This will update the loan ledger and post GL entries.`
    )) {
      toast('Payment cancelled.', 'info');
      return;
    }

    /* Call server-side RPC */
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/post_loan_repayment`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        p_application_id: _record.application_id,
        p_amount_received: amountReceived,
        p_penalty_collected: penaltyCollected,
        p_reference_no: refBatch,
        p_narration: narration,
        p_transaction_date: txDate,
        p_created_by: document.getElementById('fCreatedBy')?.value?.trim() || null
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${res.status}`);
    }

    toast('Payment posted successfully.', 'success');

    /* Reload to show updated state */
    await loadLoanForRepayment();
    clearPaymentEntry();
  } catch (e) {
    toast('Post payment error: ' + e.message, 'error');
  } finally {
    /* ── PATCH: Always release guard ── */
    _repaymentInFlight = false;
    if (postBtn) postBtn.disabled = false;
  }
}

function clearPaymentEntry() {
  document.getElementById('fAmountReceived') && (document.getElementById('fAmountReceived').value = '');
  document.getElementById('fPenaltyCollected') && (document.getElementById('fPenaltyCollected').value = '0.00');
  document.getElementById('fNarration') && (document.getElementById('fNarration').value = '');
}

/* ── Event bindings ─────────────────────────────────────── */
document.getElementById('btnLoadForRepayment')?.addEventListener('click', loadLoanForRepayment);
document.getElementById('btnPost')?.addEventListener('click', postPayment);
document.getElementById('repayAppId')?.addEventListener('keydown', e => { if (e.key === 'Enter') loadLoanForRepayment(); });

/* ── Init ───────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => {
  toast('Loan Repayment Collection v1.2 ready.', 'success');
});

// ── Window Controls: Minimize / Maximize ────────────────────
const windowContainer = document.querySelector('.window-container');
const wcMinimizeBtn    = document.getElementById('wcMinimize');
const wcMaximizeBtn    = document.getElementById('wcMaximize');
const dockSliver        = document.getElementById('dockSliver');

function toggleMinimize() {
  if (!windowContainer || !dockSliver) return;
  windowContainer.classList.remove('is-maximized');
  if (wcMaximizeBtn) wcMaximizeBtn.textContent = '▢';

  windowContainer.classList.toggle('is-minimized');
  const minimized = windowContainer.classList.contains('is-minimized');
  dockSliver.classList.toggle('show', minimized);
  if (wcMinimizeBtn) wcMinimizeBtn.title = minimized ? 'Restore' : 'Minimize';
}

function toggleMaximize() {
  if (!windowContainer) return;
  if (windowContainer.classList.contains('is-minimized')) {
    windowContainer.classList.remove('is-minimized');
    if (dockSliver) dockSliver.classList.remove('show');
    if (wcMinimizeBtn) wcMinimizeBtn.title = 'Minimize';
  }
  windowContainer.classList.toggle('is-maximized');
  const maximized = windowContainer.classList.contains('is-maximized');
  if (wcMaximizeBtn) {
    wcMaximizeBtn.textContent = maximized ? '❐' : '▢';
    wcMaximizeBtn.title = maximized ? 'Restore Down' : 'Maximize';
  }
}
