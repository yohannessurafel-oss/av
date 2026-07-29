/* ═══════════════════════════════════════════════════════════
   Africa Village Microfinance — 02 Group / Center Loan Application
   group-loan-projection.js  v2.3.1 — FIXED

   FIX: Removed 'frequency' from product query — column doesn't exist
   in lendingproductparametermatrix. Frequency remains user-selectable.
═══════════════════════════════════════════════════════════ */

'use strict';

const SUPABASE_URL = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';

const TABLE_CLIENTS = 'ClientMasterRecords';

/* ── HTTP Helper ────────────────────────────────────────── */
async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': opts.prefer || 'return=representation',
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
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(params)
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((data && data.message) || `HTTP ${res.status}`);
  }
  return data;
}

/* Populate the #groupRegistryId dropdown with existing groups */
async function loadGroupOptions() {
  const sel = document.getElementById('groupRegistryId');
  if (!sel) return;
  try {
    const rows = await sbFetch(
      'portfoliogrouphierarchy?select=group_registry_id,group_name_alias,collective_credit_limit&order=group_name_alias.asc'
    );
    sel.innerHTML = '<option value="">-- Select existing group, or create new below --</option>' +
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
  if (sel) { sel.innerHTML = '<option>Loading branches…</option>'; sel.disabled = true; }
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
    /* FIX v2.3.1: Removed 'frequency' from select — column doesn't exist */
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
      const advEl = document.getElementById('groupAdvanceType');
      if (schemeEl && !schemeEl.value && center.scheme_id) schemeEl.value = center.scheme_id;
      if (advEl && !advEl.value && center.advance_type) advEl.value = center.advance_type;
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
══════════════════════════════════════════════════════════ */
let _gridRows = [];
let _selectedIdx = -1;
let _batchSaveInFlight = false;

/* Snapshot the current member-entry form fields into a row object */
function getCurrentFormRow() {
  const g = id => document.getElementById(id)?.value || '';
  return {
    client_id: g('groupClientId'),
    client_name: g('groupClientName'),
    loan_cycle: g('groupLoanCycle'),
    loan_level: g('groupLoanLevel'),
    loan_amount: g('groupLoanAmount'),
    term: g('groupTerm'),
    loan_period: g('groupLoanPeriod'),
    repayment_term: g('groupRepaymentTerm'),
    frequency: g('groupFrequency'),
    interest_rate: g('groupInterestRate'),
    penalty_rate: g('groupPenaltyRate'),
    total_savings: g('groupTotalSavings'),
  };
}

/* Restore a row object back into the member-entry fields */
function loadRowToForm(idx) {
  const row = _gridRows[idx];
  if (!row) return;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  set('groupClientId', row.client_id);
  set('groupClientName', row.client_name);
  set('groupLoanCycle', row.loan_cycle);
  set('groupLoanLevel', row.loan_level);
  set('groupLoanAmount', row.loan_amount);
  set('groupTerm', row.term);
  set('groupLoanPeriod', row.loan_period);
  set('groupRepaymentTerm', row.repayment_term);
  set('groupFrequency', row.frequency);
  set('groupInterestRate', row.interest_rate);
  set('groupPenaltyRate', row.penalty_rate);
  set('groupTotalSavings', row.total_savings);

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

/* Real-time batch total and limit check */
function updateBatchTotal() {
  const total = _gridRows.reduce((sum, row) => sum + (parseFloat(row.loan_amount) || 0), 0);
  const totalEl = document.getElementById('batchTotalDisplay');
  if (totalEl) totalEl.textContent = `Batch Total: ${total.toLocaleString('en-ET', {minimumFractionDigits: 2})} ETB`;

  /* Check against group limit */
  const groupId = document.getElementById('groupRegistryId')?.value;
  const limitEl = document.getElementById('batchLimitDisplay');
  if (groupId && limitEl) {
    const sel = document.getElementById('groupRegistryId');
    const opt = sel?.selectedOptions?.[0];
    if (opt) {
      const match = opt.textContent.match(/limit: ([\d,]+)/);
      const limit = match ? parseFloat(match[1].replace(/,/g, '')) : 0;
      const remaining = limit - total;
      limitEl.textContent = `Remaining: ${remaining.toLocaleString('en-ET', {minimumFractionDigits: 2})} ETB / ${limit.toLocaleString('en-ET', {minimumFractionDigits: 2})} ETB limit`;
      limitEl.className = remaining < 0 ? 'limit-display over-limit' : 'limit-display';
      if (remaining < 0) {
        toast('⚠ Batch total exceeds group collective limit!', 'warning', 5000);
      }
    }
  } else if (limitEl) {
    limitEl.textContent = 'Remaining: — ETB (no group selected)';
    limitEl.className = 'limit-display';
  }
}

function renderGrid() {
  const tbody = document.getElementById('groupLoanGridBody');
  const tfoot = document.getElementById('groupLoanGridFoot');
  if (!tbody) return;

  if (_gridRows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="13" class="text-center gray-text italic">No records to display. Use "Add Member to Batch" above.</td></tr>';
    if (tfoot) tfoot.style.display = 'none';
    updateBatchCounter();
    updateBatchTotal();
    return;
  }

  tbody.innerHTML = '';
  let totalAmount = 0;

  _gridRows.forEach((row, idx) => {
    const amt = parseFloat(row.loan_amount) || 0;
    totalAmount += amt;

    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.dataset.rowIdx = idx;

    tr.innerHTML = `
      <td>${row.client_id || ''}</td>
      <td>${row.client_name || ''}</td>
      <td>${row.loan_cycle || ''}</td>
      <td>${row.loan_level || ''}</td>
      <td class="text-right">${amt > 0 ? amt.toLocaleString('en-ET', {minimumFractionDigits: 2}) : ''}</td>
      <td>${row.term || ''}</td>
      <td>${row.loan_period || ''}</td>
      <td>${row.repayment_term || ''}</td>
      <td>${row.frequency || ''}</td>
      <td>${row.interest_rate || ''}</td>
      <td>${row.penalty_rate || ''}</td>
      <td>${row.total_savings || ''}</td>
    `;

    tr.addEventListener('click', () => loadRowToForm(idx));
    tbody.appendChild(tr);
  });

  if (tfoot) {
    tfoot.style.display = '';
    const totalEl = document.getElementById('gridTotalAmount');
    if (totalEl) totalEl.textContent = totalAmount.toLocaleString('en-ET', {minimumFractionDigits: 2});
  }

  if (_selectedIdx >= 0) highlightRow(_selectedIdx);
  updateBatchCounter();
  updateBatchTotal();
}

function validateIntegerFields(row) {
  const checks = [
    { key: 'repayment_term', label: 'Repayment Term' },
    { key: 'loan_level', label: 'Loan Level' },
    { key: 'loan_cycle', label: 'Loan Cycle' },
  ];
  for (const { key, label } of checks) {
    const raw = row[key];
    if (raw === '' || raw === null || raw === undefined) continue;
    const n = Number(raw);
    if (!Number.isInteger(n)) {
      return `${label} must be a whole number (got "${raw}") — decimals aren't accepted here.`;
    }
  }
  return null;
}

/* ── Action Row Buttons ─────────────────────────────────── */

document.getElementById('btnGroupUpdate')?.addEventListener('click', () => {
  const row = getCurrentFormRow();
  if (!row.client_id) {
    toast('Enter a Client ID before adding to the batch.', 'warning');
    document.getElementById('groupClientId')?.focus();
    return;
  }
  const validationError = validateIntegerFields(row);
  if (validationError) {
    toast(validationError, 'error', 5000);
    return;
  }
  _gridRows.push(row);
  _selectedIdx = _gridRows.length - 1;
  renderGrid();
  toast(`Member ${row.client_id} added — ${_gridRows.length} member(s) in batch.`);
});

document.getElementById('btnGroupAlter')?.addEventListener('click', () => {
  if (_selectedIdx < 0 || _selectedIdx >= _gridRows.length) {
    toast('Click a row in the grid first to select it, then use Update Selected Row.', 'warning');
    return;
  }
  const updatedRow = getCurrentFormRow();
  const validationError = validateIntegerFields(updatedRow);
  if (validationError) {
    toast(validationError, 'error', 5000);
    return;
  }
  _gridRows[_selectedIdx] = updatedRow;
  renderGrid();
  toast(`Row ${_selectedIdx + 1} updated.`);
});

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

document.getElementById('btnGroupClear')?.addEventListener('click', () => {
  [
    'groupClientId', 'groupClientName', 'groupRepaymentAccId',
    'groupLoanAmount', 'groupLoanLevel', 'groupLoanCycle',
    'groupTerm', 'groupLoanPeriod', 'groupRepaymentTerm',
    'groupInterestRate', 'groupPenaltyRate', 'groupTotalSavings',
  ].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

  const freqEl = document.getElementById('groupFrequency');
  if (freqEl) freqEl.value = 'Monthly';

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

  ['btnGroupUpdate','btnGroupAlter','btnGroupRemove','btnGroupClear'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = !isEdit;
  });

  const btnSave = document.getElementById('btnGlobalSave');
  const btnCancel = document.getElementById('btnGlobalCancel');
  const btnAdd = document.getElementById('btnGlobalAdd');
  const btnEdit = document.getElementById('btnGlobalEdit');
  const btnClose = document.getElementById('btnGlobalClose');
  const btnDelete = document.getElementById('btnGlobalDelete');
  if (btnSave) btnSave.disabled = !isEdit;
  if (btnCancel) btnCancel.disabled = !isEdit;
  if (btnAdd) btnAdd.disabled = isEdit;
  if (btnEdit) btnEdit.disabled = isEdit;
  if (btnDelete) btnDelete.disabled = !isEdit;
  if (btnClose) btnClose.disabled = isEdit;

  const sb = document.getElementById('statusBar');
  if (sb) sb.textContent = `Mode: ${mode.charAt(0).toUpperCase() + mode.slice(1)} — Ready`;
}

/* ── Save Batch ──────────────────────────────────────────── */
async function saveBatch() {
  if (_gridRows.length === 0) {
    toast('Add at least one member row before saving.', 'warning');
    return;
  }

  /* Double-post guard */
  if (_batchSaveInFlight) { console.warn('Batch save already in progress.'); return; }
  _batchSaveInFlight = true;
  const saveBtn = document.getElementById('btnGlobalSave');
  if (saveBtn) saveBtn.disabled = true;

  try {
    const g = id => document.getElementById(id)?.value || '';
    const branchId = g('groupBranchId');
    const disbursDate = g('groupDisbursementDate');
    const modeOfDisb = g('groupModeOfDisbursement');
    const fileNumber = g('groupFileNumber');
    const fundId = g('groupFundId');
    const loanPurpose = g('groupLoanPurpose');
    const productId = g('groupProductId');
    const currencyId = g('groupCurrencyId') || 'ETB';
    const creditOfficer = g('groupCreditOfficer');
    const centerId = g('groupCenterId');
    const lineOfBiz = g('groupLineOfBusiness');
    const groupClass = g('groupGroupClass');
    const gracePeriod = g('groupGracePeriod');
    const repaymentAccId = g('groupRepaymentAccId');
    const existingGroupId = g('groupRegistryId');
    const newGroupName = g('groupNewName');
    const newGroupLimit = g('groupNewLimit');
    const subGroupId = g('groupSubGroupId');

    if (!branchId) { toast('Branch is required.', 'warning'); document.getElementById('groupBranchId')?.focus(); return; }
    if (!productId) { toast('Product is required.', 'warning'); document.getElementById('groupProductId')?.focus(); return; }
    if (!repaymentAccId) { toast('Repayment Acc ID is required.', 'warning'); document.getElementById('groupRepaymentAccId')?.focus(); return; }
    if (!existingGroupId && !newGroupName) {
      toast('Select an existing group, or enter a name to create a new one.', 'warning');
      return;
    }

    /* Pre-validate all rows with specific errors */
    const members = [];
    const errors = [];
    for (let i = 0; i < _gridRows.length; i++) {
      const row = _gridRows[i];
      if (!row.client_id) { errors.push(`Row ${i + 1}: Missing Client ID`); continue; }
      if (!row.loan_amount || parseFloat(row.loan_amount) <= 0) { errors.push(`Row ${i + 1} (${row.client_id}): Loan amount must be > 0`); continue; }
      if (!row.term || parseInt(row.term) <= 0) { errors.push(`Row ${i + 1} (${row.client_id}): Term must be > 0`); continue; }
      if (!row.interest_rate || parseFloat(row.interest_rate) <= 0) { errors.push(`Row ${i + 1} (${row.client_id}): Interest rate must be > 0`); continue; }

      const intErr = validateIntegerFields(row);
      if (intErr) { errors.push(`Row ${i + 1} (${row.client_id}): ${intErr}`); continue; }

      members.push({
        client_id: row.client_id,
        client_name: row.client_name,
        loan_amount: parseFloat(row.loan_amount),
        term: parseInt(row.term),
        repayment_term: row.repayment_term || null,
        loan_cycle: row.loan_cycle || 1,
        loan_level: row.loan_level || 1,
        frequency: row.frequency || 'Monthly',
        interest_rate: parseFloat(row.interest_rate),
        penalty_rate: row.penalty_rate || null
      });
    }

    if (errors.length > 0) {
      toast(`Validation failed:\n${errors.slice(0, 3).join('\n')}${errors.length > 3 ? '\n...and ' + (errors.length - 3) + ' more' : ''}`, 'error', 8000);
      return;
    }

    if (members.length === 0) {
      toast('No valid member rows to save.', 'error');
      return;
    }

    /* Client-side limit check */
    const batchTotal = members.reduce((s, m) => s + m.loan_amount, 0);
    if (existingGroupId) {
      const sel = document.getElementById('groupRegistryId');
      const opt = sel?.selectedOptions?.[0];
      if (opt) {
        const match = opt.textContent.match(/limit: ([\d,]+)/);
        const limit = match ? parseFloat(match[1].replace(/,/g, '')) : 0;
        if (batchTotal > limit) {
          if (!confirm(`⚠ WARNING: Batch total (${batchTotal.toLocaleString()} ETB) exceeds group limit (${limit.toLocaleString()} ETB).\n\nThe server will reject this. Continue anyway?`)) {
            toast('Save cancelled.', 'info');
            return;
          }
        }
      }
    }

    /* Confirmation modal */
    if (!confirm(
      `Create group loan batch?\n\n` +
      `Members: ${members.length}\n` +
      `Total Amount: ${batchTotal.toLocaleString('en-ET', {minimumFractionDigits: 2})} ETB\n` +
      `Group: ${existingGroupId || newGroupName}\n` +
      `Product: ${productId}\n\n` +
      `This will create ${members.length} loan application records.`
    )) {
      toast('Batch creation cancelled.', 'info');
      return;
    }

    const sb = document.getElementById('statusBar');
    if (sb) sb.textContent = 'Checking group limit and saving batch…';

    const result = await sbRpc('create_group_loan_batch', {
      p_branch_id: branchId,
      p_product_id: productId,
      p_repayment_account_id: repaymentAccId,
      p_members: members,
      p_group_registry_id: existingGroupId || null,
      p_new_group_name: existingGroupId ? null : newGroupName,
      p_new_group_collective_limit: existingGroupId ? null : (parseFloat(newGroupLimit) || null),
      p_center_id: centerId || null,
      p_fund_id: fundId || null,
      p_loan_purpose: loanPurpose || null,
      p_line_of_business: lineOfBiz || null,
      p_credit_officer_id: creditOfficer || null,
      p_file_number: fileNumber || null,
      p_currency_id: currencyId,
      p_group_class: groupClass || null,
      p_mode_of_disbursement: modeOfDisb || 'Transfer',
      p_disbursement_date: disbursDate || null,
      p_grace_period: gracePeriod || null,
      p_sub_group_id: subGroupId || null
    });

    toast(
      `Saved ${result.members_saved} member loan(s) under group ${result.group_registry_id}. ` +
      `Group exposure now ${result.new_total_exposure.toLocaleString()} / ${result.collective_limit.toLocaleString()} ETB limit.`,
      'success', 7000
    );
    if (sb) sb.textContent = `Saved ${result.members_saved} / ${_gridRows.length} rows under ${result.group_registry_id}.`;

    /* Clear grid after successful save */
    _gridRows = [];
    _selectedIdx = -1;
    renderGrid();
    setMode('view');

  } catch (e) {
    toast('Batch save failed: ' + e.message, 'error', 8000);
    const sb = document.getElementById('statusBar');
    if (sb) sb.textContent = 'Batch save failed — nothing was written.';
  } finally {
    _batchSaveInFlight = false;
    if (saveBtn) saveBtn.disabled = false;
  }
}

/* ── Global Toolbar ─────────────────────────────────────── */
document.getElementById('btnGlobalView')?.addEventListener('click', () => {
  toast('View mode — click a grid row to load a member record.');
});
document.getElementById('btnGlobalAdd')?.addEventListener('click', () => {
  _gridRows = [];
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
  _gridRows = [];
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
const wcMinimizeBtn = document.getElementById('wcMinimize');
const wcMaximizeBtn = document.getElementById('wcMaximize');
const dockSliver = document.getElementById('dockSliver');

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
