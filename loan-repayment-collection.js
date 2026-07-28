/* ═══════════════════════════════════════════════════════════
   Africa Village Microfinance — 15 Loan Repayment / Collection
   loan-repayment-collection.js  v1.1

   FIXES OVER v1.0 (see inline comments for full explanation):
   1. allocatePayment()/updateHierarchyPreview() previously only ever
      looked at the SINGLE next unpaid installment's interest_due, and
      dumped everything else remaining into "Principal" — including
      interest owed on any FURTHER overdue installments. Whenever more
      than one installment was overdue, the confirmation dialog and the
      printed customer receipt showed a materially wrong interest/
      principal split compared to what post_loan_repayment() actually
      posts to loan_ledger and the GL (which allocates oldest-first,
      interest-then-principal, across EVERY unpaid installment). Fixed
      by mirroring that same oldest-first walk client-side using the
      full schedule already fetched for the live display panel.
   2. postPayment() read `result.unallocated_overpayment` — the v3 RPC's
      field name for an overpayment that was left UNPOSTED (a real GL
      imbalance bug, fixed separately in post_loan_repayment_v4.sql).
      v4 renames this to `overpayment_suspense` since the amount is now
      actually posted to a GL suspense account instead of just reported.
      This file now reads the new name, with a fallback to the old name
      so it still works unmodified against a not-yet-upgraded v3 database.

   Tables written:
     → loan_ledger (one repayment row per payment posted)
     → amortization_schedules (installment status → PAID/PARTIAL)
     → loanmasterrecords (application_status → Matured, only when
                           the loan hits zero balance through normal
                           amortization — NOT early payoff/write-off,
                           which stays Module 09's job)
   Tables read:
     → loanmasterrecords, loan_ledger, amortization_schedules

   Requires loan-status-guard.js loaded BEFORE this file. (Note: this
   module currently does its OWN inline application_status check in
   loadLoan() rather than calling LoanStatusGuard.canTransition() — it
   still safely blocks non-Disbursed loans, but for consistency with
   disbursement.js / credit-sanction-console.js it should eventually
   call the shared guard too. Not changed here since it isn't a bug,
   just an inconsistency — flagging it so it doesn't get missed.)

   REPAYMENT HIERARCHY (matches loan_ledger_sample.pdf, Section 2 —
   "System Logic & Key Features"):
     1. Taxes / Insurance (not yet modeled in schema — always 0 for now)
     2. Penalties / Late Fees
     3. Accrued Interest (oldest unpaid installment first)
     4. Principal Balance (oldest unpaid installment first)
   Anything left over after the full outstanding balance is cleared is
   reported as an unapplied credit rather than silently discarded.
═══════════════════════════════════════════════════════════ */

'use strict';

const SUPABASE_URL = 'https://oxzthrubidohuwwhxsrk.supabase.co';
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
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}
function daysBetween(a, b) { return Math.round((b - a) / 86400000); }

/* ── Penalty policy — configurable PER PRODUCT via
   lendingproductparametermatrix (penalty_rate_daily, grace_period_days),
   fetched fresh for each loaded loan instead of a single hardcoded global
   constant. These fallbacks match the sample contract terms only as a
   safety net if a product row is somehow missing its own values. ── */
const FALLBACK_GRACE_PERIOD_DAYS  = 5;
const FALLBACK_DAILY_PENALTY_RATE = 0.00025;
let _graceperiodDays  = FALLBACK_GRACE_PERIOD_DAYS;
let _dailyPenaltyRate = FALLBACK_DAILY_PENALTY_RATE;

/* ── State ────────────────────────────────────────────────── */
let _record          = null;  // loanmasterrecords row
let _lastLedgerRow    = null; // most recent loan_ledger row (running balance source)
let _nextInstallment  = null; // next UNPAID row from amortization_schedules (for display only)
let _unpaidSchedule   = [];   // NEW — ALL unpaid installments, oldest first, for accurate preview
let _computedPenalty  = 0;
let _daysOverdue      = 0;

/* ══════════════════════════════════════════════════════════
   LOAD LOAN
══════════════════════════════════════════════════════════ */

/* ── Group Context — shows whether this loan is part of a group batch,
   and which member it is. Purely informational. ── */
