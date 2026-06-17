/* ═══════════════════════════════════════════════════════════
   Africa Village Microfinance — Credit Lifecycle System
   script2.js  v2.0
   Supabase CRUD · Toast Notifications · Live Calculations
═══════════════════════════════════════════════════════════ */

'use strict';

/* ── Supabase Config ───────────────────────────────────── */
const SUPABASE_URL      = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';

// FIX 8/16: DB table names are snake_case — define once at top scope
const TABLE_LOANS    = 'loanmasterrecords';
const TABLE_BRANCHES = 'branchregistry';
const TABLE_CLIENTS  = '"ClientMasterRecords"';

/* ── State ─────────────────────────────────────────────── */
// FIX 3: removed duplicate declarations of currentRecord and workspaceMode
let currentMode   = 'view';  // 'view' | 'add' | 'edit'
let currentRecord = null;
let currentModule = 'loan-app';
let viewModalData = [];

/* ── HTTP Helper ────────────────────────────────────────── */
async function sbFetch(path, opts = {}) {
  // FIX 1: SUPA_URL and SUPA_KEY were never declared — use the correct constants
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
  return res.status === 204 ? null : res.json();
}

/* ── Column Map (loanmasterrecords — snake_case to match DB) ── */
// FIX 2: was PascalCase (ApplicationId etc) — DB uses snake_case
const COL = {
  application_id:   'application_id',
  branch_id:        'branch_id',
  center_id:        'center_id',
  group_id:         'group_id',
  sub_group_id:     'sub_group_id',
  client_id:        'client_id',
  client_name:      'client_name',
  product_id:       'product_id',
  repayment_acc_id: 'main_repayment_account_id',
  donor_id:         'donor_id',
  loan_purpose:     'loan_purpose',
  officer_id:       'credit_officer_id',
  applied_amount:   'applied_amount',
  term:             'term_months',
  interest_rate:    'interest_rate',
  tax_rate:         'tax_rate',
  commission_rate:  'commission_rate',
  effective_rate:   'effective_rate',
  spread:           'spread',
  file_number:      'file_number',
  sales_officer:    'sales_officer',
  app_date:         'application_date',
  disbursement_date:'disbursement_date',
  line_of_business: 'line_of_business',
  currency_id:      'currency_id',
  app_status:       'application_status',
};

/* ── Toast ─────────────────────────────────────────────── */
const toastEl = document.getElementById('toastNotification');
let _toastTimer = null;
function toast(msg, type = '', duration = 3200) {
  toastEl.textContent = msg;
  toastEl.className = `toast show ${type}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    toastEl.className = 'toast';
  }, duration);
}

/* ── System Date ───────────────────────────────────────── */
(function initDate() {
  const el = document.getElementById('systemDate');
  if (el) el.textContent = new Date().toLocaleDateString('en-ET', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
  });
})();

/* ── Module Navigation ─────────────────────────────────── */
document.getElementById('globalModuleRouter').addEventListener('click', e => {
  const li = e.target.closest('li[data-module]');
  if (!li) return;
  const mod = li.dataset.module;

  document.querySelectorAll('#globalModuleRouter li').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.module-view').forEach(el => el.classList.remove('active'));

  li.classList.add('active');
  const target = document.getElementById(`view-${mod}`);
  if (target) target.classList.add('active');
  currentModule = mod;

  setMode('view');
  // FIX 4: statusBar id does not exist — correct id is in the active module view
  const sb = document.getElementById('statusBar');
  if (sb) sb.textContent = `Module: ${li.querySelector('.nav-label').textContent} — Ready`;
});

/* ── Sub-Tab Navigation ────────────────────────────────── */
document.querySelectorAll('.sub-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const container = tab.closest('.module-view');
    container.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
    container.querySelectorAll('.sub-tab-view').forEach(v => v.classList.remove('active'));
    tab.classList.add('active');
    const target = container.querySelector(`#subview-${tab.dataset.target}`);
    if (target) target.classList.add('active');
  });
});








