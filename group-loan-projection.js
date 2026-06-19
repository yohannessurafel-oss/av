/* ═══════════════════════════════════════════════════════════
   Africa Village Microfinance — Group Loan Projection
   group-loan-projection.js  v2.2
═══════════════════════════════════════════════════════════ */

'use strict';

const SUPABASE_URL      = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';

const TABLE_LOANS   = 'loanmasterrecords';
const TABLE_APPS    = 'loanapplications';
const TABLE_CLIENTS = 'ClientMasterRecords';

const COL = {
  application_id:    'application_id',
  branch_id:          'branch_id',
  group_id:           'group_id',
  sub_group_id:       'sub_group_id',
  client_id:          'client_id',
  client_name:        'client_name',
  product_id:         'product_id',
  repayment_acc_id:   'main_repayment_account_id',
  donor_id:           'donor_id',
  loan_purpose:       'loan_purpose',
  officer_id:         'credit_officer_id',
  applied_amount:     'applied_amount',
  term:               'term_months',
  interest_rate:      'interest_rate',
  file_number:        'file_number',
  app_date:           'application_date',
  disbursement_date:  'disbursement_date',
  line_of_business:   'line_of_business',
  currency_id:        'currency_id',
  app_status:         'application_status',
};

const toastEl = document.getElementById('toastNotification');
let _toastTimer = null;
function toast(msg, type = '', duration = 3200) {
  toastEl.textContent = msg;
  toastEl.className = `toast show ${type}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { toastEl.className = 'toast'; }, duration);
}

(function initDate() {
  const el = document.getElementById('systemDate');
  if (el) el.textContent = new Date().toLocaleDateString('en-ET', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
  });
})();

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

let _branchCache = [];

async function loadBranches() {
  const sel = document.getElementById('groupBranchId');
  if (sel) { sel.innerHTML = '<option value="">Loading branches…</option>'; sel.disabled = true; }
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/branchregistry?select=branch_id,branch_name&order=branch_id`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Accept': 'application/json' } }
    );
    if (!res.ok) { toast(`Branch list error ${res.status}`, 'error'); return; }
    const rows = await res.json();
    _branchCache = Array.isArray(rows) ? rows : [];
    const sel2 = document.getElementById('groupBranchId');
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
    const sel2 = document.getElementById('groupBranchId');
    if (sel2) { sel2.innerHTML = '<option value="">-- Select Branch --</option>'; sel2.disabled = false; }
  }
}

document.getElementById('groupBranchId')?.addEventListener('change', function () {
  const nameEl = document.getElementById('groupBranchName');
  const chosen = _branchCache.find(b => b.branch_id === this.value);
  if (nameEl) nameEl.value = chosen ? (chosen.branch_name || '') : '';
});

/* ── Client Name Auto-Fill — same logic as Loan Application's
   fClientId blur handler, looking up ClientMasterRecords by client_id ── */
document.getElementById('groupClientId')?.addEventListener('blur', async function () {
  const val = this.value.trim();
  const nameEl = document.getElementById('groupClientName');
  if (!val) { if (nameEl) nameEl.value = ''; return; }
  try {
    const rows = await sbFetch(`${TABLE_CLIENTS}?client_id=eq.${encodeURIComponent(val)}&select=client_name&limit=1`);
    if (nameEl) nameEl.value = (rows && rows[0]) ? (rows[0].client_name || '') : '';
    if (nameEl && !nameEl.value) toast('Client ID not found in registry.', 'warning');
  } catch (e) {
    if (nameEl) nameEl.value = '';
  }
});

let currentMode   = 'view';
let currentRecord = null;

function setMode(mode) {
  currentMode = mode;
  const isEdit = mode === 'edit' || mode === 'add';
  const view = document.querySelector('.module-view.active');
  if (view) {
    view.querySelectorAll('input:not([readonly]), select, textarea').forEach(el => {
      if (el.dataset.alwaysEnabled !== undefined || el.id === 'groupBranchId') { el.disabled = false; return; }
      el.disabled = !isEdit;
    });
  }
  document.querySelectorAll('input[readonly]').forEach(el => el.disabled = false);
  document.getElementById('groupBranchId').disabled = false;

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
  if (sb) sb.textContent =
    `Mode: ${mode.charAt(0).toUpperCase() + mode.slice(1)}${currentRecord ? ` — ${currentRecord[COL.application_id] || ''}` : ''}`;
}

