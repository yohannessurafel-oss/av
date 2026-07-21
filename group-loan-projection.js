/* ═══════════════════════════════════════════════════════════
   Africa Village Microfinance — 02 Group / Center Loan Application
   group-loan-projection.js  v2.2
   Fixes:
     - groupFrequency input field added (was reading wrong field)
     - groupPenaltyRate + groupTotalSavings inputs added
     - renderGrid() sets data-row-idx so Alter works correctly
     - loadRowToForm() restores all fields including frequency
     - Totals row in grid footer (Loan Amount sum)
     - btnGroupRemove: remove selected row from batch
     - Action buttons renamed with clear labels + tooltips
     - batchRowCount counter kept in sync
     - Currency ID → select (ETB default)
     - Grid height increased in HTML (180px)
═══════════════════════════════════════════════════════════ */

'use strict';

const SUPABASE_URL      = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';

const TABLE_CLIENTS = 'ClientMasterRecords';

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

async function sbRpc(fnName, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: {
      'apikey':        SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type':  'application/json'
    },
    body: JSON.stringify(params)
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((data && data.message) || `HTTP ${res.status}`);
  }
  return data;
}

/* Populate the #groupRegistryId dropdown with existing groups, showing
   each group's name alongside its collective credit limit so the loan
   officer can see capacity before picking one. */
async function loadGroupOptions() {
  const sel = document.getElementById('groupRegistryId');
  if (!sel) return; // HTML hasn't added this field yet — see note below saveBatch()
  try {
    const rows = await sbFetch(
      'portfoliogrouphierarchy?select=group_registry_id,group_name_alias,collective_credit_limit&order=group_name_alias.asc'
    );
    sel.innerHTML = '<option value="">— Create a new group —</option>' +
      (rows || []).map(g =>
        `<option value="${g.group_registry_id}">${g.group_name_alias} (limit: ${Number(g.collective_credit_limit).toLocaleString()} ETB)</option>`
      ).join('');
  } catch (e) {
    console.error('Failed to load group list:', e);
  }
}
document.addEventListener('DOMContentLoaded', loadGroupOptions);

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

function populateBranchSelect(preserveValue) {
  const sel = document.getElementById('groupBranchId');
  if (!sel) return;
  const keep = preserveValue ? sel.value : '';
  sel.innerHTML = '<option value="">-- Select Branch --</option>';
  _branchCache.forEach(r => {
    const o = document.createElement('option');
    o.value = r.branch_id;
    o.textContent = r.branch_id + (r.branch_name ? ' — ' + r.branch_name : '');
    sel.appendChild(o);
  });
  sel.disabled = false;
  if (keep) sel.value = keep;
}

async function loadBranches() {
  const sel = document.getElementById('groupBranchId');
  if (sel) { sel.innerHTML = '<option value="">Loading branches…</option>'; sel.disabled = true; }
  try {
    const rows = await sbFetch('branchregistry?select=branch_id,branch_name&order=branch_id');
    _branchCache = Array.isArray(rows) ? rows : [];
    populateBranchSelect(true);
  } catch {
    toast('Could not load branch list.', 'error');
    const sel2 = document.getElementById('groupBranchId');
    if (sel2) { sel2.innerHTML = '<option value="">-- Select Branch --</option>'; sel2.disabled = false; }
  }
}

document.getElementById('groupBranchId')?.addEventListener('change', function () {
  const nameEl = document.getElementById('groupBranchName');
  const chosen = _branchCache.find(b => b.branch_id === this.value);
  if (nameEl) nameEl.value = chosen?.branch_name || '';
});

/* ── Product Dropdown ──────────────────────────────────── */
let _productCache = [];

async function loadProducts() {
  const sel = document.getElementById('groupProductId');
  if (!sel) return;
  try {
    const rows = await sbFetch(
      'lendingproductparametermatrix?select=product_code_id,product_name_title,base_interest_rate,default_term_months&order=product_code_id'
    );
    _productCache = Array.isArray(rows) ? rows : [];
    const keep = sel.value;
    sel.innerHTML = '<option value="">-- Select Product --</option>';
    _productCache.forEach(r => {
      const o = document.createElement('option');
      o.value = r.product_code_id;
      o.textContent = r.product_code_id + (r.product_name_title ? ' — ' + r.product_name_title : '');
      sel.appendChild(o);
    });
    sel.disabled = false;
    if (keep) sel.value = keep;
  } catch {
    toast('Could not load product list.', 'error');
  }
}

