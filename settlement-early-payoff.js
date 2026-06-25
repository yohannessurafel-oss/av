/* ═══════════════════════════════════════════════════════════
   Africa Village Microfinance — 08 Teller Cash Vault Control
   teller-cash-vault-control.js  v3.0
   
   Tables used (actual schema):
     tellertillregistry   — till master record
       PK: till_id
       cols: branch_id, cashier_name, till_status (default 'CLOSED')

     teller_transactions  — individual transaction rows
       PK: transaction_id (auto)
       cols: till_id (FK), branch_id (FK), transaction_type CHECK
             (OPEN|CLOSE|RECEIPT|PAYMENT|TRANSFER|ADJUSTMENT),
             transaction_date, transaction_time, reference_no,
             denom_1000…denom_cents, total_amount, running_balance,
             narration, created_by

   Workflow:
     1. Select Branch + enter Till ID → 🔍  loads till master
        + recent transactions into the grid
     2. Add → creates a new till in tellertillregistry
     3. Edit → updates cashier_name on existing till
     4. Save → persists till master (Add/Edit)
     5. "Open Till" inline btn → posts OPEN transaction
     6. "Close Till" inline btn → posts CLOSE transaction
     7. "Post Transaction" inline btn → posts any other tx type
        with full denomination breakdown → total auto-calculated
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
function toast(msg, type = '', duration = 3500) {
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
  // Also set today as default transaction date
  const txDateEl = document.getElementById('txDate');
  if (txDateEl) txDateEl.value = new Date().toISOString().split('T')[0];
})();

/* ── Branch Dropdown ───────────────────────────────────── */
let _branchCache = [];

