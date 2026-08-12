/* ═══════════════════════════════════════════════════════════
   Africa Village Microfinance — 04 Credit Sanction Console
   credit-sanction-console.js  v3.1 — FULL REWRITE (RE-DEPLOYED)

   WHY THIS IS BEING RE-SENT:
   The v3.0 rewrite that fixed this module's real problems (wrong element
   IDs — btnLoadForSanction/sanctionAppId/etc. instead of the real
   btnSearchAppId/sanctionApplicationId/etc. — and a save payload writing
   to columns that don't exist on loanmasterrecords at all: tenure_months,
   sanction_date, sanction_remarks) was never actually deployed. A later
   one-line patch (fixing the logStatusTransition argument order) was
   mistakenly applied to the OLD v2.4 file instead, because that patch
   fetched "live" content assuming it was v3.0 when the real v3.0 had
   never gone live. This file is the full v3.0 rewrite with that
   logStatusTransition fix included from the start.

   WHAT THIS FILE ACTUALLY FIXES:
   1. Every element ID matches the real HTML (sanctionApplicationId,
      btnSearchAppId, sanctionAppStatus, sanctionRepaymentTerm,
      btnGlobalSave, etc.)
   2. Save payload writes only to columns that exist on loanmasterrecords
      (approved_amount, sanction_amount, term_months, interest_rate,
      no_of_disbursements, installment_start_date, marking_rate_sign,
      marking_rate, repayment_account_id, approved_by, approved_date,
      application_status, modified_by, modified_on) — no more
      tenure_months/sanction_date/sanction_remarks, which don't exist.
   3. btnGlobalSave is `disabled` by default in the HTML and nothing
      re-enabled it before — now it enables once a record loads.
   4. logStatusTransition is called with the real positional signature
      (sbFetch, applicationId, fromStatus, toStatus, changedBy, remarks)
      — changedBy is the actual approving officer (sanctionApprovedBy),
      not a hardcoded module-name string.

   Logic (ceiling check, status-guard transition check, confirm dialog,
   loanapplications status sync, audit log) is otherwise unchanged from
   the original design intent — it just never ran because Save was
   unreachable.
═══════════════════════════════════════════════════════════ */

'use strict';

const SUPABASE_URL = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';

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

const fmt = n => parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = (v === null || v === undefined) ? '' : v; };
const getVal = id => document.getElementById(id)?.value;

/* ── State ──────────────────────────────────────────────── */
let _currentAppId = null;
let _currentRecord = null;

/* ── Branch dropdown ─────────────────────────────────────── */
async function loadBranches() {
  const sel = document.getElementById('sanctionBranchId');
  if (!sel) return;
  try {
    const branches = await sbFetch('branchregistry?select=branch_id,branch_name&order=branch_id');
    sel.innerHTML = '<option value="">-- Select Branch --</option>' +
      branches.map(b => `<option value="${b.branch_id}">${b.branch_id}${b.branch_name ? ' — ' + b.branch_name : ''}</option>`).join('');
  } catch (e) {
    console.warn('Could not load branch list:', e.message);
  }
}
loadBranches();

/* ── Group Loan context banner ──────────────────────────── */
async function loadGroupContext(rec) {
  const banner = document.getElementById('groupContextBanner');
  const text = document.getElementById('groupContextText');
  if (!banner || !text) return;
  if (!rec.group_id) { banner.style.display = 'none'; return; }
  try {
    const members = await sbFetch(`loanmasterrecords?group_id=eq.${encodeURIComponent(rec.group_id)}&select=application_id&order=application_id.asc`);
    text.textContent = `${rec.group_id} — ${members.length} member(s)`;
    banner.style.display = '';
  } catch (e) {
    text.textContent = rec.group_id;
    banner.style.display = '';
  }
}

/* ── Load application for sanction ──────────────────────── */
async function loadApplicationForSanction() {
  const appId = getVal('sanctionApplicationId')?.trim();
  if (!appId) { toast('Enter an Application ID.', 'warning'); return; }

  try {
    const rows = await sbFetch(`loanmasterrecords?application_id=eq.${encodeURIComponent(appId)}&limit=1`);
    if (!rows || !rows[0]) {
      toast(`Application ${appId} not found.`, 'error');
      document.getElementById('btnGlobalSave').disabled = true;
      return;
    }
    _currentRecord = rows[0];
    _currentAppId = appId;
    populateSanctionForm(_currentRecord);
    loadGroupContext(_currentRecord);
    document.getElementById('btnGlobalSave').disabled = false;
    toast(`Application ${appId} loaded — status: ${_currentRecord.application_status}.`, 'success');
  } catch (e) {
    toast('Load error: ' + e.message, 'error');
  }
}