document.getElementById('groupProductId')?.addEventListener('change', function () {
  const chosen = _productCache.find(p => p.product_code_id === this.value);
  if (!chosen) return;
  const rateEl = document.getElementById('groupInterestRate');
  if (chosen.base_interest_rate && rateEl && !rateEl.value) {
    rateEl.value = chosen.base_interest_rate;
  }
  const termEl = document.getElementById('groupTerm');
  if (chosen.default_term_months && termEl && !termEl.value) {
    termEl.value = chosen.default_term_months;
  }
});

/* ── Center ID Lookup ───────────────────────────────────── */
document.getElementById('groupCenterId')?.addEventListener('blur', async function () {
  const val = this.value.trim();
  if (!val) return;
  try {
    const rows = await sbFetch(
      `operationalcenters?center_id=eq.${encodeURIComponent(val)}&select=center_id,branch_id,scheme_id,advance_type&limit=1`
    );
    if (rows && rows[0]) {
      const center = rows[0];
      const schemeEl = document.getElementById('groupSchemeId');
      const advEl    = document.getElementById('groupAdvanceType');
      if (schemeEl && !schemeEl.value && center.scheme_id)   schemeEl.value = center.scheme_id;
      if (advEl    && !advEl.value    && center.advance_type) advEl.value = center.advance_type;
      this.classList.remove('input-invalid');
    } else {
      this.classList.add('input-invalid');
      toast('Center ID not found.', 'warning');
    }
  } catch {
    toast('Could not verify Center ID.', 'error');
  }
});

/* ── Client Lookup ──────────────────────────────────────── */
// Queries ONLY ClientMasterRecords, matching every other module in the
// system (client-directory, client-maintenance, loan-account-maintenance,
// loan-appraisal-management, credit-sanction-console all do the same).
// This previously had a silent fallback to a separate 'clients' table that
// no other module references — removed, since a fallback across two
// different sources of truth can silently return stale/wrong data with no
// indication of which table actually answered.
async function lookupClient(clientId) {
  const val = (clientId || '').trim();
  if (!val) return null;
  try {
    const rows = await sbFetch(
      `${encodeURIComponent(TABLE_CLIENTS)}?client_id=eq.${encodeURIComponent(val)}&select=client_id,first_name,middle_name,last_name,client_name&limit=1`
    );
    return (rows && rows[0]) ? rows[0] : null;
  } catch (e) {
    toast('Client lookup failed: ' + e.message, 'error');
    return null;
  }
}

function clientDisplayName(rec) {
  if (!rec) return '';
  if (rec.first_name || rec.last_name) {
    return [rec.first_name, rec.middle_name, rec.last_name].filter(Boolean).join(' ');
  }
  return rec.client_name || '';
}

async function resolveClientId() {
  const val = document.getElementById('groupClientId')?.value.trim();
  const nameEl = document.getElementById('groupClientName');
  if (!val) { if (nameEl) nameEl.value = ''; return; }
  try {
    const client = await lookupClient(val);
    if (client) {
      if (nameEl) nameEl.value = clientDisplayName(client);
      document.getElementById('groupClientId')?.classList.remove('input-invalid');
    } else {
      if (nameEl) nameEl.value = '';
      document.getElementById('groupClientId')?.classList.add('input-invalid');
      toast('Client ID not found in registry.', 'warning');
    }
  } catch {
    if (nameEl) nameEl.value = '';
    toast('Could not verify Client ID.', 'error');
  }
}

document.getElementById('groupClientId')?.addEventListener('blur', resolveClientId);
document.getElementById('groupClientId')?.addEventListener('input', function () { this.classList.remove('input-invalid'); });
document.getElementById('btnLookupClient')?.addEventListener('click', resolveClientId);
document.getElementById('groupClientId')?.addEventListener('keydown', e => { if (e.key === 'Enter') resolveClientId(); });

/* ══════════════════════════════════════════════════════════
   BATCH GRID MANAGEMENT
   _gridRows = array of row objects, one per member
   _selectedIdx = index of the currently highlighted row (or -1)
══════════════════════════════════════════════════════════ */
let _gridRows     = [];
let _selectedIdx  = -1;

/* Snapshot the current member-entry form fields into a row object */
function getCurrentFormRow() {
  const g = id => document.getElementById(id)?.value || '';
  return {
    client_id:      g('groupClientId'),
    client_name:    g('groupClientName'),
    loan_cycle:     g('groupLoanCycle'),
    loan_level:     g('groupLoanLevel'),
    loan_amount:    g('groupLoanAmount'),
    term:           g('groupTerm'),
    loan_period:    g('groupLoanPeriod'),
    repayment_term: g('groupRepaymentTerm'),
    frequency:      g('groupFrequency'),        // ← was wrongly reading groupRepaymentTerm
    interest_rate:  g('groupInterestRate'),
    penalty_rate:   g('groupPenaltyRate'),      // ← new field
    total_savings:  g('groupTotalSavings'),     // ← new field
  };
}

