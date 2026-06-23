/* ═══════════════════════════════════════════════════════════
   Africa Village Microfinance — Loan Appraisal Management
   03-loan-appraisal-management.js  v2.1 (Fully Connected)
═══════════════════════════════════════════════════════════ */

'use strict';

const SUPABASE_URL      = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';

const headers = {
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
  'Accept': 'application/json'
};

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
  const sel = document.getElementById('apprBranchId');
  if (sel) { sel.innerHTML = '<option value="">Loading branches…</option>'; sel.disabled = true; }
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/branchregistry?select=branch_id,branch_name&order=branch_id`, { headers });
    if (!res.ok) { toast(`Branch list error ${res.status}`, 'error'); return; }
    const rows = await res.json();
    _branchCache = Array.isArray(rows) ? rows : [];
    const sel2 = document.getElementById('apprBranchId');
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
  }
}

document.getElementById('apprBranchId')?.addEventListener('change', function () {
  const nameEl = document.getElementById('apprBranchName');
  const chosen = _branchCache.find(b => b.branch_id === this.value);
  if (nameEl) nameEl.value = chosen ? (chosen.branch_name || '') : '';
});

/* ── Mode Control ──────────────────────────────────────── */
let currentMode = 'view';

function setMode(mode) {
  currentMode = mode;
  const isEdit = mode === 'edit' || mode === 'add';
  const view = document.querySelector('.module-view.active') || document.body;
  
  view.querySelectorAll('input:not([readonly]), select, textarea').forEach(el => {
    if (el.dataset.alwaysEnabled !== undefined || el.id === 'apprBranchId') { el.disabled = false; return; }
    el.disabled = !isEdit;
  });

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

/* ── UI Form Helper Mapping (Maps fields to public.loanmasterrecords columns) ── */
function getFormData() {
  return {
    application_id: document.getElementById('apprApplicationId')?.value,
    branch_id: document.getElementById('apprBranchId')?.value,
    client_id: document.getElementById('apprClientId')?.value,
    client_name: document.getElementById('apprClientName')?.value,
    product_id: document.getElementById('apprProductId')?.value,
    main_repayment_account_id: document.getElementById('apprRepayAccountId')?.value || 'NOT_ASSIGNED',
    applied_amount: parseFloat(document.getElementById('apprAppliedAmount')?.value || 0),
    recommended_amount: parseFloat(document.getElementById('apprRecommendedAmount')?.value || 0),
    approved_amount: parseFloat(document.getElementById('apprApprovedAmount')?.value || 0),
    term_months: parseInt(document.getElementById('apprTermMonths')?.value || 12),
    interest_rate: parseFloat(document.getElementById('apprInterestRate')?.value || 0),
    application_status: document.getElementById('apprStatus')?.value || 'DataEntry'
  };
}

function setFormData(data) {
  if (!data) return;
  if (document.getElementById('apprApplicationId')) document.getElementById('apprApplicationId').value = data.application_id || '';
  if (document.getElementById('apprBranchId')) {
    document.getElementById('apprBranchId').value = data.branch_id || '';
    document.getElementById('apprBranchId').dispatchEvent(new Event('change'));
  }
  if (document.getElementById('apprClientId')) document.getElementById('apprClientId').value = data.client_id || '';
  if (document.getElementById('apprClientName')) document.getElementById('apprClientName').value = data.client_name || '';
  if (document.getElementById('apprProductId')) document.getElementById('apprProductId').value = data.product_id || '';
  if (document.getElementById('apprAppliedAmount')) document.getElementById('apprAppliedAmount').value = data.applied_amount || 0;
  if (document.getElementById('apprRecommendedAmount')) document.getElementById('apprRecommendedAmount').value = data.recommended_amount || 0;
  if (document.getElementById('apprApprovedAmount')) document.getElementById('apprApprovedAmount').value = data.approved_amount || 0;
  if (document.getElementById('apprTermMonths')) document.getElementById('apprTermMonths').value = data.term_months || 12;
  if (document.getElementById('apprInterestRate')) document.getElementById('apprInterestRate').value = data.interest_rate || 0;
  if (document.getElementById('apprStatus')) document.getElementById('apprStatus').value = data.application_status || 'DataEntry';
}

/* ── Database Engine Hooks ────────────────────────────── */
document.getElementById('btnGlobalView')?.addEventListener('click', async () => {
  const appId = document.getElementById('apprApplicationId')?.value;
  if (!appId) { toast('Please enter an Application ID to fetch.', 'warning'); return; }
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/loanmasterrecords?application_id=eq.${appId}&select=*`, { headers });
    const data = await res.json();
    if (res.ok && data.length > 0) {
      setFormData(data[0]);
      setMode('view');
      toast('Record loaded successfully.');
    } else {
      toast('Record not found.', 'error');
    }
  } catch (e) {
    toast('Error fetching record.', 'error');
  }
});

document.getElementById('btnGlobalSave')?.addEventListener('click', async () => {
  const payload = getFormData();
  if (!payload.application_id) { toast('Application ID is required.', 'error'); return; }
  
  try {
    let url = `${SUPABASE_URL}/rest/v1/loanmasterrecords`;
    let method = 'POST';
    
    if (currentMode === 'edit') {
      url += `?application_id=eq.${payload.application_id}`;
      method = 'PATCH';
    } else {
      // For POST headers, make it act as a upsert if it already exists
      headers['Prefer'] = 'resolution=merge-duplicates';
    }

    const res = await fetch(url, {
      method: method,
      headers: headers,
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      toast('Application Appraisal saved successfully!', 'success');
      setMode('view');
    } else {
      const err = await res.json();
      toast(`Save Failed: ${err.message || res.statusText}`, 'error');
    }
  } catch (e) {
    toast('Network error during save execution.', 'error');
  }
});

document.getElementById('btnGlobalDelete')?.addEventListener('click', async () => {
  const appId = document.getElementById('apprApplicationId')?.value;
  if (!appId || !confirm('Are you sure you want to completely remove this appraisal profile?')) return;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/loanmasterrecords?application_id=eq.${appId}`, {
      method: 'DELETE',
      headers: headers
    });
    if (res.ok) {
      toast('Record dropped successfully.');
      setFormData({});
      setMode('view');
    } else {
      toast('Delete failed.', 'error');
    }
  } catch (e) {
    toast('Delete error.', 'error');
  }
});

/* ── Standard Control Handlers ─────────────────────────── */
document.getElementById('btnGlobalAdd')?.addEventListener('click', () => { setFormData({}); setMode('add'); });
document.getElementById('btnGlobalEdit')?.addEventListener('click', () => { setMode('edit'); });
document.getElementById('btnGlobalCancel')?.addEventListener('click', () => { setMode('view'); toast('Changes discarded.'); });
document.getElementById('btnGlobalClose')?.addEventListener('click', () => { setMode('view'); toast('Record closed.'); });
document.getElementById('btnGlobalPrint')?.addEventListener('click', () => window.print());

async function init() {
  setMode('view');
  await loadBranches();
}
init();
