/* ═══════════════════════════════════════════════════════════
   Africa Village Microfinance — 02 Group Loan Projection
   group-loan-projection.js  v2.1  (FIXED)
   Fixes: global button wiring, action buttons, grid population,
          center lookup, sidebar active class
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

/* ── Product Dropdown ──────────────────────────────────── */
let _productCache = [];

async function loadProducts() {
  const sel = document.getElementById('groupProductId');
  if (!sel) return;
  try {
    const rows = await sbFetch(
      'lendingproductparametermatrix?select=product_code_id,product_name_title,base_interest_rate&order=product_code_id'
    );
    _productCache = Array.isArray(rows) ? rows : [];
    const keep = sel.value;
    sel.innerHTML = '<option value="">-- Select Product --</option>';
    _productCache.forEach(r => {
      const o = document.createElement('option');
      o.value = r.product_code_id;
      o.textContent = r.product_code_id + (r.product_name_title ? ' — ' + r.product_name_title : '');
      o.dataset.rate = r.base_interest_rate || '';
      sel.appendChild(o);
    });
    sel.disabled = false;
    if (keep) sel.value = keep;
  } catch (e) {
    toast('Could not load product list.', 'error');
  }
}

document.getElementById('groupProductId')?.addEventListener('change', function () {
  const chosen = _productCache.find(p => p.product_code_id === this.value);
  const rateEl = document.getElementById('groupInterestRate');
  if (chosen && chosen.base_interest_rate && rateEl && !rateEl.value) {
    rateEl.value = chosen.base_interest_rate;
  }
  const termEl = document.getElementById('groupTerm');
  const product = _productCache.find(p => p.product_code_id === this.value);
  if (product && product.default_term_months && termEl && !termEl.value) {
    termEl.value = product.default_term_months;
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
      // Auto-fill scheme and advance type if those fields exist in form
      const schemeEl = document.getElementById('groupSchemeId');
      const advEl    = document.getElementById('groupAdvanceType');
      if (schemeEl && !schemeEl.value && center.scheme_id) schemeEl.value = center.scheme_id;
      if (advEl   && !advEl.value   && center.advance_type) advEl.value = center.advance_type;
      this.classList.remove('input-invalid');
    } else {
      this.classList.add('input-invalid');
      toast('Center ID not found.', 'warning');
    }
  } catch (e) {
    toast('Could not verify Center ID.', 'error');
  }
});

/* ── Client ID Lookup ───────────────────────────────────── */
async function lookupClient(clientId) {
  const val = (clientId || '').trim();
  if (!val) return null;
  // Try ClientMasterRecords first (PascalCase table — must be quoted in PostgREST)
  try {
    const rows = await sbFetch(
      `${encodeURIComponent(TABLE_CLIENTS)}?client_id=eq.${encodeURIComponent(val)}&select=client_name&limit=1`
    );
    if (rows && rows[0]) return rows[0];
  } catch (_) { /* fall through */ }
  // Fallback: try `clients` (lowercase) table
  try {
    const rows = await sbFetch(
      `clients?client_id=eq.${encodeURIComponent(val)}&select=client_name&limit=1`
    );
    return (rows && rows[0]) ? rows[0] : null;
  } catch (_) { return null; }
}

document.getElementById('groupClientId')?.addEventListener('blur', async function () {
  const val = this.value.trim();
  const nameEl = document.getElementById('groupClientName');
  if (!nameEl) return;
  if (!val) { nameEl.value = ''; return; }
  try {
    const client = await lookupClient(val);
    if (client) {
      nameEl.value = client.client_name || '';
      this.classList.remove('input-invalid');
    } else {
      nameEl.value = '';
      this.classList.add('input-invalid');
      toast('Client ID not found in registry.', 'warning');
    }
  } catch (e) {
    nameEl.value = '';
    toast('Could not verify Client ID.', 'error');
  }
});

document.getElementById('groupClientId')?.addEventListener('input', function () {
  this.classList.remove('input-invalid');
});

/* ── Grid Management ────────────────────────────────────── */
let _gridRows = [];

