/* ═══════════════════════════════════════════════════════════
   Africa Village Microfinance — 10 Loan Disbursement
   disbursement.js — Core Operation Engine v2.1
   Tables: loanmasterrecords, clientmasterregistry
═══════════════════════════════════════════════════════════ */

'use strict';

const SUPABASE_URL      = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';

const headers = {
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
  'Accept': 'application/json'
};

/* ── DOM Cache Strategy ─────────────────────────────────── */
const dom = {
  accountId:        () => document.getElementById('fAccountId'),
  btnView:          () => document.getElementById('btnView'),
  customerName:     () => document.getElementById('fCustomerName'),
  amountDisbursed:  () => document.getElementById('fAmountDisbursed'),
  disbursementDate: () => document.getElementById('fDisbursementDate'),
  paymentMode:      () => document.getElementById('fPaymentMode'),
  accountType:      () => document.getElementById('fAccountType'),
  contraAccountId:  () => document.getElementById('fContraAccountId'),
  chequeNo:         () => document.getElementById('fChequeNo'),
  bankName:         () => document.getElementById('fBankName'),
  interestRate:     () => document.getElementById('fInterestRate'),
  tenorMonths:      () => document.getElementById('fTenorMonths'),
  repaymentGrid:    () => document.getElementById('repaymentGrid').querySelector('tbody'),
  statusBar:        () => document.getElementById('statusBar'),
  
  // Actions
  btnAdd:           () => document.getElementById('btnAdd'),
  btnEdit:          () => document.getElementById('btnEdit'),
  btnClose:         () => document.getElementById('btnClose'),
  btnSave:          () => document.getElementById('btnSave'),
  btnCancel:        () => document.getElementById('btnCancel'),
  
  // Modal Elements
  modal:            () => document.getElementById('disbursementModal'),
  mdAccountId:      () => document.getElementById('mdAccountId'),
  mdPaymentMode:    () => document.getElementById('mdPaymentMode'),
  mdAccountType:    () => document.getElementById('mdAccountType'),
  mdContraAccountId:() => document.getElementById('mdContraAccountId'),
  btnConfirmCancel: () => document.getElementById('btnConfirmCancel'),
  btnConfirmCommit: () => document.getElementById('btnConfirmCommit')
};

let currentMode = 'view';
let activeRecord = null;

/* ── System Date Vector ────────────────────────────────── */
(function initDate() {
  const el = document.getElementById('systemDate');
  if (el) el.textContent = new Date().toLocaleDateString('en-ET', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
  });
  if (dom.disbursementDate() && !dom.disbursementDate().value) {
    dom.disbursementDate().value = new Date().toISOString().split('T')[0];
  }
})();

/* ── Notification Components ───────────────────────────── */
function toast(msg, type = '', duration = 3500) {
  const el = document.getElementById('toastNotification');
  if (!el) return;
  el.textContent = msg;
  el.className = `toast show ${type}`;
  setTimeout(() => { el.className = 'toast'; }, duration);
}

/* ── Workspace Framework State Machine ─────────────────── */
function setMode(mode) {
  currentMode = mode;
  const isEdit = (mode === 'edit' || mode === 'add');
  
  // Manage structural read/write scopes
  const fields = [
    dom.amountDisbursed(), dom.disbursementDate(), dom.paymentMode(),
    dom.accountType(), dom.contraAccountId(), dom.chequeNo(),
    dom.bankName(), dom.interestRate(), dom.tenorMonths()
  ];
  
  fields.forEach(f => { if (f) f.disabled = !isEdit; });
  if (dom.accountId()) dom.accountId().disabled = (mode === 'edit');

  // Control Actions Elements
  if (dom.btnSave()) dom.btnSave().disabled = !isEdit;
  if (dom.btnCancel()) dom.btnCancel.disabled = !isEdit;
  if (dom.btnAdd()) dom.btnAdd().disabled = isEdit;
  if (dom.btnEdit()) dom.btnEdit().disabled = isEdit || !activeRecord;
  
  if (dom.statusBar()) {
    dom.statusBar().textContent = `Status: ${mode.toUpperCase()} — Ready`;
  }
}

/* ── Tab Interactivity Router ──────────────────────────── */
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    
    tab.classList.add('active');
    const panel = document.getElementById(`tab-${tab.dataset.tab}`);
    if (panel) panel.classList.add('active');

    if (tab.dataset.tab === 'schedule') {
      generateAmortizationPreview();
    }
  });
});

/* ── Data Engine Lookup: Fetch Record ──────────────────── */
dom.btnView()?.addEventListener('click', async () => {
  const accId = dom.accountId()?.value.trim();
  if (!accId) { toast('Please input an Account ID to fetch.', 'warning'); return; }

  try {
    dom.statusBar().textContent = 'Fetching pipeline parameters...';
    // Cascades lookup into loanmasterrecords to populate fields natively
    const res = await fetch(`${SUPABASE_URL}/rest/v1/loanmasterrecords?main_repayment_account_id=eq.${accId}&select=*`, { headers });
    const records = await res.json();

    if (res.ok && records.length > 0) {
      activeRecord = records[0];
      
      // Map to fields. Fallback values handle unassigned data objects.
      if (dom.customerName()) dom.customerName().value = activeRecord.created_by || "Verified Client Profile";
      if (dom.amountDisbursed()) dom.amountDisbursed().value = activeRecord.approved_amount || activeRecord.applied_amount || "";
      if (dom.interestRate()) dom.interestRate().value = activeRecord.interest_rate || "12.00";
      if (dom.tenorMonths()) dom.tenorMonths().value = activeRecord.term_months || "12";
      if (dom.contraAccountId()) dom.contraAccountId().value = activeRecord.loan_id || "GL-10102-ADD";
      
      toast('Application variables successfully loaded.', 'success');
      setMode('view');
    } else {
      toast('No authorized application records matched this ID.', 'error');
      activeRecord = null;
    }
  } catch (e) {
    toast('Infrastructure network error.', 'error');
  }
});

