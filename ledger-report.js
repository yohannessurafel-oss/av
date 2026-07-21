/* ═══════════════════════════════════════════════════════════
   Africa Village Microfinance — 11 Loan Ledger Report
   ledger-report.js  v1.0
   Dual-mode:
     A) Load from DB  — reads loan_ledger table by account_number
     B) Generate      — builds projection locally (amortization engine)
   Views: Account Statement | Internal Accounting Ledger | Amortization Schedule
═══════════════════════════════════════════════════════════ */

'use strict';

const SUPABASE_URL      = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';

/* ── Raw REST fetch (used for all Supabase reads on this page) */
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

/* ── Toast ─────────────────────────────────────────────── */
const toastEl = document.getElementById('toastNotification');
let _toastTimer = null;
function toast(msg, type = '', duration = 3500) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.className = `toast show ${type}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { toastEl.className = 'toast'; }, duration);
}

/* ── System Date ───────────────────────────────────────── */
(function() {
  const el = document.getElementById('systemDate');
  if (el) el.textContent = new Date().toLocaleDateString('en-ET', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
  });
  document.getElementById('lrStartDate').valueAsDate = new Date();
})();

/* ── Formatters ────────────────────────────────────────── */
function fmt(val, brackets = true) {
  if (val === null || val === undefined || val === '' || val === 0) return '—';
  const abs = Math.abs(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (val < 0 && brackets) return `(${abs})`;
  if (val < 0 && !brackets) return `–${abs}`;
  return abs;
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-');
}

function toISO(d) { return d.toISOString().split('T')[0]; }
function lastDayOfMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }

/* ── Cached rows ───────────────────────────────────────── */
let _rows = [];
let _scheduleRows = [];

/* ══════════════════════════════════════════════════════════
   MODE A — Load from DB
   Search order:
     1. loanmasterrecords by application_id or client_id
        → get the canonical application_id
     2. loan_ledger by application_id (CBS pipeline key)
     3. fall back to loan_ledger by account_number (legacy)
     4. fall back to amortization_schedules if no ledger rows
══════════════════════════════════════════════════════════ */
async function loadFromDB() {
  const searchVal = document.getElementById('lrSearchId').value.trim();
  if (!searchVal) { toast('Enter an Application ID or Client ID to search.', 'warning'); return; }

  setSB('Searching CBS records…');
  toast('Searching…', '');

  let lmrRecord = null;

  // Step 1: look up loanmasterrecords by application_id OR client_id
  try {
    // Try application_id first (exact match)
    let rows = await sbFetch(
      `loanmasterrecords?application_id=eq.${encodeURIComponent(searchVal)}&limit=1`
    );
    if (!rows || !rows[0]) {
      // Try client_id — returns most recent loan for that client
      rows = await sbFetch(
        `loanmasterrecords?client_id=eq.${encodeURIComponent(searchVal)}&order=application_id.desc&limit=1`
      );
    }
    if (rows && rows[0]) {
      lmrRecord = rows[0];
      enrichHeaderFromRecord(lmrRecord);
    }
  } catch (e) {
    console.warn('loanmasterrecords lookup failed:', e.message);
  }

  const appId      = lmrRecord?.application_id || searchVal;
  const acctNumber = lmrRecord?.account_number  || searchVal;

  // Step 2: fetch loan_ledger by application_id (CBS pipeline rows)
  let data, error = null;
  try {
    data = await sbFetch(
      `loan_ledger?application_id=eq.${encodeURIComponent(appId)}&order=id.asc`
    ) || [];
  } catch (e) {
    error = e;
  }

  // Step 3: fall back to account_number (legacy standalone tool rows)
  if (!error && (!data || data.length === 0) && acctNumber !== appId) {
    try {
      data = await sbFetch(
        `loan_ledger?account_number=eq.${encodeURIComponent(acctNumber)}&order=id.asc`
      ) || [];
    } catch (e) {
      error = e;
    }
  }

  // Step 4: fall back to amortization_schedules if still empty
  if (!data || data.length === 0) {
    try {
      const schedRows = await sbFetch(
        `amortization_schedules?application_id=eq.${encodeURIComponent(appId)}&order=installment_no.asc`
      );
      if (schedRows && schedRows.length > 0) {
        toast(`No ledger rows yet — showing amortization schedule (${schedRows.length} installments).`, 'warning');
        _scheduleRows = schedRows.map((r, i) => ({
          no:        r.installment_no || i + 1,
          due_date:  r.due_date,
          opening:   0,  // not stored in amortization_schedules
          principal: parseFloat(r.principal_due) || 0,
          interest:  parseFloat(r.interest_due)  || 0,
          total_due: (parseFloat(r.principal_due) || 0) + (parseFloat(r.interest_due) || 0),
          closing:   0,
          status:    r.status || 'UNPAID'
        }));
        _rows = [];
        renderSchedule(_scheduleRows);
        showReportTab('schedule');
        setSB(`No ledger rows — showing amortization schedule for ${appId}`);
        return;
      }
    } catch(e) { console.warn('amortization_schedules fallback failed:', e.message); }

    toast(`No ledger data found for "${searchVal}". Disburse the loan first (Module 10).`, 'warning');
    setSB('No data found — loan may not be disbursed yet.');
    return;
  }

  if (error) { toast('DB error: ' + error.message, 'error'); setSB('Load failed.'); return; }

  // Reconstruct row_type from description (stripped before DB insert)
  _rows = data.map(r => ({
    ...r,
    row_type: r.description === 'Loan Disbursement'      ? 'disbursement'
            : r.description === 'Admin / Processing Fee' ? 'fee'
            : r.description === 'Late Penalty Fee'       ? 'penalty'
            : 'installment'
  }));

  _scheduleRows = buildScheduleFromRows(_rows);

  updateHeaderDisplay();
  updateKPI(_rows);
  renderStatement(_rows);
  renderLedger(_rows);
  renderSchedule(_scheduleRows);
  showReports();
  setSB(`Loaded ${_rows.length} ledger entries for ${appId}`);
  toast(`${_rows.length} rows loaded.`, 'success');
}

function enrichHeaderFromRecord(rec) {
  // Populate account card and params panel from loanmasterrecords
  const borrowerEl = document.getElementById('lrBorrowerName');
  if (rec.client_name && borrowerEl && !borrowerEl.value)
    borrowerEl.value = rec.client_name;

  // Show application_id as the reference in account card
  const acctNoEl = document.getElementById('lrAccountNo');
  if (acctNoEl) acctNoEl.value = rec.application_id || '';

  if (rec.disbursement_date || rec.application_date)
    document.getElementById('lrStartDate').value = rec.disbursement_date || rec.application_date;
  if (rec.interest_rate)
    document.getElementById('lrRate').value = rec.interest_rate;
  if (rec.term_months)
    document.getElementById('lrTerm').value = rec.term_months;
  if (rec.applied_amount || rec.sanction_amount)
    document.getElementById('lrAmount').value = rec.applied_amount || rec.sanction_amount;
  if (rec.application_status)
    document.getElementById('lrStatus').value =
      rec.application_status === 'Disbursed' ? 'Active-Performing' :
      rec.application_status === 'Closed'    ? 'Closed' :
      rec.application_status === 'WrittenOff'? 'Defaulted' : 'Active-Performing';
}

/* ══════════════════════════════════════════════════════════
   MODE B — Generate Projection (local amortization engine)
══════════════════════════════════════════════════════════ */
function runProjection() {
  const accountNo   = document.getElementById('lrAccountNo').value.trim() || 'PROJ-PREVIEW';
  const borrower    = document.getElementById('lrBorrowerName').value.trim() || 'Unnamed Borrower';
  const product     = document.getElementById('lrProduct').value;
  const amount      = parseFloat(document.getElementById('lrAmount').value);
  const annualRate  = parseFloat(document.getElementById('lrRate').value) / 100;
  const totalMonths = parseInt(document.getElementById('lrTerm').value);
  const startDateStr = document.getElementById('lrStartDate').value;
  const frequency   = document.getElementById('lrFrequency').value;
  const graceDays   = parseInt(document.getElementById('lrGracePeriod').value) || 5;
  const flatPenalty = parseFloat(document.getElementById('lrFlatPenalty').value) || 150;
  const initAccrued = parseFloat(document.getElementById('lrInitialAccrued').value) || 0;
  const inclFee     = document.getElementById('lrIncludeFee').checked;
  const simLate     = document.getElementById('lrSimulateLate').checked;

  if (!amount || !totalMonths || !startDateStr) {
    toast('Fill in Amount, Term, and Disbursement Date first.', 'warning'); return;
  }

  const startDate = new Date(startDateStr + 'T00:00:00');

  _rows = buildLedgerRows({
    accountNumber: accountNo, borrowerName: borrower, selectedProduct: product,
    amount, startDate, annualRate, totalMonths, frequency,
    gracePeriodDays: graceDays, flatPenaltyFee: flatPenalty,
    initialAccruedInterest: initAccrued,
    includeProcessingFee: inclFee, simulateLatePayment: simLate
  });

  _scheduleRows = buildScheduleFromRows(_rows);

  updateHeaderDisplay();
  updateKPI(_rows);
  renderStatement(_rows);
  renderLedger(_rows);
  renderSchedule(_scheduleRows);
  showReports();
  setSB(`Projection generated — ${_rows.length} entries`);
  toast('Projection generated.', 'success');
}

/* ── Amortization Engine (ported from script.js) ─────── */
function buildLedgerRows(p) {
  const { accountNumber, borrowerName, selectedProduct, amount, startDate,
          annualRate, totalMonths, frequency, gracePeriodDays, flatPenaltyFee,
          initialAccruedInterest, includeProcessingFee, simulateLatePayment } = p;

  const isoDisburse = toISO(startDate);
  const rows = [];

  rows.push({
    row_type: 'disbursement',
    account_number: accountNumber, borrower_name: borrowerName,
    post_date: isoDisburse, value_date: isoDisburse,
    description: 'Loan Disbursement', ref_batch: 'DSB-B001',
    principal: amount, interest: 0, charges_penalties: 0,
    accrued_interest_receivable: initialAccruedInterest,
    total_paid: 0, accrued_unpaid_interest: null, running_balance: amount
  });

  const PROCESSING_FEE_AMOUNT = 1000;

  if (includeProcessingFee) {
    rows.push({
      row_type: 'fee',
      account_number: accountNumber, borrower_name: borrowerName,
      post_date: isoDisburse, value_date: isoDisburse,
      description: 'Admin / Processing Fee', ref_batch: 'SYS-FEE01',
      principal: 0, interest: 0, charges_penalties: PROCESSING_FEE_AMOUNT,
      accrued_interest_receivable: 0, total_paid: 0,
      accrued_unpaid_interest: null, running_balance: amount
    });
  }

  let intervals     = totalMonths;
  let ratePerPeriod = annualRate / 12;
  let monthStep     = 1;
  if (frequency === 'yearly') {
    intervals = Math.max(1, Math.round(totalMonths / 12));
    ratePerPeriod = annualRate;
    monthStep = 12;
  }

  const emi = ratePerPeriod === 0
    ? amount / intervals
    : (amount * ratePerPeriod * Math.pow(1 + ratePerPeriod, intervals))
      / (Math.pow(1 + ratePerPeriod, intervals) - 1);

  let currentBalance = amount;
  let calcDate       = new Date(startDate);
  const firstUnpaid  = initialAccruedInterest - (includeProcessingFee ? PROCESSING_FEE_AMOUNT : 0);

  for (let i = 1; i <= intervals; i++) {
    calcDate.setMonth(calcDate.getMonth() + monthStep);
    const periodEnd    = lastDayOfMonth(calcDate);
    const isoValueDate = toISO(periodEnd);

    let interest  = currentBalance * ratePerPeriod;
    let principal = emi - interest;
    currentBalance -= principal;
    if (i === intervals) { principal += currentBalance; currentBalance = 0; }

    const refLabel  = frequency === 'yearly' ? `YRT-${100+i}` : `RCPT-0${41+i}`;
    const descLabel = frequency === 'yearly' ? `Yearly Installment ${i}` : `Monthly Installment ${i}`;

    if (i === 1 && simulateLatePayment) {
      const actualPayDate = new Date(periodEnd);
      actualPayDate.setDate(actualPayDate.getDate() + 15);
      const daysOverdue = Math.round((actualPayDate - periodEnd) / 86400000);
      if (daysOverdue > gracePeriodDays) {
        const penaltyDate = new Date(periodEnd.getFullYear(), periodEnd.getMonth() + 1, 15);
        const balAtPenalty = parseFloat(currentBalance.toFixed(2)) + parseFloat(principal.toFixed(2));
        rows.push({
          row_type: 'penalty',
          account_number: accountNumber, borrower_name: borrowerName,
          post_date: toISO(penaltyDate), value_date: toISO(penaltyDate),
          description: 'Late Penalty Fee', ref_batch: 'JRNL-102',
          principal: 0, interest: 0, charges_penalties: flatPenaltyFee,
          accrued_interest_receivable: 0, total_paid: flatPenaltyFee,
          accrued_unpaid_interest: null,
          running_balance: parseFloat(balAtPenalty.toFixed(2))
        });
      }
    }

    rows.push({
      row_type: 'installment',
      account_number: accountNumber, borrower_name: borrowerName,
      post_date: isoValueDate, value_date: isoValueDate,
      description: descLabel, ref_batch: refLabel,
      principal: parseFloat((-principal).toFixed(2)),
      interest: parseFloat((-interest).toFixed(2)),
      charges_penalties: 0, accrued_interest_receivable: 0,
      total_paid: parseFloat(emi.toFixed(2)),
      accrued_unpaid_interest: i === 1 ? parseFloat(firstUnpaid.toFixed(2)) : null,
      running_balance: parseFloat(Math.max(0, currentBalance).toFixed(2))
    });
  }
  return rows;
}

/* Build amortization schedule rows from ledger rows */
function buildScheduleFromRows(rows) {
  const installments = rows.filter(r => r.row_type === 'installment');
  let opening = 0;
  // Opening balance = disbursement row principal
  const disbRow = rows.find(r => r.row_type === 'disbursement');
  if (disbRow) opening = disbRow.principal;

  return installments.map((r, i) => {
    const principal = Math.abs(r.principal);
    const interest  = Math.abs(r.interest);
    const total     = principal + interest;
    const closing   = r.running_balance;
    const row = {
      no:       i + 1,
      due_date: r.value_date,
      opening:  parseFloat(opening.toFixed(2)),
      principal: parseFloat(principal.toFixed(2)),
      interest:  parseFloat(interest.toFixed(2)),
      total_due: parseFloat(total.toFixed(2)),
      closing:   parseFloat(closing.toFixed(2)),
      status:    closing <= 0 ? 'PAID' : 'UNPAID'
    };
    opening = closing;
    return row;
  });
}

/* ── Update header / account card ───────────────────────── */
function updateHeaderDisplay() {
  const acctNo  = document.getElementById('lrAccountNo').value  || '—';
  const borrow  = document.getElementById('lrBorrowerName').value || '—';
  const product = document.getElementById('lrProduct').value    || '—';
  const status  = document.getElementById('lrStatus').value     || 'Active-Performing';
  const amount  = parseFloat(document.getElementById('lrAmount').value) || 0;
  const rate    = document.getElementById('lrRate').value        || '—';
  const term    = document.getElementById('lrTerm').value        || '—';
  const startD  = document.getElementById('lrStartDate').value   || '';
  const freq    = document.getElementById('lrFrequency').value   || 'monthly';

  document.getElementById('lrDisplayAcctNo').textContent  = acctNo;
  document.getElementById('lrDisplayBorrower').textContent = borrow;
  document.getElementById('lrDisplayProduct').textContent  = product;
  document.getElementById('lrDisplayDate').textContent     = startD ? fmtDate(startD) : '—';
  document.getElementById('lrDisplayBalance').textContent  = amount ? fmt(amount) + ' ETB' : '—';
  document.getElementById('lrDisplayRate').textContent     = rate ? `${rate}% p.a.` : '—';
  document.getElementById('lrDisplayTerm').textContent     = term ? `${term} mo (${freq})` : '—';
  document.getElementById('lrRptAcctNo').textContent       = acctNo;

  const pill = document.getElementById('lrDisplayStatus');
  const statusLabel = status.replace('-', ' – ');
  pill.textContent = statusLabel;
  pill.className = 'status-pill';
  if (status === 'Active-Performing') pill.classList.add('performing');
  else if (status === 'Active-Watchlist') pill.classList.add('watchlist');
  else if (status === 'Defaulted')  pill.classList.add('defaulted');
  else pill.classList.add('closed');
}

/* ── KPI ────────────────────────────────────────────────── */
function updateKPI(rows) {
  let principal = 0, interest = 0, penalties = 0, paid = 0, closing = 0;
  rows.forEach(r => {
    if (r.row_type === 'disbursement') principal = r.principal;
    if ((r.interest || 0) < 0) interest += Math.abs(r.interest);
    if ((r.charges_penalties || 0) > 0) penalties += r.charges_penalties;
    if ((r.total_paid || 0) > 0) paid += r.total_paid;
    closing = r.running_balance;
  });
  document.getElementById('lrKpiPrincipal').textContent = fmt(principal) + ' ETB';
  document.getElementById('lrKpiInterest').textContent  = fmt(interest)  + ' ETB';
  document.getElementById('lrKpiPenalties').textContent = fmt(penalties) + ' ETB';
  document.getElementById('lrKpiPaid').textContent      = fmt(paid)      + ' ETB';
  document.getElementById('lrKpiBalance').textContent   = fmt(closing)   + ' ETB';
  document.getElementById('lrKpiRow').style.display = 'grid';
}

/* ── Render: Account Statement ──────────────────────────── */
function renderStatement(rows) {
  const tbody = document.getElementById('tbodyStatement');
  const tfoot = document.getElementById('tfootStatement');
  tbody.innerHTML = ''; tfoot.innerHTML = '';
  let totP = 0, totI = 0, totC = 0;

  rows.forEach(r => {
    const tr = document.createElement('tr');
    if (r.row_type === 'disbursement') tr.classList.add('row-disburse');
    if (r.row_type === 'fee')          tr.classList.add('row-fee');
    if (r.row_type === 'penalty')      tr.classList.add('row-penalty');
    if (r.row_type !== 'disbursement') totP += (r.principal || 0);
    totI += (r.interest || 0);
    totC += (r.charges_penalties || 0);

    tr.innerHTML = `
      <td>${fmtDate(r.post_date)}</td>
      <td>${fmtDate(r.value_date)}</td>
      <td><span class="ref-code">${r.ref_batch}</span></td>
      <td>${r.description}</td>
      <td class="r ${r.principal > 0 ? 'val-pos' : r.principal < 0 ? 'val-neg' : ''}">${fmt(r.principal)}</td>
      <td class="r ${r.interest < 0 ? 'val-neg' : ''}">${fmt(r.interest)}</td>
      <td class="r">${r.charges_penalties > 0 ? fmt(r.charges_penalties) : '—'}</td>
      <td class="r val-bal">${fmt(r.running_balance, false)}</td>
    `;
    tbody.appendChild(tr);
  });

  tfoot.innerHTML = `<tr>
    <td colspan="4" style="text-align:right;">TOTALS</td>
    <td class="r">${fmt(totP)}</td>
    <td class="r">${fmt(totI)}</td>
    <td class="r">${totC > 0 ? fmt(totC) : '—'}</td>
    <td class="r">—</td>
  </tr>`;
}

/* ── Render: Internal Accounting Ledger ─────────────────── */
function renderLedger(rows) {
  const tbody = document.getElementById('tbodyLedger');
  const tfoot = document.getElementById('tfootLedger');
  tbody.innerHTML = ''; tfoot.innerHTML = '';
  let totP = 0, totI = 0, totC = 0, totPaid = 0;

  rows.forEach(r => {
    const tr = document.createElement('tr');
    if (r.row_type === 'disbursement') tr.classList.add('row-disburse');
    if (r.row_type === 'fee')          tr.classList.add('row-fee');
    if (r.row_type === 'penalty')      tr.classList.add('row-penalty');
    if (r.row_type !== 'disbursement') totP += (r.principal || 0);
    totI    += (r.interest || 0);
    totC    += (r.charges_penalties || 0);
    totPaid += (r.total_paid || 0);

    tr.innerHTML = `
      <td>${fmtDate(r.value_date)}</td>
      <td>${r.description}</td>
      <td><span class="ref-code">${r.ref_batch}</span></td>
      <td class="r ${r.principal < 0 ? 'val-neg' : r.principal > 0 ? 'val-pos' : ''}">${fmt(r.principal)}</td>
      <td class="r ${r.interest < 0 ? 'val-neg' : ''}">${fmt(r.interest)}</td>
      <td class="r">${r.charges_penalties > 0 ? fmt(r.charges_penalties) : '—'}</td>
      <td class="r val-accrual">${r.accrued_interest_receivable > 0 ? fmt(r.accrued_interest_receivable, false) : '—'}</td>
      <td class="r val-pos">${r.total_paid > 0 ? fmt(r.total_paid, false) : '—'}</td>
      <td class="r" style="color:#b45309;">${r.accrued_unpaid_interest != null ? fmt(r.accrued_unpaid_interest, false) : '—'}</td>
      <td class="r val-bal">${fmt(r.running_balance, false)}</td>
    `;
    tbody.appendChild(tr);
  });

  tfoot.innerHTML = `<tr>
    <td colspan="3" style="text-align:right;">TOTALS</td>
    <td class="r">${fmt(totP)}</td>
    <td class="r">${fmt(totI)}</td>
    <td class="r">${totC > 0 ? fmt(totC) : '—'}</td>
    <td class="r">—</td>
    <td class="r val-pos">${fmt(totPaid, false)}</td>
    <td class="r">—</td>
    <td class="r">—</td>
  </tr>`;
}

/* ── Render: Amortization Schedule ─────────────────────── */
function renderSchedule(schedule) {
  const tbody = document.getElementById('tbodySchedule');
  const tfoot = document.getElementById('tfootSchedule');
  tbody.innerHTML = ''; tfoot.innerHTML = '';
  let totP = 0, totI = 0, totDue = 0;

  schedule.forEach(r => {
    const tr = document.createElement('tr');
    totP   += r.principal;
    totI   += r.interest;
    totDue += r.total_due;

    const statusClass = r.status === 'PAID' ? 'val-pos' : r.status === 'PARTIAL' ? '' : 'val-neg';
    tr.innerHTML = `
      <td>${r.no}</td>
      <td>${fmtDate(r.due_date)}</td>
      <td class="r">${fmt(r.opening, false)}</td>
      <td class="r val-neg">${fmt(r.principal, false)}</td>
      <td class="r" style="color:#b45309;">${fmt(r.interest, false)}</td>
      <td class="r val-bal">${fmt(r.total_due, false)}</td>
      <td class="r val-bal">${fmt(r.closing, false)}</td>
      <td><span style="font-size:10px;font-weight:600;" class="${statusClass}">${r.status}</span></td>
    `;
    tbody.appendChild(tr);
  });

  tfoot.innerHTML = `<tr>
    <td colspan="3" style="text-align:right;">TOTALS</td>
    <td class="r">${fmt(totP, false)}</td>
    <td class="r">${fmt(totI, false)}</td>
    <td class="r">${fmt(totDue, false)}</td>
    <td class="r">—</td>
    <td></td>
  </tr>`;
}

/* ── Show reports (hide empty state) ───────────────────── */
function showReports() {
  document.getElementById('lrEmpty').style.display = 'none';
  switchTab('statement');
}

function showReportTab(tab) {
  document.getElementById('lrEmpty').style.display = 'none';
  switchTab(tab);
}

/* ── Tab switching ──────────────────────────────────────── */
function switchTab(name) {
  document.querySelectorAll('.ltab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  ['statement','ledger','schedule'].forEach(t => {
    const el = document.getElementById('lpanel-' + t);
    if (el) el.style.display = t === name ? 'flex' : 'none';
  });
}

document.querySelectorAll('.ltab').forEach(btn => {
  btn.addEventListener('click', () => { if (btn.dataset.tab) switchTab(btn.dataset.tab); });
});

/* ── CSV Export ─────────────────────────────────────────── */
function exportCSV(view) {
  if (!_rows.length) { toast('Generate or load a ledger first.', 'warning'); return; }
  const activeTab = document.querySelector('.ltab.active')?.dataset.tab || 'statement';
  const tab = view || activeTab;

  let headers, rowsCSV;
  if (tab === 'schedule') {
    headers = ['#','Due Date','Opening Balance','Principal','Interest','Total Due','Closing Balance','Status'];
    rowsCSV = _scheduleRows.map(r =>
      [r.no, r.due_date, r.opening, r.principal, r.interest, r.total_due, r.closing, r.status].join(',')
    );
  } else if (tab === 'ledger') {
    headers = ['Value Date','Description','Ref#','Principal(Dr)','Interest(Dr)','Penalty(Dr)','Accrued Int Recv','Total Paid(Cr)','Accrued Unpaid Int','Principal Balance'];
    rowsCSV = _rows.map(r =>
      [r.value_date, r.description, r.ref_batch, r.principal, r.interest,
       r.charges_penalties, r.accrued_interest_receivable, r.total_paid,
       r.accrued_unpaid_interest, r.running_balance].join(',')
    );
  } else {
    headers = ['Post Date','Value Date','Ref/Batch','Description','Principal','Interest','Charges/Penalties','Running Balance'];
    rowsCSV = _rows.map(r =>
      [r.post_date, r.value_date, r.ref_batch, r.description,
       r.principal, r.interest, r.charges_penalties, r.running_balance].join(',')
    );
  }

  const csv  = [headers.join(','), ...rowsCSV].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `AVMF_Ledger_${document.getElementById('lrAccountNo').value || 'report'}_${tab}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast(`${tab} exported as CSV.`, 'success');
}

