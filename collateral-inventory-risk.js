/* ═══════════════════════════════════════════════════════════
   Africa Village Microfinance — 06 Collateral Inventory Risk
   collateral-inventory-risk.js  v2.3 — OWNER ID LOOKUP WIRED UP
   Table: collateralinventory
WHAT CHANGED FROM v2.2
   The Owner ID field's 🔍 button had no id attribute and no handler at
   all — zero validation UX, unlike every other lookup field in this
   codebase. Added lookupOwner(), wired to the button (now given an id)
   and Enter key, plus a new read-only Owner Name field in the HTML so
   the resolved name is actually visible. saveRecord() now also pre-
   checks that Owner ID resolves before writing, giving a clean toast
   instead of a raw FK-violation error from the owner_id FK added earlier.
═══════════════════════════════════════════════════════════ */

'use strict';

const SUPABASE_URL      = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';

/* ── HTTP Helper — Hardened raw text parsing ────────────────── */
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

/* ── Field Map ── */
const FIELD_MAP = {
  collateralBranchId:             'branch_id',
  collateralId:                   'collateral_id',
  collateralDescription:          'description',
  collateralType:                 'collateral_type',
  collateralOwnerId:              'owner_id',
  collateralLodgedDate:           'lodged_date',
  collateralInsured:              'is_insured',
  collateralNatureOfCharge:       'nature_of_charge',
  collateralRemarks:              'remarks',
  collateralValue:                'collateral_value',
  usedCollateralValue:            'used_collateral_value',
  collateralLoanCollValue:        'loan_collateral_value',
  collateralApportionedRatio:     'apportioned_ratio',
  collateralApportionedValue:     'apportioned_value',
  collateralApportionedCollValue: 'apportioned_collateral_value',
  collateralMargin:               'margin_percentage',
  collateralExchangeRate:         'exchange_rate',
  collateralCurrencyId:           'currency_id',
  collateralValueType:            'value_type',
  collateralAssignedDate:         'assigned_date',
  collateralWithdrawnDate:        'withdrawn_date',
  collateralWithdrawnReason:      'withdrawn_reason',
  collateralStatus:               'status',
  collateralCreatedBy:            'created_by',
  collateralCreatedOn:            'created_on',
  collateralModifiedBy:           'modified_by',
  collateralModifiedOn:           'modified_on',
  collateralSupervisedBy:         'supervised_by',
  collateralSupervisedOn:         'supervised_on',
};

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
  Object.keys(FIELD_MAP).forEach(id => setField(id, ''));
  const insuredEl = document.getElementById('collateralInsured');
  if (insuredEl) insuredEl.checked = false;
}

function formToRecord() {
  const rec = {};
  Object.entries(FIELD_MAP).forEach(([htmlId, dbCol]) => {
    const val = getField(htmlId);
    if (val !== undefined) rec[dbCol] = val;
  });
  return rec;
}

function recordToForm(rec) {
  Object.entries(FIELD_MAP).forEach(([htmlId, dbCol]) => {
    setField(htmlId, rec[dbCol] ?? '');
  });
}

/* ── Branch Dropdown ───────────────────────────────────── */
let _branchCache = [];

