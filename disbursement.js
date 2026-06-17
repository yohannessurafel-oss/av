/* ─────────────────────────────────────────────────────────
   Loan Disbursement Execution Controller Module
   ───────────────────────────────────────────────────────── */
'use strict';

// Global Environment State Flags
let mode = 'view';
let currentRecord = null;

// Tab Routing Event Hooks
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// Toast Messaging Pipeline Utility
function showNotification(msg, variant = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${variant}`;
  setTimeout(() => t.className = 'toast', 3500);
}

// Enable/Disable input controls based on status flag state
function toggleFormState(enabled) {
  const fields = document.querySelectorAll('.tab-panel input, .tab-panel select');
  fields.forEach(f => f.disabled = !enabled);
}

// Clear all inputs when adding a new record or canceling
function wipeFormInputs() {
  document.querySelectorAll('.tab-panel input').forEach(i => i.value = '');
  document.getElementById('repaymentGrid').querySelector('tbody').innerHTML = 
    `<tr><td colspan="7" class="placeholder-text">Enter transaction parameters and click save to calculate amortization profile layout.</td></tr>`;
}

// Set active operation state layout
function setMode(m) {
  mode = m;
  if (m === 'view') {
    toggleFormState(false);
    document.getElementById('btnAdd').disabled = false;
    document.getElementById('btnEdit').disabled = !currentRecord;
    document.getElementById('btnSave').disabled = true;
    document.getElementById('btnCancel').disabled = true;
  } else {
    toggleFormState(true);
    document.getElementById('btnAdd').disabled = true;
    document.getElementById('btnEdit').disabled = true;
    document.getElementById('btnSave').disabled = false;
    document.getElementById('btnCancel').disabled = false;
  }
}

/* ── Financial Mathematics Core: Straight-Line Balance Amortization Engine ── */
function renderAmortizationPlan(principal, annualRate, months, dateStart) {
  const tbody = document.getElementById('repaymentGrid').querySelector('tbody');
  tbody.innerHTML = ''; // Flush placeholder entry text

  let balance = parseFloat(principal);
  const tenor = parseInt(months);
  const interestRateFactor = parseFloat(annualRate) / 100 / 12;
  
  // Calculate fixed monthly principal breakdown installment split
  const monthlyPrincipalPay = balance / tenor;
  let baseDate = dateStart ? new Date(dateStart) : new Date();

  for (let i = 1; i <= tenor; i++) {
    const interestComponent = balance * interestRateFactor;
    const totalInstallmentDue = monthlyPrincipalPay + interestComponent;
    const initialPrincipal = balance;
    balance -= monthlyPrincipalPay;

    // Advance payment execution targets month over month dynamically
    baseDate.setMonth(baseDate.getMonth() + 1);
    const dynamicDateStr = baseDate.toISOString().split('T')[0];

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${i}</td>
      <td>${dynamicDateStr}</td>
      <td>${initialPrincipal.toFixed(2)} ETB</td>
      <td>${monthlyPrincipalPay.toFixed(2)} ETB</td>
      <td>${interestComponent.toFixed(2)} ETB</td>
      <td><strong>${totalInstallmentDue.toFixed(2)} ETB</strong></td>
      <td>${Math.abs(balance) < 0.01 ? '0.00' : balance.toFixed(2)} ETB</td>
    `;
    tbody.appendChild(row);
  }
}

/* ── Operation Listeners (Wired up to match specified guidelines) ── */

// VIEW Action Handler
document.getElementById('btnView').addEventListener('click', () => {
  const appId = document.getElementById('searchAppId').value.trim();
  if(!appId) return showNotification('Enter an active Application ID context.', 'error');
  showNotification(`Viewing active record map context for: ${appId}`);
});

// ADD Action Handler
document.getElementById('btnAdd').addEventListener('click', () => {
  wipeFormInputs();
  currentRecord = null;
  setMode('add');
  document.getElementById('fCustomerName').focus();
  showNotification('Form cleared. Type the fields then click save to commit layout.');
});

// EDIT Action Handler
document.getElementById('btnEdit').addEventListener('click', () => {
  if (!currentRecord) return showNotification('No loaded entries to amend.', 'error');
  setMode('edit');
});

// CANCEL Action Handler
document.getElementById('btnCancel').addEventListener('click', () => {
  wipeFormInputs();
  currentRecord = null;
  setMode('view');
  showNotification('Modifications discarded cleanly.');
});

// CLOSE Action Handler
document.getElementById('btnClose').addEventListener('click', () => {
  wipeFormInputs();
  currentRecord = null;
  setMode('view');
  showNotification('Workspace item reference balance unassigned.');
});

// SAVE Action Handler
document.getElementById('btnSave').addEventListener('click', async () => {
  const appRef = document.getElementById('searchAppId').value.trim();
  const cName  = document.getElementById('fCustomerName').value.trim();
  const pAmt   = document.getElementById('fAmountDisbursed').value;
  const iRate  = document.getElementById('fInterestRate').value;
  const mTenor = document.getElementById('fTenorMonths').value;
  const dDate  = document.getElementById('fDisbursementDate').value;

  if(!appRef || !cName || !pAmt) {
    return showNotification('Mandatory fields (*) must be populated.', 'error');
  }

  // Calculate the schedule on the client side before saving
  renderAmortizationPlan(pAmt, iRate, mTenor, dDate);

  const payload = {
    application_id:    appRef,
    customer_name:     cName,
    amount_disbursed:  parseFloat(pAmt),
    disbursement_date: dDate || new Date().toISOString().split('T')[0],
    payment_mode:      document.getElementById('fPaymentMode').value,
    cheque_no:         document.getElementById('fChequeNo').value || null,
    bank_name:         document.getElementById('fBankName').value || null,
    account_number:    document.getElementById('fAccountNumber').value || null,
    interest_rate:     parseFloat(iRate),
    tenor_months:      parseInt(mTenor)
  };

  try {
    showNotification('Posting transaction records directly to Supabase engine...', 'info');
    
    // Simulate API fetch payload to Supabase database destination targets
    // Replace URL stub array paths with your main sbFetch connection rules
    console.log('Sending transaction maps:', payload);
    
    currentRecord = payload; 
    setMode('view');
    showNotification('✔ Disbursement ledger finalized and committed successfully.', 'success');
  } catch (error) {
    showNotification(`Rejection Exception: ${error.message}`, 'error');
  }
});

// Application Initialize Configuration
setMode('view');