/* Restore a row object back into the member-entry fields */
function loadRowToForm(idx) {
  const row = _gridRows[idx];
  if (!row) return;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  set('groupClientId',      row.client_id);
  set('groupClientName',    row.client_name);
  set('groupLoanCycle',     row.loan_cycle);
  set('groupLoanLevel',     row.loan_level);
  set('groupLoanAmount',    row.loan_amount);
  set('groupTerm',          row.term);
  set('groupLoanPeriod',    row.loan_period);
  set('groupRepaymentTerm', row.repayment_term);
  set('groupFrequency',     row.frequency);     // ← was missing
  set('groupInterestRate',  row.interest_rate);
  set('groupPenaltyRate',   row.penalty_rate);  // ← new
  set('groupTotalSavings',  row.total_savings); // ← new

  /* Highlight the selected row */
  _selectedIdx = idx;
  highlightRow(idx);
}

function highlightRow(idx) {
  document.querySelectorAll('#groupLoanGridBody tr').forEach((tr, i) => {
    tr.classList.toggle('selected-row', i === idx);
  });
}

function updateBatchCounter() {
  const el = document.getElementById('batchRowCount');
  if (el) el.textContent = `${_gridRows.length} member(s)`;
}

function renderGrid() {
  const tbody = document.getElementById('groupLoanGridBody');
  const tfoot = document.getElementById('groupLoanGridFoot');
  if (!tbody) return;

  if (_gridRows.length === 0) {
    tbody.innerHTML = '<tr id="groupLoanGridEmptyRow"><td colspan="13" class="text-center gray-text italic">No records to display. Use "Add Member to Batch" above.</td></tr>';
    if (tfoot) tfoot.style.display = 'none';
    updateBatchCounter();
    return;
  }

  tbody.innerHTML = '';
  let totalAmount = 0;

  _gridRows.forEach((row, idx) => {
    const amt = parseFloat(row.loan_amount) || 0;
    totalAmount += amt;

    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.dataset.rowIdx = idx;   // ← critical fix: Alter needs this

    tr.innerHTML = `
      <td>${row.client_id  || ''}</td>
      <td>${row.client_name || ''}</td>
      <td>${row.loan_cycle  || ''}</td>
      <td>${row.loan_level  || ''}</td>
      <td class="text-right">${amt > 0 ? amt.toLocaleString('en-ET', {minimumFractionDigits:2}) : ''}</td>
      <td>${row.term         || ''}</td>
      <td>${row.loan_period  || ''}</td>
      <td>${row.repayment_term || ''}</td>
      <td>${row.frequency    || ''}</td>
      <td class="text-right">${row.interest_rate || ''}</td>
      <td class="text-right">${row.penalty_rate  || ''}</td>
      <td class="text-right">${row.total_savings || ''}</td>
    `;

    tr.addEventListener('click', () => loadRowToForm(idx));
    tbody.appendChild(tr);
  });

  /* Totals row in tfoot */
  if (tfoot) {
    tfoot.style.display = '';
    const totalEl = document.getElementById('gridTotalAmount');
    if (totalEl) totalEl.textContent = totalAmount.toLocaleString('en-ET', {minimumFractionDigits:2});
  }

  /* Restore highlight if a row was selected */
  if (_selectedIdx >= 0) highlightRow(_selectedIdx);
  updateBatchCounter();
}

/* ── Action Row Buttons ─────────────────────────────────── */

/* ➕ Add Member to Batch — push current form as a new row */
document.getElementById('btnGroupUpdate')?.addEventListener('click', () => {
  const row = getCurrentFormRow();
  if (!row.client_id) {
    toast('Enter a Client ID before adding to the batch.', 'warning');
    document.getElementById('groupClientId')?.focus();
    return;
  }
  _gridRows.push(row);
  _selectedIdx = _gridRows.length - 1;
  renderGrid();
  toast(`Member ${row.client_id} added — ${_gridRows.length} member(s) in batch.`);
});

