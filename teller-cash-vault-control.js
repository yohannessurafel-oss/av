/* ═══════════════════════════════════════════════════════════
   Africa Village Microfinance — 08 Teller Cash Vault Control
   teller-cash-vault-control.js  v1.0 — FIRST REAL IMPLEMENTATION

   This file did not exist before. What was deployed under this
   filename was actually a SQL migration script (ALTER TABLE /
   CREATE TRIGGER statements) — the browser hit `--` on line one,
   threw a JavaScript syntax error immediately, and the entire page
   was dead: no branch dropdown, no till search, no buttons worked,
   nothing. The real migration content now lives in
   teller_balance_guard_migration.sql instead.

   Design, matched to the real schema:
     tellertillregistry(branch_id, till_id PK, cashier_name, till_status)
     teller_transactions(transaction_id, till_id, branch_id,
       transaction_type, transaction_date, reference_no,
       denom_1000..denom_1, denom_cents, total_amount,
       running_balance, narration, created_by, created_on)

   running_balance is NOT computed here — it's computed server-side
   by the trg_compute_teller_running_balance trigger (see the .sql
   migration), so this file never sends a running_balance value on
   INSERT; the DB works out the latest balance for that till and
   applies OPEN/RECEIPT as a debit, PAYMENT/TRANSFER/CLOSE as a
   credit, ADJUSTMENT as user-signed. That's also why every post
   here re-fetches the transaction list afterward rather than trying
   to compute the new balance client-side — the trigger is the
   single source of truth for that number.

   Note: the HTML has a tellerTillDescription display field, but
   tellertillregistry has no description column — there's nothing to
   populate it from, so it's left as a manual, non-persisted note.
═══════════════════════════════════════════════════════════ */

'use strict';

const SUPABASE_URL = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';

async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: opts.prefer || 'return=representation',
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
  const dateEl = document.getElementById('txDate');
  if (dateEl) dateEl.value = new Date().toISOString().slice(0, 10);
})();

const fmt = n => parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ── State ──────────────────────────────────────────────── */
let _currentTill = null; // { branch_id, till_id, cashier_name, till_status }

/* ── Branch Dropdown ───────────────────────────────────── */
let _branchCache = [];

async function loadBranches() {
  const sel = document.getElementById('tellerBranchId');
  if (sel) { sel.innerHTML = '<option value="">Loading branches…</option>'; sel.disabled = true; }
  try {
    const rows = await sbFetch('branchregistry?select=branch_id,branch_name&order=branch_id');
    _branchCache = Array.isArray(rows) ? rows : [];
    const sel2 = document.getElementById('tellerBranchId');
    if (!sel2) return;
    sel2.innerHTML = '<option value="">-- Select Branch --</option>' +
      _branchCache.map(r => `<option value="${r.branch_id}">${r.branch_id}${r.branch_name ? ' — ' + r.branch_name : ''}</option>`).join('');
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

/* ── Denomination auto-total ────────────────────────────── */
const DENOM_VALUES = { denom1000: 1000, denom500: 500, denom200: 200, denom100: 100, denom50: 50, denom10: 10, denom5: 5, denom1: 1 };

function recalcDenomTotal() {
  let total = 0;
  for (const [id, value] of Object.entries(DENOM_VALUES)) {
    const count = parseInt(document.getElementById(id)?.value) || 0;
    total += count * value;
  }
  const cents = parseInt(document.getElementById('denomCents')?.value) || 0;
  total += cents * 0.01;
  const totalEl = document.getElementById('txTotalAmount');
  if (totalEl) totalEl.value = total.toFixed(2);
  return total;
}

['denom1000','denom500','denom200','denom100','denom50','denom10','denom5','denom1','denomCents'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', recalcDenomTotal);
});

function getDenomBreakdown() {
  const g = id => parseInt(document.getElementById(id)?.value) || 0;
  return {
    denom_1000: g('denom1000'), denom_500: g('denom500'), denom_200: g('denom200'),
    denom_100: g('denom100'), denom_50: g('denom50'), denom_10: g('denom10'),
    denom_5: g('denom5'), denom_1: g('denom1'), denom_cents: g('denomCents')
  };
}

function clearDenomFields() {
  ['denom1000','denom500','denom200','denom100','denom50','denom10','denom5','denom1','denomCents'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = 0;
  });
  recalcDenomTotal();
}

