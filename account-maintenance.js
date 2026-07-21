/* ═══════════════════════════════════════════════════════════
   Africa Village Microfinance — 12 Client Financial Account Maintenance
   account-maintenance.js  v1.2 — GL POSTING ADDED ON ACCOUNT OPENING
   Table : clientfinancialaccounts
   FK    : client_id → ClientMasterRecords(client_id)
           branch_id → branchregistry(branch_id)
   CHECK : account_type  ∈ {Savings, Repayment, Current}
           account_status ∈ {Active, Dormant, Closed}

   WHAT CHANGED FROM v1.1
   New-account creation (the 'add' branch of saveRecord()) now calls the
   post_account_opening RPC instead of inserting directly into
   clientfinancialaccounts. Previously an Initial Deposit amount was saved
   onto the account's own current_balance but never appeared anywhere in
   chart_of_accounts or gl_transaction_journal — this closes that gap.
   Editing an existing account still uses a plain PATCH, unchanged, since
   that path never creates new deposit money.
═══════════════════════════════════════════════════════════ */

'use strict';

const SUPABASE_URL      = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';

const TABLE = 'clientfinancialaccounts';

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

/* ── RPC Helper — NEW, added to call post_account_opening ──
   Same pattern as disbursement.js / loan-repayment-collection.js. ── */
async function sbRpc(fnName, params = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: {
      'apikey':        SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type':  'application/json'
    },
    body: JSON.stringify(params)
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    let msg = 'HTTP ' + res.status;
    try { const j = JSON.parse(errText); msg = j.message || j.hint || j.details || msg; } catch {}
    throw new Error(msg);
  }
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
   created_on is set by DB DEFAULT now() — never written.
   current_balance mirrors initial_deposit on new accounts.
═══════════════════════════════════════════════════════════ */
const FIELD_MAP = {
  accBranchId:     'branch_id',
  accClientId:     'client_id',
  accountNumber:   'account_number',
  accountType:     'account_type',
  accCurrencyId:   'currency_id',
  initialDeposit:  'initial_deposit_amount',
  currentBalance:  'current_balance',
  accountStatus:   'account_status',
  accRemarks:      'remarks',
  accCreatedBy:    'created_by',
  accCreatedOn:    'created_on',           // display only — set by DB
};

/* Read-only display fields — never sent to DB */
const READ_ONLY = new Set(['accCreatedOn', 'accClientName', 'accBranchName']);
// currentBalance is writable — must be sent to DB (not generated, not readonly in schema)

let currentMode = 'view';
let _currentAccountNumber = null; // PK of loaded record

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
  Object.keys(FIELD_MAP).forEach(id => {
    if (id === 'accountType')   { setField(id, 'Savings'); return; }
    if (id === 'accountStatus') { setField(id, 'Active');  return; }
    if (id === 'accCurrencyId') { setField(id, 'ETB');     return; }
    if (id === 'initialDeposit' || id === 'currentBalance') { setField(id, '0'); return; }
    setField(id, '');
  });
  setField('accClientName', '');
  setField('accBranchName', '');
  _currentAccountNumber = null;
  renderAccountGrid([]);
}

function formToRecord() {
  const rec = {};
  Object.entries(FIELD_MAP).forEach(([htmlId, dbCol]) => {
    if (READ_ONLY.has(htmlId)) return;
    const val = getField(htmlId);
    if (val !== undefined) rec[dbCol] = val;
  });
  // Numeric coercion
  if (rec.initial_deposit_amount) rec.initial_deposit_amount = parseFloat(rec.initial_deposit_amount) || 0;
  if (rec.current_balance)        rec.current_balance        = parseFloat(rec.current_balance)        || 0;
  return rec;
}

function recordToForm(rec) {
  Object.entries(FIELD_MAP).forEach(([htmlId, dbCol]) => {
    setField(htmlId, rec[dbCol] ?? '');
  });
  _currentAccountNumber = rec.account_number ?? null;
  // Format created_on for display
  if (rec.created_on) {
    const d = new Date(rec.created_on);
    setField('accCreatedOn', d.toLocaleDateString('en-ET', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    }));
  }
}

/* ── Branch Dropdown ───────────────────────────────────── */
let _branchCache = [];

