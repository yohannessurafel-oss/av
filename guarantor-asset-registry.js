/* ═══════════════════════════════════════════════════════════
   Africa Village Microfinance — 07 Guarantor Asset Registry
   guarantor-asset-registry.js  v2.1  (FIXED)
   Table: guarantorriskregistry
   Fixes: View/Save wired, all fields mapped, null guards
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

/* ── Field Map: HTML id → DB column ─────────────────────
   IMPORTANT: Add these id= attributes to guarantor-asset-registry.html
   inputs that currently have no id.                        */
const FIELD_MAP = {
  guarantorBranchId:       'branch_id',          // needs ALTER TABLE (see audit)
  guarantorTypeId:         'guarantor_type_id',
  guarantorId:             'guarantor_id',
  guarantorRelevantId:     'relevant_id',
  guarantorSignedBy:       'signed_by',
  guarantorMaxGuaranteeAmt:'max_guarantee_amount',
  guarantorMaxNoOfLoans:   'max_no_of_loan',
  guarantorNetWorth:       'net_worth',
  guarantorLiability:      'liability_exposure',
  guarantorAddress:        'address',
  guarantorCity:           'city',
  guarantorCountry:        'country',
  guarantorNoOfLoans:      'no_of_loans',         // needs ALTER TABLE (see audit)
  guarantorConstitution:   'constitution',
  guarantorId1:            'identity_card_1',
  guarantorId2:            'identity_card_2',
  guarantorLoanAmount:     'loan_amount',          // needs ALTER TABLE (see audit)
  guarantorLineOfBusiness: 'line_of_business',     // needs ALTER TABLE (see audit)
  guarantorCreatedBy:      'created_by',
  guarantorCreatedOn:      'created_on',           // display only
  guarantorModifiedBy:     'modified_by',          // needs ALTER TABLE (see audit)
  guarantorModifiedOn:     'modified_on',          // needs ALTER TABLE (see audit)
  guarantorSupervisedBy:   'supervised_by',        // needs ALTER TABLE (see audit)
  guarantorSupervisedOn:   'supervised_on',        // needs ALTER TABLE (see audit)
};

/* ── Tracked record PK for updates ─────────────────────── */
let _currentAssignmentId = null;

/* ── Helpers ────────────────────────────────────────────── */
function getField(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() || null : undefined;
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
    // Skip display-only fields for insert/update
    if (htmlId === 'guarantorCreatedOn' || htmlId === 'guarantorModifiedOn' || htmlId === 'guarantorSupervisedOn') return;
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

document.getElementById('guarantorBranchId')?.addEventListener('change', function () {
  const chosen = _branchCache.find(b => b.branch_id === this.value);
  // branch_name display field (if present)
  const nameEl = document.getElementById('guarantorBranchName');
  if (nameEl) nameEl.value = chosen ? (chosen.branch_name || '') : '';
});

/* ── View / Lookup ─────────────────────────────────────── */
async function viewRecord() {
  const guarantorId = getField('guarantorId');
  if (!guarantorId) { toast('Enter a Guarantor ID to search.', 'warning'); return; }

  try {
    // Search by guarantor_id; may return multiple assignments — load first
    const rows = await sbFetch(
      `guarantorriskregistry?guarantor_id=eq.${encodeURIComponent(guarantorId)}&order=guarantor_assignment_id.desc&limit=1`
    );
    if (rows && rows[0]) {
      recordToForm(rows[0]);
      toast(`Guarantor ${guarantorId} loaded.`);
      setMode('view');
    } else {
      toast('Guarantor ID not found.', 'warning');
    }
  } catch (e) {
    toast('Lookup error: ' + e.message, 'error');
  }
}

/* ── Save (Insert or Update) ────────────────────────────── */
async function saveRecord() {
  const rec = formToRecord();
  if (!rec.guarantor_id) { toast('Guarantor ID is required.', 'warning'); return; }

  const sb = document.getElementById('statusBar');
  if (sb) sb.textContent = 'Saving…';

  try {
    if (currentMode === 'add' || !_currentAssignmentId) {
      // INSERT
      const result = await sbFetch('guarantorriskregistry', {
        method: 'POST',
        prefer: 'return=representation',
        body: JSON.stringify(rec)
      });
      if (result && result[0]) {
        _currentAssignmentId = result[0].guarantor_assignment_id;
      }
      toast(`Guarantor ${rec.guarantor_id} registered.`, 'success');
    } else {
      // UPDATE by PK
      await sbFetch(`guarantorriskregistry?guarantor_assignment_id=eq.${_currentAssignmentId}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: JSON.stringify(rec)
      });
      toast(`Guarantor ${rec.guarantor_id} updated.`, 'success');
    }
    setMode('view');
    if (sb) sb.textContent = `Saved — Guarantor ${rec.guarantor_id}`;
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
    view.querySelectorAll('input:not([readonly]), select, textarea').forEach(el => {
      if (el.dataset.alwaysEnabled !== undefined || el.id === 'guarantorBranchId') {
        el.disabled = false; return;
      }
      el.disabled = !isEdit;
    });
  }
  document.querySelectorAll('input[readonly]').forEach(el => el.disabled = false);
  const sel = document.getElementById('guarantorBranchId');
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

/* ── Toolbar Buttons ────────────────────────────────────── */
document.getElementById('btnGlobalView')?.addEventListener('click', viewRecord);
document.getElementById('btnGlobalAdd')?.addEventListener('click', () => {
  clearForm();
  setMode('add');
  toast('Add mode — enter guarantor details then Save.');
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
  if (!confirm('Delete this guarantor record?')) return;
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