/* ── Load till + its transaction history ────────────────── */
async function searchTill() {
  const branchId = document.getElementById('tellerBranchId')?.value;
  const tillId = document.getElementById('tellerTillId')?.value?.trim();
  if (!branchId) { toast('Select a Branch first.', 'warning'); return; }
  if (!tillId) { toast('Enter a Till ID.', 'warning'); return; }

  try {
    const rows = await sbFetch(`tellertillregistry?till_id=eq.${encodeURIComponent(tillId)}&limit=1`);
    if (rows && rows[0]) {
      _currentTill = rows[0];
      document.getElementById('tellerCashierName').value = _currentTill.cashier_name || '';
      document.getElementById('tellerTillStatus').value = _currentTill.till_status || 'CLOSED';
      document.getElementById('tellerTillDescription').value = '';
      toast(`Till ${tillId} loaded — status: ${_currentTill.till_status || 'CLOSED'}.`, 'success');
    } else {
      _currentTill = null;
      document.getElementById('tellerTillStatus').value = 'NOT REGISTERED';
      document.getElementById('tellerCashierName').value = '';
      toast(`Till ${tillId} not found. Enter a Cashier Name and click Open Till to register and open it.`, 'warning');
    }
    await loadTransactions(tillId);
  } catch (e) {
    toast('Till lookup error: ' + e.message, 'error');
  }
}

async function loadTransactions(tillId) {
  const tbody = document.getElementById('transactionsTbody');
  if (!tbody) return;
  try {
    const rows = await sbFetch(`teller_transactions?till_id=eq.${encodeURIComponent(tillId)}&select=*&order=transaction_id.desc&limit=25`);
    if (!rows || !rows.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center gray-text italic">No transactions for this till yet.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td>${r.transaction_id}</td>
        <td>${r.transaction_type}</td>
        <td>${r.transaction_date}</td>
        <td>${r.reference_no || ''}</td>
        <td>${r.narration || ''}</td>
        <td class="text-right">${fmt(r.total_amount)}</td>
        <td class="text-right">${fmt(r.running_balance)}</td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="color:#dc2626;">Error loading transactions: ${e.message}</td></tr>`;
  }
}

/* ── Post a transaction — shared by Open Till / Close Till / Post Transaction ── */
async function postTransaction(forcedType) {
  const branchId = document.getElementById('tellerBranchId')?.value;
  const tillId = document.getElementById('tellerTillId')?.value?.trim();
  const cashierName = document.getElementById('tellerCashierName')?.value?.trim();
  const txType = forcedType || document.getElementById('txType')?.value;
  const txDate = document.getElementById('txDate')?.value || new Date().toISOString().slice(0, 10);
  const refNo = document.getElementById('txRefNo')?.value?.trim() || null;
  const narration = document.getElementById('txNarration')?.value?.trim() || null;
  const createdBy = document.getElementById('txCreatedBy')?.value?.trim();

  if (!branchId) { toast('Select a Branch.', 'warning'); return; }
  if (!tillId) { toast('Enter a Till ID.', 'warning'); return; }
  if (!txType) { toast('Select a Transaction Type.', 'warning'); return; }
  if (!createdBy) { toast('Created By is required.', 'warning'); return; }

  const totalAmount = recalcDenomTotal();
  if (totalAmount <= 0 && txType !== 'ADJUSTMENT') {
    toast('Enter a denomination breakdown greater than zero.', 'warning'); return;
  }

  // Status guard — mirrors the till_status lifecycle: OPEN must happen
  // before any RECEIPT/PAYMENT/TRANSFER/ADJUSTMENT/CLOSE.
  const liveStatus = _currentTill?.till_status || 'NOT REGISTERED';
  if (txType === 'OPEN' && liveStatus === 'OPEN') {
    toast('This till is already OPEN.', 'warning'); return;
  }
  if (txType !== 'OPEN' && liveStatus !== 'OPEN') {
    toast(`Till must be OPEN before posting a ${txType} transaction (currently: ${liveStatus}).`, 'error'); return;
  }

  if (!confirm(
    `Post ${txType} transaction?\n\n` +
    `Till: ${tillId} (${branchId})\n` +
    `Amount: ETB ${fmt(totalAmount)}\n` +
    `Reference: ${refNo || '(none)'}\n` +
    `By: ${createdBy}`
  )) {
    toast('Cancelled.', 'info');
    return;
  }

  try {
    // Register the till if this is its first-ever OPEN.
    if (txType === 'OPEN' && !_currentTill) {
      await sbFetch('tellertillregistry', {
        method: 'POST',
        prefer: 'return=representation',
        body: JSON.stringify({ branch_id: branchId, till_id: tillId, cashier_name: cashierName || null, till_status: 'OPEN' })
      });
    } else if (txType === 'OPEN' || txType === 'CLOSE') {
      await sbFetch(`tellertillregistry?till_id=eq.${encodeURIComponent(tillId)}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: JSON.stringify({ till_status: txType === 'OPEN' ? 'OPEN' : 'CLOSED', cashier_name: cashierName || null })
      });
    }

    // Insert the transaction — running_balance is intentionally omitted;
    // the DB trigger computes it from the till's own latest row.
    const denoms = getDenomBreakdown();
    await sbFetch('teller_transactions', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify({
        till_id: tillId,
        branch_id: branchId,
        transaction_type: txType,
        transaction_date: txDate,
        reference_no: refNo,
        ...denoms,
        total_amount: totalAmount,
        narration,
        created_by: createdBy
      })
    });

    toast(`✔ ${txType} posted for till ${tillId}.`, 'success');

    _currentTill = { branch_id: branchId, till_id: tillId, cashier_name: cashierName, till_status: txType === 'OPEN' ? 'OPEN' : (txType === 'CLOSE' ? 'CLOSED' : liveStatus) };
    document.getElementById('tellerTillStatus').value = _currentTill.till_status;
    clearDenomFields();
    document.getElementById('txRefNo').value = '';
    document.getElementById('txNarration').value = '';
    if (!forcedType) document.getElementById('txType').value = '';

    await loadTransactions(tillId);
  } catch (e) {
    toast('Post transaction failed: ' + e.message, 'error');
  }
}

