/* ═══════════════════════════════════════════════════════════
   Africa Village Microfinance — 15 Loan Repayment / Collection
   loan-repayment-collection.js  v2.0 — FULL REWRITE

   WHY THIS IS A REWRITE, NOT A PATCH:
   The v1.2 file this replaces was wired to element IDs that don't exist
   anywhere in loan-repayment-collection.html (repayAppId, fAmountReceived,
   fPenaltyCollected, btnLoadForRepayment...), called post_loan_repayment
   with parameter names that don't match its real signature (p_reference_no,
   p_narration, p_created_by — the real params are p_ref_batch,
   p_payment_date, p_posted_by, and there is no narration param at all),
   and read amortization_schedules columns that don't exist in the real
   table (installment_number, payment_status, installment_amount — the
   real columns are installment_no, status, principal_due/interest_due).
   Practically: Load Loan and Post Payment did nothing on click; Clear and
   Print Receipt had no listeners bound at all. This version is built
   against what's actually in the HTML and the actual database schema.

   NEW: Cash / Bank Account dropdown (fBankAccount), same pattern as
   disbursement.js — populated live from chart_of_accounts leaf bank
   accounts, passed to the RPC as p_gl_cash_account_code instead of the
   RPC guessing/defaulting to Main Cash.

   PENALTY: there's no manual penalty-amount input in this HTML (only a
   "Waive penalty" checkbox), so penalty is computed client-side as a
   preview — outstanding principal balance × the product's
   penalty_rate_daily × days overdue — and passed to the RPC as
   p_penalty_collected unless waived. This is a simple daily-accrual
   estimate for display/collection purposes; it is NOT authoritative
   provisioning math (see nbe-loan-loss-provision.js for that).
═══════════════════════════════════════════════════════════ */

'use strict';

const SUPABASE_URL = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';

async function sbFetch(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
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

async function sbRpc(fnName, payload) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
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

const fmt = n => parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ── State ──────────────────────────────────────────────── */
let _record = null;
let _lastLedgerRow = null;
let _schedule = [];
let _productPenaltyRate = 0;
let _repaymentInFlight = false;

/* ── Cash/Bank Account dropdown — same pattern as disbursement.js ── */
async function loadBankAccounts() {
  const sel = document.getElementById('fBankAccount');
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
    sel.value = '11101004'; // default to Main Cash, still overridable
  } catch (e) {
    console.warn('Could not load bank/cash accounts:', e.message);
  }
}

/* ── Group Loan context banner — same pattern as disbursement.js ── */
async function loadGroupContext(rec) {
  const banner = document.getElementById('groupContextBanner');
  const text = document.getElementById('groupContextText');
  if (!banner || !text) return;
  if (!rec.group_id) { banner.style.display = 'none'; return; }
  try {
    const [members, groupRows] = await Promise.all([
      sbFetch(`loanmasterrecords?group_id=eq.${encodeURIComponent(rec.group_id)}&select=application_id&order=application_id.asc`),
      sbFetch(`portfoliogrouphierarchy?group_registry_id=eq.${encodeURIComponent(rec.group_id)}&select=group_name_alias&limit=1`)
    ]);
    const total = Array.isArray(members) ? members.length : 1;
    const idx = Array.isArray(members) ? members.findIndex(m => m.application_id === rec.application_id) + 1 : 1;
    const groupName = (groupRows && groupRows[0] && groupRows[0].group_name_alias) ? ` — ${groupRows[0].group_name_alias}` : '';
    text.textContent = `${rec.group_id}${groupName} — Member ${idx > 0 ? idx : '?'} of ${total}`;
    banner.style.display = '';
  } catch (e) {
    text.textContent = `${rec.group_id} (could not load member count)`;
    banner.style.display = '';
  }
}

