/* ═══════════════════════════════════════════════════════════
   Africa Village Microfinance — 05 Loan Account Maintenance
   loan-account-maintenance.js  v2.4 — STATUS GUARD + TERM LOCK
   Table : loanmasterrecords

   Requires loan-status-guard.js to be loaded BEFORE this file:
     <script src="loan-status-guard.js"></script>
     <script src="loan-account-maintenance.js"></script>

   WHAT CHANGED FROM v2.3
   Previously this module could PATCH application_status to ANY value
   via a free dropdown — including 'Sanctioned' or 'Disbursed' — with
   no check at all. That completely bypassed Module 04 (Credit
   Sanction Console) and Module 10 (Disbursement). Now:

     1. Any change to application_status is validated against
        LoanStatusGuard before saving. This module is only authorized
        to move a loan to 'Closed' from a PRE-sanction status
        (cancelling/withdrawing an application) — it can no longer
        sanction or disburse a loan itself.
     2. Once a loan is Sanctioned or later, its financial terms
        (sanction_amount, interest_rate, term_months,
        repayment_term_months, installment_amount) are locked here —
        changing them after money has been committed must go through
        Module 04 (pre-disbursement) or a formal restructuring entry
        (loan_restructuring_log, post-disbursement), not a silent edit.
     3. Closing a loan now verifies loan_ledger has a zero balance
        first, same principle already applied to deposit account
        closure in account-maintenance.js.
═══════════════════════════════════════════════════════════ */

'use strict';

const SUPABASE_URL      = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';

const TABLE = 'loanmasterrecords';

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
    throw new Error((data && data.message) || `HTTP ${res.status}`);
  }
  return data;
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

/* ── Field Map: HTML id → loanmasterrecords column ──────── */
const FIELD_MAP = {
  maintBranchId:              'branch_id',
  maintApplicationId:         'application_id',
  maintClientId:              'client_id',
  maintClientName:            'client_name',
  maintLoanSeriesNo:          'loan_series_no',
  maintReferenceNo:           'reference_no',
  maintRepayAccountId:        'main_repayment_account_id',
  maintPurpose:               'loan_purpose',
  maintCreditOfficer:         'credit_officer_id',
  maintRepaymentMethod:       'repayment_method',
  maintLineOfBusiness:        'line_of_business',
  maintFundId:                'fund_id',
  maintProductId:             'product_id',
  maintCurrencyId:            'currency_id',
  maintSanctionAmount:        'sanction_amount',
  maintBookedAmount:          'booked_amount',
  maintTermMonths:            'term_months',
  maintRepaymentTermMonths:   'repayment_term_months',
  maintRepaymentFrequency:    'repayment_frequency',
  maintCalculationMethod:     'calculation_method',
  maintFileNumber:            'file_number',
  maintHealthCode:            'health_code',
  maintAccountClass:          'account_class',
  maintApplicationStatus:     'application_status',
  maintStopInterestAccrual:   'stop_interest_accrual',
  maintInterestRateType:      'interest_rate_type',
  maintMarkingRate:           'marking_rate',
  maintInterestRate:          'interest_rate',
  maintPenaltyRate:           'penalty_rate',
  maintEffectiveRate:         'effective_rate',
  maintInstallmentStartDate:  'installment_start_date',
  maintValueDate:             'value_date',
  maintMaturityDate:          'maturity_date',
  maintDisbursementDate:      'disbursement_date',
  maintInstallmentAmount:     'installment_amount',
  maintLastInstallmentAmt:    'last_installment_amt',
  maintGracePeriod:           'grace_period',
  maintGraceDays:             'grace_days',
  maintCreatedBy:             'created_by',
  maintCreatedOn:             'created_on',
  maintModifiedBy:            'modified_by',
  maintModifiedOn:            'modified_on',
};

const READ_ONLY = new Set(['maintCreatedOn', 'maintModifiedOn']);

/* Financial terms that must not change silently once a loan is
   Sanctioned or later — see header comment. */
const LOCKED_TERM_FIELDS = [
  'sanction_amount', 'interest_rate', 'term_months',
  'repayment_term_months', 'installment_amount'
];
const TERM_LOCK_STATUSES = ['Sanctioned', 'Disbursed', 'Matured'];