/* ── Core Amortization Matrix Generator ───────────────── */
function generateAmortizationPreview() {
  const principal = parseFloat(dom.amountDisbursed()?.value) || 0;
  const ratePercent = parseFloat(dom.interestRate()?.value) || 0;
  const terms = parseInt(dom.tenorMonths()?.value) || 0;
  const baseDateStr = dom.disbursementDate()?.value || new Date().toISOString().split('T')[0];

  const tbody = dom.repaymentGrid();
  if (!tbody) return;

  if (principal <= 0 || terms <= 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="placeholder-text">Provide valid Principal, Rate, and Tenor fields to map matrix.</td></tr>`;
    return;
  }

  let html = '';
  let cumulativeBalance = principal;
  const monthlyPrincipal = principal / terms;
  let currentDate = new Date(baseDateStr);

  for (let i = 1; i <= terms; i++) {
    const interestSegment = cumulativeBalance * (ratePercent / 100 / 12);
    const totalDue = monthlyPrincipal + interestSegment;
    const closingBalance = cumulativeBalance - monthlyPrincipal;

    currentDate.setMonth(currentDate.getMonth() + 1);

    html += `
      <tr>
        <td>${i}</td>
        <td>${currentDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
        <td>${cumulativeBalance.toFixed(2)}</td>
        <td>${monthlyPrincipal.toFixed(2)}</td>
        <td>${interestSegment.toFixed(2)}</td>
        <td><strong>${totalDue.toFixed(2)}</strong></td>
        <td>${Math.max(0, closingBalance).toFixed(2)}</td>
      </tr>`;
    
    cumulativeBalance = closingBalance;
  }
  tbody.innerHTML = html;
}

/* ── Save Action with Validation Rules ────────────────── */
dom.btnSave()?.addEventListener('click', () => {
  // 1. Structural Validation Rule Check
  const name = dom.customerName()?.value.trim();
  const principal = parseFloat(dom.amountDisbursed()?.value) || 0;
  const mode = dom.paymentMode()?.value;
  const type = dom.accountType()?.value;
  const contra = dom.contraAccountId()?.value.trim();

  if (!name || principal <= 0) {
    toast('Validation Error: Customer Name and Principal variables are mandatory.', 'error');
    return;
  }
  if (!mode || !type || !contra) {
    toast('Validation Error: Ensure Mode, Account Type, and Contra fields are mapped.', 'warning');
    return;
  }

  // 2. Open confirmation modal and populate its data table
  if (dom.mdAccountId()) dom.mdAccountId().textContent = dom.accountId().value;
  if (dom.mdPaymentMode()) dom.mdPaymentMode().textContent = mode;
  if (dom.mdAccountType()) dom.mdAccountType().textContent = type;
  if (dom.mdContraAccountId()) dom.mdContraAccountId().textContent = contra;

  dom.modal()?.classList.add('active');
});

/* ── Transaction Commit Confirmation Logic ────────────── */
dom.btnConfirmCommit()?.addEventListener('click', async () => {
  dom.modal()?.classList.remove('active');
  dom.statusBar().textContent = 'Posting accounting definitions to core General Ledger...';

  const payload = {
    loan_id: dom.contraAccountId().value,
    main_repayment_account_id: dom.accountId().value,
    approved_amount: parseFloat(dom.amountDisbursed().value),
    interest_rate: parseFloat(dom.interestRate().value),
    term_months: parseInt(dom.tenorMonths().value),
    created_by: dom.customerName().value
  };

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/loanmasterrecords`, {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      toast('Disbursement posted successfully! Amortization parameters initialized.', 'success');
      generateAmortizationPreview();
      setMode('view');
    } else {
      const errData = await res.json();
      toast(`Core Rejection: ${errData.message || res.statusText}`, 'error');
    }
  } catch (e) {
    toast('Posting exception detected.', 'error');
  }
});

/* ── Administrative Workspace Wire-up Controls ─────────── */
dom.btnAdd()?.addEventListener('click', () => {
  if (dom.customerName()) dom.customerName().value = '';
  if (dom.amountDisbursed()) dom.amountDisbursed().value = '';
  setMode('add');
});

dom.btnEdit()?.addEventListener('click', () => setMode('edit'));
dom.btnCancel()?.addEventListener('click', () => { setMode('view'); toast('Modifications discarded.'); });
dom.btnConfirmCancel()?.addEventListener('click', () => dom.modal()?.classList.remove('active'));
dom.btnClose()?.addEventListener('click', () => window.location.href = 'loan-application.html');

// Initial setup on boot
setMode('view');