function getCurrentFormRow() {
  return {
    group_id:       document.getElementById('groupCenterId')?.value     || '',
    client_id:      document.getElementById('groupClientId')?.value     || '',
    client_name:    document.getElementById('groupClientName')?.value   || '',
    loan_cycle:     document.getElementById('groupLoanCycle')?.value    || '',
    loan_level:     document.getElementById('groupLoanLevel')?.value    || '',
    loan_amount:    document.getElementById('groupLoanAmount')?.value   || '',
    term:           document.getElementById('groupTerm')?.value          || '',
    loan_period:    document.getElementById('groupLoanPeriod')?.value   || '',
    repayment_term: document.getElementById('groupRepaymentTerm')?.value || '',
    frequency:      document.getElementById('groupRepaymentTerm')?.value || 'Monthly',
    interest_rate:  document.getElementById('groupInterestRate')?.value || '',
    penalty_rate:   '',
    total_savings:  '',
  };
}

function renderGrid() {
  const tbody = document.getElementById('groupLoanGridBody');
  if (!tbody) return;
  if (_gridRows.length === 0) {
    tbody.innerHTML = '<tr id="groupLoanGridEmptyRow"><td colspan="13" class="text-center gray-text italic">No records to display.</td></tr>';
    return;
  }
  tbody.innerHTML = '';
  _gridRows.forEach((row, idx) => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.innerHTML = `
      <td>${row.group_id}</td>
      <td>${row.client_id}</td>
      <td>${row.client_name}</td>
      <td>${row.loan_cycle}</td>
      <td>${row.loan_level}</td>
      <td class="text-right">${Number(row.loan_amount || 0).toLocaleString()}</td>
      <td>${row.term}</td>
      <td>${row.loan_period}</td>
      <td>${row.repayment_term}</td>
      <td>${row.frequency}</td>
      <td>${row.interest_rate}</td>
      <td>${row.penalty_rate}</td>
      <td>${row.total_savings}</td>
    `;
    tr.addEventListener('click', () => loadRowToForm(idx));
    tbody.appendChild(tr);
  });
}

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
  set('groupInterestRate',  row.interest_rate);
}

/* ── Action Row Buttons ─────────────────────────────────── */
document.getElementById('btnGroupAlter')?.addEventListener('click', () => {
  // "Alter" = update an existing selected grid row
  const tbody = document.getElementById('groupLoanGridBody');
  const selected = tbody?.querySelector('tr.selected-row');
  if (!selected) { toast('Select a row first to alter.', 'warning'); return; }
  const idx = parseInt(selected.dataset.rowIdx);
  if (isNaN(idx)) return;
  _gridRows[idx] = getCurrentFormRow();
  renderGrid();
  toast('Row updated.');
});

document.getElementById('btnGroupUpdate')?.addEventListener('click', () => {
  // "Update" = add current form values as a new row
  const row = getCurrentFormRow();
  if (!row.client_id) { toast('Enter a Client ID before adding to grid.', 'warning'); return; }
  _gridRows.push(row);
  renderGrid();
  toast(`Row added — ${_gridRows.length} member(s) in batch.`);
});

document.getElementById('btnGroupClear')?.addEventListener('click', () => {
  // Clear just the per-member fields (keep header/batch fields)
  ['groupClientId','groupClientName','groupLoanAmount','groupLoanLevel',
   'groupLoanCycle','groupTerm','groupLoanPeriod','groupRepaymentTerm','groupInterestRate'
  ].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  toast('Member fields cleared.');
});

/* ── Mode Control ──────────────────────────────────────── */
let currentMode = 'view';