let currentMode = 'view';
let _loadedStatus = null;      // status as of last successful load
let _loadedSnapshot = null;    // full record as loaded, for term-lock comparison

/* ── Helpers ────────────────────────────────────────────── */
function getField(id) {
  const el = document.getElementById(id);
  if (!el) return undefined;
  if (el.type === 'checkbox') return el.checked;
  return el.value.trim() || null;
}

function setField(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el.type === 'checkbox') { el.checked = !!val; return; }
  el.value = val ?? '';
}

function clearForm() {
  Object.keys(FIELD_MAP).forEach(id => {
    if (id === 'maintCurrencyId')         { setField(id, 'ETB'); return; }
    if (id === 'maintApplicationStatus')  { setField(id, 'DataEntry'); return; }
    if (id === 'maintRepaymentFrequency') { setField(id, 'Monthly'); return; }
    setField(id, '');
  });
  _loadedStatus = null;
  _loadedSnapshot = null;
}

function formToRecord() {
  const rec = {};
  Object.entries(FIELD_MAP).forEach(([htmlId, dbCol]) => {
    if (READ_ONLY.has(htmlId)) return;
    const val = getField(htmlId);
    if (val !== undefined) rec[dbCol] = val;
  });
  return rec;
}

function recordToForm(rec) {
  Object.entries(FIELD_MAP).forEach(([htmlId, dbCol]) => {
    setField(htmlId, rec[dbCol] ?? '');
  });
  const sel = document.getElementById('maintBranchId');
  if (sel) sel.dispatchEvent(new Event('change'));
}

/* ── Auto-compute: Effective Rate ────────────────────────── */
function computeEffectiveRate() {
  const interest   = parseFloat(document.getElementById('maintInterestRate')?.value) || 0;
  const commission = parseFloat(document.getElementById('maintMarkingRate')?.value)  || 0;
  const el = document.getElementById('maintEffectiveRate');
  if (el) el.value = (interest + commission).toFixed(2);
}

/* ── Auto-compute: Installment Amount & Maturity Date (reducing balance) ─────── */
function computeSchedule() {
  const principal = parseFloat(document.getElementById('maintSanctionAmount')?.value) || 0;
  const rate      = parseFloat(document.getElementById('maintInterestRate')?.value)   || 0;
  const term      = parseInt(document.getElementById('maintTermMonths')?.value)       || 0;
  const startDate = document.getElementById('maintDisbursementDate')?.value ||
                    document.getElementById('maintInstallmentStartDate')?.value;

  if (!principal || !term) return;

  const monthlyRate = (rate / 100) / 12;
  let installment;
  if (monthlyRate === 0) {
    installment = principal / term;
  } else {
    installment = principal * (monthlyRate * Math.pow(1 + monthlyRate, term)) /
                  (Math.pow(1 + monthlyRate, term) - 1);
  }

  const instEl = document.getElementById('maintInstallmentAmount');
  if (instEl) instEl.value = installment.toFixed(2);

  if (startDate) {
    const maturity = new Date(startDate);
    maturity.setMonth(maturity.getMonth() + term);
    const matEl = document.getElementById('maintMaturityDate');
    if (matEl) matEl.value = maturity.toISOString().split('T')[0];
  }

  toast(`Schedule computed — Installment: ETB ${installment.toFixed(2)}`, 'success');
}

['maintInterestRate','maintMarkingRate'].forEach(id =>
  document.getElementById(id)?.addEventListener('input', computeEffectiveRate)
);
['maintSanctionAmount','maintInterestRate','maintTermMonths','maintDisbursementDate'].forEach(id =>
  document.getElementById(id)?.addEventListener('change', () => {})
);
document.getElementById('btnComputeSchedule')?.addEventListener('click', computeSchedule);

/* ── Branch Dropdown ───────────────────────────────────── */
let _branchCache = [];

async function loadBranches() {
  const sel = document.getElementById('maintBranchId');
  if (sel) { sel.innerHTML = '<option value="">Loading…</option>'; sel.disabled = true; }
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
  } catch {
    toast('Could not load branch list.', 'error');
    const sel2 = document.getElementById('maintBranchId');
    if (sel2) { sel2.innerHTML = '<option value="">-- Select Branch --</option>'; sel2.disabled = false; }
  }
}

