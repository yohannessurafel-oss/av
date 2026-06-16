/* ═══════════════════════════════════════════════════════════
   Africa Village Microfinance — Credit Lifecycle System
   script2.js  v2.0
   Supabase CRUD · Toast Notifications · Live Calculations
═══════════════════════════════════════════════════════════ */

'use strict';

/* ── Supabase Config ───────────────────────────────────── */
const SUPABASE_URL      = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';

let currentRecord = null; // Holds the active record data
let workspaceMode = 'view'; // Modes: 'view', 'add', 'edit'


async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      'apikey':        SUPA_KEY,
      'Authorization': `Bearer ${SUPA_KEY}`,
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

/* ── Column Map (LoanMasterRecords) ────────────────────── */
const COL = {
  application_id:   'ApplicationId',
  branch_id:        'BranchId',
  client_id:        'ClientId',
  client_name:      'ClientName',
  product_id:       'ProductId',
  repayment_acc_id: 'RepaymentAccId',
  donor_id:         'DonorId',
  loan_purpose:     'LoanPurpose',
  officer_id:       'OfficerId',
  applied_amount:   'AppliedAmount',
  term:             'Term',
  interest_rate:    'InterestRate',
  tax_rate:         'TaxRate',
  commission_rate:  'CommissionRate',
  effective_rate:   'EffectiveRate',
  spread:           'Spread',
  file_number:      'FileNumber',
  sales_officer:    'SalesOfficer',
  app_date:         'AppDate',
  disbursement_date:'DisbursementDate',
  line_of_business: 'LineOfBusiness',
  currency_id:      'CurrencyId',
  app_status:       'AppStatus',
  group_id:         'GroupId',
  sub_group_id:     'SubGroupId',
};

/* ── State ─────────────────────────────────────────────── */
let currentMode   = 'view';  // 'view' | 'add' | 'edit'
let currentRecord = null;
let currentModule = 'loan-app';
let viewModalData = [];

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
  document.getElementById('statusBar').textContent = `Module: ${li.querySelector('.nav-label').textContent} — Ready`;
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








function setWorkspaceMode(mode) {
    workspaceMode = mode;
    const inputs = document.querySelectorAll('.loan-form-input'); // Adjust selector to your form inputs
    
    if (mode === 'view') {
        // Form is locked; Action buttons enabled; Save/Cancel disabled
        inputs.forEach(input => input.disabled = true);
        document.getElementById('btnGlobalView').disabled = false;
        document.getElementById('btnGlobalAdd').disabled = false;
        document.getElementById('btnGlobalEdit').disabled = (currentRecord === null); // Only edit if a record is loaded
        document.getElementById('btnGlobalClose').disabled = (currentRecord === null);
        document.getElementById('btnGlobalSave').disabled = true;
        document.getElementById('btnGlobalCancel').disabled = true;
    } else if (mode === 'add' || mode === 'edit') {
        // Form is unlocked; Action buttons disabled; Save/Cancel active
        inputs.forEach(input => input.disabled = false);
        document.getElementById('btnGlobalView').disabled = true;
        document.getElementById('btnGlobalAdd').disabled = true;
        document.getElementById('btnGlobalEdit').disabled = true;
        document.getElementById('btnGlobalClose').disabled = true;
        document.getElementById('btnGlobalSave').disabled = false;
        document.getElementById('btnGlobalCancel').disabled = false;
    }
}


function clearFormFields() {
    const form = document.getElementById('loanApplicationForm'); // Adjust to your form ID
    if (form) form.reset();
}


/* ── Branch Dropdown ───────────────────────────────────── */
async function loadBranches() {
  const sel = document.getElementById('loanBranchId');
  if (!sel) return;
  try {
    const rows = await sbFetch('BranchRegistry?select=BranchId,BranchName&order=BranchId');
    sel.innerHTML = '<option value="">--</option>';
    (rows || []).forEach(r => {
      const o = document.createElement('option');
      o.value = r.BranchId;
      o.textContent = r.BranchId;
      sel.appendChild(o);
    });
  } catch {
    sel.innerHTML = '<option value="1001">1001</option>';
  }
}

document.getElementById('loanBranchId')?.addEventListener('change', async function () {
  const nameEl = document.getElementById('loanBranchName');
  if (!this.value) { nameEl.value = ''; return; }
  try {
    const rows = await sbFetch(`BranchRegistry?BranchId=eq.${this.value}&select=BranchName&limit=1`);
    nameEl.value = (rows && rows[0]) ? rows[0].BranchName : '';
  } catch { nameEl.value = ''; }
});

