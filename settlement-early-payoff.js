/* ═══════════════════════════════════════════════════════════
   Africa Village Microfinance — 09 Settlement / Early Payoff
   settlement-early-payoff.js  v1.1 — SYSTEM BALANCED
   Tables:
     loanmasterrecords      — loan master record (read)
     loan_ledger            — transaction history (read, write on settle)
     amortization_schedules — installment schedule (read)
═══════════════════════════════════════════════════════════ */

'use strict';

const SUPABASE_URL      = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';

/* ── HTTP Helper — Hardened raw text parsing ────────────────── */
async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      'apikey':        SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        opts.prefer || 'return=representation',
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

/* ── Branch Dropdown ───────────────────────────────────── */
let _branchCache = [];

async function loadBranches() {
  const sel = document.getElementById('payoffBranchId');
  if (sel) { sel.innerHTML = '<option value="">Loading branches…</option>'; sel.disabled = true; }
  try {
    const rows = await sbFetch('branchregistry?select=branch_id,branch_name&order=branch_id');
    _branchCache = Array.isArray(rows) ? rows : [];
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Select Branch --</option>';
    _branchCache.forEach(r => {
      const o = document.createElement('option');
      o.value = r.branch_id;
      o.textContent = r.branch_id + (r.branch_name ? ' — ' + r.branch_name : '');
      sel.appendChild(o);
    });
    sel.disabled = false;
  } catch (e) {
    toast('Could not load branch list.', 'error');
    if (sel) { sel.innerHTML = '<option value="">-- Select Branch --</option>'; sel.disabled = false; }
  }
}

document.getElementById('payoffBranchId')?.addEventListener('change', function () {
  const nameEl = document.getElementById('payoffBranchName');
  const chosen = _branchCache.find(b => b.branch_id === this.value);
  if (nameEl) nameEl.value = chosen ? (chosen.branch_name || '') : '';
});

/* ── Tab Switching ──────────────────────────────────────── */
document.querySelectorAll('.sub-tab').forEach(tab => {
  tab.addEventListener('click', function () {
    document.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.sub-tab-view').forEach(v => v.classList.remove('active'));
    this.classList.add('active');
    document.getElementById('subview-' + this.dataset.target)?.classList.add('active');
  });
});

/* ── Format helpers ──────────────────────────────────────── */
const fmt = n => parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ── State ──────────────────────────────────────────────── */
let _loadedAppId = null;
let _loanRecord  = null;
let _scheduleRows = [];
let _ledgerRows   = [];
const FALLBACK_EARLY_SETTLEMENT_PENALTY_RATE = 0.02; // 2%, matches existing sample contract terms
let _earlySettlementPenaltyRate = FALLBACK_EARLY_SETTLEMENT_PENALTY_RATE;

/* ── Load Loan + Schedule + Ledger ───────────────────────── */
async function loadPayoffRecord() {
  const appId = document.getElementById('payoffAccNoTarget')?.value?.trim();
  if (!appId) { toast('Enter an Application ID to search.', 'warning'); return; }

  const sb = document.getElementById('statusBar');
  if (sb) sb.textContent = `Loading ${appId}…`;

  try {
    const loanRows = await sbFetch(
      `loanmasterrecords?application_id=eq.${encodeURIComponent(appId)}&select=*&limit=1`
    );
    if (!loanRows || !loanRows[0]) {
      toast('Application ID not found.', 'warning');
      if (sb) sb.textContent = 'Status: Not found';
      return;
    }
    _loanRecord = loanRows[0];
    _loadedAppId = _loanRecord.application_id;

    // Pull this loan's PRODUCT-SPECIFIC early-settlement penalty rate,
    // falling back to the sample contract default (2%) only if the
    // product row is missing it.
    try {
      const productRows = await sbFetch(
        `lendingproductparametermatrix?product_code_id=eq.${encodeURIComponent(_loanRecord.product_id)}&select=early_settlement_penalty_rate&limit=1`
      );
      const prod = productRows && productRows[0];
      _earlySettlementPenaltyRate = (prod && prod.early_settlement_penalty_rate != null)
        ? prod.early_settlement_penalty_rate : FALLBACK_EARLY_SETTLEMENT_PENALTY_RATE;
    } catch (e) {
      console.warn('Could not load product penalty policy, using default:', e.message);
      _earlySettlementPenaltyRate = FALLBACK_EARLY_SETTLEMENT_PENALTY_RATE;
    }

    const v = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };
    v('payoffClientId',   _loanRecord.client_id);
    v('payoffLoanSeries', _loanRecord.loan_series_no);
    v('payoffLoanAmount', fmt(_loanRecord.applied_amount));
    v('payoffProductId',  _loanRecord.product_id);
    v('payoffCurrencyId', _loanRecord.currency_id || 'ETB');
    v('payoffCreatedOn',  _loanRecord.created_on ? new Date(_loanRecord.created_on).toLocaleString('en-ET') : '');
    v('payoffPreclosureStatus', _loanRecord.application_status === 'Settled' ? 'Already Settled' : 'Eligible');

    const brSel = document.getElementById('payoffBranchId');
    if (brSel && _loanRecord.branch_id) {
      brSel.value = _loanRecord.branch_id;
      brSel.dispatchEvent(new Event('change'));
    }

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
    if (sb) sb.textContent = `Application ${_loadedAppId} | Status: ${_loanRecord.application_status}`;
  } catch (e) {
    toast('Lookup error: ' + e.message, 'error');
    if (sb) sb.textContent = 'Lookup failed.';
  }
}