function populateSanctionForm(rec) {
  setVal('sanctionBranchId', rec.branch_id);
  setVal('sanctionClientId', rec.client_id);
  setVal('sanctionMailingAddress', rec.mailing_address);
  setVal('sanctionCity', rec.city);
  setVal('sanctionPhone', rec.phone_number);
  setVal('sanctionLoanType', rec.loan_purpose);
  setVal('sanctionAccountId', rec.main_repayment_account_id);
  setVal('sanctionProductId', rec.product_id);
  setVal('sanctionSanctionAmount', fmt(rec.sanction_amount));
  setVal('sanctionTerm', rec.term_months);
  setVal('sanctionMarkingRate', rec.marking_rate);
  setVal('sanctionInstallmentAmt', fmt(rec.installment_amount));
  setVal('sanctionCalcMethod', rec.calculation_method);
  setVal('sanctionNetCollateral', '');
  setVal('sanctionRefNo', rec.reference_no);
  setVal('sanctionAppDate', rec.application_date);
  setVal('sanctionGracePeriod', rec.grace_period);
  setVal('sanctionInterestRateType', rec.interest_rate_type);
  setVal('sanctionBaseRate', rec.base_rate);
  setVal('sanctionLoanSeries', rec.loan_series_no);
  setVal('sanctionCurrencyId', rec.currency_id);
  setVal('sanctionAppliedAmount', fmt(rec.applied_amount));
  setVal('sanctionRepaymentTerm2', rec.repayment_term_months);
  setVal('sanctionInterestRateR', rec.interest_rate);
  setVal('sanctionNoOfGuarantors', rec.no_of_guarantors);
  setVal('sanctionAppStatus', rec.application_status);
  setVal('sanctionGracePeriod2', rec.grace_period);
  setVal('sanctionWorkflowTypeId', rec.workflow_type_id);

  setVal('sanctionApprovedAmount', rec.approved_amount > 0 ? rec.approved_amount : rec.applied_amount);
  setVal('sanctionNoOfDisbursements', rec.no_of_disbursements || 1);
  setVal('sanctionRepaymentTerm', rec.term_months);
  setVal('sanctionInstallmentStartDate', rec.installment_start_date || '');
  setVal('sanctionMarkingRateSign', rec.marking_rate_sign || '+');
  setVal('sanctionMarkingRate2', rec.marking_rate || 0);
  setVal('sanctionInterestRate', rec.interest_rate);
  setVal('sanctionRepayAccId', rec.repayment_account_id || rec.main_repayment_account_id);
  setVal('sanctionApprovedBy', rec.approved_by || '');
  setVal('sanctionApprovedDate', rec.approved_date || new Date().toISOString().slice(0, 10));
  setVal('sanctionModeOfDisb', rec.mode_of_disbursement || 'Transfer');
  setVal('sanctionFirstDisbDate', rec.first_disbursement_date || '');
}

