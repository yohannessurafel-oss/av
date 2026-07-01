/* ═══════════════════════════════════════════════════════════
   Africa Village Microfinance — 10 Loan Disbursement
   disbursement.js  v3.2 — STATUS GUARD WIRED IN
   Tables written:
     → loan_disbursement  (one row per disbursement event)
     → loan_ledger        (disbursement row only)
   Tables read:
     → loanmasterrecords              (application lookup)
     → lendingproductparametermatrix  (product_name_title)

   Requires loan-status-guard.js to be loaded BEFORE this file:
     <script src="loan-status-guard.js"></script>
     <script src="disbursement.js"></script>

   WHAT CHANGED FROM v3.1
   Previously this module would post a disbursement and set
   application_status = 'Disbursed' regardless of the loan's current
   status — a Draft or DataEntry application could be disbursed
   without ever being sanctioned. Now the confirm-commit step checks
   LoanStatusGuard.canTransition() first and refuses to post if the
   loan isn't currently 'Sanctioned'.
═══════════════════════════════════════════════════════════ */
'use strict';

/* ── Supabase config ────────────────────────────────────── */
const SUPABASE_URL = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';

/* ── HTTP helper ─────────────────────────────────────────── */
async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
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

/* ── Module state ────────────────────────────────────────── */
let mode          = 'view';
let currentRecord = null;   // row from loanmasterrecords
let _productName  = '';     // resolved from lendingproductparametermatrix

/* ── System date ─────────────────────────────────────────── */
(function initDate() {
  const el = document.getElementById('systemDate');
  if (el) el.textContent = new Date().toLocaleDateString('en-ET', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
  });
})();

/* ── Tab navigation ──────────────────────────────────────── */
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

/* ── Toast ───────────────────────────────────────────────── */
const _toastEl = document.getElementById('toastNotification');
let _toastTimer = null;
function showToast(msg, variant = 'info') {
  _toastEl.textContent = msg;
  _toastEl.className = `toast show ${variant}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { _toastEl.className = 'toast'; }, 4000);
}

/* ── Form Control State Handler ──────────────────── */
function setFormControlsState(enabled) {
  document.querySelectorAll('.tab-panel input, .tab-panel select')
    .forEach(el => { 
      if (el.id !== 'fCustomerName') {
        el.disabled = !enabled; 
      }
    });
}

/* ── Clear form ──────────────────────────────────────────── */
function clearFormLayout() {
  document.querySelectorAll('.tab-panel input, .tab-panel select').forEach(el => {
    if (el.id !== 'fAccountId') el.value = '';
  });
  document.getElementById('repaymentGrid').querySelector('tbody').innerHTML =
    `<tr><td colspan="7" class="placeholder-text">Enter transaction parameters and click Save to generate amortization schedule.</td></tr>`;
}

/* ── Mode Control ────────────────────────────────── */
function setMode(newMode) {
  mode = newMode;
  const isEditing = newMode === 'add' || newMode === 'edit';
  setFormControlsState(isEditing);

  document.getElementById('fAccountId').disabled = false;

  document.getElementById('btnAdd').disabled    = isEditing;
  document.getElementById('btnEdit').disabled   = isEditing || !currentRecord;
  document.getElementById('btnSave').disabled   = !isEditing;
  document.getElementById('btnCancel').disabled = !isEditing;

  const sb = document.getElementById('statusBar');
  if (sb) sb.textContent = `Mode: ${newMode.charAt(0).toUpperCase() + newMode.slice(1)}` +
    (currentRecord ? ` — Account: ${document.getElementById('fAccountId').value}` : '');
}

/* ══════════════════════════════════════════════════════════
   AMORTIZATION ENGINE
   Standardized to Equated Monthly Installment (reducing balance / annuity)
   to ensure mathematical consistency with loan-application.js
══════════════════════════════════════════════════════════ */
function buildAmortizationSchedule(principal, annualRate, tenor, startDate) {
  const rows = [];
  const P = parseFloat(principal);
  const n = parseInt(tenor);
  const r = (parseFloat(annualRate) / 100) / 12;
  let balance = P;
  let date = startDate ? new Date(startDate) : new Date();

  // Monthly annuity installment formula (EMI)
  const emi = r === 0 ? P / n : P * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);

  for (let i = 1; i <= n; i++) {
    const interest = balance * r;
    const principalPaid = emi - interest;
    const openBalance = balance;
    balance -= principalPaid;
    date.setMonth(date.getMonth() + 1);

    rows.push({
      instalment_no:   i,
      payment_date:    date.toISOString().split('T')[0],
      opening_balance: openBalance,
      principal_paid:  principalPaid,
      interest:        interest,
      total_due:       emi,
      closing_balance: Math.abs(balance) < 0.01 ? 0 : balance
    });
  }
  return rows;
}

/* Render schedule to the on-screen grid */
function renderScheduleGrid(rows) {
  const tbody = document.getElementById('repaymentGrid').querySelector('tbody');
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${r.instalment_no}</td>
      <td>${r.payment_date}</td>
      <td>${r.opening_balance.toFixed(2)} ETB</td>
      <td>${r.principal_paid.toFixed(2)} ETB</td>
      <td>${r.interest.toFixed(2)} ETB</td>
      <td><strong>${r.total_due.toFixed(2)} ETB</strong></td>
      <td>${r.closing_balance.toFixed(2)} ETB</td>
    </tr>`).join('');
}