/* ── Render: Amortization Schedule ──────────────────────── */
function renderSchedule(rows) {
  const tbody = document.querySelector('#installmentScheduleTable tbody');
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center gray-text italic">No schedule found for this loan.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${r.installment_no}</td>
      <td>${r.due_date}</td>
      <td class="text-right">${fmt(r.principal_due)}</td>
      <td class="text-right">${fmt(r.interest_due)}</td>
      <td class="text-right">${fmt(r.principal_paid)}</td>
      <td class="text-right">${fmt(r.interest_paid)}</td>
      <td><span class="status-badge">${r.status}</span></td>
    </tr>
  `).join('');
}

/* ── Render: Loan Statement (ledger) ────────────────────── */
function renderStatement(rows) {
  const tbody = document.querySelector('#loanStatementTable tbody');
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center gray-text italic">No statement data available.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${r.post_date}</td>
      <td>${r.value_date}</td>
      <td>${r.description}</td>
      <td><small class="gray-text">${r.ref_batch}</small></td>
      <td class="text-right">${fmt(r.principal)}</td>
      <td class="text-right">${fmt(r.interest)}</td>
      <td class="text-right">${fmt(r.charges_penalties)}</td>
      <td class="text-right">${fmt(r.total_paid)}</td>
      <td class="text-right" style="font-weight:700;">${fmt(r.running_balance)}</td>
    </tr>
  `).join('');
}

/* ── Render: Loan History ───────────────────────────────── */
function renderHistory(loan) {
  const tbody = document.querySelector('#loanHistoryTable tbody');
  if (!tbody) return;
  tbody.innerHTML = `
    <tr>
      <td class="text-right">${fmt(loan.interest_rate)}%</td>
      <td>${loan.loan_series_no || '—'}</td>
      <td>${loan.file_number || '—'}</td>
      <td>${loan.application_id}</td>
      <td class="text-right">${fmt(loan.sanction_amount)}</td>
      <td class="text-right">${fmt(loan.approved_amount)}</td>
      <td>${loan.disbursement_date || '—'}</td>
      <td>${loan.term_months || '—'} mo</td>
      <td><span class="status-badge">${loan.application_status}</span></td>
    </tr>
  `;
}