// FIX 5: setWorkspaceMode() removed — it used '.loan-form-input' selector which
// matches nothing in the HTML. All mode control goes through setMode() below.


/* ── Branch Dropdown ───────────────────────────────────── */
async function loadBranches() {
  const sel = document.getElementById('loanBranchId');
  if (!sel) return;
  try {
    // FIX 7: table is branchregistry (snake_case), columns are branch_id/branch_name
    const rows = await sbFetch(TABLE_BRANCHES + '?select=branch_id,branch_name&order=branch_id');
    sel.innerHTML = '<option value="">--</option>';
    (rows || []).forEach(r => {
      const o = document.createElement('option');
      o.value = r.branch_id;
      o.textContent = r.branch_id;
      sel._branchData = rows; // cache for name lookup
      sel.appendChild(o);
    });
  } catch {
    sel.innerHTML = '<option value="1001">1001</option>';
  }
}

document.getElementById('loanBranchId')?.addEventListener('change', function () {
  const nameEl = document.getElementById('loanBranchName');
  // FIX 7: use cached branch data instead of a second API call
  const chosen = (this._branchData || []).find(b => b.branch_id === this.value);
  nameEl.value = chosen ? chosen.branch_name : '';
});

/* ── Client Name Auto-Fill ─────────────────────────────── */
document.getElementById('fClientId')?.addEventListener('blur', async function () {
  const val = this.value.trim();
  const nameEl = document.getElementById('fClientName');
  if (!val) { nameEl.value = ''; return; }
  try {
    const rows = await sbFetch(`${TABLE_CLIENTS}?client_id=eq.${encodeURIComponent(val)}&select=client_name&limit=1`);
    nameEl.value = (rows && rows[0]) ? (rows[0].client_name || '') : '';
    if (!nameEl.value) toast('Client ID not found in registry.', 'warning');
  } catch { nameEl.value = ''; }
});

/* ── Live Loan Summary Calculator ──────────────────────── */
function calcLoanSummary() {
  const P  = parseFloat(document.getElementById('fLoanAmount')?.value) || 0;
  const r  = (parseFloat(document.getElementById('fInterestRate')?.value) || 0) / 100 / 12;
  const n  = parseInt(document.getElementById('fTerm')?.value) || 0;

  let installment = 0, totalRepay = 0, totalInterest = 0;
  if (P > 0 && n > 0) {
    if (r === 0) {
      installment = P / n;
    } else {
      installment = P * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    }
    totalRepay    = installment * n;
    totalInterest = totalRepay - P;
  }

  const annualRate = parseFloat(document.getElementById('fInterestRate')?.value) || 0;
  const EAR = r > 0 ? ((Math.pow(1 + r, 12) - 1) * 100) : annualRate;

  const fmt = v => 'ETB ' + v.toLocaleString('en-ET', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  document.getElementById('lscInstallment').textContent = fmt(installment);
  document.getElementById('lscTotal').textContent       = fmt(totalRepay);
  document.getElementById('lscInterest').textContent    = fmt(totalInterest);
  document.getElementById('lscEAR').textContent         = EAR.toFixed(2) + '%';
}

['fLoanAmount','fInterestRate','fTerm'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', calcLoanSummary);
});
calcLoanSummary();

/* ── Form Mode Control ─────────────────────────────────── */
function getActiveFormInputs() {
  const view = document.querySelector('.module-view.active');
  return view ? view.querySelectorAll('input:not([readonly]), select, textarea') : [];
}

