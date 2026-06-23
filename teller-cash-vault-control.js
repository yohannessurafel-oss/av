/* ═══════════════════════════════════════════════════════════
   Africa Village Microfinance — 08 Teller Cash Vault Control
   teller-cash-vault-control.js  v2.1 (Fully Connected)
   Table: tellervaultregistry
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
  const sel = document.getElementById('tellerBranchId');
  if (sel) { sel.innerHTML = '<option value="">Loading branches…</option>'; sel.disabled = true; }
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/branchregistry?select=branch_id,branch_name&order=branch_id`, { headers });
    if (!res.ok) { toast(`Branch list error ${res.status}`, 'error'); return; }
    const rows = await res.json();
    _branchCache = Array.isArray(rows) ? rows : [];
    const sel2 = document.getElementById('tellerBranchId');
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

document.getElementById('tellerBranchId')?.addEventListener('change', function () {
  const nameEl = document.getElementById('tellerBranchName');
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
    if (el.dataset.alwaysEnabled !== undefined || el.id === 'tellerBranchId') { el.disabled = false; return; }
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

/* ── Form Mapping ──────────────────────────────────────── */
const inputs = {
  branchId:       () => document.getElementById('tellerBranchId'),
  tillId:         () => document.querySelector('.input-group.width-small input'),
  cashier:        () => document.querySelectorAll('.sub-column')[1].querySelectorAll('input')[0],
  status:         () => document.querySelectorAll('.sub-column')[1].querySelectorAll('input')[1],
  cashCredits:    () => document.querySelectorAll('.sub-column')[2].querySelectorAll('input')[0],
  cashDebits:     () => document.querySelectorAll('.sub-column')[2].querySelectorAll('input')[1],
  transferCreds:  () => document.querySelectorAll('.sub-column')[2].querySelectorAll('input')[2],
  transferDebs:   () => document.querySelectorAll('.sub-column')[2].querySelectorAll('input')[3],
  entCredits:     () => document.querySelectorAll('.sub-column')[3].querySelectorAll('input')[0],
  entDebits:      () => document.querySelectorAll('.sub-column')[3].querySelectorAll('input')[1],
  entTxCredits:   () => document.querySelectorAll('.sub-column')[3].querySelectorAll('input')[2],
  entTxDebits:    () => document.querySelectorAll('.sub-column')[3].querySelectorAll('input')[3]
};

function getFormData() {
  return {
    branch_id: inputs.branchId()?.value,
    till_id: inputs.tillId()?.value,
    cashier_username: inputs.cashier()?.value,
    till_status: inputs.status()?.value || 'Closed',
    cash_credits: parseFloat(inputs.cashCredits()?.value || 0),
    cash_debits: parseFloat(inputs.cashDebits()?.value || 0),
    transfer_credits: parseFloat(inputs.transferCreds()?.value || 0),
    transfer_debits: parseFloat(inputs.transferDebs()?.value || 0),
    entries_cash_credit: parseInt(inputs.entCredits()?.value || 0),
    entries_cash_debit: parseInt(inputs.entDebits()?.value || 0),
    entries_transfer_credit: parseInt(inputs.entTxCredits()?.value || 0),
    entries_transfer_debit: parseInt(inputs.entTxDebits()?.value || 0)
  };
}

function setFormData(data) {
  if (!data) return;
  if (inputs.branchId()) {
    inputs.branchId().value = data.branch_id || '';
    inputs.branchId().dispatchEvent(new Event('change'));
  }
  if (inputs.tillId()) inputs.tillId().value = data.till_id || '1';
  if (inputs.cashier()) inputs.cashier().value = data.cashier_username || '';
  if (inputs.status()) inputs.status().value = data.till_status || 'Closed';
  if (inputs.cashCredits()) inputs.cashCredits().value = data.cash_credits || 0;
  if (inputs.cashDebits()) inputs.cashDebits().value = data.cash_debits || 0;
  if (inputs.transferCreds()) inputs.transferCreds().value = data.transfer_credits || 0;
  if (inputs.transferDebs()) inputs.transferDebs().value = data.transfer_debits || 0;
  if (inputs.entCredits()) inputs.entCredits().value = data.entries_cash_credit || 0;
  if (inputs.entDebits()) inputs.entDebits().value = data.entries_cash_debit || 0;
  if (inputs.entTxCredits()) inputs.entTxCredits().value = data.entries_transfer_credit || 0;
  if (inputs.entTxDebits()) inputs.entTxDebits().value = data.entries_transfer_debit || 0;
  
  updateBalanceGrid(data);
}

function updateBalanceGrid(data) {
  const tbody = document.querySelector('.ledger-grid tbody');
  if (!tbody) return;
  const opening = 150000.00; // Mock historical base tracking asset
  const closing = opening + (data.cash_credits || 0) - (data.cash_debits || 0);
  
  tbody.innerHTML = `
    <tr>
      <td>ETB</td>
      <td>10101-002</td>
      <td>Main Cash Vault Balance Vector</td>
      <td class="text-right">${opening.toFixed(2)}</td>
      <td class="text-right"><strong>${closing.toFixed(2)}</strong></td>
    </tr>
  `;
}

/* ── Database Routing Hooks ───────────────────────────── */
document.getElementById('btnGlobalView')?.addEventListener('click', async () => {
  const tillId = inputs.tillId()?.value;
  const branchId = inputs.branchId()?.value;
  if (!tillId || !branchId) { toast('Please specify both Branch ID and Till ID.', 'warning'); return; }
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/tellervaultregistry?till_id=eq.${tillId}&branch_id=eq.${branchId}&select=*`, { headers });
    const data = await res.json();
    if (res.ok && data.length > 0) {
      setFormData(data[0]);
      setMode('view');
      toast('Till parameters loaded into memory.');
    } else {
      toast('No active configuration discovered for this index.', 'error');
    }
  } catch (e) {
    toast('Error connecting to engine.', 'error');
  }
});

document.getElementById('btnGlobalSave')?.addEventListener('click', async () => {
  const payload = getFormData();
  if (!payload.till_id || !payload.branch_id) { toast('Till ID and Branch parameters required.', 'error'); return; }
  
  try {
    let url = `${SUPABASE_URL}/rest/v1/tellervaultregistry`;
    let method = 'POST';
    
    if (currentMode === 'edit') {
      url += `?till_id=eq.${payload.till_id}&branch_id=eq.${payload.branch_id}`;
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
      toast('Till Ledger balance models synchronized.', 'success');
      setMode('view');
    } else {
      const err = await res.json();
      toast(`Sync Failure: ${err.message || res.statusText}`, 'error');
    }
  } catch (e) {
    toast('Execution error context block.', 'error');
  }
});

/* ── Open Till Handler ─────────────────────────────────── */
document.querySelector('.action-btn-inline')?.addEventListener('click', () => {
  if (inputs.status()) {
    inputs.status().value = 'Open';
    toast('Till state transformed to: Open. Awaiting balances.', 'success');
  }
});

/* ── Standard Stubs ───────────────────────────────────── */
document.getElementById('btnGlobalAdd')?.addEventListener('click', () => { setFormData({}); setMode('add'); });
document.getElementById('btnGlobalEdit')?.addEventListener('click', () => { setMode('edit'); });
document.getElementById('btnGlobalCancel')?.addEventListener('click', () => { setMode('view'); toast('Modifications purged.'); });
document.getElementById('btnGlobalClose')?.addEventListener('click', () => { setMode('view'); toast('Ledger closed.'); });
document.getElementById('btnGlobalPrint')?.addEventListener('click', () => window.print());

async function init() {
  setMode('view');
  await loadBranches();
}
init();
