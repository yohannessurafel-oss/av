/* ═══════════════════════════════════════════════════════════
   Africa Village Microfinance — Group Loan Projection
   02-group-loan-projection.js  v2.0
═══════════════════════════════════════════════════════════ */

'use strict';

const SUPABASE_URL      = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';

/* ── Toast ─────────────────────────────────────────────── */
const toastEl = document.getElementById('toastNotification');
let _toastTimer = null;
function toast(msg, type = '', duration = 3200) {
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
  const sel = document.getElementById('groupBranchId');
  if (sel) { sel.innerHTML = '<option value="">Loading branches…</option>'; sel.disabled = true; }
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/branchregistry?select=branch_id,branch_name&order=branch_id`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Accept': 'application/json' } }
    );
    if (!res.ok) { toast(`Branch list error ${res.status}`, 'error'); return; }
    const rows = await res.json();
    _branchCache = Array.isArray(rows) ? rows : [];
    const sel2 = document.getElementById('groupBranchId');
    if (!sel2) return;
    sel2.innerHTML = '<option value="">-- Select Branch --</option>';
    _branchCache.forEach(r => {
      const o = document.createElement('option');
      o.value = r.branch_id;
      o.textContent = r.branch_id + (r.branch_name ? ' — ' + r.branch_name : '');
      sel2.appendChild(o);
    });
    sel2.disabled = false;
  } catch (e) {
    toast('Could not load branch list.', 'error');
    const sel2 = document.getElementById('groupBranchId');
    if (sel2) { sel2.innerHTML = '<option value="">-- Select Branch --</option>'; sel2.disabled = false; }
  }
}

document.getElementById('groupBranchId')?.addEventListener('change', function () {
  const nameEl = document.getElementById('groupBranchName');
  const chosen = _branchCache.find(b => b.branch_id === this.value);
  if (nameEl) nameEl.value = chosen ? (chosen.branch_name || '') : '';
});

/* ── Mode Control ──────────────────────────────────────── */
let currentMode = 'view';

function setMode(mode) {
  currentMode = mode;
  const isEdit = mode === 'edit' || mode === 'add';
  const view = document.querySelector('.module-view.active');
  if (view) {
    view.querySelectorAll('input:not([readonly]), select, textarea').forEach(el => {
      if (el.dataset.alwaysEnabled !== undefined || el.id === 'groupBranchId') { el.disabled = false; return; }
      el.disabled = !isEdit;
    });
  }
  document.querySelectorAll('input[readonly]').forEach(el => el.disabled = false);
  document.getElementById('groupBranchId').disabled = false;

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

/* ── Toolbar Buttons (scaffold) ────────────────────────── */
document.getElementById('btnGlobalView')?.addEventListener('click', () => {
  toast('View not yet implemented for this module.', 'warning');
});
document.getElementById('btnGlobalAdd')?.addEventListener('click', () => {
  setMode('add');
  toast('Add mode — enter details then Save.');
});
document.getElementById('btnGlobalEdit')?.addEventListener('click', () => {
  setMode('edit');
  toast('Edit mode — make changes then Save.');
});
document.getElementById('btnGlobalSave')?.addEventListener('click', () => {
  toast('Save not yet implemented for this module.', 'warning');
});
document.getElementById('btnGlobalCancel')?.addEventListener('click', () => {
  setMode('view');
  toast('Changes discarded.');
});
document.getElementById('btnGlobalClose')?.addEventListener('click', () => {
  setMode('view');
  toast('Record closed.');
});
document.getElementById('btnGlobalDelete')?.addEventListener('click', () => {
  toast('Delete not yet implemented for this module.', 'warning');
});
document.getElementById('btnGlobalPrint')?.addEventListener('click', () => window.print());

/* ── Init ──────────────────────────────────────────────── */
async function init() {
  setMode('view');
  await loadBranches();
}
init();




async function commitGroupSave(payload) {
  try {
    toast('Processing…', 'info');

    // 1. Save to parent table (loanapplications)
    const parentPayload = {
      application_id:     payload[COL.application_id],
      application_date:   payload[COL.app_date],
      branch_id:          payload[COL.branch_id],
      group_id:           payload[COL.group_id],
      sub_group_id:       payload[COL.sub_group_id],
      application_status: payload[COL.app_status],
    };

    await sbFetch(TABLE_APPS, {
      method: 'POST',
      body:   JSON.stringify(parentPayload),
      // Updated headers to cleanly support upserts/inserts across Supabase tables
      headers: { 'Prefer': 'resolution=merge-duplicates' }, 
      prefer: 'return=minimal'
    });

    // 2. Clear out local UI properties (prefixed with '_') before sending to loanmasterrecords
    const childPayload = { ...payload };
    Object.keys(childPayload).forEach(k => { if (k.startsWith('_')) delete childPayload[k]; });

    const responseData = await sbFetch(TABLE_LOANS, {
      method: 'POST',
      body:   JSON.stringify(childPayload),
      prefer: 'return=representation'
    });

    currentRecord = Array.isArray(responseData) ? responseData[0] : childPayload;

    // Append to UI ledger grid and reset view
    addGridRow(payload);
    setMode('view');
    toast('✔ Group loan application saved successfully.', 'success');
    showGroupSaveOkDialog(payload);

  } catch (e) {
    console.error('commitGroupSave error:', e);
    toast(`Save failed: ${e.message}`, 'error');
  }
}