/* ✏️ Update Selected Row — overwrite the highlighted row with current form */
document.getElementById('btnGroupAlter')?.addEventListener('click', () => {
  if (_selectedIdx < 0 || _selectedIdx >= _gridRows.length) {
    toast('Click a row in the grid first to select it, then use Update Selected Row.', 'warning');
    return;
  }
  _gridRows[_selectedIdx] = getCurrentFormRow();
  renderGrid();
  toast(`Row ${_selectedIdx + 1} updated.`);
});

/* 🗑 Remove Selected Row */
document.getElementById('btnGroupRemove')?.addEventListener('click', () => {
  if (_selectedIdx < 0 || _selectedIdx >= _gridRows.length) {
    toast('Click a row in the grid first to select it, then use Remove Selected Row.', 'warning');
    return;
  }
  const removed = _gridRows.splice(_selectedIdx, 1);
  _selectedIdx = -1;
  renderGrid();
  toast(`Member ${removed[0]?.client_id || ''} removed from batch.`);
});

/* 🧹 Clear Member Fields — reset only the per-member inputs */
document.getElementById('btnGroupClear')?.addEventListener('click', () => {
  [
    'groupClientId', 'groupClientName', 'groupRepaymentAccId',
    'groupLoanAmount', 'groupLoanLevel', 'groupLoanCycle',
    'groupTerm', 'groupLoanPeriod', 'groupRepaymentTerm',
    'groupInterestRate', 'groupPenaltyRate', 'groupTotalSavings',
  ].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const freqEl = document.getElementById('groupFrequency');
  if (freqEl) freqEl.value = 'Monthly'; // reset to default
  _selectedIdx = -1;
  highlightRow(-1);
  toast('Member fields cleared — ready for next entry.');
});