async function loadGroupContext(rec) {
  const banner = document.getElementById('groupContextBanner');
  const text   = document.getElementById('groupContextText');
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
    loadGroupContext(_record);

    if (_record.application_status !== 'Disbursed') {
      toast(`This loan's status is "${_record.application_status}" — repayments can only be posted against a Disbursed loan.`, 'warning');
      setSB(`Loan status: ${_record.application_status} — repayment blocked.`);
      resetPanels();
      return;
    }

    // Pull this loan's PRODUCT-SPECIFIC penalty policy, falling back to the
    // sample contract defaults only if the product row is missing values.
    try {
      const productRows = await sbFetch(
        `lendingproductparametermatrix?product_code_id=eq.${encodeURIComponent(_record.product_id)}&select=penalty_rate_daily,grace_period_days,interest_calculation_method&limit=1`
      );
      const prod = productRows && productRows[0];
      _graceperiodDays  = (prod && prod.grace_period_days   != null) ? prod.grace_period_days   : FALLBACK_GRACE_PERIOD_DAYS;
      _dailyPenaltyRate = (prod && prod.penalty_rate_daily  != null) ? prod.penalty_rate_daily  : FALLBACK_DAILY_PENALTY_RATE;
    } catch (e) {
      console.warn('Could not load product penalty policy, using defaults:', e.message);
      _graceperiodDays  = FALLBACK_GRACE_PERIOD_DAYS;
      _dailyPenaltyRate = FALLBACK_DAILY_PENALTY_RATE;
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

    // Full schedule for the live display panel — ALL rows, any status,
    // ordered by installment number.
    const fullSchedule = await sbFetch(
      `amortization_schedules?application_id=eq.${encodeURIComponent(appId)}&order=installment_no.asc`
    );

    // NEW — every UNPAID/PARTIAL installment, oldest first. This is the
    // exact same set post_loan_repayment() walks server-side, so building
    // the client-side preview from this (instead of just the single next
    // installment) is what makes updateHierarchyPreview() actually match
    // what gets posted.
    _unpaidSchedule = (fullSchedule || [])
      .filter(r => r.status !== 'PAID')
      .sort((a, b) => (a.installment_no || 0) - (b.installment_no || 0));
    _nextInstallment = _unpaidSchedule[0] || null;

    renderLiveSchedule(fullSchedule || []);
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

/* ── Live amortization schedule display ──────────────────── */
function renderLiveSchedule(rows) {
  const panel = document.getElementById('rpcScheduleLivePanel');
  const tbody = document.getElementById('tbodyScheduleLive');
  const note  = document.getElementById('scheduleLiveNote');
  if (!panel || !tbody) return;
  if (!rows.length) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';

  // Flag duplicate installment_no values directly in the UI — this is a
  // real data problem (usually caused by disbursement running twice for
  // the same loan), not just a display quirk, and it silently breaks
  // repayment allocation if left unnoticed.
  const seen = new Map();
  rows.forEach(r => seen.set(r.installment_no, (seen.get(r.installment_no) || 0) + 1));
  const duplicateNos = [...seen.entries()].filter(([, count]) => count > 1).map(([no]) => no);

  tbody.innerHTML = rows.map(r => {
    const isDup = duplicateNos.includes(r.installment_no);
    return `
    <tr${isDup ? ' style="background:#fee2e2;"' : ''}>
      <td>${escapeHtml(r.installment_no)}${isDup ? ' ⚠️' : ''}</td>
      <td>${escapeHtml(fmtDate(r.due_date))}</td>
      <td class="r">${fmt(r.principal_due)}</td>
      <td class="r">${fmt(r.principal_paid)}</td>
      <td class="r">${fmt(r.interest_due)}</td>
      <td class="r">${fmt(r.interest_paid)}</td>
      <td>${escapeHtml(r.status)}</td>
    </tr>`;
  }).join('');

  if (duplicateNos.length > 0) {
    note.innerHTML = `⚠️ <strong>Data problem:</strong> installment number(s) ${duplicateNos.join(', ')} ` +
      `appear more than once for this loan — usually means disbursement ran twice for the same application. ` +
      `This can cause a single payment to be mis-allocated across duplicate rows. Recommend checking ` +
      `<code>disbursement.js</code> for a duplicate-insert, and cleaning up the extra row(s) before posting further repayments on this loan.`;
    note.style.color = '#dc2626';
  } else {
    note.textContent = '';
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
  const chargeableDays = Math.max(0, _daysOverdue - _graceperiodDays);
  if (chargeableDays <= 0) return;

  const balance = parseFloat(_lastLedgerRow.running_balance) || 0;
  _computedPenalty = parseFloat((balance * _dailyPenaltyRate * chargeableDays).toFixed(2));
}

/* ── Render summary card ─────────────────────────────────── */
function renderSummary() {
  document.getElementById('rpcSummaryCard').style.display = 'flex';
  document.getElementById('sAppId').textContent   = _record.application_id;
  document.getElementById('sBorrower').textContent = _record.client_name || _lastLedgerRow.borrower_name || '—';
  document.getElementById('sBalance').textContent  = fmt(_lastLedgerRow.running_balance);

  if (_nextInstallment) {
    document.getElementById('sDueDate').textContent      = fmtDate(_nextInstallment.due_date);
    document.getElementById('sInterestDue').textContent  = fmt(_nextInstallment.interest_due);
    document.getElementById('sPrincipalDue').textContent = fmt(_nextInstallment.principal_due);
  } else {
    document.getElementById('sDueDate').textContent      = 'No unpaid installments';
    document.getElementById('sInterestDue').textContent  = '—';
    document.getElementById('sPrincipalDue').textContent = '—';
  }

  const daysEl = document.getElementById('sDaysOverdue');
  daysEl.textContent = _daysOverdue > 0 ? `${_daysOverdue} days` : 'Not overdue';
  daysEl.className = 'rpc-meta-value' + (_daysOverdue > _graceperiodDays ? ' danger' : _daysOverdue > 0 ? ' warn' : '');

  const noteEl = document.getElementById('penaltyNote');
  if (_computedPenalty > 0) {
    noteEl.style.display = 'block';
    noteEl.innerHTML = `⚠ ${_daysOverdue} days overdue (grace period ${_graceperiodDays} days). ` +
      `Computed penalty: <strong>${fmt(_computedPenalty)}</strong> at ${(_dailyPenaltyRate*100).toFixed(3)}%/day. ` +
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
  document.getElementById('rpcScheduleLivePanel').style.display = 'none';
  document.getElementById('btnPost').disabled = true;
  _record = null; _lastLedgerRow = null; _nextInstallment = null; _unpaidSchedule = [];
}

/* ══════════════════════════════════════════════════════════
   REPAYMENT HIERARCHY — allocate a payment amount

   FIX: previously this only ever consumed _nextInstallment.interest_due
   for the "Accrued Interest" step, then dumped ALL remaining funds into
   "Principal" regardless of how much of that was actually still-unpaid
   INTEREST on a second, third, etc. overdue installment. The real
   post_loan_repayment() RPC walks every unpaid installment oldest-first,
   paying that installment's interest before its principal, then moves to
   the next installment — so whenever more than one installment was
   overdue, this preview understated interest and overstated principal
   versus what actually got posted to loan_ledger / gl_transaction_journal.

   Now this walks the SAME _unpaidSchedule list (oldest first, interest
   before principal per installment) that was fetched in loadLoan(), so
   the confirmation dialog, the printed receipt, and the actual RPC
   posting agree with each other.

   Order: Taxes/Insurance (0, unmodeled) → Penalties → Interest → Principal
══════════════════════════════════════════════════════════ */
function allocatePayment(amount) {
  let remaining = Math.max(0, amount || 0);
  const waivePenalty = document.getElementById('fWaivePenalty').checked;
  const penaltyDue   = waivePenalty ? 0 : _computedPenalty;
  const taxesApplied = 0; // not modeled in current schema

  const penaltyApplied = Math.min(remaining, penaltyDue);
  remaining -= penaltyApplied;

  // Walk every unpaid installment oldest-first — interest before
  // principal on each one — exactly like post_loan_repayment() does.
  let interestApplied  = 0;
  let principalApplied = 0;
  let interestDueTotal  = 0;
  let principalDueTotal = 0;

  for (const inst of _unpaidSchedule) {
    const instInterestOutstanding  = Math.max(0, (parseFloat(inst.interest_due)  || 0) - (parseFloat(inst.interest_paid)  || 0));
    const instPrincipalOutstanding = Math.max(0, (parseFloat(inst.principal_due) || 0) - (parseFloat(inst.principal_paid) || 0));
    interestDueTotal  += instInterestOutstanding;
    principalDueTotal += instPrincipalOutstanding;

    if (remaining <= 0) continue; // still need the totals above for display, so don't break early

    const payInterest = Math.min(remaining, instInterestOutstanding);
    remaining -= payInterest;
    interestApplied += payInterest;

    const payPrincipal = Math.min(remaining, instPrincipalOutstanding);
    remaining -= payPrincipal;
    principalApplied += payPrincipal;
  }

  // Genuine early-payoff/prepayment: extra beyond every installment's own
  // principal, applied against the loan's total remaining principal
  // balance (matches the RPC's early-payoff step).
  const totalOutstandingPrincipal = parseFloat(_lastLedgerRow?.running_balance) || 0;
  if (remaining > 0) {
    const prepay = Math.min(remaining, Math.max(0, totalOutstandingPrincipal - principalApplied));
    principalApplied += prepay;
    remaining -= prepay;
  }

  const excess = remaining; // unapplied / advance credit — posted to OVERPAY_SUSPENSE by the v4 RPC

  return {
    taxesApplied, penaltyApplied, interestApplied, principalApplied, excess,
    penaltyDue, interestDue: interestDueTotal, principalDue: totalOutstandingPrincipal,
    waivePenalty
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
    html += `<tr class="hier-excess"><td>Unapplied Credit (overpayment — held in suspense)</td><td class="r">${fmt(alloc.excess)}</td></tr>`;
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

  const amount    = parseFloat(document.getElementById('fAmount').value);
  const payDate   = document.getElementById('fPayDate').value;
  const payMode   = document.getElementById('fPayMode').value;
  const refBatch  = document.getElementById('fRefBatch').value.trim();

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

    // FIX: v4 of post_loan_repayment renames 'unallocated_overpayment' to
    // 'overpayment_suspense' (the amount is now actually posted to a GL
    // suspense account, not just left unposted and reported). Read the
    // new field name first; fall back to the old one so this still works
    // unmodified against a database still running the v3 function.
    const overpayAmount = (result.overpayment_suspense != null)
      ? result.overpayment_suspense
      : result.unallocated_overpayment;

    let overpayMsg = '';
    if (overpayAmount > 0) {
      overpayMsg = ` ⚠️ ${fmt(overpayAmount)} exceeded the total remaining balance — held in the overpayment suspense account. Review with the client (refund or apply to next loan/deposit).`;
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