/* ── STEP 1 + 2 — VIEW: Lookup Application ───────────────── */
document.getElementById('btnView').addEventListener('click', async () => {
  const appId = document.getElementById('fAccountId').value.trim();
  if (!appId) return showToast('Please enter an Application / Account ID.', 'error');

  try {
    showToast('Loading application record…', 'info');

    const rows = await sbFetch(
      `loanmasterrecords?application_id=eq.${encodeURIComponent(appId)}&limit=1`
    );
    if (!rows || rows.length === 0) {
      return showToast('No record found for that Application ID in loanmasterrecords.', 'error');
    }
    currentRecord = rows[0];

    _productName = '';
    if (currentRecord.product_id) {
      try {
        const prod = await sbFetch(
          `lendingproductparametermatrix?product_code_id=eq.${encodeURIComponent(currentRecord.product_id)}&select=product_name_title&limit=1`
        );
        if (prod && prod[0]) _productName = prod[0].product_name_title || '';
      } catch (_) {}
    }

    let resolvedName = currentRecord.client_name || '';
    if (!resolvedName && currentRecord.client_id) {
      try {
        const cRows = await sbFetch(
          `ClientMasterRecords?client_id=eq.${encodeURIComponent(currentRecord.client_id)}&select=client_name&limit=1`
        );
        if (cRows && cRows[0]) resolvedName = cRows[0].client_name || '';
      } catch (_) {}
    }

    currentRecord._resolvedName = resolvedName;

    document.getElementById('fCustomerName').value     = resolvedName;
    document.getElementById('fAmountDisbursed').value  = currentRecord.approved_amount || currentRecord.applied_amount || '';
    document.getElementById('fDisbursementDate').value = currentRecord.disbursement_date || new Date().toISOString().split('T')[0];
    document.getElementById('fPaymentMode').value      = currentRecord.mode_of_disbursement || '';
    document.getElementById('fAccountType').value      = currentRecord.account_class || '';
    document.getElementById('fContraAccountId').value  = currentRecord.main_repayment_account_id || '';
    document.getElementById('fChequeNo').value         = currentRecord.reference_no || '';
    document.getElementById('fBankName').value         = '';   
    document.getElementById('fInterestRate').value     = currentRecord.interest_rate || '12.00';
    document.getElementById('fTenorMonths').value      = currentRecord.term_months   || '12';

    const schedule = buildAmortizationSchedule(
      currentRecord.approved_amount || currentRecord.applied_amount,
      currentRecord.interest_rate || 12,
      currentRecord.term_months   || 12,
      currentRecord.disbursement_date
    );
    renderScheduleGrid(schedule);

    setMode('view');
    showToast(`✔ Loaded: ${appId} — ${resolvedName}`, 'success');
  } catch (err) {
    showToast(`Lookup failed: ${err.message}`, 'error');
  }
});

