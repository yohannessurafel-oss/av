/* ═══════════════════════════════════════════════════════════
   Africa Village Microfinance — 07 Guarantor Asset Registry
   guarantor-asset-registry.js  v2.2
   Table: guarantorriskregistry
   FK links: loanapplications (application_id)
             loanmasterrecords (account_id)
             ClientMasterRecords (guarantor_id)
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

/* ── Field Map: HTML id → DB column ─────────────────────
   All ids now exist in the HTML.
   Display-only ids (readonly auto-filled) are skipped in formToRecord().
═══════════════════════════════════════════════════════════ */
const FIELD_MAP = {
  /* Loan linkage (new FKs) */
  guarantorApplicationId:  'application_id',
  guarantorAccountId:      'account_id',
  guarantorClientId:       'client_id',           // display-only — set from app lookup
  guarantorClientName:     'client_name',          // display-only — set from app lookup

  /* Guarantor details */
  guarantorBranchId:       'branch_id',
  guarantorTypeId:         'guarantor_type_id',
  guarantorId:             'guarantor_id',
  guarantorName:           'guarantor_name',       // display-only — set from registry lookup
  guarantorSignedBy:       'signed_by',
  guarantorMaxGuaranteeAmt:'max_guarantee_amount',
  guarantorMaxNoOfLoans:   'max_no_of_loan',
  guarantorNetWorth:       'net_worth',

  /* Profile matrix */
  guarantorLiability:      'liability_exposure',
  guarantorLoanAmount:     'loan_amount',
  guarantorNoOfLoans:      'no_of_loans',
  guarantorLineOfBusiness: 'line_of_business',
  guarantorConstitution:   'constitution',
  guarantorAddress:        'address',
  guarantorCity:           'city',
  guarantorCountry:        'country',
  guarantorId1:            'identity_card_1',
  guarantorId2:            'identity_card_2',

  /* Audit trail */
  guarantorCreatedBy:      'created_by',
  guarantorCreatedOn:      'created_on',           // display-only
  guarantorModifiedBy:     'modified_by',
  guarantorModifiedOn:     'modified_on',          // display-only
  guarantorSupervisedBy:   'supervised_by',
  guarantorSupervisedOn:   'supervised_on',        // display-only
};

/* Fields that are display-only and should never be sent to DB on insert/update */
const DISPLAY_ONLY = new Set([
  'guarantorClientName',
  'guarantorName',
  'guarantorCreatedOn',
  'guarantorModifiedOn',
  'guarantorSupervisedOn',
]);

/* ── Tracked record PK for updates ─────────────────────── */
let _currentAssignmentId = null;

/* ── Helpers ────────────────────────────────────────────── */
function getField(id) {
  const el = document.getElementById(id);
  if (!el) return undefined;
  return el.value.trim() || null;
}

function setField(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val ?? '';
}

function clearForm() {
  Object.keys(FIELD_MAP).forEach(id => setField(id, ''));
  _currentAssignmentId = null;
}

function formToRecord() {
  const rec = {};
  Object.entries(FIELD_MAP).forEach(([htmlId, dbCol]) => {
    if (DISPLAY_ONLY.has(htmlId)) return;
    const val = getField(htmlId);
    if (val !== undefined) rec[dbCol] = val;
  });
  return rec;
}

function recordToForm(rec) {
  Object.entries(FIELD_MAP).forEach(([htmlId, dbCol]) => {
    setField(htmlId, rec[dbCol] ?? '');
  });
  _currentAssignmentId = rec.guarantor_assignment_id ?? null;
}

/* ── Branch Dropdown ───────────────────────────────────── */
let _branchCache = [];

async function loadBranches() {
  const sel = document.getElementById('guarantorBranchId');
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
    if (sel) { sel.innerHTML = '<option value="">-- Select Branch --</option>'; sel.disabled = false; }
  }
}

document.getElementById('guarantorBranchId')?.addEventListener('change', function () {
  const chosen = _branchCache.find(b => b.branch_id === this.value);
  const nameEl = document.getElementById('guarantorBranchName');
  if (nameEl) nameEl.value = chosen?.branch_name || '';
});

