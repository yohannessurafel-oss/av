/* ═══════════════════════════════════════════════════════════
   Africa Village Microfinance — 04 Credit Sanction Console
   credit-sanction-console.js  v2.1
   Tables: loanapplications · loanmasterrecords · branchregistry

   Workflow:
     1. User enters Application ID → clicks 🔍 (or View button)
     2. Record loads from loanmasterrecords → fills all read-only
        Application Details fields AND pre-fills editable sanction
        fields (amounts, rates, dates).
     3. User clicks Edit → adjusts sanction fields → Save
     4. Save PATCHes loanmasterrecords + loanapplications with
        status = 'Sanctioned'.
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

/* ── Track loaded record ───────────────────────────────── */
let _loadedAppId = null;

/* ── Application Lookup ─────────────────────────────────── */
async function lookupApplication() {
  // Read from the APPLICATION ID input field (editable, top of form)
  const appId = document.getElementById('sanctionApplicationId')?.value?.trim();
  if (!appId) { toast('Enter an Application ID to search.', 'warning'); return; }

  const sb = document.getElementById('statusBar');
  if (sb) sb.textContent = `Looking up ${appId}…`;

  try {
    const lmrRows = await sbFetch(
      `loanmasterrecords?application_id=eq.${encodeURIComponent(appId)}&select=*&limit=1`
    );

    if (!lmrRows || lmrRows.length === 0) {
      toast('Application ID not found in loan master records.', 'warning');
      if (sb) sb.textContent = 'Status: Not found';
      return;
    }

    const lmr = lmrRows[0];
    _loadedAppId = lmr.application_id;

    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val ?? '';
    };

    // ── Read-only Application Details ──────────────────
    set('sanctionAccountId',        lmr.application_id);
    set('sanctionClientId',         lmr.client_id);
    set('sanctionMailingAddress',   lmr.mailing_address);
    set('sanctionCity',             lmr.city);
    set('sanctionPhone',            lmr.phone_number);
    set('sanctionLoanType',         lmr.account_class);
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
    set('sanctionBaseRate',         lmr.base_rate);

    // Set branch dropdown to match the loaded record
    const brSel = document.getElementById('sanctionBranchId');
    if (brSel && lmr.branch_id) {
      brSel.value = lmr.branch_id;
      brSel.dispatchEvent(new Event('change'));
    }

    // ── Pre-fill editable sanction fields ──────────────
    set('sanctionApprovedAmount',    lmr.approved_amount  || lmr.applied_amount);
    set('sanctionRepaymentTerm',     lmr.repayment_term_months);
    set('sanctionInterestRate',      lmr.interest_rate);
    set('sanctionGracePeriod',       lmr.grace_period);
    set('sanctionNoOfDisbursements', lmr.no_of_disbursements || 1);
    set('sanctionModeOfDisb',        lmr.mode_of_disbursement || 'Transfer');
    set('sanctionFirstDisbDate',     lmr.first_disbursement_date);
    set('sanctionInstallmentStartDate', lmr.installment_start_date);
    set('sanctionInterestRateType',  lmr.interest_rate_type);
    set('sanctionMarkingRate2',      lmr.marking_rate);

    toast(`Application ${_loadedAppId} loaded.`);
    if (sb) sb.textContent = `Application ${_loadedAppId} — click Edit to sanction`;

    // Enable Edit button now that a record is loaded
    const btnEdit = document.getElementById('btnGlobalEdit');
    if (btnEdit) btnEdit.disabled = false;

    setMode('view');
  } catch (e) {
    toast('Lookup error: ' + e.message, 'error');
    if (sb) sb.textContent = 'Lookup failed.';
  }
}