/* ── ADD button ──────────────────────────────────────────── */
document.getElementById('btnAdd').addEventListener('click', () => {
  if (!currentRecord) {
    return showToast('Enter an Application ID and click 🔍 View before adding.', 'error');
  }
  setMode('add');
  
  document.getElementById('fCustomerName').value    = currentRecord.client_name || currentRecord._resolvedName || '';
  document.getElementById('fAmountDisbursed').value = currentRecord.approved_amount || currentRecord.applied_amount || '';
  
  showToast('Fields unlocked. Confirm details then click Save.');
});

/* ── EDIT button ─────────────────────────────────────────── */
document.getElementById('btnEdit').addEventListener('click', () => {
  if (!currentRecord) {
    return showToast('Load a record first via View (🔍).', 'error');
  }
  setMode('edit');
  
  document.getElementById('fCustomerName').value = currentRecord.client_name || currentRecord._resolvedName || '';
  if (!document.getElementById('fAmountDisbursed').value) {
    document.getElementById('fAmountDisbursed').value = currentRecord.approved_amount || currentRecord.applied_amount || '';
  }
  
  showToast('Edit mode — adjust details then Save.');
});

/* ── SAVE validation ─────────────────────────────────────── */
document.getElementById('btnSave').addEventListener('click', () => {
  const accId     = document.getElementById('fAccountId').value.trim();
  const modeDis   = document.getElementById('fPaymentMode').value;
  const accType   = document.getElementById('fAccountType').value;
  const contra    = document.getElementById('fContraAccountId').value.trim();
  const cName     = document.getElementById('fCustomerName').value.trim();
  const principal = document.getElementById('fAmountDisbursed').value;

  if (!accId)     return showToast('Validation: Application ID cannot be blank.', 'error');
  if (!modeDis)   return showToast('Validation: Select a Mode of Disbursement.', 'error');
  if (!accType)   return showToast('Validation: Select an Account Type.', 'error');
  if (!contra)    return showToast('Validation: Contra Account ID is required.', 'error');
  if (!cName || !principal) return showToast('Validation: Customer name and principal amount are required.', 'error');

  document.getElementById('mdAccountId').textContent      = accId;
  document.getElementById('mdPaymentMode').textContent    = modeDis;
  document.getElementById('mdAccountType').textContent    = accType;
  document.getElementById('mdContraAccountId').textContent = contra;

  const schedule = buildAmortizationSchedule(
    principal,
    document.getElementById('fInterestRate').value,
    document.getElementById('fTenorMonths').value,
    document.getElementById('fDisbursementDate').value
  );
  renderScheduleGrid(schedule);

  document.getElementById('disbursementModal').classList.add('active');
});

document.getElementById('btnConfirmCancel').addEventListener('click', () => {
  document.getElementById('disbursementModal').classList.remove('active');
  showToast('Disbursement posting aborted.', 'info');
});