/* ── Client Name Auto-Fill ─────────────────────────────── */
document.getElementById('fClientId')?.addEventListener('blur', async function () {
  const val = this.value.trim();
  const nameEl = document.getElementById('fClientName');
  if (!val) { nameEl.value = ''; return; }
  try {
    const rows = await sbFetch(`ClientMasterRecords?client_id=eq.${encodeURIComponent(val)}&select=client_name&limit=1`);
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
  const btnDelete = document.getElementById('btnGlobalDelete');
  const btnEdit   = document.getElementById('btnGlobalEdit');
  const btnAdd    = document.getElementById('btnGlobalAdd');
  const btnCancel = document.getElementById('btnGlobalCancel');

  btnSave.disabled   = !isEdit;
  btnCancel.disabled = !isEdit;
  btnAdd.disabled    = isEdit;
  btnEdit.disabled   = isEdit || !currentRecord;
  btnDelete.disabled = !currentRecord || isEdit;

  document.getElementById('statusBar').textContent =
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


   {
        if (selectedRecord) {
            currentRecord = selectedRecord;
            populateFormFields(currentRecord);
            setWorkspaceMode('view');
        }
    });

  if (currentModule !== 'loan-app') { toast('View records: switch to Loan Application module.', 'warning'); return; }
  try {
    toast('Loading records…');
    const rows = await sbFetch(
      `LoanMasterRecords?select=*&order=${COL.application_id}.desc&limit=200`
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
  document.getElementById('fApplicationId')?.focus();
  toast('New record — fill in the details and Save.');
   const firstInput = document.querySelector('.loan-form-input');
    if (firstInput) firstInput.focus();
});

/* EDIT ─────────────────────────────────────────────────── */
document.getElementById('btnGlobalEdit').addEventListener('click', () => {
if (!currentRecord) {
        alert("Please view and select a record first before trying to edit.");
        return;
    }
    setWorkspaceMode('edit');
});

/* SAVE ─────────────────────────────────────────────────── */
/* SAVE ──────────────────────────────────────────────────── */
document.getElementById('btnGlobalSave').addEventListener('click', async () => {
  // 1. Gather form payload parameters
  const payload = collectFormData();

  // 2. Client-side field validations before network transmission
  if (!payload[COL.application_id]) {
    toast('Application ID is a required field.', 'error');
    const appEl = document.getElementById('fApplicationId');
    if (appEl) appEl.focus();
    return;
  }
  
  if (!payload[COL.client_id]) {
    toast('Client ID is a required field.', 'error');
    const clientEl = document.getElementById('fClientId');
    if (clientEl) clientEl.focus();
    return;
  }

  try {
    toast('Processing transaction...', 'info');

    if (mode === 'add') {
      // Execute standard database insertion
      const responseData = await sbFetch('LoanMasterRecords', {
        method: 'POST',
        body: JSON.stringify(payload),
        prefer: 'return=representation'
      });
      
      // Update local state record references
      currentRecord = Array.isArray(responseData) ? responseData[0] : responseData;
      toast('✔ Record successfully created.', 'success');

    } else if (mode === 'edit') {
      // Enforce update payload targeting matching current primary identifier
      const currentAppId = currentRecord[COL.application_id];
      if (!currentAppId) {
        throw new Error('State reference exception: No active record identifier to modify.');
      }

      const responseData = await sbFetch(`LoanMasterRecords?${COL.application_id}=eq.${encodeURIComponent(currentAppId)}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
        prefer: 'return=representation'
      });

      // Update state matching the fresh modifications
      currentRecord = Array.isArray(responseData) ? responseData[0] : responseData;
      toast('✔ Record successfully modified.', 'success');
    }

    // 3. Post-Transaction Interface Reversion
    if (currentRecord) {
      fillForm(currentRecord); // Refresh form layouts with saved server entries
    }
    
    setMode('view'); // Lock inputs safely back to view-only mode
    
  } catch (error) {
    console.error('Database Mutation Failure:', error);
    toast(`Save Operation Failed: ${error.message}`, 'error');
  }
});

// CLOSE: Safely unloads the active record and clears the screen
document.getElementById('btnGlobalClose').addEventListener('click', () => {
    currentRecord = null;
    clearFormFields();
    setWorkspaceMode('view');
});


/* DELETE ────────────────────────────────────────────────── */
document.getElementById('btnGlobalDelete').addEventListener('click', async () => {
  if (!currentRecord) { toast('No record loaded.', 'warning'); return; }
  const appId = currentRecord[COL.application_id];
  if (!appId) { toast('Cannot delete — no Application ID.', 'error'); return; }

  // Confirm via modal-style inline confirm
  const confirmed = window.confirm(`Delete loan record ${appId}?\n\nThis action cannot be undone.`);
  if (!confirmed) return;

  try {
    toast('Deleting…');
    await sbFetch(`LoanMasterRecords?${COL.application_id}=eq.${encodeURIComponent(appId)}`, {
      method: 'DELETE',
      prefer: 'return=minimal'
    });
    toast(`✔ Record ${appId} deleted.`, 'success');
    currentRecord = null;
    clearLoanAppForm();
    setMode('view');
  } catch (e) {
    toast(`Delete failed: ${e.message}`, 'error');
  }
});

/* CANCEL ────────────────────────────────────────────────── */
document.getElementById('btnGlobalCancel').addEventListener('click', () => {
  if (currentRecord) fillForm(currentRecord);
  else clearLoanAppForm();
  setMode('view');
  toast('Changes discarded.');
});

/* PRINT ─────────────────────────────────────────────────── */
document.getElementById('btnGlobalPrint').addEventListener('click', () => {
  window.print();
});

/* ── Init ──────────────────────────────────────────────── */
async function init() {
  await loadBranches();
  setMode('view');
  // Default date
  const dateEl = document.getElementById('fDate');
  if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().split('T')[0];
}

init();
