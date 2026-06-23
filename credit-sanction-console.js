/* ═══════════════════════════════════════════════════════════
   Africa Village Microfinance — 04 Credit Sanction Console
   credit-sanction-console.js  v2.0  (NEW)
   Tables: loanapplications · loanmasterrecords · branchregistry
═══════════════════════════════════════════════════════════ */

'use strict';

const SUPABASE_URL      = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';

/* ── HTTP Helper ────────────────────────────────────────── */
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
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  const text = await res.text();
  if (!text || !text.trim()) return null;
  try { return JSON.parse(text); } catch { return null; }
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

/* ── System Date ───────────────────────────────────────── */
(function initDate() {
  const el = document.getElementById('systemDate');
  if (el) el.textContent = new Date().toLocaleDateString('en-ET', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
  });
})();

/* ── Branch Dropdown ───────────────────────────────────── */
let _branchCache = [];

async function loadBranches() {
  const sel = document.getElementById('sanctionBranchId');
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

document.getElementById('sanctionBranchId')?.addEventListener('change', function () {
  const nameEl = document.getElementById('sanctionBranchName');
  const chosen = _branchCache.find(b => b.branch_id === this.value);
  if (nameEl) nameEl.value = chosen ? (chosen.branch_name || '') : '';
});

/* ── Application Lookup ─────────────────────────────────── */
// Reads loanapplications + loanmasterrecords and populates the
// "Application Details" read-only section at the bottom of the form.

async function lookupApplication(appId) {
  if (!appId) return;
  const sb = document.getElementById('statusBar');
  if (sb) sb.textContent = `Looking up application ${appId}…`;

  try {
    // Fetch header from loanapplications
    const appRows = await sbFetch(
      `loanapplications?application_id=eq.${encodeURIComponent(appId)}&limit=1`
    );
    // Fetch full record from loanmasterrecords
    const lmrRows = await sbFetch(
      `loanmasterrecords?application_id=eq.${encodeURIComponent(appId)}&limit=1`
    );

    if ((!appRows || appRows.length === 0) && (!lmrRows || lmrRows.length === 0)) {
      toast('Application ID not found.', 'warning');
      if (sb) sb.textContent = 'Mode: View — Ready';
      return;
    }

    const lmr = (lmrRows && lmrRows[0]) || {};

    // Populate Application Details read-only section
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };

    set('sanctionClientId',         lmr.client_id);
    set('sanctionMailingAddress',   lmr.mailing_address);
    set('sanctionCity',             lmr.city);
    set('sanctionPhone',            lmr.phone_number);
    set('sanctionLoanType',         lmr.account_class);
    set('sanctionAccountId',        appId);
    set('sanctionProductId',        lmr.product_id);
    set('sanctionSanctionAmount',   lmr.sanction_amount);
    set('sanctionTerm',             lmr.term_months);
    set('sanctionMarkingRate',      lmr.marking_rate);
    set('sanctionInstallmentAmt',   lmr.installment_amount);
    set('sanctionCalcMethod',       lmr.calculation_method);
    set('sanctionNetCollateral',    lmr.net_collateral_value);
    set('sanctionLoanSeries',       lmr.loan_series_no);
    set('sanctionCurrencyId',       lmr.currency_id);
    set('sanctionAppliedAmount',    lmr.applied_amount);
    set('sanctionRepaymentTerm2',   lmr.repayment_term_months);
    set('sanctionInterestRateR',    lmr.interest_rate);
    set('sanctionNoOfGuarantors',   lmr.no_of_guarantors);
    set('sanctionAppStatus',        lmr.application_status);
    set('sanctionGracePeriod2',     lmr.grace_period);
    set('sanctionRefNo',            lmr.reference_no);
    set('sanctionAppDate',          lmr.application_date);

    // Pre-fill the sanction header from existing values
    set('sanctionApprovedAmount',   lmr.approved_amount || lmr.applied_amount);
    set('sanctionRepaymentTerm',    lmr.repayment_term_months);
    set('sanctionInterestRate',     lmr.interest_rate);
    set('sanctionGracePeriod',      lmr.grace_period);
    set('sanctionNoOfDisbursements', lmr.no_of_disbursements || 1);

    toast(`Application ${appId} loaded.`);
    if (sb) sb.textContent = `Application ${appId} — ready to sanction`;
  } catch (e) {
    toast('Lookup error: ' + e.message, 'error');
    if (sb) sb.textContent = 'Lookup failed.';
  }
}

/* Wire the Application ID search button */
document.querySelectorAll('.search-btn').forEach(btn => {
  btn.addEventListener('click', function () {
    const input = this.closest('.input-group')?.querySelector('input');
    if (!input) return;
    // Identify which search button was clicked by its sibling input's placeholder or position
    const label = this.closest('.form-row')?.querySelector('label')?.textContent?.trim();
    if (label && label.includes('Application ID')) {
      lookupApplication(input.value.trim());
    }
  });
});