function setMode(mode) {
  currentMode = mode;
  const isEdit = mode === 'edit' || mode === 'add';

  getActiveFormInputs().forEach(el => {
    if (el.dataset.alwaysRo !== undefined) return;
    el.disabled = !isEdit;
  });

  // Always keep readonly inputs truly readonly
  document.querySelectorAll('input[readonly]').forEach(el => el.disabled = false);

  const btnSave   = document.getElementById('btnGlobalSave');
  const btnEdit   = document.getElementById('btnGlobalEdit');
  const btnAdd    = document.getElementById('btnGlobalAdd');
  const btnCancel = document.getElementById('btnGlobalCancel');
  const btnClose  = document.getElementById('btnGlobalClose');
  // FIX 6: btnGlobalDelete and btnGlobalPrint don't exist in HTML — guarded with ?.
  const btnDelete = document.getElementById('btnGlobalDelete');

  if (btnSave)   btnSave.disabled   = !isEdit;
  if (btnCancel) btnCancel.disabled = !isEdit;
  if (btnAdd)    btnAdd.disabled    = isEdit;
  if (btnEdit)   btnEdit.disabled   = isEdit || !currentRecord;
  if (btnDelete) btnDelete.disabled = !currentRecord || isEdit;
  if (btnClose)  btnClose.disabled  = isEdit;

  const sb = document.getElementById('statusBar');
  if (sb) sb.textContent =
    `Mode: ${mode.charAt(0).toUpperCase() + mode.slice(1)}${currentRecord ? ` — ${currentRecord[COL.application_id] || ''}` : ''}`;
}

/* ── Form Fill (Record → DOM) ──────────────────────────── */
function fillForm(rec) {
  if (!rec) return;
  const set = (id, key) => {
    const el = document.getElementById(id);
    if (el) el.value = rec[key] ?? '';
  };
  set('loanBranchId',       COL.branch_id);
  set('fGroupId',           COL.group_id);
  set('fSubGroupId',        COL.sub_group_id);
  set('fApplicationId',     COL.application_id);
  set('fClientId',          COL.client_id);
  set('fClientName',        COL.client_name);
  set('fProductId',         COL.product_id);
  set('fRepaymentAccId',    COL.repayment_acc_id);
  set('fDonorId',           COL.donor_id);
  set('fLoanPurpose',       COL.loan_purpose);
  set('fOfficerId',         COL.officer_id);
  set('fLoanAmount',        COL.applied_amount);
  set('fTerm',              COL.term);
  set('fCommissionRate',    COL.commission_rate);
  set('fEffectiveRate',     COL.effective_rate);
  set('fSpread',            COL.spread);
  set('fFileNumber',        COL.file_number);
  set('fSalesOfficer',      COL.sales_officer);
  set('fDate',              COL.app_date);
  set('fLineOfBusiness',    COL.line_of_business);
  set('fCurrencyId',        COL.currency_id);
  set('fInterestRate',      COL.interest_rate);
  set('fTaxRate',           COL.tax_rate);
  set('fDisbursementDate',  COL.disbursement_date);
  set('fApplicationStatus', COL.app_status);

  // Branch name fill
  const branchSel = document.getElementById('loanBranchId');
  if (branchSel) branchSel.dispatchEvent(new Event('change'));

  calcLoanSummary();
}

/* ── Form Collect (DOM → payload) ─────────────────────── */
function collectForm() {
  const g = id => {
    const el = document.getElementById(id);
    return el ? (el.value.trim() || null) : null;
  };
  return {
    [COL.branch_id]:        g('loanBranchId'),
    [COL.group_id]:         g('fGroupId'),
    [COL.sub_group_id]:     g('fSubGroupId'),
    [COL.application_id]:   g('fApplicationId'),
    [COL.client_id]:        g('fClientId'),
    [COL.client_name]:      g('fClientName'),
    [COL.product_id]:       g('fProductId'),
    [COL.repayment_acc_id]: g('fRepaymentAccId'),
    [COL.donor_id]:         g('fDonorId'),
    [COL.loan_purpose]:     g('fLoanPurpose'),
    [COL.officer_id]:       g('fOfficerId'),
    [COL.applied_amount]:   g('fLoanAmount')     ? Number(g('fLoanAmount'))     : null,
    [COL.term]:             g('fTerm')           ? Number(g('fTerm'))           : null,
    [COL.interest_rate]:    g('fInterestRate')   ? Number(g('fInterestRate'))   : null,
    [COL.tax_rate]:         g('fTaxRate')        ? Number(g('fTaxRate'))        : null,
    [COL.commission_rate]:  g('fCommissionRate') ? Number(g('fCommissionRate')) : null,
    [COL.effective_rate]:   g('fEffectiveRate')  ? Number(g('fEffectiveRate'))  : null,
    [COL.spread]:           g('fSpread'),
    [COL.file_number]:      g('fFileNumber'),
    [COL.sales_officer]:    g('fSalesOfficer'),
    [COL.app_date]:         g('fDate'),
    [COL.disbursement_date]:g('fDisbursementDate'),
    [COL.line_of_business]: g('fLineOfBusiness'),
    [COL.currency_id]:      g('fCurrencyId') || 'ETB',
    [COL.app_status]:       g('fApplicationStatus') || 'DataEntry',
  };
}

