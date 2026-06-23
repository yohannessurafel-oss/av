/* ═══════════════════════════════════════════════════════════
   Africa Village Microfinance — Loan Account Maintenance
   05-loan-account-maintenance.js  v2.1 (Fully Connected)
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
  const sel = document.getElementById('maintBranchId');
  if (sel) { sel.innerHTML = '<option value="">Loading branches…</option>'; sel.disabled = true; }
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/branchregistry?select=branch_id,branch_name&order=branch_id`, { headers });
    if (!res.ok) { toast(`Branch list error ${res.status}`, 'error'); return; }
    const rows = await res.json();
    _branchCache = Array.isArray(rows) ? rows : [];
    const sel2 = document.getElementById('maintBranchId');
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

document.getElementById('maintBranchId')?.addEventListener('change', function () {
  const nameEl = document.getElementById('maintBranchName');
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
    if (el.dataset.alwaysEnabled !== undefined || el.id === 'maintBranchId') { el.disabled = false; return; }
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

/* ── UI Form Helper Mapping (Maps fields to public.loandetails columns) ── */
function getMaintFormData() {
  return {
    application_id: document.getElementById('maintApplicationId')?.value,
    client_id: document.getElementById('maintClientId')?.value,
    client_branch_id: document.getElementById('maintBranchId')?.value,
    product_id: document.getElementById('maintProductId')?.value,
    loan_amount: parseFloat(document.getElementById('maintLoanAmount')?.value || 0),
    term_months: parseInt(document.getElementById('maintTermMonths')?.value || 12),
    interest_rate: parseFloat(document.getElementById('maintInterestRate')?.value || 0),
    main_repayment_account_id: document.getElementById('maintRepayAccountId')?.value || null,
    loan_purpose: document.getElementById('maintPurpose')?.value || 'OTHER'
  };
}

function setMaintFormData(data) {
  if (!data) return;
  if (document.getElementById('maintApplicationId')) document.getElementById('maintApplicationId').value = data.application_id || '';
  if (document.getElementById('maintClientId')) document.getElementById('maintClientId').value = data.client_id || '';
  if (document.getElementById('maintBranchId')) {
    document.getElementById('maintBranchId').value = data.client_branch_id || '';
    document.getElementById('maintBranchId').dispatchEvent(new Event('change'));
  }
  if (document.getElementById('maintProductId')) document.getElementById('maintProductId').value = data.product_id || '';
  if (document.getElementById('maintLoanAmount')) document.getElementById('maintLoanAmount').value = data.loan_amount || 0;
  if (document.getElementById('maintTermMonths')) document.getElementById('maintTermMonths').value = data.term_months || 12;
  if (document.getElementById('maintInterestRate')) document.getElementById('maintInterestRate').value = data.interest_rate || 0;
  if (document.getElementById('maintRepayAccountId')) document.getElementById('maintRepayAccountId').value = data.main_repayment_account_id || '';
  if (document.getElementById('maintPurpose')) document.getElementById('maintPurpose').value = data.loan_purpose || 'OTHER';
}

/* ── Database Engine Hooks ────────────────────────────── */
document.getElementById('btnGlobalView')?.addEventListener('click', async () => {
  const appId = document.getElementById('maintApplicationId')?.value;
  if (!appId) { toast('Please specify an Application ID.', 'warning'); return; }
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/loandetails?application_id=eq.${appId}&select=*`, { headers });
    const data = await res.json();
    if (res.ok && data.length > 0) {
      setMaintFormData(data[0]);
      setMode('view');
      toast('Loan account maintenance file loaded.');
    } else {
      toast('Loan profile records not found.', 'error');
    }
  } catch (e) {
    toast('Error retrieving maintenance file.', 'error');
  }
});

document.getElementById('btnGlobalSave')?.addEventListener('click', async () => {
  const payload = getMaintFormData();
  if (!payload.application_id || !payload.client_id || !payload.product_id) {
    toast('Application ID, Client ID, and Product ID are required.', 'error');
    return;
  }
  
  try {
    let url = `${SUPABASE_URL}/rest/v1/loandetails`;
    let method = 'POST';
    
    if (currentMode === 'edit') {
      url += `?application_id=eq.${payload.application_id}`;
      method = 'PATCH';
    } else {
      headers['Prefer'] = 'resolution=merge-duplicates';
    }

    const res = await fetch(url, {
      method: method,
      headers: headers,
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      toast('Loan Account Parameters updated successfully.', 'success');
      setMode('view');
    } else {
      const err = await res.json();
      toast(`Failed modification setup: ${err.message || res.statusText}`, 'error');
    }
  } catch (e) {
    toast('Network synchronization failure.', 'error');
  }
});

document.getElementById('btnGlobalDelete')?.addEventListener('click', async () => {
  const appId = document.getElementById('maintApplicationId')?.value;
  if (!appId || !confirm('Purge this record completely?')) return;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/loandetails?application_id=eq.${appId}`, {
      method: 'DELETE',
      headers: headers
    });
    if (res.ok) {
      toast('Record dropped.');
      setMaintFormData({});
      setMode('view');
    } else {
      toast('Error dropping file records.', 'error');
    }
  } catch (e) {
    toast('Execution crash.', 'error');
  }
});

/* ── Standard Control Handlers ─────────────────────────── */
document.getElementById('btnGlobalAdd')?.addEventListener('click', () => { setMaintFormData({}); setMode('add'); });
document.getElementById('btnGlobalEdit')?.addEventListener('click', () => { setMode('edit'); });
document.getElementById('btnGlobalCancel')?.addEventListener('click', () => { setMode('view'); toast('Changes discarded.'); });
document.getElementById('btnGlobalClose')?.addEventListener('click', () => { setMode('view'); toast('Record closed.'); });
document.getElementById('btnGlobalPrint')?.addEventListener('click', () => window.print());

async function init() {
  setMode('view');
  await loadBranches();
}
init();
