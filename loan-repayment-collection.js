/* ═══════════════════════════════════════════════════════════
   Africa Village Microfinance — 15 Loan Repayment / Collection
   loan-repayment-collection.js  v1.0

   Tables written:
     → loan_ledger             (one repayment row per payment posted)
     → amortization_schedules  (installment status → PAID/PARTIAL)
     → loanmasterrecords       (application_status → Matured, only when
                                 the loan hits zero balance through normal
                                 amortization — NOT early payoff/write-off,
                                 which stays Module 09's job)
   Tables read:
     → loanmasterrecords, loan_ledger, amortization_schedules

   Requires loan-status-guard.js loaded BEFORE this file.

   REPAYMENT HIERARCHY (matches loan_ledger_sample.pdf, Section 2 —
   "System Logic & Key Features"):
     1. Taxes / Insurance   (not yet modeled in schema — always 0 for now)
     2. Penalties / Late Fees
     3. Accrued Interest
     4. Principal Balance
   Anything left over after the full outstanding balance is cleared is
   reported as an unapplied credit rather than silently discarded.
═══════════════════════════════════════════════════════════ */
'use strict';

const SUPABASE_URL      = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';

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

async function sbRpc(fnName, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: {
      'apikey':        SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type':  'application/json'
    },
    body: JSON.stringify(params)
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // Postgres RAISE EXCEPTION messages arrive in data.message
    throw new Error((data && data.message) || `HTTP ${res.status}`);
  }
  return data;
}

/* ── Toast / status bar ──────────────────────────────────── */
const toastEl = document.getElementById('toastNotification');
let _toastTimer = null;
function toast(msg, type = '', duration = 3800) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.className = `toast show ${type}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { toastEl.className = 'toast'; }, duration);
}
function setSB(msg) { const sb = document.getElementById('statusBar'); if (sb) sb.textContent = msg; }

/* ── System date ──────────────────────────────────────────── */
(function() {
  const el = document.getElementById('systemDate');
  if (el) el.textContent = new Date().toLocaleDateString('en-ET', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
  });
  document.getElementById('fPayDate').valueAsDate = new Date();
})();

/* ── Formatters ───────────────────────────────────────────── */
function fmt(val) {
  if (val === null || val === undefined || isNaN(val)) return '—';
  const n = Number(val);
  if (n === 0) return '0.00 ETB';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ETB';
}
function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-');
}
function toISO(d) { return d.toISOString().split('T')[0]; }
function daysBetween(a, b) { return Math.round((b - a) / 86400000); }

/* ── Penalty policy (configurable defaults — matches sample PDF Section 4) ── */
const GRACE_PERIOD_DAYS = 5;
const DAILY_PENALTY_RATE = 0.00025; // 0.025% per day, per contract terms in sample

/* ── State ────────────────────────────────────────────────── */
let _record        = null;   // loanmasterrecords row
let _lastLedgerRow  = null;   // most recent loan_ledger row (running balance source)
let _nextInstallment = null; // next UNPAID row from amortization_schedules
let _computedPenalty = 0;
let _daysOverdue    = 0;

/* ══════════════════════════════════════════════════════════
   LOAD LOAN
══════════════════════════════════════════════════════════ */
async function loadLoan() {
  const appId = document.getElementById('rpcAppId').value.trim();
  if (!appId) { toast('Enter an Application ID.', 'warning'); return; }

  setSB('Looking up loan…');
  toast('Loading…', '');

  try {
    const masterRows = await sbFetch(`loanmasterrecords?application_id=eq.${encodeURIComponent(appId)}&limit=1`);
    if (!masterRows || !masterRows[0]) {
      toast(`No loan found for Application ID "${appId}".`, 'error');
      setSB('Load failed — no such application.');
      return;
    }
    _record = masterRows[0];

    if (_record.application_status !== 'Disbursed') {
      toast(`This loan's status is "${_record.application_status}" — repayments can only be posted against a Disbursed loan.`, 'warning');
      setSB(`Loan status: ${_record.application_status} — repayment blocked.`);
      resetPanels();
      return;
    }

    const ledgerRows = await sbFetch(
      `loan_ledger?application_id=eq.${encodeURIComponent(appId)}&order=id.desc&limit=1`
    );
    _lastLedgerRow = (ledgerRows && ledgerRows[0]) || null;
    if (!_lastLedgerRow) {
      toast('No ledger rows found — this loan may not have been disbursed through Module 10 yet.', 'warning');
      setSB('No ledger data — disburse the loan first.');
      resetPanels();
      return;
    }

    const schedRows = await sbFetch(
      `amortization_schedules?application_id=eq.${encodeURIComponent(appId)}&status=neq.PAID&order=due_date.asc&limit=1`
    );
    _nextInstallment = (schedRows && schedRows[0]) || null;

    computePenaltyPreview();
    renderSummary();
    document.getElementById('fRefBatch').value = `RCPT-${appId}-${Date.now().toString().slice(-6)}`;
    showPanels();
    updateHierarchyPreview();
    setSB(`Loaded ${appId} — outstanding balance ${fmt(_lastLedgerRow.running_balance)}`);
    toast('Loan loaded.', 'success');
  } catch (err) {
    toast('Load failed: ' + err.message, 'error');
    setSB('Load failed.');
  }
}

