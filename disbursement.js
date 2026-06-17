/* ─────────────────────────────────────────────────────────
   Loan Disbursement Execution Controller Module
   Africa Village Microfinance CBS
   ───────────────────────────────────────────────────────── */
'use strict';

// ── Supabase REST API Setup ──────────────────────────────
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

// UI Tab Navigation Logic
document.querySelectorAll('.tab').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    button.classList.add('active');
    document.getElementById(`tab-${button.dataset.tab}`).classList.add('active');
  });
});

// Toast Feedback Notification Pipeline
function showToast(message, variant = 'info') {
  const target = document.getElementById('toast');
  target.textContent = message;
  target.className = `toast show ${variant}`;
  clearTimeout(target._timer);
  target._timer = setTimeout(() => target.className = 'toast', 4000);
}

// Toggle Input Fields Form State
function setFormControlsState(enabled) {
  const entries = document.querySelectorAll('.tab-panel input, .tab-panel select');
  entries.forEach(item => item.disabled = !enabled);
}

// Clear Form Input Layout Clear out
function clearFormLayout() {
  document.querySelectorAll('.tab-panel input, .tab-panel select').forEach(element => {
    if (element.id !== 'fAccountId') element.value = '';
  });
  document.getElementById('repaymentGrid').querySelector('tbody').innerHTML = 
    `<tr><td colspan="7" class="placeholder-text">Enter transaction parameters and click save to calculate amortization profile layout.</td></tr>`;
}

// Global Core State Workflow Matrix
function setMode(newMode) {
  mode = newMode;
  const isEditing = (newMode === 'add' || newMode === 'edit');
  setFormControlsState(isEditing);
  
  // Enforce rigid core input state flow rules
  document.getElementById('fAccountId').disabled = (newMode !== 'view');
  document.getElementById('btnAdd').disabled = isEditing;
  document.getElementById('btnEdit').disabled = (isEditing || !currentRecord);
  document.getElementById('btnSave').disabled = !isEditing;
  document.getElementById('btnCancel').disabled = !isEditing;
}

/* ── Amortization Engine Matrix: Straight Line Amortization ── */
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

/* ── Core 7-Step Business Rule Pipeline Logic ───────────── */

// STEP 2: CLICK VIEW — Query master backend table schemas to populate customer details
document.getElementById('btnView').addEventListener('click', async () => {
  const searchId = document.getElementById('fAccountId').value.trim(); // STEP 1: Enter Account/Application ID
  if (!searchId) return showToast('Please enter an Account ID to fetch.', 'error');

  try {
    showToast('Fetching structural application ledger parameters...', 'info');
    // Queries database layout matching your exact relational schemas
    const records = await sbFetch(`loanmasterrecords?application_id=eq.${encodeURIComponent(searchId)}&limit=1`);
    
    if (records && records.length > 0) {
      currentRecord = records[0];
      
      // Map properties back dynamically into core input controls
      document.getElementById('fCustomerName').value = currentRecord.client_name || '';
      document.getElementById('fAmountDisbursed').value = currentRecord.approved_amount || currentRecord.applied_amount || '';
      document.getElementById('fDisbursementDate').value = currentRecord.disbursement_date || new Date().toISOString().split('T')[0];
      document.getElementById('fPaymentMode').value = currentRecord.mode_of_disbursement || '';
      document.getElementById('fAccountType').value = currentRecord.account_class || '';
      document.getElementById('fContraAccountId').value = currentRecord.main_repayment_account_id || '';
      document.getElementById('fChequeNo').value = currentRecord.reference_no || '';
      document.getElementById('fBankName').value = currentRecord.bank_id || '';
      document.getElementById('fInterestRate').value = currentRecord.interest_rate || '12.00';
      document.getElementById('fTenorMonths').value = currentRecord.term_months || '12';

      // Load client-side visualization plan values instantly
      runAmortizationCalculation(
        currentRecord.approved_amount || currentRecord.applied_amount,
        currentRecord.interest_rate || 12,
        currentRecord.term_months || 12,
        currentRecord.disbursement_date
      );
      
      setMode('view');
      showToast(`✔ Records loaded for Account Application ID: ${searchId}`, 'success');
    } else {
      showToast('No record found matching that entry inside loanmasterrecords.', 'error');
    }
  } catch (err) {
    showToast(`Inquiry Failure: ${err.message}`, 'error');
  }
});