/* ── Toolbar ────────────────────────────────────────────── */
document.getElementById('btnSearchTill')?.addEventListener('click', searchTill);
document.getElementById('tellerTillId')?.addEventListener('keydown', e => { if (e.key === 'Enter') searchTill(); });
document.getElementById('btnGlobalView')?.addEventListener('click', searchTill);

document.getElementById('btnOpenTill')?.addEventListener('click', () => postTransaction('OPEN'));
document.getElementById('btnCloseTill')?.addEventListener('click', () => postTransaction('CLOSE'));
document.getElementById('btnPostTx')?.addEventListener('click', () => {
  const t = document.getElementById('txType')?.value;
  if (t === 'OPEN' || t === 'CLOSE') {
    toast(`Use the "${t === 'OPEN' ? 'Open Till' : 'Close Till'}" button for this transaction type.`, 'warning');
    return;
  }
  postTransaction();
});

document.getElementById('btnGlobalAdd')?.addEventListener('click', () => {
  document.getElementById('tellerTillId').value = '';
  document.getElementById('tellerCashierName').value = '';
  document.getElementById('tellerTillStatus').value = '';
  document.getElementById('tellerTillDescription').value = '';
  document.getElementById('transactionsTbody').innerHTML = '<tr><td colspan="7" class="text-center gray-text italic">Load a till to view transactions.</td></tr>';
  _currentTill = null;
  clearDenomFields();
  toast('Enter a new Till ID and Cashier Name, then click Open Till.', 'info');
  document.getElementById('tellerTillId')?.focus();
});
document.getElementById('btnGlobalEdit')?.addEventListener('click', () => {
  toast('This module is transactional — post an ADJUSTMENT entry rather than editing history directly.', 'warning');
});
document.getElementById('btnGlobalClose')?.addEventListener('click', () => { window.location = 'indexll.html'; });
document.getElementById('btnGlobalCancel')?.addEventListener('click', () => {
  clearDenomFields();
  document.getElementById('txRefNo').value = '';
  document.getElementById('txNarration').value = '';
  document.getElementById('txType').value = '';
  toast('Entry cleared.', 'info');
});
document.getElementById('btnGlobalDelete')?.addEventListener('click', () => {
  toast('Teller transactions cannot be deleted — this is an audit ledger. Post a correcting ADJUSTMENT instead.', 'warning');
});
document.getElementById('btnGlobalPrint')?.addEventListener('click', () => window.print());

/* ── Init ───────────────────────────────────────────────── */
async function init() {
  await loadBranches();
  recalcDenomTotal();
}
init();

// ── Window Controls: Minimize / Maximize ────────────────────
const windowContainer = document.querySelector('.window-container');
const wcMinimizeBtn    = document.getElementById('wcMinimize');
const wcMaximizeBtn    = document.getElementById('wcMaximize');
const dockSliver        = document.getElementById('dockSliver');

function toggleMinimize() {
  if (!windowContainer || !dockSliver) return;
  windowContainer.classList.remove('is-maximized');
  if (wcMaximizeBtn) wcMaximizeBtn.textContent = '▢';
  windowContainer.classList.toggle('is-minimized');
  const minimized = windowContainer.classList.contains('is-minimized');
  dockSliver.classList.toggle('show', minimized);
  if (wcMinimizeBtn) wcMinimizeBtn.title = minimized ? 'Restore' : 'Minimize';
}

function toggleMaximize() {
  if (!windowContainer) return;
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