async function loadBranches() {
  const sel = document.getElementById('tellerBranchId');
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

document.getElementById('tellerBranchId')?.addEventListener('change', function () {
  const nameEl = document.getElementById('tellerBranchName');
  const chosen = _branchCache.find(b => b.branch_id === this.value);
  if (nameEl) nameEl.value = chosen ? (chosen.branch_name || '') : '';
});

/* ── Denomination Auto-Calc ─────────────────────────────── */
const DENOM_IDS = [
  { id: 'denom1000', value: 1000 },
  { id: 'denom500',  value: 500  },
  { id: 'denom200',  value: 200  },
  { id: 'denom100',  value: 100  },
  { id: 'denom50',   value: 50   },
  { id: 'denom10',   value: 10   },
  { id: 'denom5',    value: 5    },
  { id: 'denom1',    value: 1    },
  { id: 'denomCents',value: 0.01 },
];

function recalcTotal() {
  const total = DENOM_IDS.reduce((sum, d) => {
    const qty = parseInt(document.getElementById(d.id)?.value || 0) || 0;
    return sum + (qty * d.value);
  }, 0);
  const el = document.getElementById('txTotalAmount');
  if (el) el.value = total.toFixed(2);
}

DENOM_IDS.forEach(d => {
  document.getElementById(d.id)?.addEventListener('input', recalcTotal);
});

function getDenomPayload() {
  return {
    denom_1000: parseInt(document.getElementById('denom1000')?.value || 0) || 0,
    denom_500:  parseInt(document.getElementById('denom500')?.value  || 0) || 0,
    denom_200:  parseInt(document.getElementById('denom200')?.value  || 0) || 0,
    denom_100:  parseInt(document.getElementById('denom100')?.value  || 0) || 0,
    denom_50:   parseInt(document.getElementById('denom50')?.value   || 0) || 0,
    denom_10:   parseInt(document.getElementById('denom10')?.value   || 0) || 0,
    denom_5:    parseInt(document.getElementById('denom5')?.value    || 0) || 0,
    denom_1:    parseInt(document.getElementById('denom1')?.value    || 0) || 0,
    denom_cents:parseInt(document.getElementById('denomCents')?.value|| 0) || 0,
  };
}

function clearDenomFields() {
  DENOM_IDS.forEach(d => { const el = document.getElementById(d.id); if (el) el.value = 0; });
  const t = document.getElementById('txTotalAmount'); if (t) t.value = '';
}

/* ── Track loaded till ──────────────────────────────────── */
let _loadedTillId  = null;
let _runningBalance = 0;

/* ── Load Till + Transactions ───────────────────────────── */
async function loadTill() {
  const tillId   = document.getElementById('tellerTillId')?.value?.trim();
  const branchId = document.getElementById('tellerBranchId')?.value?.trim();
  if (!tillId)   { toast('Enter a Till ID to search.', 'warning'); return; }
  if (!branchId) { toast('Select a Branch first.', 'warning'); return; }

  const sb = document.getElementById('statusBar');
  if (sb) sb.textContent = `Loading till ${tillId}…`;

  try {
    // 1. Load till master
    const tillRows = await sbFetch(
      `tellertillregistry?till_id=eq.${encodeURIComponent(tillId)}&branch_id=eq.${encodeURIComponent(branchId)}&select=*&limit=1`
    );

    if (!tillRows || tillRows.length === 0) {
      toast(`Till ${tillId} not found for this branch.`, 'warning');
      if (sb) sb.textContent = 'Status: Not found';
      return;
    }

    const till = tillRows[0];
    _loadedTillId = till.till_id;

    document.getElementById('tellerCashierName').value = till.cashier_name || '';
    document.getElementById('tellerTillStatus').value  = till.till_status  || 'CLOSED';
    document.getElementById('tellerTillDescription').value = till.till_id;

    // 2. Load recent transactions (last 50)
    const txRows = await sbFetch(
      `teller_transactions?till_id=eq.${encodeURIComponent(tillId)}&branch_id=eq.${encodeURIComponent(branchId)}&select=*&order=transaction_id.desc&limit=50`
    );

    renderTransactions(Array.isArray(txRows) ? txRows : []);

    // Running balance = latest row's running_balance
    if (txRows && txRows.length > 0) {
      _runningBalance = parseFloat(txRows[0].running_balance || 0);
    } else {
      _runningBalance = 0;
    }

    toast(`Till ${tillId} loaded. Balance: ETB ${_runningBalance.toFixed(2)}`);
    if (sb) sb.textContent = `Till ${tillId} | Status: ${till.till_status} | Balance: ETB ${_runningBalance.toFixed(2)}`;

    // Enable Edit since we loaded a record
    const btnEdit = document.getElementById('btnGlobalEdit');
    if (btnEdit) btnEdit.disabled = false;

    setMode('view');
  } catch (e) {
    toast('Load error: ' + e.message, 'error');
    if (sb) sb.textContent = 'Load failed.';
  }
}

/* ── Render Transactions Grid ───────────────────────────── */
function renderTransactions(rows) {
  const tbody = document.getElementById('transactionsTbody');
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center gray-text italic">No transactions for this till.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${r.transaction_id}</td>
      <td><span style="font-weight:600;">${r.transaction_type}</span></td>
      <td>${r.transaction_date || ''}</td>
      <td>${r.reference_no || ''}</td>
      <td>${r.narration || ''}</td>
      <td class="text-right">${parseFloat(r.total_amount || 0).toFixed(2)}</td>
      <td class="text-right"><strong>${parseFloat(r.running_balance || 0).toFixed(2)}</strong></td>
    </tr>
  `).join('');
}

/* ── Post a Transaction ─────────────────────────────────── */
async function postTransaction(forcedType) {
  if (!_loadedTillId) { toast('Load a till first.', 'warning'); return; }

  const txType = forcedType || document.getElementById('txType')?.value;
  if (!txType) { toast('Select a Transaction Type.', 'warning'); return; }

  const branchId = document.getElementById('tellerBranchId')?.value?.trim();
  const total    = parseFloat(document.getElementById('txTotalAmount')?.value || 0);
  const txDate   = document.getElementById('txDate')?.value || new Date().toISOString().split('T')[0];

  // Running balance: RECEIPT/OPEN/ADJUSTMENT add; PAYMENT/CLOSE/TRANSFER subtract
  const isCredit = ['OPEN','RECEIPT','ADJUSTMENT'].includes(txType);
  const newBalance = _runningBalance + (isCredit ? total : -total);

  const payload = {
    till_id:          _loadedTillId,
    branch_id:        branchId || null,
    transaction_type: txType,
    transaction_date: txDate,
    transaction_time: new Date().toISOString(),
    reference_no:     document.getElementById('txRefNo')?.value?.trim()     || null,
    narration:        document.getElementById('txNarration')?.value?.trim()  || null,
    created_by:       document.getElementById('txCreatedBy')?.value?.trim()  || null,
    total_amount:     total,
    running_balance:  newBalance,
    ...getDenomPayload()
  };

  const sb = document.getElementById('statusBar');
  if (sb) sb.textContent = `Posting ${txType}…`;

  try {
    await sbFetch('teller_transactions', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify(payload)
    });

    // If OPEN or CLOSE — also update till status in master
    if (txType === 'OPEN' || txType === 'CLOSE') {
      const newStatus = txType === 'OPEN' ? 'OPEN' : 'CLOSED';
      await sbFetch(`tellertillregistry?till_id=eq.${encodeURIComponent(_loadedTillId)}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: JSON.stringify({ till_status: newStatus })
      });
      document.getElementById('tellerTillStatus').value = newStatus;
    }

    _runningBalance = newBalance;
    toast(`${txType} posted. New balance: ETB ${newBalance.toFixed(2)}`, 'success');
    if (sb) sb.textContent = `Till ${_loadedTillId} | Balance: ETB ${newBalance.toFixed(2)}`;

    // Clear transaction entry fields
    clearDenomFields();
    ['txRefNo','txNarration','txCreatedBy'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    const txTypeEl = document.getElementById('txType');
    if (txTypeEl) txTypeEl.value = '';

    // Refresh the grid
    await loadTill();
  } catch (e) {
    toast('Post error: ' + e.message, 'error');
    if (sb) sb.textContent = 'Post failed — see toast.';
  }
}

