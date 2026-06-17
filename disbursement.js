/* ─────────────────────────────────────────────────────────
   Loan Disbursement Execution Controller Module
   Africa Village Microfinance Core Banking System
   ───────────────────────────────────────────────────────── */
'use strict';

// ── Supabase REST Framework Engine Connectors ────────────
const SUPABASE_URL = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';

async function sbFetch(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': options.prefer || 'return=representation',
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const errorDetails = await response.json().catch(() => ({}));
    throw new Error(errorDetails.message || `HTTP Execution Refusal: ${response.status}`);
  }
  return response.status === 204 ? null : response.json();
}

// ── Application Core Operational State Parameters ────────
let mode = 'view';
let currentRecord = null;

// Tab panel Routing Link Toggles
document.querySelectorAll('.tab').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    button.classList.add('active');
    document.getElementById(`tab-${button.dataset.tab}`).classList.add('active');
  });
});

// Toast System Visual Dispatch Pipeline
function showToast(message, variant = 'info') {
  const target = document.getElementById('toast');
  target.textContent = message;
  target.className = `toast show ${variant}`;
  clearTimeout(target._timer);
  target._timer = setTimeout(() => target.className = 'toast', 4000);
}

// Input Fields Form Toggles
function setFormControlsState(enabled) {
  const entries = document.querySelectorAll('.tab-panel input, .tab-panel select');
  entries.forEach(item => item.disabled = !enabled);
}

// Flush Input Fields Form Content
function clearFormLayout() {
  document.querySelectorAll('.tab-panel input, .tab-panel select').forEach(element => element.value = '');
  document.getElementById('repaymentGrid').querySelector('tbody').innerHTML = 
    `<tr><td colspan="7" class="placeholder-text">Enter transaction parameters and click save to calculate amortization profile layout.</td></tr>`;
}

// State Control Flow Matrix Engine
function setMode(newMode) {
  mode = newMode;
  const isEditing = (newMode === 'add' || newMode === 'edit');
  setFormControlsState(isEditing);
  
  // Rule Base Disabling States
  document.getElementById('fAccountId').disabled = (newMode !== 'view' && newMode !== 'add');
  document.getElementById('btnAdd').disabled = isEditing;
  document.getElementById('btnEdit').disabled = (isEditing || !currentRecord);
  document.getElementById('btnSave').disabled = !isEditing;
  document.getElementById('btnCancel').disabled = !isEditing;
}