async function loadBranches() {
  const sel = document.getElementById('accBranchId');
  if (sel) { sel.innerHTML = '<option value="">Loading…</option>'; sel.disabled = true; }
  try {
    // Note: branchregistry has no is_operational_active column — removed that filter
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

document.getElementById('accBranchId')?.addEventListener('change', function () {
  const chosen = _branchCache.find(b => b.branch_id === this.value);
  setField('accBranchName', chosen?.branch_name || '');
});

/* ── Client Lookup ──────────────────────────────────────── */
async function verifyClient(clientId) {
  const val = (clientId || document.getElementById('accClientId')?.value || '').trim();
  if (!val) { toast('Enter a Client ID first.', 'warning'); return false; }

  try {
    // Try ClientMasterRecords first (richer name data)
    let name = null;
    // clientfinancialaccounts.client_id FK → ClientMasterRecords(client_id)
    // ONLY look up from ClientMasterRecords — using the 'clients' table as fallback
    // would find IDs not in ClientMasterRecords and cause a FK violation on save.
    const cmr = await sbFetch(
      `ClientMasterRecords?client_id=eq.${encodeURIComponent(val)}&select=client_name,first_name,middle_name,last_name&limit=1`
    );
    if (cmr && cmr[0]) {
      const r = cmr[0];
      name = r.client_name || [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(' ');
    }

    if (name) {
      setField('accClientName', name);
      document.getElementById('accClientId')?.classList.remove('input-invalid');
      toast(`Client ${val} verified — ${name}`, 'success');
      // Load all accounts for this client
      await loadClientAccounts(val);
      return true;
    } else {
      setField('accClientName', '');
      document.getElementById('accClientId')?.classList.add('input-invalid');
      toast(`Client ID "${val}" not found in registry.`, 'warning');
      renderAccountGrid([]);
      return false;
    }
  } catch (e) {
    toast('Client lookup error: ' + e.message, 'error');
    return false;
  }
}

document.getElementById('btnVerifyClient')?.addEventListener('click', () => verifyClient());
document.getElementById('accClientId')?.addEventListener('blur', () => {
  const val = document.getElementById('accClientId')?.value.trim();
  if (val) verifyClient(val);
});
document.getElementById('accClientId')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') verifyClient();
});

/* ── Load client's existing accounts into grid ──────────── */
async function loadClientAccounts(clientId) {
  try {
    const rows = await sbFetch(
      `${TABLE}?client_id=eq.${encodeURIComponent(clientId)}&select=account_number,account_type,current_balance,account_status&order=account_number`
    );
    renderAccountGrid(Array.isArray(rows) ? rows : []);
  } catch {
    renderAccountGrid([]);
  }
}

function renderAccountGrid(rows) {
  const tbody = document.getElementById('tbodyAccountList');
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center gray-text italic">No accounts found for this client.</td></tr>';
    return;
  }
  tbody.innerHTML = '';
  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.title = 'Click to load this account';
    const bal = parseFloat(r.current_balance || 0).toLocaleString('en-ET', { minimumFractionDigits: 2 });
    const statusColor = r.account_status === 'Active' ? '#16a34a'
                      : r.account_status === 'Dormant' ? '#b45309' : '#dc2626';
    tr.innerHTML = `
      <td style="font-family:monospace;font-size:11px;">${r.account_number}</td>
      <td>${r.account_type}</td>
      <td class="text-right">${bal}</td>
      <td style="color:${statusColor};font-weight:600;font-size:11px;">${r.account_status}</td>
    `;
    tr.addEventListener('click', () => viewAccountByNumber(r.account_number));
    tbody.appendChild(tr);
  });
}

/* ── Account Number Generator ───────────────────────────── */
document.getElementById('btnGenAccNo')?.addEventListener('click', () => {
  const branch  = document.getElementById('accBranchId')?.value;
  const client  = document.getElementById('accClientId')?.value.trim();
  const type    = document.getElementById('accountType')?.value;
  if (!branch || !client) {
    toast('Select Branch and enter Client ID before generating.', 'warning'); return;
  }
  const typeCode = type === 'Savings' ? 'SAV' : type === 'Repayment' ? 'REP' : 'CUR';
  // Collision-safe: timestamp suffix instead of Math.random
  const suffix = Date.now().toString(36).toUpperCase().slice(-4);
  const acctNo = `${branch}-${client.slice(0,6).toUpperCase()}-${typeCode}-${suffix}`;
  setField('accountNumber', acctNo);
});

/* ── Initial deposit → mirror to current balance ────────── */
document.getElementById('initialDeposit')?.addEventListener('input', function () {
  setField('currentBalance', this.value || '0');
});

/* ── View account by number (from grid click) ────────────── */
async function viewAccountByNumber(accountNumber) {
  try {
    const rows = await sbFetch(
      `${TABLE}?account_number=eq.${encodeURIComponent(accountNumber)}&limit=1`
    );
    if (rows && rows[0]) {
      recordToForm(rows[0]);
      // Cascade branch name
      const bSel = document.getElementById('accBranchId');
      if (bSel) bSel.dispatchEvent(new Event('change'));
      setMode('view');
      toast(`Account ${accountNumber} loaded.`, 'success');
      setSB(`Loaded — ${accountNumber}`);
    }
  } catch (e) {
    toast('Load error: ' + e.message, 'error');
  }
}

/* ── View (search by account number) ────────────────────── */
async function viewRecord() {
  const acctNo = getField('accountNumber');
  const clientId = getField('accClientId');

  if (!acctNo && !clientId) {
    toast('Enter an Account Number or Client ID to search.', 'warning'); return;
  }

  try {
    if (acctNo) {
      await viewAccountByNumber(acctNo);
    } else {
      // Search by client — verify and load accounts
      await verifyClient(clientId);
    }
  } catch (e) {
    toast('Search error: ' + e.message, 'error');
  }
}

