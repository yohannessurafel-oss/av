/* ═══════════════════════════════════════════════════════════
   Africa Village Microfinance — 01 Loan Application
   01-loan-application.js  v2.0
   Supabase CRUD · Toast Notifications · Live Calculations
═══════════════════════════════════════════════════════════ */

'use strict';

/* ── Supabase Config ───────────────────────────────────── */
const SUPABASE_URL      = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';

const TABLE_LOANS    = 'loanmasterrecords';
const TABLE_CLIENTS  = 'ClientMasterRecords';

/* ── State ─────────────────────────────────────────────── */
let currentMode   = 'view';
let currentRecord = null;
let viewModalData = [];

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

/* ── Column Map ─────────────────────────────────────────── */
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
  const sel = document.getElementById('loanBranchId');
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
  const sel = document.getElementById('loanBranchId');
  if (sel) { sel.innerHTML = '<option value="">Loading branches…</option>'; sel.disabled = true; }
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/branchregistry?select=branch_id,branch_name&order=branch_id`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Accept': 'application/json' } }
    );
    if (!res.ok) { toast(`Branch list error ${res.status}`, 'error'); return; }
    const rows = await res.json();
    _branchCache = Array.isArray(rows) ? rows : [];
    populateBranchSelect(true);
  } catch (e) {
    toast('Could not load branch list.', 'error');
    const sel = document.getElementById('loanBranchId');
    if (sel) { sel.innerHTML = '<option value="">-- Select Branch --</option>'; sel.disabled = false; }
  }
}

document.getElementById('loanBranchId')?.addEventListener('change', function () {
  const nameEl = document.getElementById('loanBranchName');
  const chosen = _branchCache.find(b => b.branch_id === this.value);
  if (nameEl) nameEl.value = chosen ? (chosen.branch_name || '') : '';
  updateAddButtonState();
});

function updateAddButtonState() {
  const addBtn = document.getElementById('btnGlobalAdd');
  const branchSel = document.getElementById('loanBranchId');
  if (addBtn) addBtn.disabled = !branchSel?.value || currentMode === 'add' || currentMode === 'edit';
}

/* ── Product Dropdown ─────────────────────────────────── */
let _productCache = [];

async function loadProducts() {
  const sel = document.getElementById('fProductId');
  if (!sel) return;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/lendingproductparametermatrix?select=product_code_id,product_name_title,base_interest_rate&order=product_code_id`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Accept': 'application/json' } }
    );
    if (!res.ok) { console.error('Product load failed:', res.status); return; }
    const rows = await res.json();
    _productCache = rows || [];
    sel.innerHTML = '<option value="">-- Select Product --</option>';
    _productCache.forEach(r => {
      const o = document.createElement('option');
      o.value = r.product_code_id;
      o.textContent = r.product_code_id + (r.product_name_title ? ' — ' + r.product_name_title : '');
      o.dataset.rate = r.base_interest_rate || '';
      sel.appendChild(o);
    });
  } catch (e) { console.error('loadProducts exception:', e); }
}

document.getElementById('fProductId')?.addEventListener('change', function () {
  const chosen = _productCache.find(p => p.product_code_id === this.value);
  if (chosen && chosen.base_interest_rate) {
    const rateEl = document.getElementById('fInterestRate');
    if (rateEl && !rateEl.value) { rateEl.value = chosen.base_interest_rate; calcLoanSummary(); }
  }
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
  const P = parseFloat(document.getElementById('fLoanAmount')?.value) || 0;
  const r = (parseFloat(document.getElementById('fInterestRate')?.value) || 0) / 100 / 12;
  const n = parseInt(document.getElementById('fTerm')?.value) || 0;
  let installment = 0, totalRepay = 0, totalInterest = 0;
  if (P > 0 && n > 0) {
    installment = r === 0 ? P / n : P * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    totalRepay = installment * n;
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
    if (el.dataset.alwaysEnabled !== undefined || el.id === 'loanBranchId' || el.id === 'fProductId') {
      el.disabled = false; return;
    }
    el.disabled = !isEdit;
  });
  document.querySelectorAll('input[readonly]').forEach(el => el.disabled = false);
  const sel = document.getElementById('loanBranchId');
  if (sel) sel.disabled = false;
  const btnSave   = document.getElementById('btnGlobalSave');
  const btnEdit   = document.getElementById('btnGlobalEdit');
  const btnAdd    = document.getElementById('btnGlobalAdd');
  const btnCancel = document.getElementById('btnGlobalCancel');
  const btnClose  = document.getElementById('btnGlobalClose');
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
  updateAddButtonState();
}

