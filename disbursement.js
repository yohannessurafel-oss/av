/* ═══════════════════════════════════════════════════════════
   Africa Village Microfinance — 10 Loan Disbursement
   disbursement.js v3.3 — GL DOUBLE-ENTRY POSTING ADDED

   Tables written:
     → loan_disbursement        (one row per disbursement event)
     → loan_ledger               (disbursement row only)
     → gl_transaction_journal    (NEW — Dr Loans Receivable / Cr Cash-or-Bank)
     → chart_of_accounts         (NEW — running balance update on both legs)

   Tables read:
     → loanmasterrecords              (application lookup)
     → lendingproductparametermatrix  (product_name_title)
     → chart_of_accounts              (NEW — resolve GL account codes by name)

   Requires loan-status-guard.js to be loaded BEFORE this file:
     <script src="loan-status-guard.js"></script>
     <script src="disbursement.js"></script>

   WHAT CHANGED FROM v3.2
   Previously this module posted loan_disbursement and loan_ledger rows
   but never touched the general ledger — chart_of_accounts.current_balance
   and gl_transaction_journal had no writer anywhere in the codebase.
   Now the confirm-commit step also posts a balanced GL journal entry
   (Dr. Loans Receivable / Cr. Cash or Bank, chosen by Mode of Disbursement)
   and updates both accounts' running balances.

   KNOWN LIMITATIONS — flagging rather than silently working around:
   1. GL account matching is done by a case-insensitive LIKE on
      account_name_title ('Loans Receivable' / 'Cash' / 'Bank'). If your
      chart_of_accounts doesn't have accounts with those words in the
      title, GL posting is skipped with a warning toast — the core
      disbursement (loan_disbursement, loan_ledger, status) still
      completes normally. Rename accounts or adjust GL_ACCOUNT_PATTERNS
      below to match your actual chart of accounts.
   2. The chart_of_accounts.current_balance update is a read-then-write,
      not an atomic increment. Two disbursements posted at the exact
      same instant could race and one update could be lost. Closing
      this properly needs a Postgres function (e.g. an RPC that does
      `current_balance = current_balance + delta` server-side) — not
      implemented here since it's a schema/RPC change, not a JS change,
      and I don't have visibility into what RPCs already exist in this
      Supabase project.
   3. This step runs in its own try/catch AFTER loan_disbursement,
      loan_ledger, amortization_schedules, and the status PATCH have
      already succeeded. If GL posting fails, the disbursement is NOT
      rolled back — you get a completed disbursement with a warning
      toast instead of a silent, undetected accounting gap. This is
      consistent with the fact that none of these multi-step writes are
      wrapped in an actual DB transaction (Supabase REST doesn't give
      you one without an RPC) — a pre-existing limitation of this whole
      confirm-commit flow, not something new introduced here.
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
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': opts.prefer || 'return=representation',
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

async function sbRpc(fnName, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type':  'application/json'
    },
    body: JSON.stringify(params)
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((data && data.message) || `HTTP ${res.status}`);
  }
  return data;
}

/* ── Module state ────────────────────────────────────────── */
let mode = 'view';
let currentRecord = null;   // row from loanmasterrecords
let _productName = '';      // resolved from lendingproductparametermatrix

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
  document.getElementById('btnAdd').disabled = isEditing;
  document.getElementById('btnEdit').disabled = isEditing || !currentRecord;
  document.getElementById('btnSave').disabled = !isEditing;
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
      instalment_no: i,
      payment_date: date.toISOString().split('T')[0],
      opening_balance: openBalance,
      principal_paid: principalPaid,
      interest: interest,
      total_due: emi,
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
/* ── Group Context — shows whether this loan is part of a group
   batch, and which member it is. Purely informational — every group
   member gets its own normal loanmasterrecords row, so nothing else
   in this module needs group_id for its actual logic. Same pattern
   as credit-sanction-console.js / loan-appraisal-management.js /
   loan-repayment-collection.js. ── */