document.getElementById('maintBranchId')?.addEventListener('change', function () {
  const chosen = _branchCache.find(b => b.branch_id === this.value);
  const nameEl = document.getElementById('maintBranchName');
  if (nameEl) nameEl.value = chosen?.branch_name || '';
});

/* ── Product Dropdown ──────────────────────────────────── */
let _productCache = [];

async function loadProducts() {
  const sel = document.getElementById('maintProductId');
  if (!sel) return;
  try {
    const rows = await sbFetch(
      'lendingproductparametermatrix?select=product_code_id,product_name_title,base_interest_rate,default_term_months&order=product_code_id'
    );
    _productCache = Array.isArray(rows) ? rows : [];
    const keep = sel.value;
    sel.innerHTML = '<option value="">-- Select Product --</option>';
    _productCache.forEach(r => {
      const o = document.createElement('option');
      o.value = r.product_code_id;
      o.textContent = r.product_code_id + (r.product_name_title ? ' — ' + r.product_name_title : '');
      sel.appendChild(o);
    });
    if (keep) sel.value = keep;
  } catch {
    toast('Could not load product list.', 'error');
  }
}

document.getElementById('maintProductId')?.addEventListener('change', function () {
  const chosen = _productCache.find(p => p.product_code_id === this.value);
  if (!chosen) return;
  if (chosen.base_interest_rate && !document.getElementById('maintInterestRate')?.value) {
    setField('maintInterestRate', chosen.base_interest_rate);
    computeEffectiveRate();
  }
  if (chosen.default_term_months && !document.getElementById('maintTermMonths')?.value) {
    setField('maintTermMonths', chosen.default_term_months);
  }
});