/* ── Clear Module 1 Form ───────────────────────────────── */
function clearLoanAppForm() {
  const ids = [
    'fGroupId','fSubGroupId','fApplicationId','fClientId','fClientName',
    'fProductId','fRepaymentAccId','fDonorId','fOfficerId','fLoanAmount',
    'fTerm','fCommissionRate','fEffectiveRate','fSpread','fFileNumber',
    'fSalesOfficer','fDate','fDisbursementDate','fInterestRate','fTaxRate'
  ];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const st = document.getElementById('fApplicationStatus');
  if (st) st.value = 'DataEntry';
  const cy = document.getElementById('fCurrencyId');
  if (cy) cy.value = 'ETB';
  document.querySelector('#tblClientResults tbody').innerHTML =
    '<tr><td colspan="5" class="text-center gray-text italic">No records to display.</td></tr>';
  calcLoanSummary();
}

/* ── Validation ────────────────────────────────────────── */
function validateLoanApp() {
  const required = [
    { id: 'fApplicationId',  label: 'Application ID' },
    { id: 'fClientId',       label: 'Client ID' },
    { id: 'fProductId',      label: 'Product ID' },
    { id: 'fRepaymentAccId', label: 'Repayment Account ID' },
    { id: 'fLoanAmount',     label: 'Loan Amount' },
    { id: 'fTerm',           label: 'Term (Months)' },
    { id: 'fInterestRate',   label: 'Interest Rate' },
  ];
  for (const { id, label } of required) {
    const el = document.getElementById(id);
    if (!el || !el.value.trim()) {
      toast(`⚠ ${label} is required.`, 'error');
      el?.focus();
      return false;
    }
  }
  const amt = parseFloat(document.getElementById('fLoanAmount').value);
  if (isNaN(amt) || amt <= 0) { toast('⚠ Loan Amount must be greater than 0.', 'error'); return false; }
  const rate = parseFloat(document.getElementById('fInterestRate').value);
  if (isNaN(rate) || rate <= 0) { toast('⚠ Interest Rate must be greater than 0.', 'error'); return false; }
  return true;
}