/* ── Save Sanction ──────────────────────────────────────── */
async function saveSanction() {
  if (!_loadedAppId) {
    toast('Load an Application first — enter Application ID and click 🔍.', 'warning');
    return;
  }

  const getVal  = id => { const el = document.getElementById(id); return el ? el.value.trim() || null : null; };
  const getNum  = id => { const v = parseFloat(getVal(id)); return isNaN(v) ? null : v; };
  const getInt  = id => { const v = parseInt(getVal(id));   return isNaN(v) ? null : v; };

  const payload = {
    approved_amount:         getNum('sanctionApprovedAmount'),
    no_of_disbursements:     getInt('sanctionNoOfDisbursements') || 1,
    repayment_term_months:   getInt('sanctionRepaymentTerm'),
    installment_start_date:  getVal('sanctionInstallmentStartDate'),
    interest_rate:           getNum('sanctionInterestRate'),
    grace_period:            getInt('sanctionGracePeriod') || 0,
    mode_of_disbursement:    getVal('sanctionModeOfDisb') || 'Transfer',
    first_disbursement_date: getVal('sanctionFirstDisbDate'),
    interest_rate_type:      getVal('sanctionInterestRateType'),
    marking_rate:            getNum('sanctionMarkingRate2'),
    application_status:      'Sanctioned',
    modified_on:             new Date().toISOString(),
  };

  // Remove null dates — PostgREST rejects null for date columns
  if (!payload.installment_start_date)  delete payload.installment_start_date;
  if (!payload.first_disbursement_date) delete payload.first_disbursement_date;

  const sb = document.getElementById('statusBar');
  if (sb) sb.textContent = 'Saving sanction…';

  try {
    // 1. Update loanmasterrecords
    await sbFetch(`loanmasterrecords?application_id=eq.${encodeURIComponent(_loadedAppId)}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify(payload)
    });

    // 2. Update loanapplications status
    await sbFetch(`loanapplications?application_id=eq.${encodeURIComponent(_loadedAppId)}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ application_status: 'Sanctioned' })
    });

    // Reflect new status in the read-only field
    const statusEl = document.getElementById('sanctionAppStatus');
    if (statusEl) statusEl.value = 'Sanctioned';

    toast(`Application ${_loadedAppId} sanctioned successfully.`, 'success');
    if (sb) sb.textContent = `Sanctioned — ${_loadedAppId}`;
    setMode('view');
  } catch (e) {
    toast('Sanction save error: ' + e.message, 'error');
    if (sb) sb.textContent = 'Save failed — see toast.';
  }
}

/* ── Mode Control ──────────────────────────────────────── */
let currentMode = 'view';

function setMode(mode) {
  currentMode = mode;
  const isEdit = mode === 'edit' || mode === 'add';
  const view = document.querySelector('.module-view.active');

  if (view) {
    view.querySelectorAll('input, select, textarea').forEach(el => {
      if (el.dataset.alwaysEnabled !== undefined) { el.disabled = false; return; }
      if (el.hasAttribute('readonly'))            { el.disabled = false; return; }
      el.disabled = !isEdit;
    });
  }

  // Application ID input always enabled so user can type a new ID
  const appIdEl = document.getElementById('sanctionApplicationId');
  if (appIdEl) appIdEl.disabled = false;

  const btnSave   = document.getElementById('btnGlobalSave');
  const btnCancel = document.getElementById('btnGlobalCancel');
  const btnAdd    = document.getElementById('btnGlobalAdd');
  const btnEdit   = document.getElementById('btnGlobalEdit');
  const btnClose  = document.getElementById('btnGlobalClose');
  const btnDelete = document.getElementById('btnGlobalDelete');

  if (btnSave)   btnSave.disabled   = !isEdit;
  if (btnCancel) btnCancel.disabled = !isEdit;
  if (btnAdd)    btnAdd.disabled    = isEdit;
  if (btnEdit)   btnEdit.disabled   = isEdit || !_loadedAppId;
  if (btnDelete) btnDelete.disabled = true;    // no hard-delete on sanctions
  if (btnClose)  btnClose.disabled  = isEdit;

  const sb = document.getElementById('statusBar');
  if (sb && mode !== 'view') {
    sb.textContent = `Mode: ${mode.charAt(0).toUpperCase() + mode.slice(1)} — Ready`;
  }
}

/* ── Toolbar ─────────────────────────────────────────────── */
// View button: look up whatever is in the Application ID field
document.getElementById('btnGlobalView')?.addEventListener('click', lookupApplication);

// 🔍 icon next to Application ID input
document.getElementById('btnSearchAppId')?.addEventListener('click', lookupApplication);

document.getElementById('btnGlobalEdit')?.addEventListener('click', () => {
  if (!_loadedAppId) { toast('Load an application first.', 'warning'); return; }
  setMode('edit');
  toast('Edit mode — adjust sanction details then Save.');
});

document.getElementById('btnGlobalSave')?.addEventListener('click', saveSanction);

document.getElementById('btnGlobalCancel')?.addEventListener('click', () => {
  if (_loadedAppId) lookupApplication();  // reload fresh from DB
  else setMode('view');
  toast('Changes discarded.');
});

document.getElementById('btnGlobalAdd')?.addEventListener('click', () => {
  toast('Use Module 01 — Loan Application to create a new application.', 'warning');
});

document.getElementById('btnGlobalClose')?.addEventListener('click', () => {
  _loadedAppId = null;
  document.querySelectorAll('#view-module-04 input, #view-module-04 select, #view-module-04 textarea')
    .forEach(el => { if (!el.dataset.alwaysEnabled) el.value = ''; });
  setMode('view');
  toast('Record closed.');
});

document.getElementById('btnGlobalDelete')?.addEventListener('click', () => {
  toast('Delete not permitted on sanctioned records.', 'warning');
});

document.getElementById('btnGlobalPrint')?.addEventListener('click', () => window.print());

document.getElementById('btnCharges')?.addEventListener('click', () => {
  toast('Charges module coming soon.', '');
});

/* ── Init ──────────────────────────────────────────────── */
async function init() {
  setMode('view');
  await loadBranches();
}
init();