/* ── Params panel toggle ────────────────────────────────── */
document.getElementById('btnToggleParams')?.addEventListener('click', () => {
  const panel = document.getElementById('paramsPanel');
  const visible = panel.classList.toggle('visible');
  document.getElementById('btnToggleParams').textContent = visible ? '✕ Hide Params' : '⚙ Generate Projection';
});

/* ── Status bar helper ──────────────────────────────────── */
function setSB(msg) {
  const sb = document.getElementById('statusBar');
  if (sb) sb.textContent = msg;
}

/* ── Button wiring ──────────────────────────────────────── */
document.getElementById('btnFetchLedger')?.addEventListener('click', loadFromDB);
document.getElementById('btnRunProjection')?.addEventListener('click', runProjection);
document.getElementById('btnLoad')?.addEventListener('click', loadFromDB);
document.getElementById('btnGenerate')?.addEventListener('click', () => {
  document.getElementById('paramsPanel').classList.add('visible');
  document.getElementById('btnToggleParams').textContent = '✕ Hide Params';
});
document.getElementById('btnClose')?.addEventListener('click', () => {
  _rows = []; _scheduleRows = [];
  document.getElementById('lrEmpty').style.display = 'flex';
  ['statement','ledger','schedule'].forEach(t => {
    const el = document.getElementById('lpanel-' + t);
    if (el) el.style.display = 'none';
  });
  document.getElementById('lrKpiRow').style.display = 'none';
  setSB('Status: Ready');
  toast('Ledger cleared.');
});
document.getElementById('btnExportStatement')?.addEventListener('click', () => exportCSV('statement'));
document.getElementById('btnPrint')?.addEventListener('click', () => window.print());
document.getElementById('lrSearchId')?.addEventListener('keydown', e => { if (e.key === 'Enter') loadFromDB(); });

/* ── Init ───────────────────────────────────────────────── */
updateHeaderDisplay();

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