/* ── Penalty preview from days overdue vs grace period ──── */
function computePenaltyPreview() {
  _computedPenalty = 0;
  _daysOverdue = 0;
  if (!_nextInstallment || !_nextInstallment.due_date) return;

  const due   = new Date(_nextInstallment.due_date + 'T00:00:00');
  const today = new Date(new Date().toISOString().split('T')[0] + 'T00:00:00');
  if (today <= due) return;

  _daysOverdue = daysBetween(due, today);
  const chargeableDays = Math.max(0, _daysOverdue - GRACE_PERIOD_DAYS);
  if (chargeableDays <= 0) return;

  const balance = parseFloat(_lastLedgerRow.running_balance) || 0;
  _computedPenalty = parseFloat((balance * DAILY_PENALTY_RATE * chargeableDays).toFixed(2));
}

/* ── Render summary card ─────────────────────────────────── */
function renderSummary() {
  document.getElementById('rpcSummaryCard').style.display = 'flex';
  document.getElementById('sAppId').textContent = _record.application_id;
  document.getElementById('sBorrower').textContent = _record.client_name || _lastLedgerRow.borrower_name || '—';
  document.getElementById('sBalance').textContent = fmt(_lastLedgerRow.running_balance);

  if (_nextInstallment) {
    document.getElementById('sDueDate').textContent = fmtDate(_nextInstallment.due_date);
    document.getElementById('sInterestDue').textContent = fmt(_nextInstallment.interest_due);
    document.getElementById('sPrincipalDue').textContent = fmt(_nextInstallment.principal_due);
  } else {
    document.getElementById('sDueDate').textContent = 'No unpaid installments';
    document.getElementById('sInterestDue').textContent = '—';
    document.getElementById('sPrincipalDue').textContent = '—';
  }

  const daysEl = document.getElementById('sDaysOverdue');
  daysEl.textContent = _daysOverdue > 0 ? `${_daysOverdue} days` : 'Not overdue';
  daysEl.className = 'rpc-meta-value' + (_daysOverdue > GRACE_PERIOD_DAYS ? ' danger' : _daysOverdue > 0 ? ' warn' : '');

  const noteEl = document.getElementById('penaltyNote');
  if (_computedPenalty > 0) {
    noteEl.style.display = 'block';
    noteEl.innerHTML = `⚠ ${_daysOverdue} days overdue (grace period ${GRACE_PERIOD_DAYS} days). ` +
      `Computed penalty: <strong>${fmt(_computedPenalty)}</strong> at ${(DAILY_PENALTY_RATE*100).toFixed(3)}%/day. ` +
      `Check "Waive penalty" to skip it for this payment.`;
  } else {
    noteEl.style.display = 'none';
  }
}

function showPanels() {
  document.getElementById('rpcEmpty').style.display = 'none';
  document.getElementById('rpcEntryPanel').style.display = 'block';
  document.getElementById('rpcBreakdownPanel').style.display = 'block';
  document.getElementById('btnPost').disabled = false;
}
function resetPanels() {
  document.getElementById('rpcSummaryCard').style.display = 'none';
  document.getElementById('rpcEmpty').style.display = 'flex';
  document.getElementById('rpcEntryPanel').style.display = 'none';
  document.getElementById('rpcBreakdownPanel').style.display = 'none';
  document.getElementById('btnPost').disabled = true;
  _record = null; _lastLedgerRow = null; _nextInstallment = null;
}

/* ══════════════════════════════════════════════════════════
   REPAYMENT HIERARCHY — allocate a payment amount
   Order: Taxes/Insurance (0, unmodeled) → Penalties → Interest → Principal
══════════════════════════════════════════════════════════ */
function allocatePayment(amount) {
  let remaining = Math.max(0, amount || 0);

  const waivePenalty = document.getElementById('fWaivePenalty').checked;
  const penaltyDue   = waivePenalty ? 0 : _computedPenalty;
  const interestDue  = _nextInstallment ? parseFloat(_nextInstallment.interest_due) || 0 : 0;
  const principalDue = parseFloat(_lastLedgerRow?.running_balance) || 0;

  const taxesApplied    = 0; // not modeled in current schema
  const penaltyApplied  = Math.min(remaining, penaltyDue);   remaining -= penaltyApplied;
  const interestApplied = Math.min(remaining, interestDue);  remaining -= interestApplied;
  const principalApplied = Math.min(remaining, principalDue); remaining -= principalApplied;
  const excess = remaining; // unapplied / advance credit

  return {
    taxesApplied, penaltyApplied, interestApplied, principalApplied, excess,
    penaltyDue, interestDue, principalDue, waivePenalty
  };
}