/* ── Load loan for repayment ────────────────────────────── */
async function loadLoanForRepayment() {
  const appId = document.getElementById('rpcAppId')?.value?.trim();
  if (!appId) { toast('Enter an Application ID.', 'warning'); return; }

  try {
    const rows = await sbFetch(`loanmasterrecords?application_id=eq.${encodeURIComponent(appId)}&limit=1`);
    if (!rows || !rows[0]) { toast(`Application ${appId} not found.`, 'error'); return; }
    _record = rows[0];

    if (_record.application_status !== 'Disbursed') {
      toast(`Loan status is ${_record.application_status}. Only Disbursed loans can receive repayments.`, 'warning');
      document.getElementById('rpcSummaryCard').style.display = 'none';
      document.getElementById('rpcEntryPanel').style.display = 'none';
      document.getElementById('rpcBreakdownPanel').style.display = 'none';
      document.getElementById('rpcScheduleLivePanel').style.display = 'none';
      document.getElementById('rpcEmpty').style.display = 'flex';
      document.getElementById('btnPost').disabled = true;
      return;
    }

    loadGroupContext(_record);

    // Product penalty rate, for the client-side penalty preview
    _productPenaltyRate = 0;
    if (_record.product_id) {
      try {
        const prod = await sbFetch(`lendingproductparametermatrix?product_code_id=eq.${encodeURIComponent(_record.product_id)}&select=penalty_rate_daily&limit=1`);
        if (prod && prod[0]) _productPenaltyRate = parseFloat(prod[0].penalty_rate_daily) || 0;
      } catch (_) {}
    }

    const ledger = await sbFetch(`loan_ledger?application_id=eq.${encodeURIComponent(appId)}&order=id.desc&limit=1`);
    _lastLedgerRow = ledger?.[0] || null;

    const sched = await sbFetch(`amortization_schedules?application_id=eq.${encodeURIComponent(appId)}&order=installment_no.asc`);
    _schedule = sched || [];

    populateRepaymentForm(_record, _lastLedgerRow, _schedule);
    document.getElementById('btnPost').disabled = false;
    toast(`Loan ${appId} loaded — balance: ETB ${fmt(_lastLedgerRow?.running_balance || 0)}.`, 'success');
  } catch (e) {
    toast('Load error: ' + e.message, 'error');
  }
}

function populateRepaymentForm(rec, ledger, schedule) {
  document.getElementById('rpcEmpty').style.display = 'none';
  document.getElementById('rpcSummaryCard').style.display = 'flex';
  document.getElementById('rpcEntryPanel').style.display = 'block';
  document.getElementById('rpcBreakdownPanel').style.display = 'block';
  document.getElementById('rpcScheduleLivePanel').style.display = 'block';

  document.getElementById('sAppId').textContent = rec.application_id;
  document.getElementById('sBorrower').textContent = rec.client_name || '—';
  document.getElementById('sBalance').textContent = `ETB ${fmt(ledger?.running_balance || 0)}`;

  const unpaid = schedule.filter(s => s.status === 'UNPAID' || s.status === 'PARTIAL');
  const totalInterestDue = unpaid.reduce((sum, s) => sum + Math.max((parseFloat(s.interest_due) || 0) - (parseFloat(s.interest_paid) || 0), 0), 0);
  const totalPrincipalDue = unpaid.reduce((sum, s) => sum + Math.max((parseFloat(s.principal_due) || 0) - (parseFloat(s.principal_paid) || 0), 0), 0);

  const today = new Date();
  const overdueRows = unpaid.filter(s => new Date(s.due_date) < today);
  const nextDue = unpaid.length ? unpaid[0].due_date : null;
  const maxDaysOverdue = overdueRows.length
    ? Math.max(...overdueRows.map(s => Math.round((today - new Date(s.due_date)) / 86400000)))
    : 0;

  document.getElementById('sDueDate').textContent = nextDue || '—';
  document.getElementById('sInterestDue').textContent = `ETB ${fmt(totalInterestDue)}`;
  document.getElementById('sPrincipalDue').textContent = `ETB ${fmt(totalPrincipalDue)}`;
  const daysEl = document.getElementById('sDaysOverdue');
  daysEl.textContent = maxDaysOverdue > 0 ? `${maxDaysOverdue} days` : 'Current';
  daysEl.className = 'rpc-meta-value' + (maxDaysOverdue > 30 ? ' danger' : maxDaysOverdue > 0 ? ' warn' : '');

  const appId = rec.application_id;
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  document.getElementById('fRefBatch').value = `RCPT-${appId}-${stamp}-${rand}`;
  document.getElementById('fPayDate').value = new Date().toISOString().slice(0, 10);

  loadBankAccounts();
  renderScheduleLive(schedule);
  updatePenaltyPreviewAndHierarchy(ledger?.running_balance || 0, maxDaysOverdue);
}

function renderScheduleLive(schedule) {
  const tbody = document.getElementById('tbodyScheduleLive');
  if (!tbody) return;
  tbody.innerHTML = schedule.map(s => `
    <tr>
      <td>${s.installment_no}</td>
      <td>${s.due_date}</td>
      <td class="r">${fmt(s.principal_due)}</td>
      <td class="r">${fmt(s.principal_paid)}</td>
      <td class="r">${fmt(s.interest_due)}</td>
      <td class="r">${fmt(s.interest_paid)}</td>
      <td>${s.status}</td>
    </tr>
  `).join('') || '<tr><td colspan="7" class="text-center gray-text italic">No schedule found.</td></tr>';
  document.getElementById('scheduleLiveNote').textContent =
    `${schedule.filter(s => s.status !== 'PAID').length} installment(s) still outstanding of ${schedule.length} total.`;
}