/* ── Compute Pay-off Components — Excludes unearned future interest ── */
function computePayoff() {
  if (!_loanRecord) return;

  let outstandingBalance = _loanRecord.applied_amount || 0;
  if (_ledgerRows.length) {
    outstandingBalance = parseFloat(_ledgerRows[_ledgerRows.length - 1].running_balance || 0);
  }

  const settlementDateStr = document.getElementById('payoffSettlementDate')?.value;
  const settlementDateObj = settlementDateStr ? new Date(settlementDateStr) : new Date();

  let unpaidPrincipal = 0, unpaidInterest = 0;
  let lastDueDateBeforeSettlement = null; // most recent installment due-date <= settlement date

  // Sort ascending by due date so we can find the period boundaries correctly
  const sortedRows = [..._scheduleRows].sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

  sortedRows.forEach(r => {
    const dueDateObj = new Date(r.due_date);
    if (r.status !== 'PAID') {
      unpaidPrincipal += (parseFloat(r.principal_due||0) - parseFloat(r.principal_paid||0));

      // Standard Financial Protection:
      // Exclude future unearned interest. Only accrued/overdue interest is billed.
      if (dueDateObj <= settlementDateObj) {
        unpaidInterest += (parseFloat(r.interest_due||0) - parseFloat(r.interest_paid||0));
      }
    }
    if (dueDateObj <= settlementDateObj) {
      lastDueDateBeforeSettlement = dueDateObj;
    }
  });

  if (unpaidPrincipal < 0) unpaidPrincipal = 0;
  if (unpaidInterest  < 0) unpaidInterest  = 0;

  if (!_scheduleRows.length) {
    unpaidPrincipal = outstandingBalance;
    unpaidInterest  = 0;
  }

  // ── Day-count accrued interest for the CURRENT, not-yet-due period ──
  // Standard microfinance convention: actual calendar days / 365, applied
  // to the declining principal balance, at the loan's contracted annual
  // rate. Covers the gap between the last due date that's already been
  // billed above and the actual settlement date — e.g. a customer settling
  // on the 15th, mid-cycle, owes 14 days of real accrued interest that a
  // due-date-only calculation would otherwise miss entirely.
  let accruedPartialInterest = 0;
  const periodStart = lastDueDateBeforeSettlement || new Date(_loanRecord.disbursement_date || _loanRecord.created_on);
  const daysSincePeriodStart = Math.max(0, Math.round((settlementDateObj - periodStart) / 86400000));
  const annualRate = parseFloat(_loanRecord.interest_rate || 0) / 100;
  if (daysSincePeriodStart > 0 && annualRate > 0 && unpaidPrincipal > 0) {
    accruedPartialInterest = parseFloat(
      (unpaidPrincipal * annualRate * (daysSincePeriodStart / 365)).toFixed(2)
    );
  }
  unpaidInterest += accruedPartialInterest;

  const penaltyRate = _earlySettlementPenaltyRate;
  const penalty = unpaidPrincipal * penaltyRate;

  const waiver = parseFloat(document.getElementById('payoffWaiver')?.value || 0) || 0;
  const netSettlement = unpaidPrincipal + unpaidInterest + penalty - waiver;

  const tbody = document.querySelector('#dynamicPayoffGrid tbody');
  if (tbody) {
    tbody.innerHTML = `
      <tr><td>Outstanding Principal</td><td class="text-right">${fmt(unpaidPrincipal)}</td></tr>
      <tr><td>Overdue Interest (billed installments)</td><td class="text-right">${fmt(unpaidInterest - accruedPartialInterest)}</td></tr>
      <tr><td>Accrued Interest — current period (${daysSincePeriodStart}d @ actual/365)</td><td class="text-right">${fmt(accruedPartialInterest)}</td></tr>
      <tr><td>Early Settlement Penalty (${(penaltyRate*100).toFixed(2)}%)</td><td class="text-right">${fmt(penalty)}</td></tr>
      <tr><td>Less: Approved Waiver</td><td class="text-right">−${fmt(waiver)}</td></tr>
      <tr style="border-top:2px solid var(--accent,#0d3460);">
        <td style="font-weight:700;">Net Settlement Amount</td>
        <td class="text-right" style="font-weight:700;">${fmt(netSettlement)}</td>
      </tr>
    `;
  }

  document.getElementById('payoffLoanBalance').value = fmt(outstandingBalance);
  document.getElementById('payoffNetAmount').value    = fmt(netSettlement);

  return { unpaidPrincipal, unpaidInterest, penalty, waiver, netSettlement, outstandingBalance };
}

document.getElementById('payoffWaiver')?.addEventListener('input', computePayoff);
document.getElementById('payoffSettlementDate')?.addEventListener('change', computePayoff);