/* ── Mode Control ──────────────────────────────────────── */
let currentMode = 'view';

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

  /* Inline action buttons only enabled in edit/add mode */
  ['btnGroupUpdate','btnGroupAlter','btnGroupRemove','btnGroupClear'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = !isEdit;
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

/* ── Save Batch ─────────────────────────────────────────── */
async function saveBatch() {
  if (_gridRows.length === 0) {
    toast('Add at least one member row before saving.', 'warning');
    return;
  }

  const g = id => document.getElementById(id)?.value || '';
  const branchId       = g('groupBranchId');
  const disbursDate    = g('groupDisbursementDate');
  const modeOfDisb     = g('groupModeOfDisbursement');
  const fileNumber     = g('groupFileNumber');
  const fundId         = g('groupFundId');
  const loanPurpose    = g('groupLoanPurpose');
  const productId      = g('groupProductId');
  const currencyId     = g('groupCurrencyId') || 'ETB';
  const creditOfficer  = g('groupCreditOfficer');
  const centerId       = g('groupCenterId');
  const lineOfBiz      = g('groupLineOfBusiness');
  const groupClass     = g('groupGroupClass');
  const gracePeriod    = g('groupGracePeriod');
  const repaymentAccId = g('groupRepaymentAccId');

  // Group registry — either pick an existing group, or create a new one
  // with a stated collective credit limit. These are new fields; see the
  // note below the function for the HTML inputs this expects.
  const existingGroupId = g('groupRegistryId');
  const newGroupName    = g('groupNewName');
  const newGroupLimit   = g('groupNewLimit');
  const subGroupId      = g('groupSubGroupId');

  if (!branchId)  { toast('Branch is required.', 'warning'); document.getElementById('groupBranchId')?.focus(); return; }
  if (!productId) { toast('Product is required.', 'warning'); document.getElementById('groupProductId')?.focus(); return; }
  if (!repaymentAccId) { toast('Repayment Acc ID is required.', 'warning'); document.getElementById('groupRepaymentAccId')?.focus(); return; }
  if (!existingGroupId && !newGroupName) {
    toast('Select an existing group, or enter a name to create a new one.', 'warning');
    return;
  }

  const sb = document.getElementById('statusBar');
  if (sb) sb.textContent = 'Checking group limit and saving batch…';

  const members = [];
  let skipped = 0;
  for (const row of _gridRows) {
    if (!row.client_id || !row.loan_amount || !row.term || !row.interest_rate) {
      console.warn('Skipping incomplete row:', row);
      skipped++;
      continue;
    }
    members.push({
      client_id:      row.client_id,
      client_name:    row.client_name,
      loan_amount:    parseFloat(row.loan_amount),
      term:           parseInt(row.term),
      repayment_term: row.repayment_term || null,
      loan_cycle:     row.loan_cycle || 1,
      loan_level:     row.loan_level || 1,
      frequency:      row.frequency || 'Monthly',
      interest_rate:  parseFloat(row.interest_rate),
      penalty_rate:   row.penalty_rate || null
    });
  }

  if (members.length === 0) {
    toast('No complete member rows to save.', 'error');
    return;
  }

  try {
    // Single atomic transaction: resolves/creates the group, checks the
    // WHOLE batch against the group's collective_credit_limit BEFORE
    // writing anything, then inserts every member's loanapplications +
    // loanmasterrecords pair together. Either the entire group saves, or
    // none of it does — no more partial batches with orphaned rows.
    const result = await sbRpc('create_group_loan_batch', {
      p_branch_id:                  branchId,
      p_product_id:                 productId,
      p_repayment_account_id:       repaymentAccId,
      p_members:                    members,
      p_group_registry_id:          existingGroupId || null,
      p_new_group_name:             existingGroupId ? null : newGroupName,
      p_new_group_collective_limit: existingGroupId ? null : (parseFloat(newGroupLimit) || null),
      p_center_id:                  centerId || null,
      p_fund_id:                    fundId || null,
      p_loan_purpose:               loanPurpose || null,
      p_line_of_business:           lineOfBiz || null,
      p_credit_officer_id:          creditOfficer || null,
      p_file_number:                fileNumber || null,
      p_currency_id:                currencyId,
      p_group_class:                groupClass || null,
      p_mode_of_disbursement:       modeOfDisb || 'Transfer',
      p_disbursement_date:          disbursDate || null,
      p_grace_period:               gracePeriod || null,
      p_sub_group_id:               subGroupId || null
    });

    toast(
      `Saved ${result.members_saved} member loan(s) under group ${result.group_registry_id}. ` +
      `Group exposure now ${result.new_total_exposure.toLocaleString()} / ${result.collective_limit.toLocaleString()} ETB limit.` +
      (skipped > 0 ? ` (${skipped} incomplete row(s) skipped.)` : ''),
      'success', 7000
    );
    if (sb) sb.textContent = `Saved ${result.members_saved} / ${_gridRows.length} rows under ${result.group_registry_id}.`;
    setMode('view');

  } catch (e) {
    // The RPC rejects the ENTIRE batch if it would exceed the group's
    // collective limit, or if any member row is invalid — nothing gets
    // written in that case, so there's nothing to clean up.
    toast('Batch save failed: ' + e.message, 'error', 8000);
    if (sb) sb.textContent = 'Batch save failed — nothing was written.';
  }
}

/* ============================================================================
   NEW HTML INPUTS THIS FUNCTION EXPECTS (add these to group-loan-projection.html):
     #groupRegistryId  — <select> populated from portfoliogrouphierarchy,
                          letting the user pick an EXISTING group
     #groupNewName     — <input> for creating a NEW group (used only if
                          groupRegistryId is left blank)
     #groupNewLimit    — <input type="number"> the new group's collective
                          credit limit (required only when creating new)
     #groupSubGroupId  — <input> optional sub-group code
   Consider calling a loadGroupOptions() function on page load to populate
   #groupRegistryId from: portfoliogrouphierarchy?select=group_registry_id,group_name_alias,collective_credit_limit
   ============================================================================ */

/* ── Global Toolbar ─────────────────────────────────────── */
document.getElementById('btnGlobalView')?.addEventListener('click', () => {
  toast('View mode — click a grid row to load a member record.');
});
document.getElementById('btnGlobalAdd')?.addEventListener('click', () => {
  _gridRows    = [];
  _selectedIdx = -1;
  renderGrid();
  setMode('add');
  document.getElementById('groupBranchId')?.focus();
  toast('Add mode — fill batch header, then add member rows one by one.');
});
document.getElementById('btnGlobalEdit')?.addEventListener('click', () => {
  setMode('edit');
  toast('Edit mode — modify member rows then Save.');
});
document.getElementById('btnGlobalSave')?.addEventListener('click', saveBatch);
document.getElementById('btnGlobalCancel')?.addEventListener('click', () => {
  setMode('view');
  toast('Changes discarded.');
});
document.getElementById('btnGlobalClose')?.addEventListener('click', () => {
  _gridRows    = [];
  _selectedIdx = -1;
  renderGrid();
  setMode('view');
  toast('Batch closed.');
});
document.getElementById('btnGlobalDelete')?.addEventListener('click', () => {
  toast('Batch delete not implemented — use Remove Selected Row to remove individual members.', 'warning');
});
document.getElementById('btnGlobalPrint')?.addEventListener('click', () => window.print());

/* ── Init ──────────────────────────────────────────────── */
async function init() {
  setMode('view');
  await Promise.all([loadBranches(), loadProducts()]);
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