/* ── Save ──────────────────────────────────────────────── */
async function saveRecord() {
  const rec = formToRecord();

  if (!rec.account_number) { toast('Account Number is required.', 'warning'); document.getElementById('accountNumber')?.focus(); return; }
  if (!rec.client_id)      { toast('Client ID is required.', 'warning'); document.getElementById('accClientId')?.focus(); return; }
  if (!rec.branch_id)      { toast('Branch is required.', 'warning'); return; }
  if (!rec.account_type)   { toast('Account Type is required.', 'warning'); return; }

  setSB('Saving…');

  try {
    if (currentMode === 'add' || !_currentAccountNumber) {
      // CHANGED: was a plain INSERT into clientfinancialaccounts with no
      // GL involvement — the initial deposit never appeared anywhere in
      // chart_of_accounts/gl_transaction_journal. Now routed through
      // post_account_opening, which inserts the account AND posts the
      // matching Cash/Deposits GL entry in one transaction, only when
      // there's an actual deposit amount.
      const result = await sbRpc('post_account_opening', {
        p_account_number: rec.account_number,
        p_client_id:      rec.client_id,
        p_branch_id:      rec.branch_id,
        p_account_type:   rec.account_type,
        p_currency_id:    rec.currency_id || 'ETB',
        p_initial_deposit: rec.initial_deposit_amount || 0,
        p_account_status: rec.account_status || 'Active',
        p_remarks:        rec.remarks || null,
        p_created_by:     rec.created_by || null
      });
      toast(
        result?.gl_posted
          ? `Account ${rec.account_number} opened — deposit posted to GL (${result.gl_dr_account} / ${result.gl_cr_account}).`
          : `Account ${rec.account_number} opened successfully.`,
        'success'
      );
    } else {
      const { account_number, client_id, ...updateFields } = rec;
      // Never PATCH the PK or FK client_id
      await sbFetch(`${TABLE}?account_number=eq.${encodeURIComponent(_currentAccountNumber)}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: JSON.stringify(updateFields)
      });
      toast(`Account ${_currentAccountNumber} updated.`, 'success');
    }
    setMode('view');
    // Reload client accounts grid
    const cid = getField('accClientId');
    if (cid) await loadClientAccounts(cid);
    setSB(`Saved — ${rec.account_number}`);
  } catch (e) {
    toast('Save error: ' + e.message, 'error');
    setSB('Save failed.');
  }
}

/* ── Delete (status → Closed) ───────────────────────────── */
async function deleteRecord() {
  if (!_currentAccountNumber) { toast('Load an account first.', 'warning'); return; }
  const bal = parseFloat(document.getElementById('currentBalance')?.value || 0);
  if (bal > 0) {
    toast(`Cannot close account with balance of ETB ${bal.toFixed(2)}. Withdraw funds first.`, 'warning');
    return;
  }
  if (!confirm(`Close account ${_currentAccountNumber}?\nThis sets status to Closed and cannot be undone easily.`)) return;
  try {
    await sbFetch(`${TABLE}?account_number=eq.${encodeURIComponent(_currentAccountNumber)}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ account_status: 'Closed' })
    });
    toast(`Account ${_currentAccountNumber} closed.`, 'success');
    setField('accountStatus', 'Closed');
    setMode('view');
    const cid = getField('accClientId');
    if (cid) await loadClientAccounts(cid);
  } catch (e) {
    toast('Close error: ' + e.message, 'error');
  }
}

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
  document.getElementById('btnGlobalEdit').disabled   = isEdit || !_currentAccountNumber;
  document.getElementById('btnGlobalDelete').disabled = !_currentAccountNumber;
  document.getElementById('btnGlobalClose').disabled  = isEdit;

  setSB(`Mode: ${mode.charAt(0).toUpperCase() + mode.slice(1)} — Ready`);
}

function setSB(msg) {
  const sb = document.getElementById('statusBar');
  if (sb) sb.textContent = msg;
}

/* ── Account number lookup (🔍) ─────────────────────────── */
document.getElementById('btnLookupAccount')?.addEventListener('click', viewRecord);
document.getElementById('accountNumber')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') viewRecord();
});

/* ── Toolbar Buttons ────────────────────────────────────── */
document.getElementById('btnGlobalView')?.addEventListener('click', viewRecord);

document.getElementById('btnGlobalAdd')?.addEventListener('click', () => {
  clearForm();
  setMode('add');
  document.getElementById('accClientId')?.focus();
  toast('Add mode — verify Client ID, then fill account details and Save.');
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

document.getElementById('btnGlobalDelete')?.addEventListener('click', deleteRecord);

document.getElementById('btnGlobalPrint')?.addEventListener('click', () => window.print());

/* ── Init ──────────────────────────────────────────────── */
async function init() {
  setMode('view');
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

