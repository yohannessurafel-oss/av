/* ═══════════════════════════════════════════════════════════
   Africa Village Microfinance — 05 Loan Account Maintenance
   loan-account-maintenance.js  v3.0

   Table: loanmasterrecords  (same record used across 01→05)
   PK:    application_id

   Design: This module READS an existing loanmasterrecords row
   (created in Module 01, progressed through 03 & 04) and
   PATCHes only the maintenance-editable fields:
     - repayment_account_id       (repayment acc)
     - loan_purpose
     - credit_officer_id
     - repayment_method
     - line_of_business
     - fund_id
     - file_number
     - health_code
     - stop_interest_accrual      (checkbox)
     - installment_start_date
     - value_date
     - maturity_date
     - modified_by
     - modified_on  (auto)

   All other fields (amounts, rates, dates set at sanction,
   installment_amount, grace_period etc.) are READ-ONLY display.
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
  const sel = document.getElementById('maintBranchId');
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
    const sel2 = document.getElementById('maintBranchId');
    if (sel2) { sel2.innerHTML = '<option value="">-- Select Branch --</option>'; sel2.disabled = false; }
  }
}

document.getElementById('maintBranchId')?.addEventListener('change', function () {
  const nameEl = document.getElementById('maintBranchName');
  const chosen = _branchCache.find(b => b.branch_id === this.value);
  if (nameEl) nameEl.value = chosen ? (chosen.branch_name || '') : '';
});

/* ── Track loaded record ───────────────────────────────── */
let _loadedAppId = null;

/* ── Populate form from loanmasterrecords row ───────────── */
function populateForm(rec) {
  const v = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };
  const c = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };

  // Identity (read-only)
  v('maintApplicationId',      rec.application_id);
  v('maintClientId',            rec.client_id);
  v('maintLoanSeries',          rec.loan_series_no);
  v('maintReferenceNo',         rec.reference_no);
  v('maintProductId',           rec.product_id);
  v('maintCurrencyId',          rec.currency_id);
  v('maintLoanType',            rec.account_class);
  v('maintSanctionAmount',      rec.sanction_amount);
  v('maintSanctionDate',        rec.disbursement_date);   // closest to sanction date
  v('maintBookedAmount',        rec.booked_amount);
  v('maintTermMonths',          rec.term_months);
  v('maintRepaymentTermMonths', rec.repayment_term_months);
  v('maintRepaymentFrequency',  rec.repayment_frequency);
  v('maintCalcMethod',          rec.calculation_method);
  v('maintNetCollateral',       rec.net_collateral_value ?? '');
  v('maintInterestRateType',    rec.interest_rate_type);
  v('maintMarkingRate',         rec.marking_rate);
  v('maintInterestRate',        rec.interest_rate);
  v('maintPenaltyRate',         rec.penalty_rate);
  v('maintInstallmentAmount',   rec.installment_amount);
  v('maintLastInstallmentAmt',  rec.last_installment_amt);
  v('maintGraceDays',           rec.grace_days);
  v('maintGracePeriod',         rec.grace_period);
  v('maintAppStatus',           rec.application_status);
  v('maintModifiedOn',          rec.modified_on ? new Date(rec.modified_on).toLocaleString('en-ET') : '');

  // Branch dropdown
  const brSel = document.getElementById('maintBranchId');
  if (brSel && rec.branch_id) {
    brSel.value = rec.branch_id;
    brSel.dispatchEvent(new Event('change'));
  }

  // Editable maintenance fields — pre-filled from DB
  v('maintRepayAccountId',       rec.repayment_account_id || rec.main_repayment_account_id);
  v('maintLoanPurpose',          rec.loan_purpose);
  v('maintCreditOfficer',        rec.credit_officer_id);
  v('maintRepaymentMethod',      rec.repayment_method);
  v('maintLineOfBusiness',       rec.line_of_business);
  v('maintFundId',               rec.fund_id);
  v('maintFileNumber',           rec.file_number);
  v('maintHealthCode',           rec.health_code);
  c('maintStopInterest',         rec.stop_interest_accrual);
  v('maintInstallmentStartDate', rec.installment_start_date);
  v('maintValueDate',            rec.value_date);
  v('maintMaturityDate',         rec.maturity_date);
  v('maintModifiedBy',           rec.modified_by);
}

function clearForm() {
  document.querySelectorAll('#view-module-05 input, #view-module-05 select, #view-module-05 textarea')
    .forEach(el => {
      if (el.type === 'checkbox') el.checked = false;
      else el.value = '';
    });
  _loadedAppId = null;
}

/* ── View / Lookup ──────────────────────────────────────── */
async function viewRecord() {
  const appId = document.getElementById('maintApplicationId')?.value?.trim();
  if (!appId) { toast('Enter an Application ID to search.', 'warning'); return; }

  const sb = document.getElementById('statusBar');
  if (sb) sb.textContent = `Loading ${appId}…`;

  try {
    const rows = await sbFetch(
      `loanmasterrecords?application_id=eq.${encodeURIComponent(appId)}&select=*&limit=1`
    );
    if (rows && rows[0]) {
      populateForm(rows[0]);
      _loadedAppId = rows[0].application_id;
      setMode('view');
      toast(`Loaded: ${_loadedAppId}`);
      if (sb) sb.textContent = `Account: ${_loadedAppId} | Status: ${rows[0].application_status}`;
    } else {
      toast('Application ID not found.', 'warning');
      if (sb) sb.textContent = 'Status: Not found';
    }
  } catch (e) {
    toast('Lookup error: ' + e.message, 'error');
  }
}