function clearGroupForm() {
  const ids = [
    'groupCenterId','groupSchemeId','groupDisbursementDate','groupModeOfDisbursement',
    'groupFileNumber','groupFundId','groupLoanPurpose','groupClientId','groupClientName',
    'groupRepaymentAccId','groupLoanAmount','groupLoanLevel','groupTerm','groupInterestRate',
    'groupLoanPeriod','groupAdvanceType','groupCreditOfficer','groupProductId',
    'groupLineOfBusiness','groupLoanCycle','groupGroupClass','groupRepaymentTerm','groupGracePeriod'
  ];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const curr = document.getElementById('groupCurrencyId');
  if (curr) curr.value = 'ETB';
  currentRecord = null;
}

/* Only fields with a confirmed matching column in loanmasterrecords are
   sent to Supabase. Mode Of Disbursement, Loan Level, Loan Period,
   Advance Type, Loan Cycle, Group Class, Repayment Term and Grace Period
   don't have a confirmed column yet, so they're captured for the on-screen
   grid only and are NOT written to the database. */
function collectForm() {
  const g  = id => { const el = document.getElementById(id); return el ? (el.value.trim() || null) : null; };
  const gN = id => { const v = g(id); return v != null ? Number(v) : null; };

  return {
    [COL.branch_id]:         g('groupBranchId'),
    [COL.group_id]:          g('groupCenterId'),
    [COL.sub_group_id]:      g('groupSchemeId'),
    [COL.client_id]:         g('groupClientId'),
    [COL.client_name]:       g('groupClientName'),
    [COL.product_id]:        g('groupProductId'),
    [COL.repayment_acc_id]:  g('groupRepaymentAccId'),
    [COL.donor_id]:          g('groupFundId'),
    [COL.loan_purpose]:      g('groupLoanPurpose'),
    [COL.officer_id]:        g('groupCreditOfficer'),
    [COL.applied_amount]:    gN('groupLoanAmount'),
    [COL.term]:              gN('groupTerm'),
    [COL.interest_rate]:     gN('groupInterestRate'),
    [COL.file_number]:       g('groupFileNumber'),
    [COL.app_date]:          new Date().toISOString().split('T')[0],
    [COL.disbursement_date]: g('groupDisbursementDate'),
    [COL.line_of_business]:  g('groupLineOfBusiness'),
    [COL.currency_id]:       g('groupCurrencyId') || 'ETB',
    [COL.app_status]:        'DataEntry',
    _modeOfDisbursement: g('groupModeOfDisbursement'),
    _loanLevel:          g('groupLoanLevel'),
    _loanPeriod:         g('groupLoanPeriod'),
    _advanceType:        g('groupAdvanceType'),
    _loanCycle:          g('groupLoanCycle'),
    _groupClass:         g('groupGroupClass'),
    _repaymentTerm:      g('groupRepaymentTerm'),
    _gracePeriod:        g('groupGracePeriod'),
  };
}

function validateGroupLoan(payload) {
  const checks = [
    [payload[COL.branch_id],         'Branch ID is required.'],
    [payload[COL.group_id],          'Center ID is required.'],
    [payload[COL.sub_group_id],      'Scheme ID is required.'],
    [payload[COL.disbursement_date], 'Disbursement Date is required.'],
    [payload._modeOfDisbursement,    'Mode Of Disbursement is required.'],
    [payload[COL.loan_purpose],      'Loan Purpose is required.'],
    [payload[COL.line_of_business],  'Line Of Business is required.'],
    [payload[COL.client_id],         'Client ID is required.'],
    [payload[COL.applied_amount],    'Loan Amount is required.'],
    [payload[COL.term],              'Term is required.'],
  ];
  for (const [val, msg] of checks) {
    if (val === null || val === undefined || val === '') { toast(msg, 'warning'); return false; }
  }
  return true;
}