/* Preview of how a payment will apply, mirroring the RPC's own logic:
   interest-then-principal per installment, oldest first, penalty taken
   off the top before the schedule walk (same order post_loan_repayment
   uses: p_amount_received - p_penalty_collected feeds the schedule loop). */
function updatePenaltyPreviewAndHierarchy(runningBalance, daysOverdue) {
  const waived = document.getElementById('fWaivePenalty')?.checked;
  const penaltyNote = document.getElementById('penaltyNote');
  const suggestedPenalty = waived ? 0 : Math.round((runningBalance * _productPenaltyRate * Math.max(daysOverdue, 0)) * 100) / 100;

  if (daysOverdue > 0 && !waived) {
    penaltyNote.style.display = 'block';
    penaltyNote.textContent = `Suggested penalty: ETB ${fmt(suggestedPenalty)} (${daysOverdue} days overdue × ${(_productPenaltyRate * 100).toFixed(4)}%/day on ETB ${fmt(runningBalance)} balance). Check "Waive penalty" to skip this.`;
  } else if (daysOverdue > 0 && waived) {
    penaltyNote.style.display = 'block';
    penaltyNote.textContent = `Penalty waived for this payment (would otherwise be ETB ${fmt(Math.round((runningBalance * _productPenaltyRate * daysOverdue) * 100) / 100)}).`;
  } else {
    penaltyNote.style.display = 'none';
  }

  renderHierarchyPreview(suggestedPenalty);
  return suggestedPenalty;
}
document.getElementById('fWaivePenalty')?.addEventListener('change', () => {
  if (_record) {
    const daysEl = document.getElementById('sDaysOverdue');
    const days = daysEl.textContent === 'Current' ? 0 : parseInt(daysEl.textContent) || 0;
    updatePenaltyPreviewAndHierarchy(_lastLedgerRow?.running_balance || 0, days);
  }
});
document.getElementById('fAmount')?.addEventListener('input', () => {
  if (_record) renderHierarchyPreview(getCurrentPenaltyPreview());
});

function getCurrentPenaltyPreview() {
  const daysEl = document.getElementById('sDaysOverdue');
  const days = daysEl && daysEl.textContent !== 'Current' ? parseInt(daysEl.textContent) || 0 : 0;
  const waived = document.getElementById('fWaivePenalty')?.checked;
  if (waived || days <= 0) return 0;
  return Math.round(((_lastLedgerRow?.running_balance || 0) * _productPenaltyRate * days) * 100) / 100;
}

function renderHierarchyPreview(penaltyAmount) {
  const tbody = document.getElementById('tbodyHierarchy');
  const totalEl = document.getElementById('hierTotalApplied');
  if (!tbody) return;

  const amountReceived = parseFloat(document.getElementById('fAmount')?.value) || 0;
  let remaining = Math.max(amountReceived - penaltyAmount, 0);
  const steps = [];
  if (penaltyAmount > 0) steps.push({ label: 'Penalty / Late Fee', amount: Math.min(amountReceived, penaltyAmount) });

  let interestApplied = 0, principalApplied = 0;
  for (const s of _schedule) {
    if (s.status === 'PAID') continue;
    if (remaining <= 0) break;
    const interestDue = Math.max((parseFloat(s.interest_due) || 0) - (parseFloat(s.interest_paid) || 0), 0);
    const payInterest = Math.min(remaining, interestDue);
    remaining -= payInterest;
    interestApplied += payInterest;

    const principalDue = Math.max((parseFloat(s.principal_due) || 0) - (parseFloat(s.principal_paid) || 0), 0);
    const payPrincipal = Math.min(remaining, principalDue);
    remaining -= payPrincipal;
    principalApplied += payPrincipal;
  }
  if (interestApplied > 0) steps.push({ label: 'Accrued Interest', amount: interestApplied });
  if (principalApplied > 0) steps.push({ label: 'Principal Balance', amount: principalApplied });
  if (remaining > 0.005) steps.push({ label: 'Unapplied Credit (held in suspense)', amount: remaining, excess: true });

  tbody.innerHTML = steps.map((s, i) => `
    <tr class="${s.excess ? 'hier-excess' : ''}">
      <td><span class="hier-step-num">${i + 1}</span>${s.label}</td>
      <td class="r">${fmt(s.amount)}</td>
    </tr>
  `).join('') || '<tr class="hier-zero"><td colspan="2">Enter an amount to preview allocation.</td></tr>';

  totalEl.textContent = `ETB ${fmt(Math.min(amountReceived, penaltyAmount + interestApplied + principalApplied + remaining))}`;
}

