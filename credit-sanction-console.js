/* ═══════════════════════════════════════════════════════════
   Africa Village Microfinance — 04 Credit Sanction Console
   credit-sanction-console.js  v3.0 — rebuilt against real field IDs

   The previous "v2.4 PATCHED" upload had, independently confirmed:
     • Every element ID referenced (buttons included) did not exist in
       the real HTML — the Load/Save buttons couldn't even be clicked
     • canTransition() called with 2 args instead of 3 — the missing
       sourceModule argument means the authorization check always fails
     • logStatusTransition() called with wrong (positional) signature
     • `approvedBy` referenced but never declared — guaranteed crash
     • Wrote to tenure_months / sanction_date / sanction_remarks —
       none of these columns exist (real ones: term_months, approved_date;
       no remarks column at all)
     • Reverted to two raw sequential PATCHes instead of the atomic
       post_credit_sanction RPC, losing both atomicity and the
       server-side ceiling re-check
   This version fixes all of the above, built against the real HTML.
═══════════════════════════════════════════════════════════ */

'use strict';

const SUPABASE_URL = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';

async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: opts.prefer || 'return=representation',
      ...(opts.headers || {})
    }
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    let msg = 'HTTP ' + res.status;
    try { const j = JSON.parse(txt); msg = j.message || j.hint || msg; } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text || !text.trim()) return null;
  try { return JSON.parse(text); } catch { return null; }
}

async function sbRpc(fnName, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.message) || `HTTP ${res.status}`);
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

/* ── System date ───────────────────────────────────────── */
(function initDate() {
  const el = document.getElementById('systemDate');
  if (el) el.textContent = new Date().toLocaleDateString('en-ET', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
  });
})();

const fmt = n => parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const getVal = id => { const el = document.getElementById(id); return el ? (el.value || '').trim() || null : null; };
const getNum = id => { const v = parseFloat(getVal(id)); return isNaN(v) ? null : v; };
const getInt = id => { const v = parseInt(getVal(id)); return isNaN(v) ? null : v; };
const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = (v === null || v === undefined) ? '' : v; };

/* ── State ──────────────────────────────────────────────── */
let _loadedAppId = null;
let _loadedRecord = null;

/* ── Lookup ──────────────────────────────────────────────── */
async function lookupApplication() {
  const appId = getVal('sanctionApplicationId');
  if (!appId) { toast('Enter an Application ID.', 'warning'); return; }

  const sb = document.getElementById('statusBar');
  if (sb) sb.textContent = 'Looking up application…';

  try {
    const rows = await sbFetch(`loanmasterrecords?application_id=eq.${encodeURIComponent(appId)}&limit=1`);
    if (!rows || !rows[0]) {
      toast(`Application ${appId} not found.`, 'error');
      if (sb) sb.textContent = 'Not found.';
      return;
    }
    _loadedRecord = rows[0];
    _loadedAppId = appId;
    populateForm(_loadedRecord);
    toast(`Application ${appId} loaded — status: ${_loadedRecord.application_status}.`, 'success');
    if (sb) sb.textContent = `Loaded ${appId}. Status: ${_loadedRecord.application_status}.`;
  } catch (e) {
    toast('Lookup failed: ' + e.message, 'error');
    if (sb) sb.textContent = 'Lookup failed.';
  }
}

function populateForm(rec) {
  // Editable sanction fields — pre-fill with existing values if re-opening
  setVal('sanctionApprovedAmount', rec.approved_amount || rec.applied_amount || '');
  setVal('sanctionNoOfDisbursements', rec.no_of_disbursements || 1);
  setVal('sanctionRepaymentTerm', rec.repayment_term_months || rec.term_months || '');
  setVal('sanctionInstallmentStartDate', rec.installment_start_date || '');
  setVal('sanctionMarkingRate2', rec.marking_rate || '');
  setVal('sanctionInterestRate', rec.interest_rate || '');
  setVal('sanctionRepayAccId', rec.main_repayment_account_id || '');
  setVal('sanctionApprovedBy', rec.approved_by || '');
  setVal('sanctionApprovedDate', rec.approved_date || new Date().toISOString().slice(0, 10));
  setVal('sanctionModeOfDisb', rec.mode_of_disbursement || 'Transfer');
  setVal('sanctionFirstDisbDate', rec.first_disbursement_date || '');
  setVal('sanctionGracePeriod', rec.grace_period || '');
  setVal('sanctionInterestRateType', rec.interest_rate_type || '');
  setVal('sanctionInstallmentAmt', rec.installment_amount || '');

  // Read-only application details
  setVal('sanctionClientId', rec.client_id || '');
  setVal('sanctionLoanType', rec.loan_purpose || '');
  setVal('sanctionAccountId', rec.application_id || '');
  setVal('sanctionProductId', rec.product_id || '');
  setVal('sanctionSanctionAmount', fmt(rec.applied_amount));
  setVal('sanctionTerm', rec.term_months || '');
  setVal('sanctionAppliedAmount', fmt(rec.applied_amount));
  setVal('sanctionRepaymentTerm2', rec.repayment_term_months || rec.term_months || '');
  setVal('sanctionInterestRateR', rec.interest_rate || '');
  setVal('sanctionAppStatus', rec.application_status || '');
  setVal('sanctionGracePeriod2', rec.grace_period || '');
  setVal('sanctionAppDate', rec.application_date || '');
  setVal('sanctionCurrencyId', rec.currency_id || '');
  setVal('sanctionBranchId', rec.branch_id || '');
  setVal('sanctionRefNo', rec.application_id || '');

  // Group loan context banner
  const banner = document.getElementById('groupContextBanner');
  const bannerText = document.getElementById('groupContextText');
  if (rec.group_id) {
    if (banner) banner.style.display = 'block';
    if (bannerText) bannerText.textContent = `Group ${rec.group_id}${rec.sub_group_id ? ' / Sub-group ' + rec.sub_group_id : ''}`;
  } else {
    if (banner) banner.style.display = 'none';
  }
}