/* ── Save Till Master (Add / Edit) ──────────────────────── */
async function saveTill() {
  const tillId   = document.getElementById('tellerTillId')?.value?.trim();
  const branchId = document.getElementById('tellerBranchId')?.value?.trim();
  if (!tillId)   { toast('Till ID is required.', 'warning'); return; }
  if (!branchId) { toast('Branch is required.', 'warning'); return; }

  const payload = {
    till_id:      tillId,
    branch_id:    branchId,
    cashier_name: document.getElementById('tellerCashierName')?.value?.trim() || null,
    till_status:  currentMode === 'add' ? 'CLOSED' : undefined,
  };
  if (payload.till_status === undefined) delete payload.till_status;

  const sb = document.getElementById('statusBar');
  if (sb) sb.textContent = 'Saving till…';

  try {
    if (currentMode === 'add') {
      await sbFetch('tellertillregistry', {
        method: 'POST',
        prefer: 'return=minimal',
        body: JSON.stringify(payload)
      });
      toast(`Till ${tillId} created.`, 'success');
      _loadedTillId = tillId;
    } else {
      const { till_id, ...updateFields } = payload;
      await sbFetch(`tellertillregistry?till_id=eq.${encodeURIComponent(tillId)}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: JSON.stringify(updateFields)
      });
      toast(`Till ${tillId} updated.`, 'success');
    }
    setMode('view');
    await loadTill();
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
      if (el.dataset.alwaysEnabled !== undefined) { el.disabled = false; return; }
      if (el.hasAttribute('readonly'))            { el.disabled = false; return; }
      el.disabled = !isEdit;
    });
  }

  // These are always enabled regardless of mode
  ['tellerTillId','txType','txDate','txRefNo','txNarration','txCreatedBy',
   ...DENOM_IDS.map(d => d.id)].forEach(id => {
    const el = document.getElementById(id); if (el) el.disabled = false;
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
  if (btnEdit)   btnEdit.disabled   = isEdit || !_loadedTillId;
  if (btnDelete) btnDelete.disabled = true;
  if (btnClose)  btnClose.disabled  = isEdit;

  const sb = document.getElementById('statusBar');
  if (sb && mode !== 'view') {
    sb.textContent = `Mode: ${mode.charAt(0).toUpperCase() + mode.slice(1)} — Ready`;
  }
}

/* ── Toolbar ─────────────────────────────────────────────── */
document.getElementById('btnGlobalView')?.addEventListener('click', loadTill);
document.getElementById('btnSearchTill')?.addEventListener('click', loadTill);

document.getElementById('btnGlobalAdd')?.addEventListener('click', () => {
  _loadedTillId = null;
  _runningBalance = 0;
  ['tellerTillId','tellerCashierName','tellerTillStatus','tellerTillDescription'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('transactionsTbody').innerHTML =
    '<tr><td colspan="7" class="text-center gray-text italic">New till — save to create.</td></tr>';
  setMode('add');
  toast('Add mode — enter Till ID, select branch, set cashier then Save.');
});

document.getElementById('btnGlobalEdit')?.addEventListener('click', () => {
  if (!_loadedTillId) { toast('Load a till first.', 'warning'); return; }
  setMode('edit');
  toast('Edit mode — update cashier name then Save.');
});

document.getElementById('btnGlobalSave')?.addEventListener('click', saveTill);

document.getElementById('btnGlobalCancel')?.addEventListener('click', () => {
  if (_loadedTillId) loadTill();
  else setMode('view');
  toast('Changes discarded.');
});

document.getElementById('btnGlobalClose')?.addEventListener('click', () => {
  _loadedTillId = null;
  _runningBalance = 0;
  document.querySelectorAll('#view-module-08 input:not([data-always-enabled]), #view-module-08 select, #view-module-08 textarea')
    .forEach(el => { el.value = ''; });
  document.getElementById('transactionsTbody').innerHTML =
    '<tr><td colspan="7" class="text-center gray-text italic">Load a till to view transactions.</td></tr>';
  setMode('view');
  toast('Till closed.');
});

document.getElementById('btnGlobalPrint')?.addEventListener('click', () => window.print());

document.getElementById('btnGlobalDelete')?.addEventListener('click', () => {
  toast('Tills cannot be deleted — use Close.', 'warning');
});

/* ── Inline Action Buttons ────────────────────────────────── */
document.getElementById('btnOpenTill')?.addEventListener('click', () => {
  if (!_loadedTillId) { toast('Load a till first.', 'warning'); return; }
  const status = document.getElementById('tellerTillStatus')?.value;
  if (status === 'OPEN') { toast('Till is already open.', 'warning'); return; }
  document.getElementById('txType').value = 'OPEN';
  recalcTotal();
  postTransaction('OPEN');
});

document.getElementById('btnCloseTill')?.addEventListener('click', () => {
  if (!_loadedTillId) { toast('Load a till first.', 'warning'); return; }
  const status = document.getElementById('tellerTillStatus')?.value;
  if (status === 'CLOSED') { toast('Till is already closed.', 'warning'); return; }
  document.getElementById('txType').value = 'CLOSE';
  recalcTotal();
  postTransaction('CLOSE');
});

document.getElementById('btnPostTx')?.addEventListener('click', () => {
  postTransaction();
});

/* ── Init ───────────────────────────────────────────────── */
async function init() {
  setMode('view');
  await loadBranches();
}
init();