function setMode(mode) {
  currentMode = mode;
  const isEdit = mode === 'edit' || mode === 'add';
  const view = document.querySelector('.module-view.active');
  if (view) {
    view.querySelectorAll('input:not([readonly]), select, textarea').forEach(el => {
      if (el.dataset.alwaysEnabled !== undefined) { el.disabled = false; return; }
      el.disabled = !isEdit;
    });
  }
  document.querySelectorAll('input[readonly]').forEach(el => el.disabled = false);

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

/* ── Save (Persist batch to loanapplications + loanmasterrecords) ── */
async function saveBatch() {
  if (_gridRows.length === 0) {
    toast('Add at least one member row before saving.', 'warning');
    return;
  }

  const branchId      = document.getElementById('groupBranchId')?.value;
  const disbursDate   = document.getElementById('groupDisbursementDate')?.value;
  const modeOfDisb    = document.getElementById('groupModeOfDisbursement')?.value;
  const fileNumber    = document.getElementById('groupFileNumber')?.value;
  const fundId        = document.getElementById('groupFundId')?.value;
  const loanPurpose   = document.getElementById('groupLoanPurpose')?.value;
  const productId     = document.getElementById('groupProductId')?.value;
  const currencyId    = document.getElementById('groupCurrencyId')?.value || 'ETB';
  const creditOfficer = document.getElementById('groupCreditOfficer')?.value;
  const centerId      = document.getElementById('groupCenterId')?.value;
  const schemeId      = document.getElementById('groupSchemeId')?.value;

  if (!branchId)  { toast('Branch is required.', 'warning'); return; }
  if (!productId) { toast('Product is required.', 'warning'); return; }

  const sb = document.getElementById('statusBar');
  if (sb) sb.textContent = 'Saving…';

  let saved = 0, errors = 0;

  for (const row of _gridRows) {
    if (!row.client_id || !row.loan_amount || !row.term || !row.interest_rate) {
      errors++;
      continue;
    }

    // Generate application_id
    const applicationId = `GRP-${branchId}-${Date.now()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
    const repaymentAccId = document.getElementById('groupRepaymentAccId')?.value || '';

    try {
      // Step 1 — Insert into loanapplications
      await sbFetch('loanapplications', {
        method: 'POST',
        prefer: 'return=minimal',
        body: JSON.stringify({
          application_id:     applicationId,
          application_date:   disbursDate || new Date().toISOString().slice(0,10),
          branch_id:          branchId,
          application_status: 'Draft',
        })
      });

      // Step 2 — Insert into loanmasterrecords
      await sbFetch('loanmasterrecords', {
        method: 'POST',
        prefer: 'return=minimal',
        body: JSON.stringify({
          application_id:          applicationId,
          branch_id:               branchId,
          center_id:               centerId || null,
          client_id:               row.client_id,
          client_name:             row.client_name,
          product_id:              productId,
          main_repayment_account_id: repaymentAccId || 'DEFAULT',
          fund_id:                 fundId || null,
          loan_purpose:            loanPurpose || null,
          line_of_business:        document.getElementById('groupLineOfBusiness')?.value || null,
          credit_officer_id:       creditOfficer || null,
          file_number:             fileNumber || null,
          applied_amount:          parseFloat(row.loan_amount),
          currency_id:             currencyId,
          term_months:             parseInt(row.term),
          repayment_term_months:   row.repayment_term ? parseInt(row.repayment_term) : null,
          loan_cycle_no:           row.loan_cycle ? parseInt(row.loan_cycle) : 1,
          loan_level_no:           row.loan_level ? parseInt(row.loan_level) : 1,
          group_class:             document.getElementById('groupGroupClass')?.value || null,
          repayment_frequency:     row.frequency || 'Monthly',
          interest_rate:           parseFloat(row.interest_rate),
          mode_of_disbursement:    modeOfDisb || 'Transfer',
          disbursement_date:       disbursDate || null,
          application_status:      'DataEntry',
        })
      });

      saved++;
    } catch (e) {
      console.error('Save error for row:', row.client_id, e);
      errors++;
    }
  }

  if (saved > 0) toast(`Saved ${saved} record(s)${errors > 0 ? `, ${errors} failed` : ''}.`, errors > 0 ? 'warning' : 'success');
  else toast(`Save failed — ${errors} error(s). Check console.`, 'error');

  if (sb) sb.textContent = `Saved ${saved} / ${_gridRows.length} rows`;
  if (saved > 0) setMode('view');
}

/* ── Global Toolbar Buttons ─────────────────────────────── */
document.getElementById('btnGlobalView')?.addEventListener('click', () => {
  toast('View mode — grid rows are clickable to load a record.');
});
document.getElementById('btnGlobalAdd')?.addEventListener('click', () => {
  setMode('add');
  toast('Add mode — fill batch header, then add member rows.');
});
document.getElementById('btnGlobalEdit')?.addEventListener('click', () => {
  setMode('edit');
  toast('Edit mode — modify details then Save.');
});
document.getElementById('btnGlobalSave')?.addEventListener('click', saveBatch);
document.getElementById('btnGlobalCancel')?.addEventListener('click', () => {
  setMode('view');
  toast('Changes discarded.');
});
document.getElementById('btnGlobalClose')?.addEventListener('click', () => {
  _gridRows = [];
  renderGrid();
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
  await Promise.all([loadBranches(), loadProducts()]);
}
init();