/* ══════════════════════════════════════════════════════════
   CONFIRM COMMIT
   Updates to standard practices:
     - Only logs actual opening transaction (Disbursement) in ledger [1].
     - Generates repayment plan solely in amortization_schedules (keeps ledger clean) [1].
══════════════════════════════════════════════════════════ */
document.getElementById('btnConfirmCommit').addEventListener('click', async () => {
  document.getElementById('disbursementModal').classList.remove('active');

  const appId = document.getElementById('fAccountId').value.trim();

  // ── GATE: only a Sanctioned loan can be disbursed, and only from here ──
  if (window.LoanStatusGuard) {
    const currentStatus = currentRecord?.application_status || 'DataEntry';
    const check = LoanStatusGuard.canTransition(currentStatus, 'Disbursed', 'disbursement');
    if (!check.allowed) {
      showToast(check.reason, 'error');
      return;
    }
  } else {
    console.warn('LoanStatusGuard not found — disbursing WITHOUT a sanction-status check.');
  }

  const customerName  = document.getElementById('fCustomerName').value.trim()
                     || currentRecord?._resolvedName
                     || currentRecord?.client_name
                     || '';
  const principal     = parseFloat(document.getElementById('fAmountDisbursed').value);
  const disbDate      = document.getElementById('fDisbursementDate').value || new Date().toISOString().split('T')[0];
  const paymentMode   = document.getElementById('fPaymentMode').value;
  const chequeNo      = document.getElementById('fChequeNo').value || null;
  const bankName      = document.getElementById('fBankName').value || null;
  const interestRate  = parseFloat(document.getElementById('fInterestRate').value);
  const tenorMonths   = parseInt(document.getElementById('fTenorMonths').value);
  const accountNumber = document.getElementById('fContraAccountId').value.trim() || currentRecord?.main_repayment_account_id || null;
  const today         = new Date().toISOString().split('T')[0];

  const refBatch = `DISB-${appId}-${today.replace(/-/g, '')}`;

  try {
    showToast('Posting disbursement records…', 'info');

    // ── STEP 1: Insert into loan_disbursement
    const disbPayload = {
      application_id:    appId,
      customer_name:     customerName,
      amount_disbursed:  principal,
      disbursement_date: disbDate,
      payment_mode:      paymentMode,
      cheque_no:         chequeNo,
      bank_name:         bankName,
      account_number:    accountNumber,
      interest_rate:     interestRate,
      tenor_months:      tenorMonths
    };

    await sbFetch('loan_disbursement', {
      method: 'POST',
      prefer: 'return=minimal',
      body:   JSON.stringify(disbPayload)
    });

    // ── STEP 2: Write opening transaction to loan_ledger (Running Balance = Principal owed)
    const ledgerDisbRow = {
      application_id:  appId,
      client_id:       currentRecord?.client_id  || null,
      account_number:  accountNumber,
      product_name:    _productName              || null,
      post_date:       today,
      value_date:      disbDate,
      description:     'Disbursement',
      ref_batch:       refBatch,
      principal:       principal,
      interest:        0,
      charges_penalties: 0,
      accrued_interest_receivable: 0,
      total_paid:      0,
      accrued_unpaid_interest: 0,
      running_balance: principal,
      borrower_name:   customerName
    };

    await sbFetch('loan_ledger', {
      method: 'POST',
      prefer: 'return=minimal',
      body:   JSON.stringify(ledgerDisbRow)
    });

    // ── STEP 3: Write plan installments purely into amortization_schedules (keeps ledger correct) [1]
    const schedule = buildAmortizationSchedule(principal, interestRate, tenorMonths, disbDate);

    for (const row of schedule) {
      await sbFetch('amortization_schedules', {
        method: 'POST',
        prefer: 'return=minimal',
        body: JSON.stringify({
          application_id: appId,
          installment_no: row.instalment_no,
          due_date:       row.payment_date,
          principal_due:  parseFloat(row.principal_paid.toFixed(2)),
          interest_due:   parseFloat(row.interest.toFixed(2)),
          status:         'UNPAID'
        })
      });
    }

    // ── STEP 4: Update status on loanmasterrecords
    const masterPatch = {
      application_status: 'Disbursed',
      modified_on:        new Date().toISOString()
    };
    if (!currentRecord?.first_disbursement_date) {
      masterPatch.first_disbursement_date = disbDate;
    }

    await sbFetch(`loanmasterrecords?application_id=eq.${encodeURIComponent(appId)}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body:   JSON.stringify(masterPatch)
    });

    if (window.LoanStatusGuard) {
      await LoanStatusGuard.logStatusTransition(sbFetch, {
        applicationId: appId,
        fromStatus:    currentRecord?.application_status || 'Sanctioned',
        toStatus:      'Disbursed',
        sourceModule:  'disbursement',
        changedBy:     null
      });
    }

    currentRecord = { ...currentRecord, application_status: 'Disbursed' };
    setMode('view');
    showToast(
      `✔ Disbursement posted successfully. Loan Ledger initialized with principal.`,
      'success'
    );

  } catch (err) {
    showToast(`Post failed: ${err.message}`, 'error');
  }
});

/* ── CANCEL button ───────────────────────────────────────── */
document.getElementById('btnCancel').addEventListener('click', () => {
  clearFormLayout();
  currentRecord = null;
  _productName  = '';
  setMode('view');
  showToast('Pending changes discarded.');
});

/* ── CLOSE button ────────────────────────────────────────── */
document.getElementById('btnClose').addEventListener('click', () => {
  clearFormLayout();
  document.getElementById('fAccountId').value = '';
  currentRecord = null;
  _productName  = '';
  setMode('view');
  showToast('Workspace cleared.');
});

/* ── Init ────────────────────────────────────────────────── */
setMode('view');