/* ── Post payment ───────────────────────────────────────── */
async function postPayment() {
  if (!_record || !_lastLedgerRow) { toast('Load a loan first.', 'warning'); return; }
  if (_repaymentInFlight) { console.warn('Repayment already in progress — ignoring duplicate click.'); return; }

  const glCashAccountCode = document.getElementById('fBankAccount')?.value || null;
  if (!glCashAccountCode) { toast('Select a Cash / Bank Account before posting.', 'warning'); return; }

  _repaymentInFlight = true;
  const postBtn = document.getElementById('btnPost');
  if (postBtn) postBtn.disabled = true;

  try {
    const amountReceived = parseFloat(document.getElementById('fAmount')?.value) || 0;
    const refBatch = document.getElementById('fRefBatch')?.value?.trim() || '';
    const payDate = document.getElementById('fPayDate')?.value || new Date().toISOString().slice(0, 10);
    const payMode = document.getElementById('fPayMode')?.value || 'Cash';
    const penaltyCollected = getCurrentPenaltyPreview();

    if (amountReceived <= 0) { toast('Amount received must be greater than 0.', 'warning'); return; }
    if (!refBatch) { toast('Reference / batch is required.', 'warning'); return; }

    if (!confirm(
      `Post repayment?\n\n` +
      `Application: ${_record.application_id}\n` +
      `Amount: ETB ${fmt(amountReceived)}\n` +
      `Penalty: ETB ${fmt(penaltyCollected)}\n` +
      `Cash/Bank Account: ${document.getElementById('fBankAccount').selectedOptions[0].text}\n` +
      `Ref: ${refBatch}\n\n` +
      `This will update the loan ledger and post GL entries.`
    )) {
      toast('Payment cancelled.', 'info');
      return;
    }

    const result = await sbRpc('post_loan_repayment', {
      p_application_id: _record.application_id,
      p_amount_received: amountReceived,
      p_payment_date: payDate,
      p_ref_batch: refBatch,
      p_penalty_collected: penaltyCollected,
      p_payment_mode: payMode,
      p_posted_by: (window.currentUserEmail || null),
      p_gl_cash_account_code: glCashAccountCode
    });

    toast(
      `✔ Payment posted. Principal: ${fmt(result.total_principal_paid)} · Interest: ${fmt(result.total_interest_paid)}` +
      (result.overpayment_suspense > 0 ? ` · ETB ${fmt(result.overpayment_suspense)} held in suspense` : '') +
      (result.loan_matured ? ' · Loan fully matured 🎉' : ''),
      'success'
    );

    await loadLoanForRepayment();
    clearPaymentEntry();
  } catch (e) {
    toast('Post payment error: ' + e.message, 'error');
  } finally {
    _repaymentInFlight = false;
    if (postBtn) postBtn.disabled = false;
  }
}

function clearPaymentEntry() {
  document.getElementById('fAmount') && (document.getElementById('fAmount').value = '');
  document.getElementById('fWaivePenalty') && (document.getElementById('fWaivePenalty').checked = false);
  document.getElementById('tbodyHierarchy') && (document.getElementById('tbodyHierarchy').innerHTML = '');
  document.getElementById('hierTotalApplied') && (document.getElementById('hierTotalApplied').textContent = '—');
}

function clearAll() {
  _record = null;
  _lastLedgerRow = null;
  _schedule = [];
  document.getElementById('rpcAppId').value = '';
  document.getElementById('rpcSummaryCard').style.display = 'none';
  document.getElementById('rpcEntryPanel').style.display = 'none';
  document.getElementById('rpcBreakdownPanel').style.display = 'none';
  document.getElementById('rpcScheduleLivePanel').style.display = 'none';
  document.getElementById('groupContextBanner').style.display = 'none';
  document.getElementById('rpcEmpty').style.display = 'flex';
  document.getElementById('btnPost').disabled = true;
  toast('Cleared.', 'info');
}

function printReceipt() {
  if (!_record) { toast('Load a loan first.', 'warning'); return; }
  window.print();
}

/* ── Event bindings — matched to the REAL element IDs in the HTML ── */
document.getElementById('btnLoadLoan')?.addEventListener('click', loadLoanForRepayment);
document.getElementById('btnLoad2')?.addEventListener('click', loadLoanForRepayment);
document.getElementById('btnPost')?.addEventListener('click', postPayment);
document.getElementById('btnClear')?.addEventListener('click', clearAll);
document.getElementById('btnPrintReceipt')?.addEventListener('click', printReceipt);
document.getElementById('rpcAppId')?.addEventListener('keydown', e => { if (e.key === 'Enter') loadLoanForRepayment(); });

/* ── Init ───────────────────────────────────────────────── */
document.getElementById('btnPost').disabled = true;
window.addEventListener('DOMContentLoaded', () => {
  toast('Loan Repayment Collection v2.0 ready.', 'success');
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