// STEP 3: CLICK ADD — Unlock input elements for configuration adjustments
document.getElementById('btnAdd').addEventListener('click', () => {
  if (!currentRecord) {
    return showToast('Please input an Account ID and click View before activating entry fields.', 'error');
  }
  setMode('add');
  showToast('Form fields unlocked. Populate configurations and click Save.');
});

// STEP 7: CLICK SAVE — Validate inputs and show verification confirmation screen modal overlay
document.getElementById('btnSave').addEventListener('click', () => {
  const accId   = document.getElementById('fAccountId').value.trim();
  const modeDis = document.getElementById('fPaymentMode').value;           // STEP 4: Select Mode of Disbursement
  const accType = document.getElementById('fAccountType').value;           // STEP 5: Select Account Type
  const contra  = document.getElementById('fContraAccountId').value.trim(); // STEP 6: Enter Contra Account ID
  const cName   = document.getElementById('fCustomerName').value.trim();
  const principal = document.getElementById('fAmountDisbursed').value;

  // Enforce rigid transactional form assertions
  if (!accId) return showToast('Validation Error: Account ID field cannot be left blank.', 'error');
  if (!modeDis) return showToast('Validation Error: Please select a valid Mode Of Disbursement.', 'error');
  if (!accType) return showToast('Validation Error: Please select an Account Type context.', 'error');
  if (!contra) return showToast('Validation Error: Contra Account ID field is mandatory.', 'error');
  if (!cName || !principal) return showToast('Validation Error: Structural profile transaction metrics are missing.', 'error');

  // Sync details dynamically to validation modal text nodes
  document.getElementById('mdAccountId').textContent = accId;
  document.getElementById('mdPaymentMode').textContent = modeDis;
  document.getElementById('mdAccountType').textContent = accType;
  document.getElementById('mdContraAccountId').textContent = contra;

  // Refresh data matrix views before final confirmation sequence
  runAmortizationCalculation(
    principal, 
    document.getElementById('fInterestRate').value, 
    document.getElementById('fTenorMonths').value, 
    document.getElementById('fDisbursementDate').value
  );

  // Present validation window to supervisor
  document.getElementById('disbursementModal').classList.add('active');
});

/* ── Modal Processing and Database Pipeline Actions ────── */

// Handle cancellation request from the overlay
document.getElementById('btnConfirmCancel').addEventListener('click', () => {
  document.getElementById('disbursementModal').classList.remove('active');
  showToast('Disbursement journal entry creation aborted by user.', 'info');
});

// Post validated input configurations directly to Supabase production tables
document.getElementById('btnConfirmCommit').addEventListener('click', async () => {
  document.getElementById('disbursementModal').classList.remove('active');

  // Build schema mapping payload fields exactly matching your database structures
  const payload = {
    application_id:    document.getElementById('fAccountId').value.trim(), // Foreign key link to loanmasterrecords
    customer_name:     document.getElementById('fCustomerName').value.trim(),
    amount_disbursed:  parseFloat(document.getElementById('fAmountDisbursed').value),
    disbursement_date: document.getElementById('fDisbursementDate').value || new Date().toISOString().split('T')[0],
    payment_mode:      document.getElementById('fPaymentMode').value,
    account_type:       document.getElementById('fAccountType').value,
    contra_account_id:  document.getElementById('fContraAccountId').value.trim(), 
    cheque_no:         document.getElementById('fChequeNo').value || null,
    bank_name:         document.getElementById('fBankName').value || null,
    interest_rate:     parseFloat(document.getElementById('fInterestRate').value),
    tenor_months:      parseInt(document.getElementById('fTenorMonths').value)
  };

  try {
    showToast('Committing posted values into public schema tables...', 'info');
    
    // Fire transaction save records directly onto table paths via REST API endpoints
    const responseData = await sbFetch('loan_disbursement', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    currentRecord = Array.isArray(responseData) ? responseData[0] : responseData;
    setMode('view');
    showToast('✔ Credit disbursement posted and saved safely into the general ledger.', 'success');
  } catch (err) {
    showToast(`Post Failure: ${err.message}`, 'error');
  }
});

// TOOLBAR CANCEL Action Handler
document.getElementById('btnCancel').addEventListener('click', () => {
  clearFormLayout();
  currentRecord = null;
  setMode('view');
  showToast('Pending structural entry changes discarded.');
});

// TOOLBAR CLOSE Action Handler
document.getElementById('btnClose').addEventListener('click', () => {
  clearFormLayout();
  document.getElementById('fAccountId').value = '';
  currentRecord = null;
  setMode('view');
  showToast('Workspace reset. System operational references cleared.');
});

// Initialize form operational view components upon screen load
setMode('view');