/* ── View Modal ────────────────────────────────────────── */
function buildViewModal(rows) {
  viewModalData = rows || [];
  const fmt = v => v != null ? Number(v).toLocaleString('en-ET', { minimumFractionDigits: 2 }) : '—';
  const statusColor = { DataEntry:'#ddeaf7', Approved:'#d4edda', Rejected:'#fde8e8', Disbursed:'#fff3cd', Closed:'#e2e3e5' };

  const rowsHtml = viewModalData.length
    ? viewModalData.map(r => `
        <tr data-appid="${r[COL.application_id]}" style="cursor:pointer;" class="modal-result-row">
          <td style="padding:4px 8px;font-weight:700;color:#0d3460;border-bottom:1px solid #cde0f0;">${r[COL.application_id] || '—'}</td>
          <td style="padding:4px 8px;border-bottom:1px solid #cde0f0;">${r[COL.client_id] || '—'}</td>
          <td style="padding:4px 8px;border-bottom:1px solid #cde0f0;">${r[COL.client_name] || '—'}</td>
          <td style="padding:4px 8px;border-bottom:1px solid #cde0f0;">${r[COL.branch_id] || '—'}</td>
          <td style="padding:4px 8px;border-bottom:1px solid #cde0f0;">
            <span style="background:${statusColor[r[COL.app_status]] || '#eef4fb'};padding:1px 7px;border-radius:10px;font-weight:700;">${r[COL.app_status] || '—'}</span>
          </td>
          <td style="padding:4px 8px;text-align:right;border-bottom:1px solid #cde0f0;">ETB ${fmt(r[COL.applied_amount])}</td>
        </tr>`).join('')
    : '<tr><td colspan="6" style="text-align:center;padding:14px;color:#667788;font-style:italic;">No records found.</td></tr>';

  const modal = document.getElementById('viewModal');
  modal.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <span class="modal-title">🔍 Loan Application Records — Select to Load</span>
        <button class="modal-close-btn" id="modalCloseBtn">✕</button>
      </div>
      <div class="modal-search-bar">
        <input type="text" id="modalSearchInput" placeholder="Search by Application ID, Client ID or Name…" style="flex:1;"/>
        <button id="modalSearchBtn">Search</button>
        <span style="color:#667788;font-size:10px;margin-left:6px;">${viewModalData.length} record(s)</span>
      </div>
      <div class="modal-body">
        <div style="overflow:auto;max-height:340px;">
          <table class="ledger-grid" id="modalTable">
            <thead>
              <tr>
                <th>Application ID</th><th>Client ID</th><th>Client Name</th>
                <th>Branch</th><th>Status</th><th class="text-right">Amount (ETB)</th>
              </tr>
            </thead>
            <tbody id="modalTableBody">${rowsHtml}</tbody>
          </table>
        </div>
      </div>
      <div class="modal-footer">
        <button class="modal-btn" id="modalCancelBtn">Cancel</button>
        <button class="modal-btn primary" id="modalSelectBtn">Select Record</button>
      </div>
    </div>`;

  modal.style.display = 'flex';
  let selectedAppId = null;

  // Row selection
  modal.querySelectorAll('.modal-result-row').forEach(row => {
    row.addEventListener('click', () => {
      modal.querySelectorAll('.modal-result-row').forEach(r => r.classList.remove('selected-row'));
      row.classList.add('selected-row');
      selectedAppId = row.dataset.appid;
    });
    row.addEventListener('dblclick', () => {
      selectedAppId = row.dataset.appid;
      loadSelectedRecord(selectedAppId);
    });
  });

  // Close
  const closeModal = () => { modal.style.display = 'none'; };
  document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
  document.getElementById('modalCancelBtn').addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

  // Select button
  document.getElementById('modalSelectBtn').addEventListener('click', () => {
    if (!selectedAppId) { toast('Select a record first.', 'warning'); return; }
    loadSelectedRecord(selectedAppId);
  });

  // Search filter
  const filterTable = (q) => {
    const lower = q.toLowerCase();
    modal.querySelectorAll('.modal-result-row').forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(lower) ? '' : 'none';
    });
  };
  document.getElementById('modalSearchBtn').addEventListener('click', () => {
    filterTable(document.getElementById('modalSearchInput').value.trim());
  });
  document.getElementById('modalSearchInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') filterTable(e.target.value.trim());
  });

  function loadSelectedRecord(appId) {
    const rec = viewModalData.find(r => r[COL.application_id] === appId);
    if (rec) {
      currentRecord = rec;
      fillForm(rec);
      setMode('view');
      closeModal();
      toast(`✔ Loaded: ${rec[COL.application_id]} — ${rec[COL.client_name] || ''}`, 'success');
    }
  }
}

/* ── Installment Schedule Generator ───────────────────── */
function generateSchedule(principal, annualRate, termMonths, startDate) {
  const tbody = document.querySelector('#installmentScheduleTable tbody');
  if (!tbody) return;
  if (!principal || !annualRate || !termMonths) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center gray-text italic">Enter loan details to generate schedule.</td></tr>';
    return;
  }

  const r = annualRate / 100 / 12;
  const n = termMonths;
  const emi = r === 0 ? principal / n : principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  const fmt = v => v.toLocaleString('en-ET', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  let balance = principal;
  let html = '';
  const base = startDate ? new Date(startDate) : new Date();

  for (let i = 1; i <= n; i++) {
    const dueDate = new Date(base);
    dueDate.setMonth(dueDate.getMonth() + i);
    const interest  = balance * r;
    const principalPmt = emi - interest;
    balance = Math.max(balance - principalPmt, 0);
    html += `<tr>
      <td style="text-align:center;">${i}</td>
      <td>${dueDate.toLocaleDateString('en-ET')}</td>
      <td style="text-align:right;">ETB ${fmt(emi)}</td>
      <td style="text-align:right;">ETB ${fmt(principalPmt)}</td>
      <td style="text-align:right;">ETB ${fmt(interest)}</td>
      <td style="text-align:right;">ETB ${fmt(balance)}</td>
    </tr>`;
  }
  tbody.innerHTML = html;
}

/* ══ TOOLBAR BUTTON HANDLERS ════════════════════════════ */

/* VIEW ─────────────────────────────────────────────────── */
document.getElementById('btnGlobalView').addEventListener('click', async () => {
  // FIX 9: removed malformed inner block with undefined selectedRecord reference
  if (currentModule !== 'loan-app') { toast('View records: switch to Loan Application module.', 'warning'); return; }
  try {
    toast('Loading records…');
    const rows = await sbFetch(
      `${TABLE_LOANS}?select=*&order=${COL.application_id}.desc&limit=200`
    );
    buildViewModal(rows);
  } catch (e) {
    toast(`Error loading records: ${e.message}`, 'error');
  }
});

/* ADD ──────────────────────────────────────────────────── */
document.getElementById('btnGlobalAdd').addEventListener('click', () => {
  currentRecord = null;
  clearLoanAppForm();
  setMode('add');
  // FIX 10: removed duplicate focus + setWorkspaceMode call
  document.getElementById('fApplicationId')?.focus();
  toast('New record — fill in the details and Save.');
});

/* EDIT ─────────────────────────────────────────────────── */
document.getElementById('btnGlobalEdit').addEventListener('click', () => {
  // FIX 11: was calling setWorkspaceMode (removed) and alert() — use setMode + toast
  if (!currentRecord) { toast('Load a record first before editing.', 'warning'); return; }
  setMode('edit');
  toast('Editing — make your changes then Save.');
});

/* SAVE ──────────────────────────────────────────────────── */
document.getElementById('btnGlobalSave').addEventListener('click', async () => {
  const payload = collectForm();
  if (!validateLoanApp()) return;

  const appId      = payload[COL.application_id];
  const branchId   = payload[COL.branch_id];
  const groupId    = payload[COL.group_id];
  const subGroupId = payload[COL.sub_group_id];
  const appDate    = payload[COL.app_date];
  const appStatus  = payload[COL.app_status] || 'DataEntry';

  try {
    toast('Processing…', 'info');

    if (currentMode === 'add') {

      // ── STEP 1: Insert parent row into loanapplications ──────────────
      // loanmasterrecords.application_id is a FK → loanapplications(application_id)
      // so the parent record MUST exist before the child insert.
      const parentPayload = {
        application_id:     appId,
        application_date:   appDate || new Date().toISOString().split('T')[0],
        branch_id:          branchId   || null,
        group_id:           groupId    || null,
        sub_group_id:       subGroupId || null,
        application_status: appStatus,
      };

      // Use upsert (POST with Prefer: resolution=merge-duplicates) so that
      // re-saving after a partial failure doesn't throw a duplicate PK error.
      await sbFetch('loanapplications', {
        method: 'POST',
        body:   JSON.stringify(parentPayload),
        headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' }
      });

      // ── STEP 2: Insert child row into loanmasterrecords ──────────────
      const responseData = await sbFetch(TABLE_LOANS, {
        method: 'POST',
        body:   JSON.stringify(payload),
        prefer: 'return=representation'
      });
      currentRecord = Array.isArray(responseData) ? responseData[0] : responseData;
      toast('✔ Record successfully created.', 'success');

    } else if (currentMode === 'edit') {
      const currentAppId = currentRecord[COL.application_id];
      if (!currentAppId) throw new Error('No active record identifier to modify.');

      // On edit — only loanmasterrecords needs updating (parent row already exists)
      const updatePayload = { ...payload };
      delete updatePayload[COL.application_id]; // never send PK in PATCH body

      // Also sync the status back to loanapplications
      await sbFetch(
        `loanapplications?application_id=eq.${encodeURIComponent(currentAppId)}`, {
        method: 'PATCH',
        body:   JSON.stringify({ application_status: appStatus }),
        prefer: 'return=minimal'
      });

      const responseData = await sbFetch(
        `${TABLE_LOANS}?${COL.application_id}=eq.${encodeURIComponent(currentAppId)}`, {
        method: 'PATCH',
        body:   JSON.stringify(updatePayload),
        prefer: 'return=representation'
      });
      currentRecord = Array.isArray(responseData) ? responseData[0] : currentRecord;
      toast('✔ Record successfully updated.', 'success');
    }

    if (currentRecord) fillForm(currentRecord);
    setMode('view');

  } catch (error) {
    console.error('Save error:', error);
    toast(`Save failed: ${error.message}`, 'error');
  }
});

// CLOSE
document.getElementById('btnGlobalClose').addEventListener('click', () => {
  // FIX 13: was calling setWorkspaceMode + clearFormFields (both undefined/removed)
  currentRecord = null;
  clearLoanAppForm();
  setMode('view');
  toast('Record closed.');
});


/* DELETE ────────────────────────────────────────────────── */
// FIX 14: btnGlobalDelete doesn't exist in HTML — guard with if block
const _delBtn = document.getElementById('btnGlobalDelete');
if (_delBtn) {
  _delBtn.addEventListener('click', async () => {
    if (!currentRecord) { toast('No record loaded.', 'warning'); return; }
    const appId = currentRecord[COL.application_id];
    if (!appId) { toast('Cannot delete — no Application ID.', 'error'); return; }
    if (!window.confirm(`Delete loan record ${appId}?\nThis action cannot be undone.`)) return;
    try {
      toast('Deleting…');
      await sbFetch(`${TABLE_LOANS}?${COL.application_id}=eq.${encodeURIComponent(appId)}`, {
        method: 'DELETE', prefer: 'return=minimal'
      });
      toast(`✔ Record ${appId} deleted.`, 'success');
      currentRecord = null;
      clearLoanAppForm();
      setMode('view');
    } catch (e) {
      toast(`Delete failed: ${e.message}`, 'error');
    }
  });
}

/* CANCEL ────────────────────────────────────────────────── */
document.getElementById('btnGlobalCancel').addEventListener('click', () => {
  if (currentRecord) fillForm(currentRecord);
  else clearLoanAppForm();
  setMode('view');
  toast('Changes discarded.');
});

/* PRINT ─────────────────────────────────────────────────── */
// FIX 15: btnGlobalPrint doesn't exist in HTML — guard with if block
const _printBtn = document.getElementById('btnGlobalPrint');
if (_printBtn) _printBtn.addEventListener('click', () => window.print());

/* ── Init ──────────────────────────────────────────────── */
async function init() {
  await loadBranches();
  setMode('view');
  // Default date
  const dateEl = document.getElementById('fDate');
  if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().split('T')[0];
}

init();