/* ── Save sanction ──────────────────────────────────────── */
async function saveSanction() {
  if (!_loadedRecord || !_loadedAppId) {
    toast('Load an application first.', 'warning');
    return;
  }

  const approvedAmt = getNum('sanctionApprovedAmount');
  const productId = getVal('sanctionProductId');
  const repaymentTerm = getInt('sanctionRepaymentTerm');
  const interestRate = getNum('sanctionInterestRate');
  const approvedBy = getVal('sanctionApprovedBy');
  const approvedDate = getVal('sanctionApprovedDate') || new Date().toISOString().slice(0, 10);

  if (!approvedAmt || approvedAmt <= 0) { toast('Approved amount must be greater than 0.', 'warning'); return; }
  if (!repaymentTerm || repaymentTerm <= 0) { toast('Repayment term must be greater than 0.', 'warning'); return; }

  const sb = document.getElementById('statusBar');

  // ── Re-verify current status fresh, then check the transition is
  //    actually authorized for THIS module (3-arg call — the missing
  //    3rd argument in the previous version made this check always fail
  //    silently, or in this rewrite's case, always block correctly-
  //    authorized saves too if omitted, so it must be included). ──
  let liveStatus;
  try {
    const live = await sbFetch(`loanmasterrecords?application_id=eq.${encodeURIComponent(_loadedAppId)}&select=application_status&limit=1`);
    liveStatus = live?.[0]?.application_status;
  } catch (e) {
    toast('Could not verify current status: ' + e.message, 'error');
    return;
  }

  if (!window.LoanStatusGuard) {
    toast('Loan Status Guard is not loaded — cannot safely save.', 'error');
    return;
  }

  const guard = window.LoanStatusGuard.canTransition(liveStatus, 'Sanctioned', 'credit-sanction-console');
  if (!guard.allowed) {
    toast(`Sanction denied: ${guard.reason}`, 'error');
    if (sb) sb.textContent = `Blocked — record is currently "${liveStatus}".`;
    return;
  }

  // ── Client-side ceiling check (UX only — the RPC re-checks this
  //    server-side too, since a client-only check can be bypassed) ──
  try {
    const ceiling = await window.LoanStatusGuard.checkSanctionCeiling(sbFetch, productId, approvedAmt);
    if (!ceiling.ok) {
      toast(`Sanction blocked: ${ceiling.reason}`, 'error');
      return;
    }
  } catch (e) {
    toast('Ceiling check failed: ' + e.message, 'error');
    return;
  }

  if (!confirm(
    `Approve loan sanction?\n\n` +
    `Application: ${_loadedAppId}\n` +
    `Client: ${_loadedRecord.client_name || 'N/A'}\n` +
    `Amount: ETB ${fmt(approvedAmt)}\n` +
    `Repayment Term: ${repaymentTerm} months\n` +
    `Rate: ${interestRate || 0}%\n\n` +
    `This will set status to SANCTIONED.`
  )) {
    toast('Sanction cancelled.', 'info');
    return;
  }

  if (sb) sb.textContent = 'Saving sanction…';

  try {
    // Atomic: updates loanmasterrecords AND loanapplications together,
    // re-checks the sanction ceiling server-side, and logs the audit
    // trail — all in one transaction.
    const result = await sbRpc('post_credit_sanction', {
      p_application_id:          _loadedAppId,
      p_approved_amount:         approvedAmt,
      p_product_id:              productId,
      p_no_of_disbursements:     getInt('sanctionNoOfDisbursements') || 1,
      p_repayment_term_months:   repaymentTerm,
      p_installment_start_date:  getVal('sanctionInstallmentStartDate'),
      p_interest_rate:           interestRate,
      p_grace_period:            getInt('sanctionGracePeriod') || 0,
      p_mode_of_disbursement:    getVal('sanctionModeOfDisb') || 'Transfer',
      p_first_disbursement_date: getVal('sanctionFirstDisbDate'),
      p_interest_rate_type:      getVal('sanctionInterestRateType'),
      p_marking_rate:            getNum('sanctionMarkingRate2'),
      p_installment_amount:      getNum('sanctionInstallmentAmt'),
      p_approved_by:             approvedBy,
      p_approved_date:           approvedDate
    });

    setVal('sanctionAppStatus', 'Sanctioned');
    _loadedRecord.application_status = 'Sanctioned';

    toast(`Application ${_loadedAppId} sanctioned — ${fmt(result.approved_amount)} ETB.`, 'success');
    if (sb) sb.textContent = `Sanctioned — ${_loadedAppId}`;
  } catch (e) {
    toast('Sanction save error: ' + e.message, 'error');
    if (sb) sb.textContent = 'Save failed — see toast.';
  }
}

/* ── Event bindings — matched to REAL element IDs ───────── */
document.getElementById('btnSearchAppId')?.addEventListener('click', lookupApplication);
document.getElementById('sanctionApplicationId')?.addEventListener('keydown', e => { if (e.key === 'Enter') lookupApplication(); });
document.getElementById('btnGlobalSave')?.addEventListener('click', saveSanction);

/* ── Init ───────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => {
  toast('Credit Sanction Console ready.', 'success', 2000);
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