/* ── Financial Engine Matrix: Straight-Line Principal Amortization ── */
function runAmortizationCalculation(principal, annualRate, totalMonths, startingValueDate) {
  const tbody = document.getElementById('repaymentGrid').querySelector('tbody');
  tbody.innerHTML = '';

  let balance = parseFloat(principal);
  const tenor = parseInt(totalMonths);
  const monthlyRateFactor = (parseFloat(annualRate) / 100) / 12;
  const flatPrincipalInstallment = balance / tenor;
  
  let processingDate = startingValueDate ? new Date(startingValueDate) : new Date();

  for (let step = 1; step <= tenor; step++) {
    const interestComponent = balance * monthlyRateFactor;
    const grossDuePayment = flatPrincipalInstallment + interestComponent;
    const initialBalance = balance;
    balance -= flatPrincipalInstallment;

    processingDate.setMonth(processingDate.getMonth() + 1);
    const dateString = processingDate.toISOString().split('T')[0];

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${step}</td>
      <td>${dateString}</td>
      <td>${initialBalance.toFixed(2)} ETB</td>
      <td>${flatPrincipalInstallment.toFixed(2)} ETB</td>
      <td>${interestComponent.toFixed(2)} ETB</td>
      <td><strong>${grossDuePayment.toFixed(2)} ETB</strong></td>
      <td>${Math.abs(balance) < 0.01 ? '0.00' : balance.toFixed(2)} ETB</td>
    `;
    tbody.appendChild(tr);
  }
}

/* ── Core Workflow Action Event Listeners ───────────────── */

// VIEW Action Logic (Rule 1 & 2 Workflow Integration)
document.getElementById('btnView').addEventListener('click', async () => {
  const searchId = document.getElementById('fAccountId').value.trim();
  if (!searchId) return showToast('Please type an Account ID to fetch.', 'error');

  try {
    showToast('Searching active credit registers...', 'info');
    const records = await sbFetch(`loan_disbursement?account_id=eq.${encodeURIComponent(searchId)}&limit=1`);
    
    if (records && records.length > 0) {
      currentRecord = records[0];
      
      // Populate fields
      document.getElementById('fCustomerName').value = currentRecord.customer_name;
      document.getElementById('fAmountDisbursed').value = currentRecord.amount_disbursed;
      document.getElementById('fDisbursementDate').value = currentRecord.disbursement_date;
      document.getElementById('fPaymentMode').value = currentRecord.payment_mode;
      document.getElementById('fAccountType').value = currentRecord.account_type;
      document.getElementById('fContraAccountId').value = currentRecord.contra_account_id;
      document.getElementById('fChequeNo').value = currentRecord.cheque_no || '';
      document.getElementById('fBankName').value = currentRecord.bank_name || '';
      document.getElementById('fInterestRate').value = currentRecord.interest_rate;
      document.getElementById('fTenorMonths').value = currentRecord.tenor_months;

      // Populate schedule metrics grid view
      runAmortizationCalculation(currentRecord.amount_disbursed, currentRecord.interest_rate, currentRecord.tenor_months, currentRecord.disbursement_date);
      setMode('view');
      showToast(`✔ Record loaded for Account: ${searchId}`, 'success');
    } else {
      showToast('No transaction ledger found matching that Account ID.', 'error');
    }
  } catch (err) {
    showToast(`Inquiry Failure: ${err.message}`, 'error');
  }
});

// ADD Action Logic (Rule 3 Sequence Trigger)
document.getElementById('btnAdd').addEventListener('click', () => {
  clearFormLayout();
  currentRecord = null;
  setMode('add');
  document.getElementById('fAccountId').focus();
  showToast('Workspace activated. Complete required entries, then click Save.');
});

// CANCEL Action Logic
document.getElementById('btnCancel').addEventListener('click', () => {
  clearFormLayout();
  currentRecord = null;
  setMode('view');
  showToast('Modifications discarded cleanly.');
});

// CLOSE Action Logic
document.getElementById('btnClose').addEventListener('click', () => {
  clearFormLayout();
  currentRecord = null;
  setMode('view');
  showToast('Workspace reference unassigned.');
});

// SAVE Action Logic (Rule 4, 5, 6, & 7 Modal Triggers interception)
document.getElementById('btnSave').addEventListener('click', () => {
  const accId   = document.getElementById('fAccountId').value.trim();
  const modeDis = document.getElementById('fPaymentMode').value;
  const accType = document.getElementById('fAccountType').value;
  const contra  = document.getElementById('fContraAccountId').value.trim();
  const cName   = document.getElementById('fCustomerName').value.trim();
  const principal = document.getElementById('fAmountDisbursed').value;

  // Enforce Workflow Validations
  if (!accId) return showToast('Validation Error: Account ID is required.', 'error');
  if (!modeDis) return showToast('Validation Error: Select Mode Of Disbursement.', 'error');
  if (!accType) return showToast('Validation Error: Select Account Type.', 'error');
  if (!contra) return showToast('Validation Error: Contra Account ID is mandatory.', 'error');
  if (!cName || !principal) return showToast('Validation Error: Customer and Principal values required.', 'error');

  // Sync Data attributes to confirmation modal fields directly
  document.getElementById('mdAccountId').textContent = accId;
  document.getElementById('mdPaymentMode').textContent = modeDis;
  document.getElementById('mdAccountType').textContent = accType;
  document.getElementById('mdContraAccountId').textContent = contra;

  // Render Schedule Preview on Details Panel for review
  runAmortizationCalculation(principal, document.getElementById('fInterestRate').value, document.getElementById('fTenorMonths').value, document.getElementById('fDisbursementDate').value);

  // Trigger Confirmation Window display layout
  document.getElementById('disbursementModal').classList.add('active');
});

/* ── Modal Window Intercept Actions Control Routines ────── */

document.getElementById('btnConfirmCancel').addEventListener('click', () => {
  document.getElementById('disbursementModal').classList.remove('active');
  showToast('Database posting aborted by operator.', 'info');
});

document.getElementById('btnConfirmCommit').addEventListener('click', async () => {
  document.getElementById('disbursementModal').classList.remove('active');

  const payload = {
    account_id:         document.getElementById('fAccountId').value.trim(),
    customer_name:      document.getElementById('fCustomerName').value.trim(),
    amount_disbursed:   parseFloat(document.getElementById('fAmountDisbursed').value),
    disbursement_date:  document.getElementById('fDisbursementDate').value || new Date().toISOString().split('T')[0],
    payment_mode:       document.getElementById('fPaymentMode').value,
    account_type:       document.getElementById('fAccountType').value,
    contra_account_id:  document.getElementById('fContraAccountId').value.trim(),
    cheque_no:          document.getElementById('fChequeNo').value || null,
    bank_name:          document.getElementById('fBankName').value || null,
    interest_rate:      parseFloat(document.getElementById('fInterestRate').value),
    tenor_months:       parseInt(document.getElementById('fTenorMonths').value)
  };

  try {
    showToast('Committing transactions to general ledger...', 'info');
    
    const responseData = await sbFetch('loan_disbursement', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    currentRecord = Array.isArray(responseData) ? responseData[0] : responseData;
    setMode('view');
    showToast('✔ Loan posted, disbursed, and saved successfully.', 'success');
  } catch (err) {
    showToast(`Post Aborted: ${err.message}`, 'error');
  }
});

// Initialize Application System State on Layout Load Context
setMode('view');