/* This page has no Application ID field of its own — Center Loan
   Application identifies each member by Center + Client instead. */
function generateApplicationId(payload) {
  const center = (payload[COL.group_id]  || 'GRP').toString().trim().toUpperCase().replace(/\s+/g, '');
  const client = (payload[COL.client_id] || 'CL').toString().trim().toUpperCase().replace(/\s+/g, '');
  return `${center}-${client}`;
}

function showGroupSaveConfirmation(payload, onConfirm) {
  document.getElementById('saveConfirmOverlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'saveConfirmOverlay';
  overlay.style.cssText = `
    position:fixed;top:0;left:0;width:100%;height:100%;
    background:rgba(10,20,40,0.55);z-index:9000;
    display:flex;align-items:center;justify-content:center;`;

  const clientLabel = payload[COL.client_name]
    ? `${payload[COL.client_id]} (${payload[COL.client_name]})`
    : payload[COL.client_id];

  overlay.innerHTML = `
    <div style="
      background:#fff;border-radius:6px;
      box-shadow:0 8px 32px rgba(0,0,0,0.28);
      width:420px;max-width:96vw;font-family:'Segoe UI',Inter,sans-serif;font-size:13px;overflow:hidden;">
      <div style="background:#1b5199;color:#fff;padding:10px 16px;display:flex;align-items:center;gap:8px;">
        <span style="font-size:15px;">👥</span>
        <span style="font-weight:700;letter-spacing:.03em;">Confirm Group Loan Application</span>
      </div>
      <div style="padding:18px 16px 6px;color:#1a2a35;">
        <p style="margin:0 0 16px;">Do you wish to create a loan application for client
          <strong>${clientLabel}</strong> under center
          <strong>${payload[COL.group_id]}</strong>?</p>
      </div>
      <div style="padding:0 16px 14px;display:flex;justify-content:flex-end;gap:8px;">
        <button id="groupConfirmNo"  style="padding:6px 20px;border:1px solid #ccd3da;background:#fff;border-radius:4px;font-size:13px;cursor:pointer;">No</button>
        <button id="groupConfirmYes" style="padding:6px 20px;background:#e69c24;border:1px solid #c07f12;color:#1b3a5c;border-radius:4px;font-size:13px;font-weight:700;cursor:pointer;">Yes</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  document.getElementById('groupConfirmNo').addEventListener('click', () => {
    overlay.remove();
    toast('Save cancelled.');
  });
  document.getElementById('groupConfirmYes').addEventListener('click', async () => {
    overlay.remove();
    await onConfirm();
  });
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

function showGroupSaveOkDialog(payload) {
  document.getElementById('saveOkOverlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'saveOkOverlay';
  overlay.style.cssText = `
    position:fixed;top:0;left:0;width:100%;height:100%;
    background:rgba(10,20,40,0.45);z-index:9100;
    display:flex;align-items:center;justify-content:center;`;
  overlay.innerHTML = `
    <div style="
      background:#fff;border-radius:6px;
      box-shadow:0 8px 32px rgba(0,0,0,0.22);
      width:340px;text-align:center;font-family:'Segoe UI',Inter,sans-serif;font-size:13px;overflow:hidden;">
      <div style="background:#27ae60;color:#fff;padding:10px 16px;font-weight:700;">✔ Application Saved Successfully</div>
      <div style="padding:20px 16px 10px;">
        <div style="font-size:22px;margin-bottom:8px;">✅</div>
        <p style="color:#1a2a35;margin:0 0 4px;">Loan application <strong>${payload[COL.application_id]}</strong></p>
        <p style="color:#6b7f8b;margin:0 0 16px;font-size:11px;">has been saved with status <strong>DataEntry</strong>.</p>
        <button id="groupSaveOkBtn" style="padding:7px 30px;background:#1b5199;color:#fff;border:none;border-radius:4px;font-size:13px;font-weight:700;cursor:pointer;">OK</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.getElementById('groupSaveOkBtn').addEventListener('click', () => overlay.remove());
  setTimeout(() => overlay?.remove(), 8000);
}

function addGridRow(payload) {
  const body = document.getElementById('groupLoanGridBody');
  if (!body) return;
  document.getElementById('groupLoanGridEmptyRow')?.remove();
  const tr = document.createElement('tr');
  const cell = v => `<td>${v != null && v !== '' ? v : '—'}</td>`;
  tr.innerHTML =
    cell(payload[COL.group_id]) + cell(payload[COL.client_id]) + cell(payload[COL.client_name]) +
    cell(payload._loanCycle) + cell(payload._loanLevel) +
    cell(payload[COL.applied_amount] != null ? Number(payload[COL.applied_amount]).toLocaleString('en-ET') : '') +
    cell(payload[COL.term]) + cell(payload._loanPeriod) + cell(payload._repaymentTerm) +
    cell('—') + cell(payload[COL.interest_rate]) + cell('—') + cell('—');
  body.appendChild(tr);
}

async function commitGroupSave(payload) {
  try {
    toast('Processing…', 'info');

    const parentPayload = {
      application_id:     payload[COL.application_id],
      application_date:   payload[COL.app_date],
      branch_id:           payload[COL.branch_id],
      group_id:            payload[COL.group_id],
      sub_group_id:        payload[COL.sub_group_id],
      application_status:  payload[COL.app_status],
    };
    await sbFetch(TABLE_APPS, {
      method: 'POST',
      body:   JSON.stringify(parentPayload),
      prefer: 'resolution=merge-duplicates,return=minimal'
    });

    const childPayload = { ...payload };
    Object.keys(childPayload).forEach(k => { if (k.startsWith('_')) delete childPayload[k]; });

    const responseData = await sbFetch(TABLE_LOANS, {
      method: 'POST',
      body:   JSON.stringify(childPayload),
      prefer: 'return=representation'
    });
    currentRecord = Array.isArray(responseData) ? responseData[0] : childPayload;

    addGridRow(payload);
    setMode('view');
    toast('✔ Group loan application saved successfully.', 'success');
    showGroupSaveOkDialog(payload);

  } catch (e) {
    console.error('commitGroupSave error:', e);
    toast(`Save failed: ${e.message}`, 'error');
  }
}

document.getElementById('btnGlobalView')?.addEventListener('click', () => {
  toast('View not yet implemented for this module.', 'warning');
});

document.getElementById('btnGlobalAdd')?.addEventListener('click', () => {
  if (!document.getElementById('groupBranchId').value) {
    toast('Select a Branch ID first.', 'warning');
    return;
  }
  clearGroupForm();
  setMode('add');
  document.getElementById('groupCenterId')?.focus();
  toast('Add mode — enter the group loan details, then Save.');
});

document.getElementById('btnGlobalEdit')?.addEventListener('click', () => {
  setMode('edit');
  toast('Edit mode — make changes then Save.');
});

document.getElementById('btnGlobalSave')?.addEventListener('click', () => {
  const payload = collectForm();
  if (!validateGroupLoan(payload)) return;
  payload[COL.application_id] = generateApplicationId(payload);

  showGroupSaveConfirmation(payload, async () => {
    await commitGroupSave(payload);
  });
});

document.getElementById('btnGlobalCancel')?.addEventListener('click', () => {
  setMode('view');
  toast('Changes discarded.');
});
document.getElementById('btnGlobalClose')?.addEventListener('click', () => {
  setMode('view');
  toast('Record closed.');
});
document.getElementById('btnGlobalDelete')?.addEventListener('click', () => {
  toast('Delete not yet implemented for this module.', 'warning');
});
document.getElementById('btnGlobalPrint')?.addEventListener('click', () => window.print());

document.getElementById('btnGroupClear')?.addEventListener('click', () => {
  clearGroupForm();
  toast('Form cleared.');
});
document.getElementById('btnGroupUpdate')?.addEventListener('click', () => {
  document.getElementById('btnGlobalSave')?.click();
});
document.getElementById('btnGroupAlter')?.addEventListener('click', () => {
  toast("Alter: select a saved record first (loading saved records isn't available yet).", 'warning');
});

async function init() {
  setMode('view');
  await loadBranches();
}
init();
