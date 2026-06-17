/* ─────────────────────────────────────────────────────────
   Loan Disbursement Execution Controller Module
   Africa Village Microfinance Core Banking System
   ───────────────────────────────────────────────────────── */
'use strict';

// ── Supabase REST Framework Engine Connectors ────────────
const SUPABASE_URL = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';

/**
 * Universal Data Fetching Utility for Supabase PostgREST API
 */
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

// UI Tab panel Interface Routing
document.querySelectorAll('.tab').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    button.classList.add('active');
    document.getElementById(`tab-${button.dataset.tab}`).classList.add('active');
  });
});

// Toast System Status Dispatch Pipeline
function showToast(message, variant = 'info') {
  const target = document.getElementById('toast');
  target.textContent = message;
  target.className = `toast show ${variant}`;
  clearTimeout(target._timer);
  target._timer = setTimeout(() => target.className = 'toast', 4000);
}

// Input Fields Form Interactive Toggles
function setFormControlsState(enabled) {
  const entries = document.querySelectorAll('.tab-panel input, .tab-panel select');
  entries.forEach(item => item.disabled = !enabled);
}

// Flush Input Fields Form Content
function clearFormLayout() {
  document.querySelectorAll('.tab-panel input, .tab-panel select').forEach(element => {
    if (element.id !== 'fAccountId') element.value = '';
  });
  document.getElementById('repaymentGrid').querySelector('tbody').innerHTML = 
    `<tr><td colspan="7" class="placeholder-text">Enter transaction parameters and click save to calculate amortization profile layout.</td></tr>`;
}