/* ══════════════════════════════════════════════════════════
   FK LOOKUP FUNCTIONS
   These are the three lookups that make the FK links work:
   1. Application ID  → loanapplications
   2. Account ID      → loanmasterrecords
   3. Guarantor ID    → ClientMasterRecords
══════════════════════════════════════════════════════════ */

/* 1. Application ID lookup — cascades Client ID, Name, Branch, Account ID */
async function lookupApplication() {
  const appId = getField('guarantorApplicationId');
  if (!appId) { toast('Enter an Application ID to look up.', 'warning'); return; }

  try {
    // Try loanapplications first (CBS v2 staging table)
    let appRows = await sbFetch(
      `loanapplications?application_id=eq.${encodeURIComponent(appId)}&select=application_id,client_id,branch_id&limit=1`
    );
    // Fallback to loanmasterrecords if not in staging table
    if (!appRows || !appRows[0]) {
      appRows = await sbFetch(
        `loanmasterrecords?application_id=eq.${encodeURIComponent(appId)}&select=application_id,client_id,branch_id&limit=1`
      );
    }
    if (!appRows || !appRows[0]) { toast(`Application "${appId}" not found.`, 'warning'); return; }

    const app = appRows[0];

    /* Set branch from application */
    if (app.branch_id) {
      const sel = document.getElementById('guarantorBranchId');
      if (sel) sel.value = app.branch_id;
      const chosen = _branchCache.find(b => b.branch_id === app.branch_id);
      const nameEl = document.getElementById('guarantorBranchName');
      if (nameEl) nameEl.value = chosen?.branch_name || app.branch_id;
    }

    /* Set client ID and cascade to name */
    setField('guarantorClientId', app.client_id ?? '');
    if (app.client_id) await cascadeClientName(app.client_id, 'guarantorClientName');

    /* Try to find the linked loan account */
    try {
      const acctRows = await sbFetch(
        `loanmasterrecords?application_id=eq.${encodeURIComponent(appId)}&select=account_id&limit=1`
      );
      if (acctRows && acctRows[0]?.account_id) {
        setField('guarantorAccountId', acctRows[0].account_id);
      }
    } catch { /* account may not exist yet — that's fine */ }

    toast(`Application ${appId} loaded — client and branch filled.`, 'success');
  } catch (e) {
    toast('Application lookup error: ' + e.message, 'error');
  }
}

/* 2. Account ID lookup — cascades Application ID and client details */
async function lookupAccount() {
  const accId = getField('guarantorAccountId');
  if (!accId) { toast('Enter an Account ID to look up.', 'warning'); return; }

  try {
    const rows = await sbFetch(
      `loanmasterrecords?account_id=eq.${encodeURIComponent(accId)}&select=account_id,application_id,client_id,branch_id&limit=1`
    );
    if (!rows || !rows[0]) { toast(`Account "${accId}" not found.`, 'warning'); return; }

    const acct = rows[0];
    setField('guarantorApplicationId', acct.application_id ?? '');
    setField('guarantorClientId',      acct.client_id ?? '');

    if (acct.branch_id) {
      const sel = document.getElementById('guarantorBranchId');
      if (sel) sel.value = acct.branch_id;
      const chosen = _branchCache.find(b => b.branch_id === acct.branch_id);
      const nameEl = document.getElementById('guarantorBranchName');
      if (nameEl) nameEl.value = chosen?.branch_name || acct.branch_id;
    }

    if (acct.client_id) await cascadeClientName(acct.client_id, 'guarantorClientName');

    toast(`Account ${accId} loaded — application and client filled.`, 'success');
  } catch (e) {
    toast('Account lookup error: ' + e.message, 'error');
  }
}

/* 3. Guarantor ID lookup — cascades guarantor name from ClientMasterRecords */
async function lookupGuarantor() {
  const gId = getField('guarantorId');
  if (!gId) { toast('Enter a Guarantor ID to look up.', 'warning'); return; }

  try {
    await cascadeClientName(gId, 'guarantorName');
    toast(`Guarantor ${gId} found.`, 'success');
  } catch (e) {
    toast('Guarantor lookup error: ' + e.message, 'error');
  }
}

/* Shared helper — looks up a client_id in ClientMasterRecords and writes the
   full name into a target field id. Throws if not found. */
