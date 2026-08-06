/* ═══════════════════════════════════════════════════════════
   Africa Village Microfinance — 09 Settlement / Early Payoff
   settlement-early-payoff.js  v1.3 — PATCHED

   PATCHES APPLIED:
   • Calls post_loan_settlement RPC for atomic GL + ledger + status
   • Double-post guard on Process Settlement
   • Collision-resistant ref batch generation
   • loanapplications sync handled server-side in RPC
   • creditaccountpayoffregistry write handled server-side in RPC
═══════════════════════════════════════════════════════════ */

'use strict';

const SUPABASE_URL = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';

/* ── HTTP helper ────────────────────────────────────────── */
async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': opts.prefer || 'return=representation',
      ...(opts.headers || {})
    }
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    let msg = 'HTTP ' + res.status;
    try { const j = JSON.parse(errText); msg = j.message || j.hint || j.details || msg; } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  const body = await res.text();
  if (!body || !body.trim()) return null;
  try { return JSON.parse(body); } catch { return null; }
}

/* ── RPC helper ─────────────────────────────────────────── */
async function sbRpc(fnName, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(params)
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((data && data.message) || `HTTP ${res.status}`);
  }
  return data;
}

/* ── Toast ─────────────────────────────────────────────── */
const toastEl = document.getElementById('toastNotification');
let _toastTimer = null;
function toast(msg, type = '', duration = 3500) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.className = `toast show ${type}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { toastEl.className = 'toast'; }, duration);
}

/* ── System Date ───────────────────────────────────────── */
(function initDate() {
  const el = document.getElementById('systemDate');
  if (el) el.textContent = new Date().toLocaleDateString('en-ET', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
  });
  const sd = document.getElementById('payoffSettlementDate');
  if (sd) sd.value = new Date().toISOString().split('T')[0];
})();

/* ── Format helper ──────────────────────────────────────── */
const fmt = n => parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ── Bank account dropdown ──────────────────────────────────
   Matches disbursement.js's established convention exactly: ONE
   always-visible dropdown listing Main Cash (11101004) plus every
   bank leaf (8-digit codes under 1110%), rather than showing/hiding
   a separate field based on payment mode. Payment Mode only drives
   the auto-select default, same as disbursement.js. ── */
async function loadBankAccounts() {
  const sel = document.getElementById('payoffBankAccount');
  if (!sel) return;
  try {
    const accounts = await sbFetch(
      `chart_of_accounts?account_type=eq.ASSET&select=gl_account_code,account_name_title&order=gl_account_code.asc`
    );
    const leafBankAndCash = accounts.filter(a =>
      a.gl_account_code === '11101004' ||
      (a.gl_account_code.length === 8 && a.gl_account_code.startsWith('1110'))
    );
    sel.innerHTML = '<option value="">– Select Cash/Bank Account –</option>' +
      leafBankAndCash.map(a => `<option value="${a.gl_account_code}">${a.account_name_title} (${a.gl_account_code})</option>`).join('');
  } catch (e) {
    console.warn('Could not load bank/cash accounts:', e.message);
  }
}
loadBankAccounts();

/* Auto-select Main Cash when Cash Vault Handout is chosen — still
   overridable, same as disbursement.js. */
document.getElementById('payoffPaymentMode')?.addEventListener('change', function () {
  const sel = document.getElementById('payoffBankAccount');
  if (this.value === 'Cash Vault Handout' && sel && !sel.value) {
    sel.value = '11101004';
  }
});

/* ── State ──────────────────────────────────────────────── */
let _loadedAppId = null;
let _loanRecord = null;
let _scheduleRows = [];
let _ledgerRows = [];
let _settlementInFlight = false;
let _earlySettlementPenaltyRate = 0.02;

/* ── Load Loan + Schedule + Ledger ───────────────────────── */
async function loadPayoffRecord() {
  const appId = document.getElementById('payoffAccNoTarget')?.value?.trim();
  if (!appId) { toast('Enter an Application ID to search.', 'warning'); return; }

  try {
    const loanRows = await sbFetch(
      `loanmasterrecords?application_id=eq.${encodeURIComponent(appId)}&select=*&limit=1`
    );
    if (!loanRows || !loanRows[0]) {
      toast('Application ID not found.', 'warning');
      return;
    }
    _loanRecord = loanRows[0];
    _loadedAppId = _loanRecord.application_id;

    /* Load product penalty rate */
    try {
      const productRows = await sbFetch(
        `lendingproductparametermatrix?product_code_id=eq.${encodeURIComponent(_loanRecord.product_id)}&select=early_settlement_penalty_rate&limit=1`
      );
      _earlySettlementPenaltyRate = productRows?.[0]?.early_settlement_penalty_rate ?? 0.02;
    } catch {
      _earlySettlementPenaltyRate = 0.02;
    }

    populateForm(_loanRecord);

    _scheduleRows = await sbFetch(
      `amortization_schedules?application_id=eq.${encodeURIComponent(appId)}&select=*&order=installment_no.asc`
    ) || [];
    renderSchedule(_scheduleRows);

    _ledgerRows = await sbFetch(
      `loan_ledger?application_id=eq.${encodeURIComponent(appId)}&select=*&order=id.asc`
    ) || [];
    renderStatement(_ledgerRows);
    renderHistory(_loanRecord);

    computePayoff();
    toast(`Loaded: ${_loadedAppId}`);
  } catch (e) {
    toast('Lookup error: ' + e.message, 'error');
  }
}

function populateForm(rec) {
  const v = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };
  v('payoffClientId', rec.client_id);
  v('payoffLoanSeries', rec.loan_series_no);
  v('payoffLoanAmount', fmt(rec.applied_amount));
  v('payoffProductId', rec.product_id);
  v('payoffCurrencyId', rec.currency_id || 'ETB');
  v('payoffCreatedOn', rec.created_on ? new Date(rec.created_on).toLocaleString('en-ET') : '');
  v('payoffPreclosureStatus', rec.application_status === 'Closed' ? 'Already Settled' : 'Eligible');
}

/* ── Render: Amortization Schedule ──────────────────────── */
function renderSchedule(rows) {
  const tbody = document.querySelector('#installmentScheduleTable tbody');
  if (!tbody) return;
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="7">No schedule found.</td></tr>'; return; }
  tbody.innerHTML = rows.map(r => `
    <tr><td>${r.installment_no}</td><td>${r.due_date}</td>
    <td>${fmt(r.principal_due)}</td><td>${fmt(r.interest_due)}</td>
    <td>${fmt(r.principal_paid)}</td><td>${fmt(r.interest_paid)}</td>
    <td>${r.status}</td></tr>
  `).join('');
}

/* ── Render: Loan Statement (ledger) ────────────────────── */
function renderStatement(rows) {
  const tbody = document.querySelector('#loanStatementTable tbody');
  if (!tbody) return;
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="9">No statement data.</td></tr>'; return; }
  tbody.innerHTML = rows.map(r => `
    <tr><td>${r.post_date}</td><td>${r.value_date}</td><td>${r.description}</td>
    <td>${r.ref_batch}</td><td>${fmt(r.principal)}</td><td>${fmt(r.interest)}</td>
    <td>${fmt(r.charges_penalties)}</td><td>${fmt(r.total_paid)}</td>
    <td>${fmt(r.running_balance)}</td></tr>
  `).join('');
}

/* ── Render: Loan History ───────────────────────────────── */
function renderHistory(loan) {
  const tbody = document.querySelector('#loanHistoryTable tbody');
  if (!tbody) return;
  tbody.innerHTML = `
    <tr><td>${fmt(loan.interest_rate)}%</td><td>${loan.loan_series_no || '—'}</td>
    <td>${loan.file_number || '—'}</td><td>${loan.application_id}</td>
    <td>${fmt(loan.sanction_amount)}</td><td>${fmt(loan.approved_amount)}</td>
    <td>${loan.disbursement_date || '—'}</td><td>${loan.term_months || '—'} mo</td>
    <td>${loan.application_status}</td></tr>
  `;
}

/* ── Compute Pay-off Components ─────────────────────────── */
function computePayoff() {
  if (!_loanRecord) return;

  let outstandingBalance = parseFloat(_ledgerRows[_ledgerRows.length - 1]?.running_balance || _loanRecord.approved_amount || 0);

  const settlementDateStr = document.getElementById('payoffSettlementDate')?.value;
  const settlementDateObj = settlementDateStr ? new Date(settlementDateStr) : new Date();

  let unpaidPrincipal = 0, unpaidInterest = 0;
  let lastDueDateBeforeSettlement = null;
  const sortedRows = [..._scheduleRows].sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

  sortedRows.forEach(r => {
    const dueDateObj = new Date(r.due_date);
    if (r.status !== 'PAID') {
      unpaidPrincipal += (parseFloat(r.principal_due || 0) - parseFloat(r.principal_paid || 0));
      if (dueDateObj <= settlementDateObj) {
        unpaidInterest += (parseFloat(r.interest_due || 0) - parseFloat(r.interest_paid || 0));
      }
    }
    if (dueDateObj <= settlementDateObj) lastDueDateBeforeSettlement = dueDateObj;
  });

  if (unpaidPrincipal < 0) unpaidPrincipal = 0;
  if (unpaidInterest < 0) unpaidInterest = 0;
  if (!_scheduleRows.length) { unpaidPrincipal = outstandingBalance; unpaidInterest = 0; }

  let accruedPartialInterest = 0;
  const periodStart = lastDueDateBeforeSettlement || new Date(_loanRecord.disbursement_date || _loanRecord.created_on);
  const daysSincePeriodStart = Math.max(0, Math.round((settlementDateObj - periodStart) / 86400000));
  const annualRate = parseFloat(_loanRecord.interest_rate || 0) / 100;
  if (daysSincePeriodStart > 0 && annualRate > 0 && unpaidPrincipal > 0) {
    accruedPartialInterest = parseFloat((unpaidPrincipal * annualRate * (daysSincePeriodStart / 365)).toFixed(2));
  }
  unpaidInterest += accruedPartialInterest;

  const penalty = unpaidPrincipal * _earlySettlementPenaltyRate;
  const waiver = parseFloat(document.getElementById('payoffWaiver')?.value || 0) || 0;
  const netSettlement = unpaidPrincipal + unpaidInterest + penalty - waiver;

  const tbody = document.querySelector('#dynamicPayoffGrid tbody');
  if (tbody) {
    tbody.innerHTML = `
      <tr><td>Outstanding Principal</td><td>${fmt(unpaidPrincipal)}</td></tr>
      <tr><td>Overdue Interest (billed installments)</td><td>${fmt(unpaidInterest - accruedPartialInterest)}</td></tr>
      <tr><td>Accrued Interest — current period (${daysSincePeriodStart}d @ actual/365)</td><td>${fmt(accruedPartialInterest)}</td></tr>
      <tr><td>Early Settlement Penalty (${(_earlySettlementPenaltyRate * 100).toFixed(2)}%)</td><td>${fmt(penalty)}</td></tr>
      <tr><td>Less: Approved Waiver</td><td>−${fmt(waiver)}</td></tr>
      <tr style="font-weight:bold;"><td>Net Settlement Amount</td><td>${fmt(netSettlement)}</td></tr>
    `;
  }

  document.getElementById('payoffLoanBalance').value = fmt(outstandingBalance);
  document.getElementById('payoffNetAmount').value = fmt(netSettlement);

  return { unpaidPrincipal, unpaidInterest, penalty, waiver, netSettlement, outstandingBalance, daysSincePeriodStart };
}

document.getElementById('payoffWaiver')?.addEventListener('input', computePayoff);
document.getElementById('payoffSettlementDate')?.addEventListener('change', computePayoff);

/* ── Process Settlement — ATOMIC via RPC ────────────────── */
async function processSettlement() {
  if (!_loadedAppId || !_loanRecord) { toast('Load a loan record first.', 'warning'); return; }
  if (_loanRecord.application_status === 'Closed') { toast('This loan is already settled.', 'warning'); return; }

  /* ── Double-post guard ── */
  if (_settlementInFlight) { console.warn('Settlement in progress — ignoring duplicate click.'); return; }
  _settlementInFlight = true;
  const postBtn = document.getElementById('btnProcessSettlement');
  if (postBtn) postBtn.disabled = true;

  try {
    const components = computePayoff();
    const settlementDate = document.getElementById('payoffSettlementDate')?.value;
    const settledBy = document.getElementById('payoffSettledBy')?.value?.trim();
    const paymentMode = document.getElementById('payoffPaymentMode')?.value;
    const bankAccountSel = document.getElementById('payoffBankAccount');
    const glCashAccountCode = bankAccountSel?.value || null;
    const bankName = glCashAccountCode
      ? bankAccountSel.options[bankAccountSel.selectedIndex].text.replace(/\s*\([^)]*\)$/, '')
      : null;

    if (!settlementDate) { toast('Enter a Settlement Date.', 'warning'); return; }
    if (!settledBy) { toast('Enter Settled By (officer ID).', 'warning'); return; }
    if (components.netSettlement < 0) { toast('Net settlement cannot be negative.', 'warning'); return; }
    if (!glCashAccountCode) {
      toast('Select a Cash / Bank Account.', 'warning'); return;
    }

    if (!confirm(`Confirm full settlement of ${_loadedAppId} for ETB ${fmt(components.netSettlement)}?`)) {
      toast('Settlement cancelled.', 'info');
      return;
    }

    /* ── Collision-resistant ref batch ── */
    const stamp = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    const refBatch = `SETTLE-${_loadedAppId}-${stamp}-${rand}`;

    /* ── Call atomic RPC ── */
    const result = await sbRpc('post_loan_settlement', {
      p_application_id: _loadedAppId,
      p_settlement_date: settlementDate,
      p_amount_received: components.netSettlement,
      p_penalty_amount: components.penalty,
      p_interest_amount: components.unpaidInterest,
      p_waiver_amount: components.waiver,
      p_principal_amount: components.unpaidPrincipal,
      p_reference_no: refBatch,
      p_narration: `Full settlement / early payoff via ${paymentMode}`,
      p_payment_mode: paymentMode,
      p_settled_by: settledBy,
      p_gl_cash_account_code: glCashAccountCode,
      p_bank_name: bankName
    });

    if (!result || result.success !== true) {
      throw new Error(result?.error || 'Settlement RPC returned failure');
    }

    toast(`✔ Loan ${_loadedAppId} settled. Net amount: ETB ${fmt(result.net_amount)}`, 'success');
    await loadPayoffRecord();
  } catch (e) {
    toast('Settlement error: ' + e.message, 'error');
  } finally {
    _settlementInFlight = false;
    if (postBtn) postBtn.disabled = false;
  }
}

/* ── Toolbar ─────────────────────────────────────────────── */
document.getElementById('btnGlobalView')?.addEventListener('click', loadPayoffRecord);
document.getElementById('btnSearchPayoff')?.addEventListener('click', loadPayoffRecord);
document.getElementById('btnProcessSettlement')?.addEventListener('click', processSettlement);
document.getElementById('payoffAccNoTarget')?.addEventListener('keydown', e => { if (e.key === 'Enter') loadPayoffRecord(); });

document.getElementById('btnGlobalAdd')?.addEventListener('click', () => {
  toast('This module reads existing loans only. Create new loans in Module 01.', 'warning');
});
document.getElementById('btnGlobalEdit')?.addEventListener('click', () => {
  if (!_loadedAppId) { toast('Load a record first.', 'warning'); return; }
  toast('Adjust Penalty Waiver and Settlement Date, then click Process Settlement.', '');
});
document.getElementById('btnGlobalSave')?.addEventListener('click', processSettlement);
document.getElementById('btnGlobalCancel')?.addEventListener('click', () => {
  if (_loadedAppId) loadPayoffRecord();
  toast('Changes discarded.');
});
document.getElementById('btnGlobalClose')?.addEventListener('click', () => {
  _loadedAppId = null; _loanRecord = null; _scheduleRows = []; _ledgerRows = [];
  document.querySelectorAll('#view-module-09 input:not([data-always-enabled])').forEach(el => el.value = '');
  document.querySelector('#dynamicPayoffGrid tbody').innerHTML = '<tr><td colspan="2">Enter an Application ID to calculate pay-off components.</td></tr>';
  toast('Record closed.');
});
document.getElementById('btnGlobalDelete')?.addEventListener('click', () => {
  toast('Settlement records cannot be deleted.', 'warning');
});
document.getElementById('btnGlobalPrint')?.addEventListener('click', () => window.print());

/* ── Init ───────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => {
  toast('Settlement / Early Payoff v1.3 ready.', 'success');
});

// ── Window Controls ───────────────────────────────────────
const windowContainer = document.querySelector('.window-container');
const wcMinimizeBtn = document.getElementById('wcMinimize');
const wcMaximizeBtn = document.getElementById('wcMaximize');
const dockSliver = document.getElementById('dockSliver');

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