async function loadBranches() {
  const sel = document.getElementById('collateralBranchId');
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

/* ── Owner Lookup — NEW, this button previously had no id and no
   handler at all; Owner ID had zero validation UX ── */
async function lookupOwner() {
  const ownerId = getField('collateralOwnerId');
  if (!ownerId) { toast('Enter an Owner ID to look up.', 'warning'); return; }
  try {
    const rows = await sbFetch(
      `ClientMasterRecords?client_id=eq.${encodeURIComponent(ownerId)}&select=client_id,client_name,first_name,middle_name,last_name&limit=1`
    );
    if (rows && rows[0]) {
      const r = rows[0];
      const fullName = r.client_name || [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(' ');
      setField('collateralOwnerName', fullName);
      toast(`Owner found: ${fullName}`, 'success');
    } else {
      setField('collateralOwnerName', '');
      toast(`Owner ID "${ownerId}" not found in client registry.`, 'warning');
    }
  } catch (e) {
    toast('Owner lookup error: ' + e.message, 'error');
  }
}
document.getElementById('btnLookupOwner')?.addEventListener('click', lookupOwner);
document.getElementById('collateralOwnerId')?.addEventListener('keydown', e => { if (e.key === 'Enter') lookupOwner(); });

/* ── View / Lookup ─────────────────────────────────────── */
async function viewRecord() {
  const collateralId = getField('collateralId');
  if (!collateralId) { toast('Enter a Collateral ID to search.', 'warning'); return; }
  try {
    const rows = await sbFetch(
      `collateralinventory?collateral_id=eq.${encodeURIComponent(collateralId)}&limit=1`
    );
    if (rows && rows[0]) {
      recordToForm(rows[0]);
      if (rows[0].owner_id) lookupOwner();
      toast(`Record loaded: ${collateralId}`);
      setMode('view');
    } else {
      toast('Collateral ID not found.', 'warning');
    }
  } catch (e) {
    toast('Lookup error: ' + e.message, 'error');
  }
}

/* ── Save (Insert or Update) ────────────────────────────── */
async function saveRecord() {
  const rec = formToRecord();
  if (!rec.collateral_id)   { toast('Collateral ID is required.', 'warning'); return; }
  if (!rec.branch_id)       { toast('Branch is required.', 'warning'); return; }
  if (!rec.owner_id)        { toast('Owner ID is required.', 'warning'); return; }
  if (!rec.collateral_type) { toast('Collateral Type is required.', 'warning'); return; }

  // NEW: owner_id already has a real FK to ClientMasterRecords (added
  // earlier). Pre-checking here means a clean toast instead of a raw
  // Postgres FK-violation error after clicking Save.
  const sb = document.getElementById('statusBar');
  if (sb) sb.textContent = 'Verifying owner…';
  try {
    const ownerCheck = await sbFetch(
      `ClientMasterRecords?client_id=eq.${encodeURIComponent(rec.owner_id)}&select=client_id&limit=1`
    );
    if (!ownerCheck || !ownerCheck[0]) {
      toast(`Owner ID "${rec.owner_id}" is not a registered client.`, 'error');
      document.getElementById('collateralOwnerId')?.focus();
      if (sb) sb.textContent = 'Blocked — owner not found in client registry.';
      return;
    }
  } catch (e) {
    toast('Could not verify owner before saving: ' + e.message, 'error');
    return;
  }

  const sb = document.getElementById('statusBar');
  if (sb) sb.textContent = 'Saving…';

  try {
    if (currentMode === 'add') {
      rec.created_on = new Date().toISOString();
      await sbFetch('collateralinventory', {
        method: 'POST',
        prefer: 'return=minimal',
        body: JSON.stringify(rec)
      });
      toast(`Collateral ${rec.collateral_id} created.`, 'success');
    } else {
      rec.modified_on = new Date().toISOString();
      const { collateral_id, ...updateFields } = rec;
      await sbFetch(`collateralinventory?collateral_id=eq.${encodeURIComponent(collateral_id)}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: JSON.stringify(updateFields)
      });
      toast(`Collateral ${collateral_id} updated.`, 'success');
    }
    setMode('view');
  } catch (e) {
    toast('Save error: ' + e.message, 'error');
    if (sb) sb.textContent = 'Save failed — see toast.';
  }
}

/* ── Withdraw Action ────────────────────────────────────── */
async function withdrawCollateral() {
  const collateralId = getField('collateralId');
  if (!collateralId) { toast('Load a record first.', 'warning'); return; }
  const wDate   = getField('collateralWithdrawnDate');
  const wReason = getField('collateralWithdrawnReason');
  if (!wDate) { toast('Enter a Withdrawn Date before withdrawing.', 'warning'); return; }
  try {
    await sbFetch(`collateralinventory?collateral_id=eq.${encodeURIComponent(collateralId)}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ status: 'Withdrawn', withdrawn_date: wDate, withdrawn_reason: wReason || null })
    });
    setField('collateralStatus', 'Withdrawn');
    toast(`Collateral ${collateralId} marked as Withdrawn.`, 'success');
  } catch (e) {
    toast('Withdraw error: ' + e.message, 'error');
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
      if (el.hasAttribute('readonly')) { el.disabled = false; return; }
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
  toast('Add mode — enter collateral details then Save.');
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
  const collateralId = getField('collateralId');
  if (!collateralId) { toast('Load a record first.', 'warning'); return; }
  if (!confirm(`Soft-delete collateral ${collateralId}?`)) return;
  try {
    await sbFetch(`collateralinventory?collateral_id=eq.${encodeURIComponent(collateralId)}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ status: 'Deleted' })
    });
    toast(`Collateral ${collateralId} marked deleted.`);
    clearForm();
    setMode('view');
  } catch (e) {
    toast('Delete error: ' + e.message, 'error');
  }
});
document.getElementById('btnGlobalPrint')?.addEventListener('click', () => window.print());
document.getElementById('btnSearchCollateral')?.addEventListener('click', viewRecord);
document.getElementById('btnWithdraw')?.addEventListener('click', withdrawCollateral);

/* ── Init ──────────────────────────────────────────────── */
async function init() {
  setMode('view');
  await loadBranches();
}
init();