/* ── Form Fill ─────────────────────────────────────────── */
function fillForm(rec) {
  if (!rec) return;
  const set = (id, key) => { const el = document.getElementById(id); if (el) el.value = rec[key] ?? ''; };
  set('loanBranchId',       COL.branch_id);
  set('fGroupId',           COL.group_id);
  set('fSubGroupId',        COL.sub_group_id);
  set('fApplicationId',     COL.application_id);
  set('fClientId',          COL.client_id);
  set('fClientName',        COL.client_name);
  const prodSel = document.getElementById('fProductId');
  if (prodSel) prodSel.value = rec[COL.product_id] ?? '';
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
  set('fApplicationStatus', COL.app_status);
  document.getElementById('loanBranchId')?.dispatchEvent(new Event('change'));
  const disbDate = rec[COL.disbursement_date] || null;
  populateDisbursementDates(disbDate); // sets value directly on date input
  calcLoanSummary();
}

/* ── Form Collect ──────────────────────────────────────── */
function collectForm() {
  const g = id => { const el = document.getElementById(id); return el ? (el.value.trim() || null) : null; };
  return {
    [COL.branch_id]:        g('loanBranchId'),
    [COL.group_id]:         g('fGroupId'),
    [COL.sub_group_id]:     g('fSubGroupId'),
    [COL.application_id]:   g('fApplicationId'),
    [COL.client_id]:        g('fClientId'),
    // client_name is a computed column in loanmasterrecords — read-only, stripped before write
    // [COL.client_name]:   g('fClientName'),  // DO NOT send to DB
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

/* ── Clear Form ────────────────────────────────────────── */
function clearLoanAppForm() {
  ['fGroupId','fSubGroupId','fApplicationId','fClientId','fClientName',
   'fProductId','fRepaymentAccId','fDonorId','fOfficerId','fLoanAmount',
   'fTerm','fCommissionRate','fEffectiveRate','fSpread','fFileNumber',
   'fSalesOfficer','fDate','fDisbursementDate','fInterestRate','fTaxRate'
  ].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
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
    if (!el || !el.value.trim()) { toast(`⚠ ${label} is required.`, 'error'); el?.focus(); return false; }
  }
  if (isNaN(parseFloat(document.getElementById('fLoanAmount').value)) || parseFloat(document.getElementById('fLoanAmount').value) <= 0) {
    toast('⚠ Loan Amount must be greater than 0.', 'error'); return false;
  }
  if (isNaN(parseFloat(document.getElementById('fInterestRate').value)) || parseFloat(document.getElementById('fInterestRate').value) <= 0) {
    toast('⚠ Interest Rate must be greater than 0.', 'error'); return false;
  }
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
              <tr><th>Application ID</th><th>Client ID</th><th>Client Name</th><th>Branch</th><th>Status</th><th class="text-right">Amount (ETB)</th></tr>
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
  modal.querySelectorAll('.modal-result-row').forEach(row => {
    row.addEventListener('click', () => {
      modal.querySelectorAll('.modal-result-row').forEach(r => r.classList.remove('selected-row'));
      row.classList.add('selected-row');
      selectedAppId = row.dataset.appid;
    });
    row.addEventListener('dblclick', () => { selectedAppId = row.dataset.appid; loadSelectedRecord(selectedAppId); });
  });
  const closeModal = () => { modal.style.display = 'none'; };
  document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
  document.getElementById('modalCancelBtn').addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  document.getElementById('modalSelectBtn').addEventListener('click', () => {
    if (!selectedAppId) { toast('Select a record first.', 'warning'); return; }
    loadSelectedRecord(selectedAppId);
  });
  const filterTable = (q) => {
    const lower = q.toLowerCase();
    modal.querySelectorAll('.modal-result-row').forEach(row => {
      row.style.display = row.textContent.toLowerCase().includes(lower) ? '' : 'none';
    });
  };
  document.getElementById('modalSearchBtn').addEventListener('click', () => filterTable(document.getElementById('modalSearchInput').value.trim()));
  document.getElementById('modalSearchInput').addEventListener('keydown', e => { if (e.key === 'Enter') filterTable(e.target.value.trim()); });
  function loadSelectedRecord(appId) {
    const rec = viewModalData.find(r => r[COL.application_id] === appId);
    if (rec) { currentRecord = rec; fillForm(rec); setMode('view'); closeModal(); toast(`✔ Loaded: ${rec[COL.application_id]} — ${rec[COL.client_name] || ''}`, 'success'); }
  }
}

/* ── Disbursement Date — now a plain <input type="date"> ─── */
// populateDisbursementDates() removed — field is now a native date picker.
function populateDisbursementDates(existingDate) {
  // no-op stub — kept for backward compat with fillForm() call
  const el = document.getElementById('fDisbursementDate');
  if (el && existingDate) el.value = existingDate;
}

/* ── Confirmation Dialog ────────────────────────────────── */
function showSaveConfirmation(payload, onConfirm) {
  const fmt = v => v != null && v !== '' ? v : '—';
  const fmtAmt = v => v != null ? 'ETB ' + Number(v).toLocaleString('en-ET', { minimumFractionDigits: 2 }) : '—';
  const action = currentMode === 'add' ? 'Create New' : 'Update';
  document.getElementById('saveConfirmOverlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'saveConfirmOverlay';
  overlay.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(10,20,40,0.55);z-index:9000;display:flex;align-items:center;justify-content:center;`;
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:6px;box-shadow:0 8px 32px rgba(0,0,0,0.28);width:480px;max-width:96vw;font-family:'Segoe UI',Inter,sans-serif;font-size:13px;overflow:hidden;">
      <div style="background:#0A291A;color:#fff;padding:10px 16px;display:flex;align-items:center;gap:8px;">
        <span style="font-size:15px;">💾</span>
        <span style="font-weight:700;letter-spacing:.03em;">Confirm Loan Application — ${action}</span>
      </div>
      <div style="padding:14px 16px 4px;color:#1a2a35;">
        <div style="background:#f4f7f9;border:1px solid #ccd3da;border-radius:4px;padding:10px 14px;margin-bottom:10px;">
          <table style="width:100%;border-collapse:collapse;line-height:1.9;">
            <tr><td style="color:#6b7f8b;width:52%;">Application ID</td><td style="font-weight:700;color:#0A291A;">${fmt(payload['application_id'])}</td></tr>
            <tr><td style="color:#6b7f8b;">Branch</td><td>${fmt(payload['branch_id'])} ${document.getElementById('loanBranchName')?.value ? '— ' + document.getElementById('loanBranchName').value : ''}</td></tr>
            <tr><td style="color:#6b7f8b;">Client ID</td><td>${fmt(payload['client_id'])}</td></tr>
            <tr><td style="color:#6b7f8b;">Client Name</td><td>${fmt(payload['client_name'])}</td></tr>
            <tr><td style="color:#6b7f8b;">Product ID</td><td>${fmt(payload['product_id'])}</td></tr>
            <tr><td style="color:#6b7f8b;">Loan Amount</td><td style="font-weight:700;">${fmtAmt(payload['applied_amount'])}</td></tr>
            <tr><td style="color:#6b7f8b;">Term</td><td>${fmt(payload['term_months'])} months</td></tr>
            <tr><td style="color:#6b7f8b;">Interest Rate</td><td>${fmt(payload['interest_rate'])}%</td></tr>
            <tr><td style="color:#6b7f8b;">Disbursement Date</td><td>${fmt(payload['disbursement_date'])}</td></tr>
            <tr><td style="color:#6b7f8b;">Application Status</td><td><span style="background:#ddeaf7;padding:1px 8px;border-radius:10px;font-weight:700;">${fmt(payload['application_status'])}</span></td></tr>
          </table>
        </div>
        <p style="color:#6b7f8b;font-size:11px;margin:0 0 12px;">Click <strong>Yes</strong> to confirm and save this loan application record.</p>
      </div>
      <div style="padding:0 16px 14px;display:flex;justify-content:flex-end;gap:8px;">
        <button id="confirmNo"  style="padding:6px 20px;border:1px solid #ccd3da;background:#fff;border-radius:4px;font-size:13px;cursor:pointer;">No</button>
        <button id="confirmYes" style="padding:6px 20px;background:#F5A623;border:1px solid #e09615;color:#0A291A;border-radius:4px;font-size:13px;font-weight:700;cursor:pointer;">Yes</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.getElementById('confirmNo').addEventListener('click', () => { overlay.remove(); toast('Save cancelled.'); });
  document.getElementById('confirmYes').addEventListener('click', async () => { overlay.remove(); await onConfirm(); showSaveOkDialog(); });
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

function showSaveOkDialog() {
  document.getElementById('saveOkOverlay')?.remove();
  if (!currentRecord) return;
  const overlay = document.createElement('div');
  overlay.id = 'saveOkOverlay';
  overlay.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(10,20,40,0.45);z-index:9100;display:flex;align-items:center;justify-content:center;`;
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:6px;box-shadow:0 8px 32px rgba(0,0,0,0.22);width:340px;text-align:center;font-family:'Segoe UI',Inter,sans-serif;font-size:13px;overflow:hidden;">
      <div style="background:#27ae60;color:#fff;padding:10px 16px;font-weight:700;">✔ Application Saved Successfully</div>
      <div style="padding:20px 16px 10px;">
        <div style="font-size:22px;margin-bottom:8px;">✅</div>
        <p style="color:#1a2a35;margin:0 0 4px;">Loan Application <strong>${currentRecord['application_id'] || ''}</strong></p>
        <p style="color:#6b7f8b;margin:0 0 16px;font-size:11px;">has been saved with status <strong>DataEntry</strong>.</p>
        <button id="saveOkBtn" style="padding:7px 30px;background:#0A291A;color:#fff;border:none;border-radius:4px;font-size:13px;font-weight:700;cursor:pointer;">OK</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.getElementById('saveOkBtn').addEventListener('click', () => overlay.remove());
  setTimeout(() => overlay?.remove(), 8000);
}

/* ── commitSave v2.2 ────────────────────────────────────────── */
async function commitSave(payload) {
  const appId     = payload[COL.application_id];
  const branchId  = payload[COL.branch_id];
  const appDate   = payload[COL.app_date] || new Date().toISOString().slice(0,10);
  const appStatus = payload[COL.app_status] || 'DataEntry';

  // Strip generated/computed columns — loanmasterrecords rejects writes to these
  const writePayload = { ...payload };
  delete writePayload[COL.client_name];   // generated column in loanmasterrecords

  try {
    toast('Processing…', 'info');

    if (currentMode === 'add') {
      if (!appId) throw new Error('Application ID is required.');

      // Step 1 — Insert parent row into loanapplications (CBS v2 staging table)
      // ON CONFLICT DO NOTHING protects against duplicate saves on retry
      await sbFetch('loanapplications', {
        method:  'POST',
        prefer:  'return=minimal',
        headers: { 'Prefer': 'return=minimal,resolution=ignore-duplicates' },
        body: JSON.stringify({
          application_id:     appId,
          branch_id:          branchId || null,
          application_date:   appDate,
          application_status: appStatus,
        })
      });

      // Step 2 — Insert into loanmasterrecords (child)
      const responseData = await sbFetch(TABLE_LOANS, {
        method: 'POST',
        prefer: 'return=representation',
        body:   JSON.stringify(writePayload),
      });
      currentRecord = Array.isArray(responseData) ? responseData[0] : responseData;

    } else if (currentMode === 'edit') {
      const currentAppId = currentRecord[COL.application_id];
      if (!currentAppId) throw new Error('No active record to modify.');

      const updatePayload = { ...writePayload };
      delete updatePayload[COL.application_id]; // never PATCH the PK

      const responseData = await sbFetch(
        `${TABLE_LOANS}?${COL.application_id}=eq.${encodeURIComponent(currentAppId)}`,
        { method: 'PATCH', prefer: 'return=representation', body: JSON.stringify(updatePayload) }
      );
      currentRecord = (Array.isArray(responseData) && responseData[0]) ? responseData[0] : currentRecord;
    }

    if (currentRecord) fillForm(currentRecord);
    setMode('view');
    toast('✔ Loan application saved.', 'success');
  } catch (error) {
    console.error('Save error:', error);
    toast(`Save failed: ${error.message}`, 'error');
  }
}

/* ══ TOOLBAR BUTTON HANDLERS ════════════════════════════ */

document.getElementById('btnGlobalView').addEventListener('click', async () => {
  try {
    toast('Loading records…');
    const rows = await sbFetch(`${TABLE_LOANS}?select=*&order=${COL.application_id}.desc&limit=200`);
    buildViewModal(rows);
  } catch (e) { toast(`Error loading records: ${e.message}`, 'error'); }
});

document.getElementById('btnGlobalAdd').addEventListener('click', () => {
  const branchSel = document.getElementById('loanBranchId');
  if (!branchSel || !branchSel.value) { toast('⚠ Select a Branch ID first.', 'warning'); branchSel?.focus(); return; }
  const savedBranchId = branchSel.value;
  const savedBranchName = document.getElementById('loanBranchName')?.value || '';
  currentRecord = null;
  clearLoanAppForm();
  branchSel.value = savedBranchId;
  const nameEl = document.getElementById('loanBranchName');
  if (nameEl) nameEl.value = savedBranchName;
  setMode('add');
  document.getElementById('fClientId')?.focus();
  toast('Branch selected. Enter Client ID, Product ID and loan details, then Save.');
});

document.getElementById('btnGlobalEdit').addEventListener('click', () => {
  if (!currentRecord) { toast('Load a record first before editing.', 'warning'); return; }
  setMode('edit');
  toast('Editing — make your changes then Save.');
});

document.getElementById('btnGlobalSave').addEventListener('click', async () => {
  const payload = collectForm();
  if (!validateLoanApp()) return;
  showSaveConfirmation(payload, async () => { await commitSave(payload); });
});

document.getElementById('btnGlobalClose').addEventListener('click', () => {
  currentRecord = null;
  clearLoanAppForm();
  setMode('view');
  toast('Record closed.');
});

document.getElementById('btnGlobalDelete')?.addEventListener('click', async () => {
  if (!currentRecord) { toast('No record loaded.', 'warning'); return; }
  const appId = currentRecord[COL.application_id];
  if (!appId) { toast('Cannot delete — no Application ID.', 'error'); return; }
  if (!window.confirm(`Delete loan record ${appId}?\nThis action cannot be undone.`)) return;
  try {
    toast('Deleting…');
    await sbFetch(`${TABLE_LOANS}?${COL.application_id}=eq.${encodeURIComponent(appId)}`, { method: 'DELETE', prefer: 'return=minimal' });
    toast(`✔ Record ${appId} deleted.`, 'success');
    currentRecord = null;
    clearLoanAppForm();
    setMode('view');
  } catch (e) { toast(`Delete failed: ${e.message}`, 'error'); }
});

document.getElementById('btnGlobalCancel').addEventListener('click', () => {
  if (currentRecord) fillForm(currentRecord);
  else clearLoanAppForm();
  setMode('view');
  toast('Changes discarded.');
});

document.getElementById('btnGlobalPrint')?.addEventListener('click', () => window.print());

/* ── Init ──────────────────────────────────────────────── */
async function init() {
  setMode('view');
  await Promise.all([loadBranches(), loadProducts()]);
  document.getElementById('loanBranchId').disabled = false;
  const dateEl = document.getElementById('fDate');
  if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().split('T')[0];
}
init();



/* ── Data Engine Lookup: Fetch and Display All Records ── */
/* ── Data Engine Lookup: Fetch Records Joined with Client Master Profile ── */
async function loadAndDisplayLoanRecords() {
  const tbody = document.querySelector('#viewRecordsModal table tbody');
  const statusBar = document.getElementById('statusBar');
  
  if (!tbody) {
    console.error("Target table body element not found.");
    return;
  }

  try {
    if (statusBar) statusBar.textContent = 'Loading live loan portfolio matrices...';
    
    // FIX: We tell Supabase to look up the related profile from ClientMasterRecords using the client_id link!
    const queryPath = `loanmasterrecords?select=*,ClientMasterRecords(first_name,middle_name,last_name)&order=created_at.desc`;
    
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${queryPath}`, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    if (!res.ok) throw new Error(`Fetch failed with status ${res.status}`);
    const records = await res.json();

    // Reset Table Elements
    tbody.innerHTML = '';

    if (records.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center gray-text italic">No records found in portfolio database.</td></tr>`;
      if (statusBar) statusBar.textContent = 'Status: Ready — No entries found.';
      return;
    }

    // Populate rows dynamically
    records.forEach((record, index) => {
      const row = document.createElement('tr');
      row.style.cursor = 'pointer';
      
      const serialNum = index + 1;
      const clientId  = record.client_id || record.application_id || '—';
      
      // FIX: Compile the real client master names array if it exists, fallback safely otherwise
      let fullName = '';
      if (record.ClientMasterRecords) {
        const fName = record.ClientMasterRecords.first_name || '';
        const mName = record.ClientMasterRecords.middle_name || '';
        const lName = record.ClientMasterRecords.last_name || '';
        fullName = `${fName} ${mName} ${lName}`.replace(/\s+/g, ' ').trim();
      }
      
      // If no joined profile was found, fallback to fallback column names or placeholder text
      if (!fullName) {
        fullName = record.client_name || record.created_by || record.customer_name || 'Verified Client Profile';
      }

      const branch = record.branch_id || 'Main Branch';
      const status = record.approval_status || record.till_status || 'Active';

      row.innerHTML = `
        <td>${serialNum}</td>
        <td><strong>${clientId}</strong></td>
        <td>${fullName}</td>
        <td>${branch}</td>
        <td><span class="status-badge status-${status.toLowerCase()}">${status}</span></td>
      `;

      // Form workspace profile loader setup
      row.addEventListener('click', () => {
        if (typeof fillForm === 'function') {
          fillForm(record);
          currentRecord = record;
          setMode('view');
          toast(`Loaded entry: ${clientId}`, 'success');
        }
      });

      tbody.appendChild(row);
    });

    if (statusBar) statusBar.textContent = `Status: View Mode — Loaded ${records.length} records.`;

  } catch (error) {
    console.error("Matrix Loader Error:", error);
    tbody.innerHTML = `<tr><td colspan="5" class="text-center operational-error" style="color: #a00000; padding: 12px;">⚠️ Infrastructure connection failed: ${error.message}</td></tr>`;
    if (statusBar) statusBar.textContent = 'Status: Connection Exception Encountered.';
  }
}
