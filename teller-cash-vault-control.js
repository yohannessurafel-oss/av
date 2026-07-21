/* ═══════════════════════════════════════════════════════════
   Africa Village Microfinance — 08 Teller Cash Vault Control
   teller-cash-vault-control.js  v2.3 — TERMINOLOGY CORRECTED
   Tables: tellertillregistry, teller_transactions
═══════════════════════════════════════════════════════════ */

'use strict';

const SUPABASE_URL      = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';

const TABLE_TILL = 'tellertillregistry';
const TABLE_TX   = 'teller_transactions';

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
  const txDateEl = document.getElementById('txDate');
  if (txDateEl) txDateEl.valueAsDate = new Date();
})();

/* ── Helpers ────────────────────────────────────────────── */
function getField(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() || null : undefined;
}
function setField(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val ?? '';
}

let currentMode = 'view';
let _currentTillId = null;

/* ── Branch Dropdown ───────────────────────────────────── */
let _branchCache = [];

async function loadBranches() {
  const sel = document.getElementById('tellerBranchId');
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

document.getElementById('tellerBranchId')?.addEventListener('change', function () {
  const chosen = _branchCache.find(b => b.branch_id === this.value);
  setField('tellerBranchName', chosen?.branch_name || '');
});

/* ── Denomination Breakdown → Total Amount ──────────────── */
const DENOMS = [
  { id: 'denom1000', val: 1000 }, { id: 'denom500',  val: 500 },
  { id: 'denom200',  val: 200 },  { id: 'denom100',  val: 100 },
  { id: 'denom50',   val: 50 },   { id: 'denom10',   val: 10 },
  { id: 'denom5',    val: 5 },    { id: 'denom1',    val: 1 },
  { id: 'denomCents', val: 0.01 },
];

function computeDenominationTotal() {
  let total = 0;
  DENOMS.forEach(d => {
    const count = parseInt(document.getElementById(d.id)?.value) || 0;
    total += count * d.val;
  });
  setField('txTotalAmount', total.toFixed(2));
  return total;
}

DENOMS.forEach(d => {
  document.getElementById(d.id)?.addEventListener('input', computeDenominationTotal);
});

/* ── Till Lookup (🔍) ───────────────────────────────────── */
async function searchTill() {
  const branchId = getField('tellerBranchId');
  const tillId   = getField('tellerTillId');
  if (!branchId) { toast('Select a Branch first.', 'warning'); return; }
  if (!tillId)   { toast('Enter a Till ID to search.', 'warning'); return; }

  try {
    const rows = await sbFetch(
      `${TABLE_TILL}?till_id=eq.${encodeURIComponent(tillId)}&branch_id=eq.${encodeURIComponent(branchId)}&limit=1`
    );
    if (rows && rows[0]) {
      const till = rows[0];
      _currentTillId = till.till_id;
      setField('tellerCashierName', till.cashier_name || '');
      setField('tellerTillStatus',  till.till_status   || 'CLOSED');
      setField('tellerTillDescription', `Till ${till.till_id} — ${till.till_status || 'CLOSED'}`);
      await loadTransactions(till.till_id);
      toast(`Till ${tillId} loaded.`, 'success');
      setMode('view');
    } else {
      toast(`Till "${tillId}" not found for this branch.`, 'warning');
      _currentTillId = null;
      _lastRunningBalance = 0;
    }
  } catch (e) {
    toast('Till lookup error: ' + e.message, 'error');
  }
}

document.getElementById('btnSearchTill')?.addEventListener('click', searchTill);
document.getElementById('tellerTillId')?.addEventListener('keydown', e => { if (e.key === 'Enter') searchTill(); });

/* ── Load Transaction History + Running Balance ─────────── */
let _lastRunningBalance = 0;

async function loadTransactions(tillId) {
  const tbody = document.getElementById('transactionsTbody');
  if (!tbody) return;
  try {
    const rows = await sbFetch(
      `${TABLE_TX}?till_id=eq.${encodeURIComponent(tillId)}&order=transaction_id.desc&limit=50`
    );
    if (!rows || rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center gray-text italic">No transactions yet for this till.</td></tr>';
      _lastRunningBalance = 0;
      return;
    }
    _lastRunningBalance = parseFloat(rows[0].running_balance) || 0;
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td style="font-family:monospace;font-size:11px;">${r.transaction_id}</td>
        <td>${r.transaction_type}</td>
        <td>${r.transaction_date || ''}</td>
        <td><small class="gray-text">${r.reference_no || ''}</small></td>
        <td style="max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${r.narration || ''}</td>
        <td class="text-right">${parseFloat(r.total_amount).toLocaleString('en-ET', {minimumFractionDigits:2})}</td>
        <td class="text-right" style="font-weight:600;">${parseFloat(r.running_balance).toLocaleString('en-ET', {minimumFractionDigits:2})}</td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center gray-text italic">Error loading transactions: ${e.message}</td></tr>`;
  }
}

/* ── Open Till ──────────────────────────────────────────── */
async function openTill() {
  const branchId = getField('tellerBranchId');
  const tillId   = getField('tellerTillId');
  const cashier  = getField('tellerCashierName');
  if (!branchId || !tillId) { toast('Select Branch and enter Till ID.', 'warning'); return; }

  try {
    await sbFetch(TABLE_TILL, {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: JSON.stringify({
        till_id: tillId, branch_id: branchId,
        cashier_name: cashier || null, till_status: 'OPEN'
      })
    });

    const total = computeDenominationTotal();
    await postTransactionRow(tillId, branchId, 'OPEN', total, 'Till opened for business');

    setField('tellerTillStatus', 'OPEN');
    _currentTillId = tillId;
    toast(`Till ${tillId} opened — ETB ${total.toFixed(2)}.`, 'success');
    await loadTransactions(tillId);
  } catch (e) {
    toast('Open Till error: ' + e.message, 'error');
  }
}

/* ── Close Till ─────────────────────────────────────────── */
async function closeTill() {
  const tillId   = _currentTillId || getField('tellerTillId');
  const branchId = getField('tellerBranchId');
  if (!tillId) { toast('Load a till first.', 'warning'); return; }
  if (!confirm(`Close till ${tillId}? This will record the closing balance.`)) return;

  try {
    const total = computeDenominationTotal();
    await sbFetch(`${TABLE_TILL}?till_id=eq.${encodeURIComponent(tillId)}`, {
      method: 'PATCH', prefer: 'return=minimal',
      body: JSON.stringify({ till_status: 'CLOSED' })
    });
    await postTransactionRow(tillId, branchId, 'CLOSE', total, 'Till closed — end of day');
    setField('tellerTillStatus', 'CLOSED');
    toast(`Till ${tillId} closed — ETB ${total.toFixed(2)}.`, 'success');
    await loadTransactions(tillId);
  } catch (e) {
    toast('Close Till error: ' + e.message, 'error');
  }
}

/* ── Post Transaction (RECEIPT/PAYMENT/TRANSFER/ADJUSTMENT) ─── */
async function postTransaction() {
  const tillId   = _currentTillId || getField('tellerTillId');
  const branchId = getField('tellerBranchId');
  const txType   = getField('txType');
  if (!tillId)   { toast('Load a till first.', 'warning'); return; }
  if (!txType)   { toast('Select a Transaction Type.', 'warning'); return; }

  const total = computeDenominationTotal();
  if (total <= 0) { toast('Enter denomination counts — total must be greater than 0.', 'warning'); return; }

  const narration = getField('txNarration') || `${txType} transaction`;

  try {
    await postTransactionRow(tillId, branchId, txType, total, narration);
    toast(`${txType} posted — ETB ${total.toFixed(2)}.`, 'success');
    await loadTransactions(tillId);
    clearTransactionEntry();
  } catch (e) {
    toast('Post transaction error: ' + e.message, 'error');
  }
}

/* ── Shared insert helper — Corrected Debit/Credit logic for Cash Asset ─── */
async function postTransactionRow(tillId, branchId, txType, amount, narration) {
  // Correct Asset Accounting:
  // Payments, Transfers and Closings represent cash exiting the till (CREDITS, reducing balance).
  // Receipts and Openings represent cash entering the till (DEBITS, increasing balance).
  const isCredit = txType === 'PAYMENT' || txType === 'TRANSFER' || txType === 'CLOSE';
  const delta    = isCredit ? -Math.abs(amount) : Math.abs(amount);
  const newBalance = _lastRunningBalance + delta;

  const refNo = getField('txRefNo') || `TX-${Date.now().toString(36).toUpperCase()}`;
  const createdBy = getField('txCreatedBy') || null;
  const txDate = getField('txDate') || new Date().toISOString().slice(0,10);

  const payload = {
    till_id: tillId,
    branch_id: branchId,
    transaction_type: txType,
    transaction_date: txDate,
    reference_no: refNo,
    narration,
    total_amount: amount,
    running_balance: newBalance,
    created_by: createdBy,
  };

  payload.denom_1000 = parseInt(document.getElementById('denom1000')?.value) || 0;
  payload.denom_500  = parseInt(document.getElementById('denom500')?.value)  || 0;
  payload.denom_200  = parseInt(document.getElementById('denom200')?.value)  || 0;
  payload.denom_100  = parseInt(document.getElementById('denom100')?.value)  || 0;
  payload.denom_50   = parseInt(document.getElementById('denom50')?.value)   || 0;
  payload.denom_10   = parseInt(document.getElementById('denom10')?.value)   || 0;
  payload.denom_5    = parseInt(document.getElementById('denom5')?.value)    || 0;
  payload.denom_1    = parseInt(document.getElementById('denom1')?.value)    || 0;
  payload.denom_cents = parseInt(document.getElementById('denomCents')?.value) || 0;

  await sbFetch(TABLE_TX, { method: 'POST', prefer: 'return=minimal', body: JSON.stringify(payload) });
  _lastRunningBalance = newBalance;
}

function clearTransactionEntry() {
  DENOMS.forEach(d => setField(d.id, '0'));
  setField('txTotalAmount', '0.00');
  setField('txRefNo', '');
  setField('txNarration', '');
  document.getElementById('txType').value = '';
}

document.getElementById('btnOpenTill')?.addEventListener('click', openTill);
document.getElementById('btnCloseTill')?.addEventListener('click', closeTill);
document.getElementById('btnPostTx')?.addEventListener('click', postTransaction);

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
  document.getElementById('btnGlobalEdit').disabled   = isEdit || !_currentTillId;
  document.getElementById('btnGlobalDelete').disabled = !_currentTillId;
  document.getElementById('btnGlobalClose').disabled  = isEdit;
  const sb = document.getElementById('statusBar');
  if (sb) sb.textContent = `Mode: ${mode.charAt(0).toUpperCase() + mode.slice(1)} — Ready`;
}