// State Workflow Matrix Engine
function setMode(newMode) {
  mode = newMode;
  const isEditing = (newMode === 'add' || newMode === 'edit');
  setFormControlsState(isEditing);
  
  // Enforce field states based on app workflow rules
  document.getElementById('fAccountId').disabled = (newMode !== 'view');
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

/* ── 7-Step Workflow Core Action Event Listeners ────────── */

// STEP 2: CLICK VIEW — Fetch master loan record details from database
document.getElementById('btnView').addEventListener('click', async () => {
  const searchId = document.getElementById('fAccountId').value.trim(); // STEP 1: Account Identification Number
  if (!searchId) return showToast('Please enter an Account ID / Application ID to fetch.', 'error');

  try {
    showToast('Searching system master records...', 'info');
    // Fetch directly from your verified database tables matching schema column names
    const records = await sbFetch(`loanmasterrecords?application_id=eq.${encodeURIComponent(searchId)}&limit=1`); [cite: 20]
    
    if (records && records.length > 0) {
      currentRecord = records[0];
      
      // Auto-populate transaction details from master tables
      document.getElementById('fCustomerName').value = currentRecord.client_name || ''; [cite: 17]
      document.getElementById('fAmountDisbursed').value = currentRecord.approved_amount || currentRecord.applied_amount || ''; [cite: 17, 18]
      document.getElementById('fDisbursementDate').value = currentRecord.disbursement_date || new Date().toISOString().split('T')[0]; [cite: 19]
      document.getElementById('fPaymentMode').value = currentRecord.mode_of_disbursement || ''; [cite: 19]
      document.getElementById('fAccountType').value = currentRecord.account_class || ''; [cite: 19]
      document.getElementById('fContraAccountId').value = currentRecord.main_repayment_account_id || ''; [cite: 17]
      document.getElementById('fChequeNo').value = currentRecord.reference_no || ''; [cite: 17]
      document.getElementById('fBankName').value = currentRecord.bank_id || ''; [cite: 17]
      document.getElementById('fInterestRate').value = currentRecord.interest_rate || '12.00'; [cite: 18]
      document.getElementById('fTenorMonths').value = currentRecord.term_months || '12'; [cite: 18]

      // Update amortization framework matrix preview tab
      runAmortizationCalculation(
        currentRecord.approved_amount || currentRecord.applied_amount, [cite: 17, 18]
        currentRecord.interest_rate || 12, [cite: 18]
        currentRecord.term_months || 12, [cite: 18]
        currentRecord.disbursement_date [cite: 19]
      );
      
      setMode('view');
      showToast(`✔ Records matching Application ID: ${searchId} loaded successfully.`, 'success');
    } else {
      showToast('No record found matching that Application ID/Account ID inside loanmasterrecords.', 'error'); [cite: 20]
    }
  } catch (err) {
    showToast(`Inquiry Failure: ${err.message}`, 'error');
  }
});

// STEP 3: CLICK ADD — Unlock input fields for processing
document.getElementById('btnAdd').addEventListener('click', () => {
  if (!currentRecord) {
    return showToast('Please enter an Account ID and click View first before activating fields.', 'error');
  }
  setMode('add');
  showToast('Workspace activated. Complete required transactional fields.');
});

// STEP 7: CLICK SAVE — Intercept entry to display Supervisor Confirmation Modal Window
document.getElementById('btnSave').addEventListener('click', () => {
  const accId   = document.getElementById('fAccountId').value.trim();      // Account Identification Number
  const modeDis = document.getElementById('fPaymentMode').value;           // STEP 4: Mode of Disbursement
  const accType = document.getElementById('fAccountType').value;           // STEP 5: Type of Account
  const contra  = document.getElementById('fContraAccountId').value.trim(); // STEP 6: Contra Account ID
  const cName   = document.getElementById('fCustomerName').value.trim();
  const principal = document.getElementById('fAmountDisbursed').value;

  // Structural Form Validations
  if (!accId) return showToast('Validation Error: Account ID / Application ID is empty.', 'error');
  if (!modeDis) return showToast('Validation Error: Please select a valid Mode Of Disbursement.', 'error');
  if (!accType) return showToast('Validation Error: Please select an Account Type context.', 'error');
  if (!contra) return showToast('Validation Error: Contra Account ID cannot be blank.', 'error');
  if (!cName || !principal) return showToast('Validation Error: Base customer profile fields are missing.', 'error');

  // Populate structural text markers inside the hidden modal confirmation screen overlay
  document.getElementById('mdAccountId').textContent = accId;
  document.getElementById('mdPaymentMode').textContent = modeDis;
  document.getElementById('mdAccountType').textContent = accType;
  document.getElementById('mdContraAccountId').textContent = contra;

  // Refresh client-side matrix metrics
  runAmortizationCalculation(
    principal, 
    document.getElementById('fInterestRate').value, 
    document.getElementById('fTenorMonths').value, 
    document.getElementById('fDisbursementDate').value
  );

  // Bring confirmation screen layout to forefront focus
  document.getElementById('disbursementModal').classList.add('active');
});

/* ── Modal Window Window Controls & Core Commit Posting Pipeline ── */

// Handle modal cancellation/abort request
document.getElementById('btnConfirmCancel').addEventListener('click', () => {
  document.getElementById('disbursementModal').classList.remove('active');
  showToast('Database ledger entry aborted by operator.', 'info');
});

// Post checked values directly to Supabase production schema
document.getElementById('btnConfirmCommit').addEventListener('click', async () => {
  // Hide modal viewport window instantly
  document.getElementById('disbursementModal').classList.remove('active');

  // Build column names payload schema to align seamlessly with database specifications
  const payload = {
    application_id:    document.getElementById('fAccountId').value.trim(), // Foreign key back to loanmasterrecords 
    customer_name:     document.getElementById('fCustomerName').value.trim(),
    amount_disbursed:  parseFloat(document.getElementById('fAmountDisbursed').value),
    disbursement_date: document.getElementById('fDisbursementDate').value || new Date().toISOString().split('T')[0],
    payment_mode:      document.getElementById('fPaymentMode').value,
    cheque_no:         document.getElementById('fChequeNo').value || null,
    bank_name:         document.getElementById('fBankName').value || null,
    account_number:    document.getElementById('fContraAccountId').value.trim(), 
    interest_rate:     parseFloat(document.getElementById('fInterestRate').value),
    tenor_months:      parseInt(document.getElementById('fTenorMonths').value)
  };

  try {
    showToast('Posting loan disbursement parameters into general ledger...', 'info');
    
    // Commit transaction mapping directly onto database backend target paths
    const responseData = await sbFetch('loan_disbursement', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    currentRecord = Array.isArray(responseData) ? responseData[0] : responseData;
    setMode('view');
    showToast('✔ Loan successfully authorized, posted, and committed to database general ledger.', 'success');
  } catch (err) {
    showToast(`Post Aborted: ${err.message}`, 'error');
  }
});

// TOOLBAR CANCEL: Discard layout updates safely
document.getElementById('btnCancel').addEventListener('click', () => {
  clearFormLayout();
  currentRecord = null;
  setMode('view');
  showToast('Form changes discarded cleanly.');
});

// TOOLBAR CLOSE: Clear reference tracking metrics
document.getElementById('btnClose').addEventListener('click', () => {
  clearFormLayout();
  document.getElementById('fAccountId').value = '';
  currentRecord = null;
  setMode('view');
  showToast('Form reset. Workspace context unassigned.');
});

// Initial boot state configurations
setMode('view');