function updateHierarchyPreview() {
  const amount = parseFloat(document.getElementById('fAmount').value) || 0;
  const alloc = allocatePayment(amount);
  const tbody = document.getElementById('tbodyHierarchy');

  const row = (n, label, val, extraClass = '') => `
    <tr class="${val === 0 ? 'hier-zero' : ''} ${extraClass}">
      <td><span class="hier-step-num">${n}</span>${label}</td>
      <td class="r">${val > 0 ? fmt(val) : '—'}</td>
    </tr>`;

  let html = '';
  html += row(1, 'Taxes / Insurance', alloc.taxesApplied);
  html += row(2, `Penalties / Late Fees${alloc.waivePenalty ? ' (waived)' : ''}`, alloc.penaltyApplied);
  html += row(3, 'Accrued Interest', alloc.interestApplied);
  html += row(4, 'Principal Balance', alloc.principalApplied);
  if (alloc.excess > 0) {
    html += `<tr class="hier-excess"><td>Unapplied Credit (overpayment)</td><td class="r">${fmt(alloc.excess)}</td></tr>`;
  }
  tbody.innerHTML = html;

  const totalApplied = alloc.taxesApplied + alloc.penaltyApplied + alloc.interestApplied + alloc.principalApplied;
  document.getElementById('hierTotalApplied').textContent = fmt(totalApplied);
}

document.getElementById('fAmount').addEventListener('input', updateHierarchyPreview);
document.getElementById('fWaivePenalty').addEventListener('change', updateHierarchyPreview);

/* ══════════════════════════════════════════════════════════
   POST PAYMENT
══════════════════════════════════════════════════════════ */
async function postPayment() {
  if (!_record || !_lastLedgerRow) { toast('Load a loan first.', 'warning'); return; }

  const amount   = parseFloat(document.getElementById('fAmount').value);
  const payDate  = document.getElementById('fPayDate').value;
  const payMode  = document.getElementById('fPayMode').value;
  const refBatch = document.getElementById('fRefBatch').value.trim();

  if (!amount || amount <= 0) { toast('Enter a valid payment amount.', 'error'); return; }
  if (!payDate)  { toast('Enter a payment date.', 'error'); return; }
  if (!refBatch) { toast('Reference / Batch is required.', 'error'); return; }

  const alloc = allocatePayment(amount);
  const appId = _record.application_id;

  if (!confirm(
    `Post ${fmt(amount)} against ${appId}?\n\n` +
    `Penalty: ${fmt(alloc.penaltyApplied)}\nInterest: ${fmt(alloc.interestApplied)}\n` +
    `Principal: ${fmt(alloc.principalApplied)}` +
    (alloc.excess > 0 ? `\nUnapplied credit: ${fmt(alloc.excess)}` : '')
  )) return;

  setSB('Posting repayment…');
  document.getElementById('btnPost').disabled = true;

  try {
    // Single atomic transaction — allocates across ALL unpaid installments,
    // updates the ledger, posts double-entry to the GL, and auto-matures
    // the loan if this payment clears it, all-or-nothing.
    const result = await sbRpc('post_loan_repayment', {
      p_application_id:    appId,
      p_amount_received:   amount,
      p_penalty_collected: alloc.penaltyApplied || 0,
      p_payment_date:      payDate,
      p_ref_batch:         refBatch,
      p_payment_mode:      payMode || null,
      p_posted_by:         (window.currentUserEmail || null)
    });

    let maturedMsg = '';
    if (result.loan_matured) {
      maturedMsg = ' Loan fully repaid — status set to Matured.';
    }
    let overpayMsg = '';
    if (result.unallocated_overpayment > 0) {
      overpayMsg = ` ⚠️ ${fmt(result.unallocated_overpayment)} could not be allocated (exceeds total remaining principal) — review manually.`;
    }

    toast(`Payment posted.${maturedMsg}${overpayMsg}`, overpayMsg ? 'warning' : 'success', 6500);
    setSB(`Posted ${fmt(amount)} against ${appId}. New balance: ${fmt(result.new_balance)}.${maturedMsg}`);

    document.getElementById('fAmount').value = '';
    await loadLoan();

  } catch (err) {
    toast('Post failed: ' + err.message, 'error');
    setSB('Post failed.');
  } finally {
    document.getElementById('btnPost').disabled = false;
  }
}

/* ── Print receipt (simple browser print of the summary + breakdown) ── */
function printReceipt() {
  if (!_record) { toast('Load a loan first.', 'warning'); return; }
  window.print();
}

/* ── Clear form ───────────────────────────────────────────── */
function clearForm() {
  document.getElementById('rpcAppId').value = '';
  document.getElementById('fAmount').value = '';
  document.getElementById('fWaivePenalty').checked = false;
  resetPanels();
  setSB('Status: Ready');
  toast('Cleared.');
}

/* ── Wiring ───────────────────────────────────────────────── */
document.getElementById('btnLoadLoan').addEventListener('click', loadLoan);
document.getElementById('btnLoad2').addEventListener('click', loadLoan);
document.getElementById('btnPost').addEventListener('click', postPayment);
document.getElementById('btnClear').addEventListener('click', clearForm);
document.getElementById('btnPrintReceipt').addEventListener('click', printReceipt);
document.getElementById('rpcAppId').addEventListener('keydown', e => { if (e.key === 'Enter') loadLoan(); });