async function saveSanction() {
  if (!_currentRecord || !_currentAppId) {
    toast('Load an application first.', 'warning');
    return;
  }

  const approvedAmt = parseFloat(getVal('sanctionApprovedAmount')) || 0;
  const productId = getVal('sanctionProductId') || _currentRecord.product_id;
  const term = parseInt(getVal('sanctionRepaymentTerm')) || 0;
  const interestRate = parseFloat(getVal('sanctionInterestRate')) || 0;
  const noOfDisbursements = parseInt(getVal('sanctionNoOfDisbursements')) || 1;
  const installmentStartDate = getVal('sanctionInstallmentStartDate') || null;
  const markingRateSign = getVal('sanctionMarkingRateSign') || '+';
  const markingRate = parseFloat(getVal('sanctionMarkingRate2')) || 0;
  const repayAccId = getVal('sanctionRepayAccId') || null;
  const approvedBy = getVal('sanctionApprovedBy')?.trim() || null;
  const approvedDate = getVal('sanctionApprovedDate') || new Date().toISOString().slice(0, 10);

  if (approvedAmt <= 0) { toast('Approved amount must be greater than 0.', 'warning'); return; }
  if (term <= 0) { toast('Repayment term (months) must be greater than 0.', 'warning'); return; }
  if (!approvedBy) { toast('Approved By is required.', 'warning'); return; }

  try {
    const ceiling = await LoanStatusGuard.checkSanctionCeiling(sbFetch, productId, approvedAmt);
    if (!ceiling.ok) {
      toast(`Sanction blocked: ${ceiling.reason}`, 'error');
      return;
    }
  } catch (e) {
    toast('Ceiling check failed: ' + e.message, 'error');
    return;
  }

  let liveStatus;
  try {
    const live = await sbFetch(`loanmasterrecords?application_id=eq.${encodeURIComponent(_currentAppId)}&select=application_status&limit=1`);
    liveStatus = live?.[0]?.application_status;
  } catch (e) {
    toast('Could not verify current status.', 'error');
    return;
  }

  const guard = LoanStatusGuard.canTransition(liveStatus, 'Sanctioned');
  if (!guard.allowed) {
    toast(`Sanction denied: ${guard.reason}`, 'error');
    return;
  }

  if (!confirm(
    `Approve loan sanction?\n\n` +
    `Application: ${_currentAppId}\n` +
    `Client: ${_currentRecord.client_name || 'N/A'}\n` +
    `Approved Amount: ETB ${fmt(approvedAmt)}\n` +
    `Term: ${term} months\n` +
    `Rate: ${interestRate}%\n` +
    `Approved By: ${approvedBy}\n\n` +
    `This will set status to SANCTIONED.`
  )) {
    toast('Sanction cancelled.', 'info');
    return;
  }

  const payload = {
    approved_amount: approvedAmt,
    sanction_amount: approvedAmt,
    term_months: term,
    interest_rate: interestRate,
    no_of_disbursements: noOfDisbursements,
    installment_start_date: installmentStartDate,
    marking_rate_sign: markingRateSign,
    marking_rate: markingRate,
    repayment_account_id: repayAccId,
    approved_by: approvedBy,
    approved_date: approvedDate,
    application_status: 'Sanctioned',
    modified_by: approvedBy,
    modified_on: new Date().toISOString()
  };

  const saveBtn = document.getElementById('btnGlobalSave');
  if (saveBtn) saveBtn.disabled = true;

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/loanmasterrecords?application_id=eq.${encodeURIComponent(_currentAppId)}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));

    try {
      await fetch(`${SUPABASE_URL}/rest/v1/loanapplications?application_id=eq.${encodeURIComponent(_currentAppId)}`, {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({ application_status: 'Sanctioned' })
      });
    } catch (syncErr) {
      console.warn('loanapplications status sync failed (non-fatal):', syncErr.message);
    }

    await LoanStatusGuard.logStatusTransition(sbFetch, _currentAppId, liveStatus, 'Sanctioned', approvedBy, 'Sanctioned via Credit Sanction Console', 'credit-sanction-console');

    toast('Loan sanctioned successfully.', 'success');
    _currentRecord.application_status = 'Sanctioned';
    setVal('sanctionAppStatus', 'Sanctioned');
  } catch (e) {
    toast('Sanction save error: ' + e.message, 'error');
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

function clearForm() {
  _currentRecord = null;
  _currentAppId = null;
  document.querySelectorAll('#view-module-04 input:not([data-always-enabled])').forEach(el => el.value = '');
  document.getElementById('groupContextBanner').style.display = 'none';
  document.getElementById('btnGlobalSave').disabled = true;
  toast('Cleared.', 'info');
}

document.getElementById('btnSearchAppId')?.addEventListener('click', loadApplicationForSanction);
document.getElementById('btnGlobalView')?.addEventListener('click', loadApplicationForSanction);
document.getElementById('btnGlobalSave')?.addEventListener('click', saveSanction);
document.getElementById('btnGlobalCancel')?.addEventListener('click', clearForm);
document.getElementById('btnGlobalClose')?.addEventListener('click', () => { window.location = 'indexll.html'; });
document.getElementById('sanctionApplicationId')?.addEventListener('keydown', e => { if (e.key === 'Enter') loadApplicationForSanction(); });

document.getElementById('btnGlobalAdd')?.addEventListener('click', () => {
  toast('This module sanctions existing applications only. Create new loans in Module 01.', 'warning');
});
document.getElementById('btnGlobalEdit')?.addEventListener('click', () => {
  if (!_currentAppId) toast('Load a record first.', 'warning');
});
document.getElementById('btnGlobalDelete')?.addEventListener('click', () => {
  toast('Sanctioned loans cannot be deleted from this console.', 'warning');
});

document.getElementById('btnGlobalSave').disabled = true;
window.addEventListener('DOMContentLoaded', () => {
  toast('Credit Sanction Console v3.1 ready.', 'success');
});

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