/* ── Toolbar Buttons ────────────────────────────────────── */
document.getElementById('btnGlobalView')?.addEventListener('click', searchTill);
document.getElementById('btnGlobalAdd')?.addEventListener('click', () => {
  setField('tellerTillId', '');
  setField('tellerCashierName', '');
  setField('tellerTillStatus', 'CLOSED');
  setField('tellerTillDescription', '');
  document.getElementById('transactionsTbody').innerHTML =
    '<tr><td colspan="7" class="text-center gray-text italic">Load a till to view transactions.</td></tr>';
  _currentTillId = null;
  _lastRunningBalance = 0; // reset — otherwise a new till's opening balance is calculated against whatever till was last viewed
  setMode('add');
  toast('Add mode — enter new Till ID, then Open Till.');
});
document.getElementById('btnGlobalEdit')?.addEventListener('click', () => {
  setMode('edit'); toast('Edit mode — update cashier or post a transaction.');
});
document.getElementById('btnGlobalSave')?.addEventListener('click', async () => {
  const tillId = _currentTillId || getField('tellerTillId');
  const branchId = getField('tellerBranchId');
  const cashier = getField('tellerCashierName');
  if (!tillId || !branchId) { toast('Branch and Till ID required.', 'warning'); return; }
  try {
    await sbFetch(TABLE_TILL, {
      method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
      body: JSON.stringify({ till_id: tillId, branch_id: branchId, cashier_name: cashier || null })
    });
    toast(`Till ${tillId} details saved.`, 'success');
    setMode('view');
  } catch (e) {
    toast('Save error: ' + e.message, 'error');
  }
});
document.getElementById('btnGlobalCancel')?.addEventListener('click', () => {
  setMode('view'); toast('Changes discarded.');
});
document.getElementById('btnGlobalClose')?.addEventListener('click', () => {
  setMode('view'); toast('Closed.');
});
document.getElementById('btnGlobalDelete')?.addEventListener('click', async () => {
  if (!_currentTillId) { toast('Load a till first.', 'warning'); return; }
  if (!confirm(`Remove till ${_currentTillId} from registry? Transaction history is kept.`)) return;
  try {
    await sbFetch(`${TABLE_TILL}?till_id=eq.${encodeURIComponent(_currentTillId)}`, {
      method: 'DELETE', prefer: 'return=minimal'
    });
    toast(`Till ${_currentTillId} removed.`, 'success');
    _currentTillId = null;
    setMode('view');
  } catch (e) {
    toast('Delete error: ' + e.message, 'error');
  }
});
document.getElementById('btnGlobalPrint')?.addEventListener('click', () => window.print());