async function loadGroupContext(rec) {
  const banner = document.getElementById('groupContextBanner');
  const text   = document.getElementById('groupContextText');
  if (!banner || !text) return;

  if (!rec.group_id) {
    banner.style.display = 'none';
    return;
  }

  try {
    const [members, groupRows] = await Promise.all([
      sbFetch(`loanmasterrecords?group_id=eq.${encodeURIComponent(rec.group_id)}&select=application_id&order=application_id.asc`),
      sbFetch(`portfoliogrouphierarchy?group_registry_id=eq.${encodeURIComponent(rec.group_id)}&select=group_name_alias&limit=1`)
    ]);
    const total = Array.isArray(members) ? members.length : 1;
    const idx   = Array.isArray(members) ? members.findIndex(m => m.application_id === rec.application_id) + 1 : 1;
    const groupName = (groupRows && groupRows[0] && groupRows[0].group_name_alias) ? ` — ${groupRows[0].group_name_alias}` : '';

    text.textContent = `${rec.group_id}${groupName} — Member ${idx > 0 ? idx : '?'} of ${total}`;
    banner.style.display = '';
  } catch (e) {
    text.textContent = `${rec.group_id} (could not load member count)`;
    banner.style.display = '';
  }
}

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
    loadGroupContext(currentRecord);

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

    document.getElementById('fCustomerName').value = resolvedName;
    document.getElementById('fAmountDisbursed').value = currentRecord.approved_amount || currentRecord.applied_amount || '';
    document.getElementById('fDisbursementDate').value = currentRecord.disbursement_date || new Date().toISOString().split('T')[0];
    document.getElementById('fPaymentMode').value = currentRecord.mode_of_disbursement || '';
    document.getElementById('fAccountType').value = currentRecord.account_class || '';
    document.getElementById('fContraAccountId').value = currentRecord.main_repayment_account_id || '';
    document.getElementById('fChequeNo').value = currentRecord.reference_no || '';
    document.getElementById('fBankName').value = '';
    document.getElementById('fInterestRate').value = currentRecord.interest_rate || '12.00';
    document.getElementById('fTenorMonths').value = currentRecord.term_months || '12';

    const schedule = buildAmortizationSchedule(
      currentRecord.approved_amount || currentRecord.applied_amount,
      currentRecord.interest_rate || 12,
      currentRecord.term_months || 12,
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
  document.getElementById('fCustomerName').value = currentRecord.client_name || currentRecord._resolvedName || '';
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
  const accId = document.getElementById('fAccountId').value.trim();
  const modeDis = document.getElementById('fPaymentMode').value;
  const accType = document.getElementById('fAccountType').value;
  const contra = document.getElementById('fContraAccountId').value.trim();
  const cName = document.getElementById('fCustomerName').value.trim();
  const principal = document.getElementById('fAmountDisbursed').value;

  if (!accId) return showToast('Validation: Application ID cannot be blank.', 'error');
  if (!modeDis) return showToast('Validation: Select a Mode of Disbursement.', 'error');
  if (!accType) return showToast('Validation: Select an Account Type.', 'error');
  if (!contra) return showToast('Validation: Contra Account ID is required.', 'error');
  if (!cName || !principal) return showToast('Validation: Customer name and principal amount are required.', 'error');

  document.getElementById('mdAccountId').textContent = accId;
  document.getElementById('mdPaymentMode').textContent = modeDis;
  document.getElementById('mdAccountType').textContent = accType;
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
   GL posting is now handled server-side, inside the atomic
   post_loan_disbursement() function — see post_loan_disbursement.sql.
   The client-side findGLAccount()/postDisbursementToGL() helpers that
   used to live here (v3.3) are superseded and removed, since duplicating
   that account-matching logic in two places would let them drift apart.
   ══════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════
   CONFIRM COMMIT
   Updates to standard practices:
   - Only logs actual opening transaction (Disbursement) in ledger [1].
   - Generates repayment plan solely in amortization_schedules (keeps ledger clean) [1].
   - NEW: posts the matching GL journal entry after the ledger opens.
   ══════════════════════════════════════════════════════════ */
document.getElementById('btnConfirmCommit').addEventListener('click', async () => {
  // ── Guard against double-submission ──
  // This handler does several sequential writes (loan_disbursement,
  // loan_ledger, one insert per schedule installment, GL journal entries,
  // and a chart_of_accounts balance update) with no atomicity — a
  // double-click here previously inserted the ENTIRE amortization
  // schedule twice (confirmed on a real test loan), and in this v3.3
  // version would ALSO duplicate GL journal entries and double-increment
  // account balances, since nothing stopped the handler from running a
  // second time while the first was still in flight.
  if (window._disbursementInFlight) {
    console.warn('Disbursement already in progress — ignoring duplicate click.');
    return;
  }
  window._disbursementInFlight = true;
  const commitBtn = document.getElementById('btnConfirmCommit');
  if (commitBtn) commitBtn.disabled = true;

  document.getElementById('disbursementModal').classList.remove('active');
  const appId = document.getElementById('fAccountId').value.trim();

  // ── GATE: only a Sanctioned loan can be disbursed, and only from here ──
  if (window.LoanStatusGuard) {
    const currentStatus = currentRecord?.application_status || 'DataEntry';
    const check = LoanStatusGuard.canTransition(currentStatus, 'Disbursed', 'disbursement');
    if (!check.allowed) {
      showToast(check.reason, 'error');
      window._disbursementInFlight = false;
      if (commitBtn) commitBtn.disabled = false;
      return;
    }
  } else {
    console.warn('LoanStatusGuard not found — disbursing WITHOUT a sanction-status check.');
  }

  const customerName = document.getElementById('fCustomerName').value.trim()
    || currentRecord?._resolvedName
    || currentRecord?.client_name
    || '';
  const principal = parseFloat(document.getElementById('fAmountDisbursed').value);
  const disbDate = document.getElementById('fDisbursementDate').value || new Date().toISOString().split('T')[0];
  const paymentMode = document.getElementById('fPaymentMode').value;
  const chequeNo = document.getElementById('fChequeNo').value || null;
  const bankName = document.getElementById('fBankName').value || null;
  const interestRate = parseFloat(document.getElementById('fInterestRate').value);
  const tenorMonths = parseInt(document.getElementById('fTenorMonths').value);
  const accountNumber = document.getElementById('fContraAccountId').value.trim() || currentRecord?.main_repayment_account_id || null;

  const today = new Date().toISOString().split('T')[0];
  const refBatch = `DISB-${appId}-${today.replace(/-/g, '')}`;

  try {
    showToast('Posting disbursement…', 'info');

    // Single atomic transaction: loan_disbursement, loan_ledger,
    // amortization_schedules, GL journal + balance updates, status change,
    // and audit log all happen together — either the whole disbursement
    // completes, or none of it does. See post_loan_disbursement.sql for
    // the full rationale (this replaces six previously-sequential,
    // non-atomic client-side writes, including the read-then-write
    // chart_of_accounts race condition flagged in this file's own v3.3
    // header comments).
    const schedule = buildAmortizationSchedule(principal, interestRate, tenorMonths, disbDate);
    const schedulePayload = schedule.map(row => ({
      installment_no: row.instalment_no,
      due_date:       row.payment_date,
      principal_due:  parseFloat(row.principal_paid.toFixed(2)),
      interest_due:   parseFloat(row.interest.toFixed(2))
    }));

    const result = await sbRpc('post_loan_disbursement', {
      p_application_id:    appId,
      p_customer_name:     customerName,
      p_principal:         principal,
      p_disbursement_date: disbDate,
      p_payment_mode:      paymentMode,
      p_interest_rate:     interestRate,
      p_tenor_months:      tenorMonths,
      p_account_number:    accountNumber,
      p_schedule:          schedulePayload,
      p_ref_batch:         refBatch,
      p_product_name:      _productName || null,
      p_cheque_no:         chequeNo,
      p_bank_name:         bankName,
      p_posted_by:         (window.currentUserEmail || null)
    });

    currentRecord = { ...currentRecord, application_status: 'Disbursed' };
    setMode('view');
    showToast(
      `✔ Disbursement posted. ${result.installments_created} installments created. GL: Dr ${result.gl_dr_account} / Cr ${result.gl_cr_account}.`,
      'success'
    );
  } catch (err) {
    showToast(`Post failed: ${err.message}`, 'error');
  } finally {
    window._disbursementInFlight = false;
    if (commitBtn) commitBtn.disabled = false;
  }
});

/* ── CANCEL button ───────────────────────────────────────── */
document.getElementById('btnCancel').addEventListener('click', () => {
  clearFormLayout();
  currentRecord = null;
  _productName = '';
  setMode('view');
  showToast('Pending changes discarded.');
});

/* ── CLOSE button ────────────────────────────────────────── */
document.getElementById('btnClose').addEventListener('click', () => {
  clearFormLayout();
  document.getElementById('fAccountId').value = '';
  currentRecord = null;
  _productName = '';
  setMode('view');
  showToast('Workspace cleared.');
});

/* ── Init ────────────────────────────────────────────────── */
setMode('view');

// ── Window Controls: Minimize / Maximize ────────────────────
const windowContainer = document.querySelector('.window-container');
const wcMinimizeBtn    = document.getElementById('wcMinimize');
const wcMaximizeBtn    = document.getElementById('wcMaximize');
const dockSliver        = document.getElementById('dockSliver');

function toggleMinimize() {
  if (!windowContainer || !dockSliver) return;
  // Maximize and minimize are mutually exclusive
  windowContainer.classList.remove('is-maximized');
  if (wcMaximizeBtn) wcMaximizeBtn.textContent = '▢';

  windowContainer.classList.toggle('is-minimized');
  const minimized = windowContainer.classList.contains('is-minimized');
  dockSliver.classList.toggle('show', minimized);
  if (wcMinimizeBtn) wcMinimizeBtn.title = minimized ? 'Restore' : 'Minimize';
}

function toggleMaximize() {
  if (!windowContainer) return;
  // Maximize and minimize are mutually exclusive
  if (windowContainer.classList.contains('is-minimized')) {
    windowContainer.classList.remove('is-minimized');
    if (dockSliver) dockSliver.classList.remove('show');
    if (wcMinimizeBtn) wcMinimizeBtn.title = 'Minimize';
  }
  windowContainer.classList.toggle('is-maximized');
  const maximized = windowContainer.classList.contains('is-maximized');
  if (wcMaximizeBtn) {
    wcMaximizeBtn.textContent = maximized ? '❐' : '▢';
    wcMaximizeBtn.title = maximized ? 'Restore Down' : 'Maximize';
  }
}