/* ── Client ID lookup → cascade name ───────────────────── */
async function lookupClientName(clientId) {
  if (!clientId) { setField('maintClientName', ''); return; }
  try {
    const rows = await sbFetch(
      `ClientMasterRecords?client_id=eq.${encodeURIComponent(clientId)}&select=client_name,first_name,middle_name,last_name&limit=1`
    );
    if (rows && rows[0]) {
      const r = rows[0];
      const name = r.client_name ||
        [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(' ');
      setField('maintClientName', name);
      document.getElementById('maintClientId')?.classList.remove('input-invalid');
    } else {
      setField('maintClientName', '');
      document.getElementById('maintClientId')?.classList.add('input-invalid');
      toast('Client ID not found in registry.', 'warning');
    }
  } catch (e) {
    toast('Client lookup error: ' + e.message, 'error');
  }
}

document.getElementById('maintClientId')?.addEventListener('blur', e => lookupClientName(e.target.value.trim()));
document.getElementById('maintClientId')?.addEventListener('keydown', e => { if (e.key === 'Enter') lookupClientName(e.target.value.trim()); });
document.getElementById('btnLookupClient')?.addEventListener('click', () => lookupClientName(document.getElementById('maintClientId')?.value.trim()));

/* ── Application ID lookup ─────────────────────────────── */
async function viewRecord() {
  const appId = getField('maintApplicationId');
  if (!appId) { toast('Enter an Application ID to look up.', 'warning'); return; }
  try {
    const rows = await sbFetch(`${TABLE}?application_id=eq.${encodeURIComponent(appId)}&limit=1`);
    if (rows && rows[0]) {
      recordToForm(rows[0]);
      _loadedStatus   = rows[0].application_status || 'DataEntry';
      _loadedSnapshot = rows[0];
      const cid = rows[0].client_id;
      if (cid) lookupClientName(cid);
      toast(`Account ${appId} loaded (${_loadedStatus}).`, 'success');
      setMode('view');
    } else {
      toast('Application ID not found in loanmasterrecords.', 'warning');
    }
  } catch (e) {
    toast('Lookup error: ' + e.message, 'error');
  }
}

document.getElementById('btnLookupApp')?.addEventListener('click', viewRecord);
document.getElementById('maintApplicationId')?.addEventListener('keydown', e => { if (e.key === 'Enter') viewRecord(); });

/* ── Save ──────────────────────────────────────────────── */
async function saveRecord() {
  const rec = formToRecord();
  if (!rec.application_id)            { toast('Application ID is required.', 'warning'); return; }
  if (!rec.client_id)                 { toast('Client ID is required.', 'warning'); return; }
  if (!rec.product_id)                { toast('Product ID is required.', 'warning'); return; }
  if (!rec.main_repayment_account_id) { toast('Repayment Account ID is required.', 'warning'); return; }

  const sb = document.getElementById('statusBar');
  const isUpdate = currentMode !== 'add';

  if (isUpdate && _loadedSnapshot) {
    // ── GATE 1: status transition guard ──────────────────
    const targetStatus = rec.application_status;
    if (targetStatus && targetStatus !== _loadedStatus && window.LoanStatusGuard) {
      const check = LoanStatusGuard.canTransition(_loadedStatus, targetStatus, 'loan-account-maintenance');
      if (!check.allowed) {
        toast(check.reason, 'error');
        if (sb) sb.textContent = 'Save blocked — see toast.';
        return;
      }
      // Closing from here is only reached pre-disbursement per the guard's
      // transition map, but verify the ledger anyway — cheap insurance.
      if (targetStatus === 'Closed') {
        const bal = await LoanStatusGuard.checkZeroLedgerBalance(sbFetch, rec.application_id);
        if (!bal.zero) {
          toast(`Cannot close — outstanding loan ledger balance of ETB ${(bal.balance ?? 0).toLocaleString()}. Use Module 09 (Settlement) to pay off first.`, 'error');
          if (sb) sb.textContent = 'Save blocked — outstanding balance.';
          return;
        }
      }
    }

    // ── GATE 2: financial terms are locked once Sanctioned or later ──
    if (TERM_LOCK_STATUSES.includes(_loadedStatus)) {
      const changedLockedFields = LOCKED_TERM_FIELDS.filter(col => {
        const before = _loadedSnapshot[col];
        const after  = rec[col];
        // Loose numeric compare so '12' vs 12 vs '12.00' don't false-positive
        return parseFloat(before) !== parseFloat(after) &&
               !(isNaN(parseFloat(before)) && isNaN(parseFloat(after)));
      });
      if (changedLockedFields.length) {
        toast(
          `Cannot change ${changedLockedFields.join(', ')} — loan is already ${_loadedStatus}. ` +
          `Use Module 04 (Credit Sanction Console) before disbursement, or a loan restructuring entry after disbursement.`,
          'error'
        );
        if (sb) sb.textContent = 'Save blocked — financial terms are locked.';
        return;
      }
    }
  }

  if (sb) sb.textContent = 'Saving…';

  try {
    if (currentMode === 'add') {
      // Atomic: creates the matching loanapplications parent row too,
      // which this path previously skipped entirely (unlike
      // loan-application.js / group-loan-projection.js, which always
      // create both). See loan_account_maintenance_fixes.sql.
      await sbRpc('create_loan_account_direct', {
        p_application_id: rec.application_id,
        p_branch_id:      rec.branch_id || null,
        p_record:         rec
      });
      toast(`Account ${rec.application_id} created.`, 'success');
    } else {
      const { application_id, application_status: newStatus, ...otherFields } = rec;
      const statusChanged = newStatus && newStatus !== _loadedStatus;

      // Regular field changes (if any) — already a single-table write,
      // no atomicity gap here on their own.
      if (Object.keys(otherFields).length > 0) {
        otherFields.modified_on = new Date().toISOString();
        await sbFetch(`${TABLE}?application_id=eq.${encodeURIComponent(application_id)}`, {
          method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify(otherFields)
        });
      }
      toast(`Account ${application_id} updated.`, 'success');

      if (statusChanged) {
        // Atomic: status PATCH + audit log insert together — previously
        // these were two separate calls, so a failure between them left
        // a successful status change with no audit trail entry.
        await sbRpc('update_loan_account_status', {
          p_application_id: application_id,
          p_new_status:     newStatus,
          p_changed_by:     getField('maintModifiedBy'),
          p_source_module:  'loan-account-maintenance'
        });
        _loadedStatus = newStatus;
      }
    }
    setMode('view');
    if (sb) sb.textContent = `Saved — ${rec.application_id}`;
  } catch (e) {
    toast('Save error: ' + e.message, 'error');
    if (sb) sb.textContent = 'Save failed.';
  }
}

/* ── Mode Control ──────────────────────────────────────── */
function setMode(mode) {
  currentMode = mode;
  const isEdit = mode === 'edit' || mode === 'add';
  const view = document.querySelector('.module-view.active');
  if (view) {
    view.querySelectorAll('input, select, textarea').forEach(el => {
      if (el.dataset.alwaysEnabled !== undefined) { el.disabled = false; return; }
      if (el.readOnly) { el.disabled = false; return; }
      el.disabled = !isEdit;
    });
  }
  document.getElementById('btnGlobalSave').disabled   = !isEdit;
  document.getElementById('btnGlobalCancel').disabled = !isEdit;
  document.getElementById('btnGlobalAdd').disabled    = isEdit;
  document.getElementById('btnGlobalEdit').disabled   = isEdit;
  document.getElementById('btnGlobalDelete').disabled = !isEdit;
  document.getElementById('btnGlobalClose').disabled  = isEdit;
  const sb = document.getElementById('statusBar');
  if (sb) sb.textContent = `Mode: ${mode.charAt(0).toUpperCase() + mode.slice(1)} — Ready`;
}

/* ── Toolbar Buttons ────────────────────────────────────── */
document.getElementById('btnGlobalView')?.addEventListener('click', viewRecord);
document.getElementById('btnGlobalAdd')?.addEventListener('click', () => {
  clearForm(); setMode('add');
  document.getElementById('maintApplicationId')?.focus();
  toast('Add mode — enter Application ID and details then Save.');
});
document.getElementById('btnGlobalEdit')?.addEventListener('click', () => {
  setMode('edit'); toast('Edit mode — make changes then Save.');
});
document.getElementById('btnGlobalSave')?.addEventListener('click', saveRecord);
document.getElementById('btnGlobalCancel')?.addEventListener('click', () => {
  setMode('view'); toast('Changes discarded.');
});
document.getElementById('btnGlobalClose')?.addEventListener('click', () => {
  clearForm(); setMode('view'); toast('Record closed.');
});
document.getElementById('btnGlobalDelete')?.addEventListener('click', async () => {
  const appId = getField('maintApplicationId');
  if (!appId) { toast('Load a record first.', 'warning'); return; }

  if (window.LoanStatusGuard && _loadedStatus) {
    const check = LoanStatusGuard.canTransition(_loadedStatus, 'Closed', 'loan-account-maintenance');
    if (!check.allowed) {
      toast(check.reason, 'error');
      return;
    }
    const bal = await LoanStatusGuard.checkZeroLedgerBalance(sbFetch, appId);
    if (!bal.zero) {
      toast(`Cannot close — outstanding loan ledger balance of ETB ${(bal.balance ?? 0).toLocaleString()}.`, 'error');
      return;
    }
  }

  if (!confirm(`Soft-delete account ${appId}?\nThis sets status to Closed.`)) return;
  try {
    // Atomic: status PATCH + audit log insert together, same fix as
    // saveRecord()'s status-change path above.
    await sbRpc('update_loan_account_status', {
      p_application_id: appId,
      p_new_status:     'Closed',
      p_changed_by:     getField('maintModifiedBy'),
      p_source_module:  'loan-account-maintenance'
    });
    toast(`Account ${appId} closed.`, 'success');
    clearForm(); setMode('view');
  } catch (e) {
    toast('Delete error: ' + e.message, 'error');
  }
});
document.getElementById('btnGlobalPrint')?.addEventListener('click', () => window.print());

/* ── Init ──────────────────────────────────────────────── */
async function init() {
  setMode('view');
  await Promise.all([loadBranches(), loadProducts()]);
  if (!window.LoanStatusGuard) {
    console.warn('LoanStatusGuard not found — add <script src="loan-status-guard.js"> before this file. Status transitions and term locks will NOT be enforced.');
  }
}
init();