async function cascadeClientName(clientId, targetFieldId) {
  const rows = await sbFetch(
    `ClientMasterRecords?client_id=eq.${encodeURIComponent(clientId)}&select=client_id,client_name,first_name,middle_name,last_name&limit=1`
  );
  if (rows && rows[0]) {
    const r = rows[0];
    // Use generated client_name column if available, else concat name parts
    const fullName = r.client_name ||
      [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(' ');
    setField(targetFieldId, fullName);
  } else {
    setField(targetFieldId, '');
    toast(`Client ID "${clientId}" not found in registry.`, 'warning');
  }
}

/* Wire the 🔍 buttons */
document.getElementById('btnLookupApplication')?.addEventListener('click', lookupApplication);
document.getElementById('btnLookupAccount')?.addEventListener('click',     lookupAccount);
document.getElementById('btnLookupGuarantor')?.addEventListener('click',   lookupGuarantor);

/* Also trigger lookup on Enter key in the ID fields */
document.getElementById('guarantorApplicationId')?.addEventListener('keydown', e => { if (e.key === 'Enter') lookupApplication(); });
document.getElementById('guarantorAccountId')?.addEventListener('keydown',     e => { if (e.key === 'Enter') lookupAccount(); });
document.getElementById('guarantorId')?.addEventListener('keydown',            e => { if (e.key === 'Enter') lookupGuarantor(); });

/* ── View / Lookup ─────────────────────────────────────── */
async function viewRecord() {
  const guarantorId  = getField('guarantorId');
  const applicationId = getField('guarantorApplicationId');
  const accountId    = getField('guarantorAccountId');

  if (!guarantorId && !applicationId && !accountId) {
    toast('Enter a Guarantor ID, Application ID, or Account ID to search.', 'warning');
    return;
  }

  try {
    let query;
    if (guarantorId && applicationId) {
      /* Most precise: match both guarantor + application */
      query = `guarantorriskregistry?guarantor_id=eq.${encodeURIComponent(guarantorId)}&application_id=eq.${encodeURIComponent(applicationId)}&order=guarantor_assignment_id.desc&limit=1`;
    } else if (guarantorId) {
      query = `guarantorriskregistry?guarantor_id=eq.${encodeURIComponent(guarantorId)}&order=guarantor_assignment_id.desc&limit=1`;
    } else if (applicationId) {
      query = `guarantorriskregistry?application_id=eq.${encodeURIComponent(applicationId)}&order=guarantor_assignment_id.desc&limit=1`;
    } else {
      query = `guarantorriskregistry?account_id=eq.${encodeURIComponent(accountId)}&order=guarantor_assignment_id.desc&limit=1`;
    }

    const rows = await sbFetch(query);
    if (rows && rows[0]) {
      recordToForm(rows[0]);
      /* Re-cascade display-only name fields after recordToForm */
      const cid = getField('guarantorClientId');
      const gid = getField('guarantorId');
      if (cid) cascadeClientName(cid, 'guarantorClientName').catch(() => {});
      if (gid) cascadeClientName(gid, 'guarantorName').catch(() => {});
      toast('Record loaded.', 'success');
      setMode('view');
    } else {
      toast('No matching guarantor record found.', 'warning');
    }
  } catch (e) {
    toast('Lookup error: ' + e.message, 'error');
  }
}

/* ── Save (Insert or Update) ────────────────────────────── */
async function saveRecord() {
  const rec = formToRecord();

  /* Require both application_id and guarantor_id before saving */
  if (!rec.guarantor_id) {
    toast('Guarantor ID is required.', 'warning');
    document.getElementById('guarantorId')?.focus();
    return;
  }
  if (!rec.application_id) {
    toast('Application ID is required — this links the guarantor to a loan.', 'warning');
    document.getElementById('guarantorApplicationId')?.focus();
    return;
  }

  const sb = document.getElementById('statusBar');
  if (sb) sb.textContent = 'Saving…';

  try {
    if (currentMode === 'add' || !_currentAssignmentId) {
      const result = await sbFetch('guarantorriskregistry', {
        method: 'POST',
        prefer: 'return=representation',
        body: JSON.stringify(rec)
      });
      if (result && result[0]) {
        _currentAssignmentId = result[0].guarantor_assignment_id;
        /* Write back the auto-generated created_on timestamp if returned */
        if (result[0].created_on) setField('guarantorCreatedOn', result[0].created_on);
      }
      toast(`Guarantor ${rec.guarantor_id} registered for Application ${rec.application_id}.`, 'success');
    } else {
      await sbFetch(`guarantorriskregistry?guarantor_assignment_id=eq.${_currentAssignmentId}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: JSON.stringify(rec)
      });
      toast(`Guarantor ${rec.guarantor_id} updated.`, 'success');
    }
    setMode('view');
    if (sb) sb.textContent = `Saved — Guarantor ${rec.guarantor_id} | Application ${rec.application_id}`;
  } catch (e) {
    toast('Save error: ' + e.message, 'error');
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
    view.querySelectorAll('input, select, textarea').forEach(el => {
      /* Always-enabled controls (branch dropdown) */
      if (el.dataset.alwaysEnabled !== undefined) { el.disabled = false; return; }
      /* Readonly display fields stay enabled so values are visible but not editable */
      if (el.readOnly) { el.disabled = false; return; }
      el.disabled = !isEdit;
    });
  }

  const btnSave   = document.getElementById('btnGlobalSave');
  const btnCancel = document.getElementById('btnGlobalCancel');
  const btnAdd    = document.getElementById('btnGlobalAdd');
  const btnEdit   = document.getElementById('btnGlobalEdit');
  const btnClose  = document.getElementById('btnGlobalClose');
  const btnDelete = document.getElementById('btnGlobalDelete');

  if (btnSave)   btnSave.disabled   = !isEdit;
  if (btnCancel) btnCancel.disabled = !isEdit;
  if (btnAdd)    btnAdd.disabled    = isEdit;
  if (btnEdit)   btnEdit.disabled   = isEdit || !_currentAssignmentId;
  if (btnDelete) btnDelete.disabled = !_currentAssignmentId;
  if (btnClose)  btnClose.disabled  = isEdit;

  const sb = document.getElementById('statusBar');
  if (sb) sb.textContent = `Mode: ${mode.charAt(0).toUpperCase() + mode.slice(1)} — Ready`;
}

/* ── Toolbar Buttons ────────────────────────────────────── */
document.getElementById('btnGlobalView')?.addEventListener('click', viewRecord);

document.getElementById('btnGlobalAdd')?.addEventListener('click', () => {
  clearForm();
  setMode('add');
  document.getElementById('guarantorApplicationId')?.focus();
  toast('Add mode — enter Application ID first, then Save.');
});

document.getElementById('btnGlobalEdit')?.addEventListener('click', () => {
  setMode('edit');
  toast('Edit mode — make changes then Save.');
});

document.getElementById('btnGlobalSave')?.addEventListener('click', saveRecord);

document.getElementById('btnGlobalCancel')?.addEventListener('click', () => {
  setMode('view');
  toast('Changes discarded.');
});

document.getElementById('btnGlobalClose')?.addEventListener('click', () => {
  clearForm();
  setMode('view');
  toast('Record closed.');
});

document.getElementById('btnGlobalDelete')?.addEventListener('click', async () => {
  if (!_currentAssignmentId) { toast('Load a record first.', 'warning'); return; }
  const gId  = getField('guarantorId') || '?';
  const appId = getField('guarantorApplicationId') || '?';
  if (!confirm(`Delete guarantor record?\nGuarantor: ${gId}\nApplication: ${appId}\n\nThis cannot be undone.`)) return;
  try {
    await sbFetch(`guarantorriskregistry?guarantor_assignment_id=eq.${_currentAssignmentId}`, {
      method: 'DELETE',
      prefer: 'return=minimal'
    });
    toast('Record deleted.');
    clearForm();
    setMode('view');
  } catch (e) {
    toast('Delete error: ' + e.message, 'error');
  }
});

document.getElementById('btnGlobalPrint')?.addEventListener('click', () => window.print());

/* ── Init ──────────────────────────────────────────────── */
async function init() {
  setMode('view');
  await loadBranches();
}
init();