/* ── Save (PATCH maintenance fields only) ───────────────── */
async function saveRecord() {
  if (!_loadedAppId) { toast('Load a record first before saving.', 'warning'); return; }

  const getVal = id => { const el = document.getElementById(id); return el ? el.value.trim() || null : null; };
  const getChk = id => { const el = document.getElementById(id); return el ? el.checked : false; };

  const payload = {
    repayment_account_id:    getVal('maintRepayAccountId'),
    loan_purpose:            getVal('maintLoanPurpose'),
    credit_officer_id:       getVal('maintCreditOfficer'),
    repayment_method:        getVal('maintRepaymentMethod'),
    line_of_business:        getVal('maintLineOfBusiness'),
    fund_id:                 getVal('maintFundId'),
    file_number:             getVal('maintFileNumber'),
    health_code:             getVal('maintHealthCode'),
    stop_interest_accrual:   getChk('maintStopInterest'),
    installment_start_date:  getVal('maintInstallmentStartDate'),
    value_date:              getVal('maintValueDate'),
    maturity_date:           getVal('maintMaturityDate'),
    modified_by:             getVal('maintModifiedBy'),
    modified_on:             new Date().toISOString(),
  };

  // Strip null dates — Postgres rejects empty string for date columns
  ['installment_start_date','value_date','maturity_date'].forEach(k => {
    if (!payload[k]) delete payload[k];
  });

  const sb = document.getElementById('statusBar');
  if (sb) sb.textContent = 'Saving…';

  try {
    await sbFetch(
      `loanmasterrecords?application_id=eq.${encodeURIComponent(_loadedAppId)}`,
      { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify(payload) }
    );
    toast(`Account ${_loadedAppId} maintenance saved.`, 'success');
    document.getElementById('maintModifiedOn').value = new Date().toLocaleString('en-ET');
    setMode('view');
    if (sb) sb.textContent = `Saved — ${_loadedAppId}`;
  } catch (e) {
    toast('Save error: ' + e.message, 'error');
    if (sb) sb.textContent = 'Save failed.';
  }
}

/* ── Mode Control ──────────────────────────────────────── */
let currentMode = 'view';

function setMode(mode) {
  currentMode = mode;
  const isEdit = mode === 'edit';
  const view = document.querySelector('.module-view.active');

  if (view) {
    view.querySelectorAll('input, select, textarea').forEach(el => {
      if (el.dataset.alwaysEnabled !== undefined) { el.disabled = false; return; }
      if (el.hasAttribute('readonly'))            { el.disabled = false; return; }
      el.disabled = !isEdit;
    });
  }

  // Application ID always enabled so user can type a new ID to look up
  const appIdEl = document.getElementById('maintApplicationId');
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
  if (btnDelete) btnDelete.disabled = true;   // maintenance never hard-deletes
  if (btnClose)  btnClose.disabled  = isEdit;

  const sb = document.getElementById('statusBar');
  if (sb && mode !== 'view') {
    sb.textContent = `Mode: ${mode.charAt(0).toUpperCase() + mode.slice(1)} — Ready`;
  }
}

/* ── Toolbar ─────────────────────────────────────────────── */
document.getElementById('btnGlobalView')?.addEventListener('click', viewRecord);
document.getElementById('btnSearchAccount')?.addEventListener('click', viewRecord);

document.getElementById('btnGlobalEdit')?.addEventListener('click', () => {
  if (!_loadedAppId) { toast('Load a record first.', 'warning'); return; }
  setMode('edit');
  toast('Edit mode — update maintenance fields then Save.');
});

document.getElementById('btnGlobalSave')?.addEventListener('click', saveRecord);

document.getElementById('btnGlobalCancel')?.addEventListener('click', () => {
  if (_loadedAppId) viewRecord();   // re-load from DB to discard changes
  else setMode('view');
  toast('Changes discarded.');
});

document.getElementById('btnGlobalAdd')?.addEventListener('click', () => {
  toast('Use Module 01 — Loan Application to create new records.', 'warning');
});

document.getElementById('btnGlobalClose')?.addEventListener('click', () => {
  clearForm();
  setMode('view');
  toast('Record closed.');
});

document.getElementById('btnGlobalDelete')?.addEventListener('click', () => {
  toast('Loan accounts cannot be deleted here. Contact system admin.', 'warning');
});

document.getElementById('btnGlobalPrint')?.addEventListener('click', () => window.print());

// Inline stub buttons
document.getElementById('btnAccount')?.addEventListener('click', () => toast('Account detail view coming soon.'));
document.getElementById('btnSeries')?.addEventListener('click',  () => toast('Loan series view coming soon.'));
document.getElementById('btnRefNo')?.addEventListener('click',   () => toast('Reference number view coming soon.'));

/* ── Init ───────────────────────────────────────────────── */
async function init() {
  setMode('view');
  await loadBranches();
}
init();