/* ── Save Sanction ──────────────────────────────────────── */
async function saveSanction() {
  // Identify application_id from the Application Details section
  const appId = document.getElementById('sanctionAccountId')?.value?.trim();
  if (!appId) { toast('Load an Application first (use Application ID search).', 'warning'); return; }

  const getVal = id => { const el = document.getElementById(id); return el ? el.value.trim() : null; };

  const sanctionPayload = {
    approved_amount:        parseFloat(getVal('sanctionApprovedAmount')) || null,
    no_of_disbursements:    parseInt(getVal('sanctionNoOfDisbursements')) || 1,
    repayment_term_months:  parseInt(getVal('sanctionRepaymentTerm')) || null,
    installment_start_date: getVal('sanctionInstallmentStartDate') || null,
    marking_rate:           parseFloat(getVal('sanctionMarkingRate2')) || null,
    interest_rate:          parseFloat(getVal('sanctionInterestRate')) || null,
    grace_period:           parseInt(getVal('sanctionGracePeriod')) || 0,
    mode_of_disbursement:   getVal('sanctionModeOfDisb') || 'Transfer',
    first_disbursement_date: getVal('sanctionFirstDisbDate') || null,
    interest_rate_type:     getVal('sanctionInterestRateType') || null,
    application_status:     'Sanctioned',
    modified_on:            new Date().toISOString(),
  };

  const sb = document.getElementById('statusBar');
  if (sb) sb.textContent = 'Saving sanction…';

  try {
    // Update loanmasterrecords
    await sbFetch(`loanmasterrecords?application_id=eq.${encodeURIComponent(appId)}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify(sanctionPayload)
    });
    // Update loanapplications status
    await sbFetch(`loanapplications?application_id=eq.${encodeURIComponent(appId)}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ application_status: 'Sanctioned' })
    });

    toast(`Application ${appId} sanctioned successfully.`, 'success');
    if (sb) sb.textContent = `Sanctioned — ${appId}`;
    setMode('view');
  } catch (e) {
    toast('Sanction save error: ' + e.message, 'error');
    if (sb) sb.textContent = 'Save failed.';
  }
}

/* ── Mode Control ──────────────────────────────────────── */
let currentMode = 'view';

function setMode(mode) {
  currentMode = mode;
  const isEdit = mode === 'edit' || mode === 'add';
  const view = document.querySelector('.module-view.active');
  if (view) {
    view.querySelectorAll('input:not([readonly]), select, textarea').forEach(el => {
      if (el.dataset.alwaysEnabled !== undefined || el.id === 'sanctionBranchId') {
        el.disabled = false; return;
      }
      el.disabled = !isEdit;
    });
  }
  document.querySelectorAll('input[readonly]').forEach(el => el.disabled = false);
  const sel = document.getElementById('sanctionBranchId');
  if (sel) sel.disabled = false;

  const btnSave   = document.getElementById('btnGlobalSave');
  const btnCancel = document.getElementById('btnGlobalCancel');
  const btnAdd    = document.getElementById('btnGlobalAdd');
  const btnEdit   = document.getElementById('btnGlobalEdit');
  const btnClose  = document.getElementById('btnGlobalClose');
  const btnDelete = document.getElementById('btnGlobalDelete');
  if (btnSave)   btnSave.disabled   = !isEdit;
  if (btnCancel) btnCancel.disabled = !isEdit;
  if (btnAdd)    btnAdd.disabled    = isEdit;
  if (btnEdit)   btnEdit.disabled   = isEdit;
  if (btnDelete) btnDelete.disabled = !isEdit;
  if (btnClose)  btnClose.disabled  = isEdit;

  const sb = document.getElementById('statusBar');
  if (sb) sb.textContent = `Mode: ${mode.charAt(0).toUpperCase() + mode.slice(1)} — Ready`;
}

/* ── Toolbar Buttons ─────────────────────────────────────── */
document.getElementById('btnGlobalView')?.addEventListener('click', () => {
  const appId = document.getElementById('sanctionAccountId')?.value?.trim();
  if (appId) lookupApplication(appId);
  else toast('Enter an Application ID first.', 'warning');
});
document.getElementById('btnGlobalAdd')?.addEventListener('click', () => {
  setMode('add');
  toast('Add mode — search for an Application ID to sanction.');
});
document.getElementById('btnGlobalEdit')?.addEventListener('click', () => {
  setMode('edit');
  toast('Edit mode — adjust sanction details then Save.');
});
document.getElementById('btnGlobalSave')?.addEventListener('click', saveSanction);
document.getElementById('btnGlobalCancel')?.addEventListener('click', () => {
  setMode('view');
  toast('Changes discarded.');
});
document.getElementById('btnGlobalClose')?.addEventListener('click', () => {
  setMode('view');
  toast('Record closed.');
});
document.getElementById('btnGlobalDelete')?.addEventListener('click', () => {
  toast('Delete not permitted on sanctioned records.', 'warning');
});
document.getElementById('btnGlobalPrint')?.addEventListener('click', () => window.print());

/* ── Init ──────────────────────────────────────────────── */
async function init() {
  setMode('view');
  await loadBranches();
}
init();