/* ── Init ──────────────────────────────────────────────── */
async function init() {
  setMode('view');
  computeDenominationTotal();
  await loadBranches();
}
init();

// ── Window Controls: Minimize / Maximize ────────────────────
const windowContainer = document.querySelector('.window-container');
const wcMinimizeBtn    = document.getElementById('wcMinimize');
const wcMaximizeBtn    = document.getElementById('wcMaximize');
const dockSliver        = document.getElementById('dockSliver');

function toggleMinimize() {
  if (!windowContainer || !dockSliver) return;
  // Maximize and minimize are mutually exclusive
  windowContainer.classList.remove('is-maximized');
  if (wcMaximizeBtn) wcMaximizeBtn.textContent = '▢';

  windowContainer.classList.toggle('is-minimized');
  const minimized = windowContainer.classList.contains('is-minimized');
  dockSliver.classList.toggle('show', minimized);
  if (wcMinimizeBtn) wcMinimizeBtn.title = minimized ? 'Restore' : 'Minimize';
}

function toggleMaximize() {
  if (!windowContainer) return;
  // Maximize and minimize are mutually exclusive
  if (windowContainer.classList.contains('is-minimized')) {
    windowContainer.classList.remove('is-minimized');
    if (dockSliver) dockSliver.classList.remove('show');
    if (wcMinimizeBtn) wcMinimizeBtn.title = 'Minimize';
  }
  windowContainer.classList.toggle('is-maximized');
  const maximized = windowContainer.classList.contains('is-maximized');
  if (wcMaximizeBtn) {
    wcMaximizeBtn.textContent = maximized ? '❐' : '▢';
    wcMaximizeBtn.title = maximized ? 'Restore Down' : 'Maximize';
  }
}