/* ── Process Settlement ─────────────────────────────────── */
async function processSettlement() {
  if (!_loadedAppId || !_loanRecord) { toast('Load a loan record first.', 'warning'); return; }
  if (_loanRecord.application_status === 'Settled') { toast('This loan is already settled.', 'warning'); return; }

  const components = computePayoff();
  const settlementDate = document.getElementById('payoffSettlementDate')?.value;
  const settledBy       = document.getElementById('payoffSettledBy')?.value?.trim();
  const paymentMode      = document.getElementById('payoffPaymentMode')?.value;

  if (!settlementDate) { toast('Enter a Settlement Date.', 'warning'); return; }
  if (!settledBy)       { toast('Enter Settled By (officer ID).', 'warning'); return; }

  if (!confirm(`Confirm full settlement of ${_loadedAppId} for ETB ${fmt(components.netSettlement)}?`)) return;

  const sb = document.getElementById('statusBar');
  if (sb) sb.textContent = 'Processing settlement…';

  try {
    // 1. Post final payoff entry to loan_ledger — repayments set as negative to reduce balance [1]
    await sbFetch('loan_ledger', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify({
        application_id: _loadedAppId,
        client_id:      _loanRecord.client_id,
        post_date:      settlementDate,
        value_date:     settlementDate,
        description:    `Full settlement / early payoff via ${paymentMode}`,
        ref_batch:      `SETTLE-${_loadedAppId}-${Date.now()}`,
        principal:      -components.unpaidPrincipal, // negative repayment [1]
        interest:       -components.unpaidInterest,  // negative repayment [1]
        charges_penalties: components.penalty - components.waiver,
        total_paid:     components.netSettlement,
        running_balance: 0,
        borrower_name:  _loanRecord.client_name || null,
      })
    });

    // 2. Update loanmasterrecords status
    await sbFetch(`loanmasterrecords?application_id=eq.${encodeURIComponent(_loadedAppId)}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({
        application_status: 'Settled',
        modified_by: settledBy,
        modified_on: new Date().toISOString(),
      })
    });

    toast(`✔ Loan ${_loadedAppId} settled. Net amount: ETB ${fmt(components.netSettlement)}`, 'success');
    if (sb) sb.textContent = `Settled — ${_loadedAppId}`;

    await loadPayoffRecord();
  } catch (e) {
    toast('Settlement error: ' + e.message, 'error');
    if (sb) sb.textContent = 'Settlement failed — see toast.';
  }
}

/* ── Mode Control ──────────────────────────────────────── */
function setMode(mode) {
  const sb = document.getElementById('statusBar');
  if (sb && mode) sb.textContent = `Mode: ${mode.charAt(0).toUpperCase() + mode.slice(1)} — Ready`;
}

/* ── Toolbar ─────────────────────────────────────────────── */
document.getElementById('btnGlobalView')?.addEventListener('click', loadPayoffRecord);
document.getElementById('btnSearchPayoff')?.addEventListener('click', loadPayoffRecord);
document.getElementById('btnProcessSettlement')?.addEventListener('click', processSettlement);

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
  document.querySelector('#dynamicPayoffGrid tbody').innerHTML =
    '<tr><td colspan="2" class="text-center gray-text italic">Enter an Application ID to calculate pay-off components.</td></tr>';
  document.querySelector('#installmentScheduleTable tbody').innerHTML =
    '<tr><td colspan="7" class="text-center gray-text italic">Load a loan record to view schedule.</td></tr>';
  document.querySelector('#loanStatementTable tbody').innerHTML =
    '<tr><td colspan="9" class="text-center gray-text italic">No statement data available.</td></tr>';
  document.querySelector('#loanHistoryTable tbody').innerHTML =
    '<tr><td colspan="9" class="text-center gray-text italic">No history records.</td></tr>';
  toast('Record closed.');
});
document.getElementById('btnGlobalDelete')?.addEventListener('click', () => {
  toast('Settlement records cannot be deleted.', 'warning');
});
document.getElementById('btnGlobalPrint')?.addEventListener('click', () => window.print());
document.getElementById('btnDenomination')?.addEventListener('click', () => {
  toast('Use Module 08 — Teller Cash Vault Control to record cash denomination for this settlement.', '');
});

/* ── Init ───────────────────────────────────────────────── */
async function init() {
  await loadBranches();
}
init();
