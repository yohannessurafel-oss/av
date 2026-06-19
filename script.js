/* ═══════════════════════════════════════════════════════
   CBS Loan Ledger System — Core Engine
   Matches PDF spec: loan_ledger_sample.pdf
   Views: Account Statement + Internal Accounting Ledger
═══════════════════════════════════════════════════════ */

// ─── 1. Supabase Connection ────────────────────────────
const SUPABASE_URL = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── 2. Date default ──────────────────────────────────
document.getElementById('start_date').valueAsDate = new Date();

// ─── 3. Formatters ────────────────────────────────────

/**
 * Financial currency formatter.
 * - Zero / null / empty → returns dash "-"
 * - Negative with brackets → (1,234.56) style
 * - Positive → 1,234.56
 */
function fmtCurrency(val, brackets = true) {
    if (val === null || val === undefined || val === '' || val === 0) return '-';
    const abs = Math.abs(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (val < 0 && brackets) return `(${abs})`;
    if (val < 0 && !brackets) return `-${abs}`;
    return abs;
}

/**
 * Date formatter: 01-Jan-26 style (matches PDF)
 */
function fmtDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr + 'T00:00:00'); // avoid timezone shift
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-');
}

/**
 * ISO date string from a Date object (YYYY-MM-DD)
 */
function toISO(d) {
    return d.toISOString().split('T')[0];
}

/**
 * Last calendar day of a month from a given date
 */
function lastDayOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

// ─── 4. Update header display ─────────────────────────
function updateHeaderDisplay() {
    const acct    = document.getElementById('account_number').value;
    const borrow  = document.getElementById('borrower_name').value;
    const product = document.getElementById('product_type').value;
    const status  = document.getElementById('loan_status').value;
    const amount  = parseFloat(document.getElementById('loan_amount').value);
    const rate    = document.getElementById('interest_rate').value;
    const term    = document.getElementById('loan_term').value;
    const freq    = document.getElementById('repayment_frequency').value;
    const startD  = document.getElementById('start_date').value;

    document.getElementById('display-account-number').innerText = acct || '—';
    document.getElementById('display-borrower').innerText = borrow || '—';
    document.getElementById('display-product').innerText = product || '—';
    document.getElementById('display-rate').innerText = `${rate}% p.a.`;
    document.getElementById('display-term').innerText = `${term} Months (${freq})`;
    document.getElementById('display-disburse-date').innerText = startD ? fmtDate(startD) : '—';
    document.getElementById('display-orig-balance').innerText = amount ? fmtCurrency(amount) + ' ETB' : '—';
    document.getElementById('rpt-acct-no').innerText = acct || '—';

    // Status badge
    const badge = document.getElementById('display-status');
    badge.innerText = status.replace('-', ' – ');
    badge.className = 'status-badge';
    if (status === 'Active-Performing') badge.classList.add('active');
    else if (status === 'Active-Watchlist') badge.classList.add('watchlist');
    else if (status === 'Defaulted') badge.classList.add('defaulted');
    else badge.classList.add('closed');
}

// ─── 5. Core Amortization Engine ──────────────────────
function buildLedgerRows(params) {
    const {
        selectedProduct, amount, startDate, annualRate,
        totalMonths, frequency, gracePeriodDays,
        flatPenaltyFee, initialAccruedInterest,
        includeProcessingFee, simulateLatePayment, borrowerName, accountNumber
    } = params;

    const isoDisburse = toISO(startDate);
    const rows = [];

    // ── Row 0: Loan Disbursement ──
    rows.push({
        row_type:                  'disbursement',
        product_name:              selectedProduct,
        account_number:            accountNumber,
        borrower_name:             borrowerName,
        post_date:                 isoDisburse,
        value_date:                isoDisburse,
        description:               'Loan Disbursement',
        ref_batch:                 'DSB-B001',
        principal:                 amount,
        interest:                  0,
        charges_penalties:         0,
        accrued_interest_receivable: initialAccruedInterest,  // (a) from PDF
        total_paid:                0,
        accrued_unpaid_interest:   null,
        running_balance:           amount
    });

    // ── Row 1 (conditional): Admin / Processing Fee ──
    // Agri-business only. Shown as charge in Charges/Penalties column.
    // Running balance stays same (fee doesn't reduce principal).
    if (includeProcessingFee) {
        rows.push({
            row_type:                  'fee',
            product_name:              selectedProduct,
            account_number:            accountNumber,
            borrower_name:             borrowerName,
            post_date:                 isoDisburse,
            value_date:                isoDisburse,
            description:               'Admin / Processing Fee',
            ref_batch:                 'SYS-FEE01',
            principal:                 0,
            interest:                  0,
            charges_penalties:         1000.00,
            accrued_interest_receivable: 0,
            total_paid:                0,
            accrued_unpaid_interest:   null,
            running_balance:           amount  // Balance unchanged by fee
        });
    }

    // ── Scheduling setup ──
    let intervals       = totalMonths;
    let ratePerPeriod   = annualRate / 12;
    let monthStep       = 1;

    if (frequency === 'yearly') {
        intervals     = Math.max(1, Math.round(totalMonths / 12));
        ratePerPeriod = annualRate;
        monthStep     = 12;
    }

    // Standard EMI (Equal Monthly Installment)
    const emi = (amount * ratePerPeriod * Math.pow(1 + ratePerPeriod, intervals))
              / (Math.pow(1 + ratePerPeriod, intervals) - 1);

    let currentBalance = amount;
    let calcDate       = new Date(startDate);

    // For the PDF's (c) field: accrued unpaid interest tracker
    // Initial value is (initialAccruedInterest - 1000) for first installment row
    const firstUnpaidInterest = initialAccruedInterest - 1000.00;

    for (let i = 1; i <= intervals; i++) {
        calcDate.setMonth(calcDate.getMonth() + monthStep);

        // Value date = last calendar day of the period
        const periodEnd    = lastDayOfMonth(calcDate);
        const isoValueDate = toISO(periodEnd);

        // Interest and principal split
        let interestComp  = currentBalance * ratePerPeriod;
        let principalComp = emi - interestComp;
        currentBalance   -= principalComp;

        // Clean up final period rounding residual
        if (i === intervals) {
            principalComp += currentBalance;
            currentBalance = 0;
        }

        const refLabel = frequency === 'yearly'
            ? `YRT-${100 + i}`
            : `RCPT-0${41 + i}`;

        const descLabel = frequency === 'yearly'
            ? `Yearly Installment ${i}`
            : `Monthly Installment ${i}`;

        // ── Late Payment / Penalty Logic (simulated on installment 1) ──
        if (i === 1 && simulateLatePayment) {
            const actualPayDate = new Date(periodEnd);
            actualPayDate.setDate(actualPayDate.getDate() + 15); // 15 days late

            const daysOverdue = Math.round(
                (actualPayDate - periodEnd) / (1000 * 60 * 60 * 24)
            );

            if (daysOverdue > gracePeriodDays) {
                // Penalty posts on the 15th of next month (after due date)
                const penaltyDate = new Date(
                    periodEnd.getFullYear(),
                    periodEnd.getMonth() + 1,
                    15
                );
                const isoPenaltyDate = toISO(penaltyDate);

                // Balance at point of penalty = remaining balance before this installment reduces it
                const balanceAtPenalty = parseFloat(currentBalance.toFixed(2)) + parseFloat(principalComp.toFixed(2));

                rows.push({
                    row_type:                  'penalty',
                    product_name:              selectedProduct,
                    account_number:            accountNumber,
                    borrower_name:             borrowerName,
                    post_date:                 isoPenaltyDate,
                    value_date:                isoPenaltyDate,
                    description:               'Late Penalty Fee',
                    ref_batch:                 'JRNL-102',
                    principal:                 0,
                    interest:                  0,
                    charges_penalties:         flatPenaltyFee,
                    accrued_interest_receivable: 0,
                    total_paid:                flatPenaltyFee,   // Penalty collected
                    accrued_unpaid_interest:   null,
                    running_balance:           parseFloat(balanceAtPenalty.toFixed(2))
                });
            }
        }

        // ── Regular Installment Row ──
        rows.push({
            row_type:                  'installment',
            product_name:              selectedProduct,
            account_number:            accountNumber,
            borrower_name:             borrowerName,
            post_date:                 isoValueDate,
            value_date:                isoValueDate,
            description:               descLabel,
            ref_batch:                 refLabel,
            // Principal debit is negative (reduces balance) → shown in brackets
            principal:                 parseFloat((-principalComp).toFixed(2)),
            // PDF point (b): first installment interest overridden to -1,000
            interest:                  i === 1 ? -1000.00 : parseFloat((-interestComp).toFixed(2)),
            charges_penalties:         0,
            accrued_interest_receivable: 0,
            total_paid:                parseFloat(emi.toFixed(2)),
            // PDF point (c): accrued unpaid interest mapped only on first row
            accrued_unpaid_interest:   i === 1 ? parseFloat(firstUnpaidInterest.toFixed(2)) : null,
            running_balance:           parseFloat(Math.max(0, currentBalance).toFixed(2))
        });
    }

    return rows;
}

// ─── 6. KPI Summary ───────────────────────────────────
function updateKPI(rows) {
    let totalInterest   = 0;
    let totalPenalties  = 0;
    let totalPaid       = 0;
    let closingBalance  = 0;
    let origPrincipal   = 0;

    rows.forEach(r => {
        if (r.row_type === 'disbursement') origPrincipal = r.principal;
        if (r.interest < 0)          totalInterest  += Math.abs(r.interest);
        if (r.charges_penalties > 0) totalPenalties += r.charges_penalties;
        if (r.total_paid > 0)        totalPaid      += r.total_paid;
        closingBalance = r.running_balance; // Last row wins
    });

    document.getElementById('kpi-principal').innerText  = fmtCurrency(origPrincipal) + ' ETB';
    document.getElementById('kpi-interest').innerText   = fmtCurrency(totalInterest) + ' ETB';
    document.getElementById('kpi-penalties').innerText  = fmtCurrency(totalPenalties) + ' ETB';
    document.getElementById('kpi-paid').innerText       = fmtCurrency(totalPaid) + ' ETB';
    document.getElementById('kpi-balance').innerText    = fmtCurrency(closingBalance) + ' ETB';
    document.getElementById('kpi-bar').style.display    = 'grid';
}

// ─── 7. Render: View A — Account Statement ────────────
function renderStatement(rows) {
    const tbody = document.getElementById('statement-body');
    const tfoot = document.getElementById('statement-foot');
    tbody.innerHTML = '';
    tfoot.innerHTML = '';

    let totPrincipal = 0, totInterest = 0, totCharges = 0;

    rows.forEach(row => {
        const tr = document.createElement('tr');
        if (row.row_type === 'penalty')     tr.classList.add('row-penalty');
        if (row.row_type === 'disbursement') tr.classList.add('row-disburse');
        if (row.row_type === 'fee')          tr.classList.add('row-fee');

        // Accumulate totals (exclude disbursement principal from sum)
        if (row.row_type !== 'disbursement') {
            totPrincipal += (row.principal || 0);
        }
        totInterest  += (row.interest || 0);
        totCharges   += (row.charges_penalties || 0);

        tr.innerHTML = `
            <td>${fmtDate(row.post_date)}</td>
            <td>${fmtDate(row.value_date)}</td>
            <td><span class="ref-code">${row.ref_batch}</span></td>
            <td>${row.description}</td>
            <td class="num-col ${row.principal > 0 ? 'val-positive' : row.principal < 0 ? 'val-negative' : ''}">
                ${fmtCurrency(row.principal)}
            </td>
            <td class="num-col ${row.interest < 0 ? 'val-negative' : ''}">
                ${fmtCurrency(row.interest)}
            </td>
            <td class="num-col penalty-col">
                ${row.charges_penalties > 0 ? fmtCurrency(row.charges_penalties) : '-'}
            </td>
            <td class="num-col val-balance">
                ${fmtCurrency(row.running_balance, false)}
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Footer totals row
    tfoot.innerHTML = `
        <tr>
            <td colspan="4" style="text-align:right; color: var(--slate-mid); font-family: var(--font-ui);">
                TOTALS
            </td>
            <td class="num-col">${fmtCurrency(totPrincipal)}</td>
            <td class="num-col">${fmtCurrency(totInterest)}</td>
            <td class="num-col">${totCharges > 0 ? fmtCurrency(totCharges) : '-'}</td>
            <td class="num-col">—</td>
        </tr>
    `;
}

// ─── 8. Render: View B — Internal Accounting Ledger ───
function renderLedger(rows) {
    const tbody = document.getElementById('ledger-body');
    const tfoot = document.getElementById('ledger-foot');
    tbody.innerHTML = '';
    tfoot.innerHTML = '';

    let totPrincipal = 0, totInterest = 0, totCharges = 0, totPaid = 0;

    rows.forEach(row => {
        const tr = document.createElement('tr');
        if (row.row_type === 'penalty')      tr.classList.add('row-penalty');
        if (row.row_type === 'disbursement')  tr.classList.add('row-disburse');
        if (row.row_type === 'fee')           tr.classList.add('row-fee');

        if (row.row_type !== 'disbursement') totPrincipal += (row.principal || 0);
        totInterest  += (row.interest || 0);
        totCharges   += (row.charges_penalties || 0);
        totPaid      += (row.total_paid || 0);

        tr.innerHTML = `
            <td>${fmtDate(row.value_date)}</td>
            <td>${row.description}</td>
            <td><span class="ref-code">${row.ref_batch}</span></td>
            <td class="num-col ${row.principal < 0 ? 'val-negative' : row.principal > 0 ? 'val-positive' : ''}">
                ${fmtCurrency(row.principal)}
            </td>
            <td class="num-col ${row.interest < 0 ? 'val-negative' : ''}">
                ${fmtCurrency(row.interest)}
            </td>
            <td class="num-col penalty-col">
                ${row.charges_penalties > 0 ? fmtCurrency(row.charges_penalties) : '-'}
            </td>
            <td class="num-col val-accrual">
                ${row.accrued_interest_receivable > 0 ? fmtCurrency(row.accrued_interest_receivable, false) : '-'}
            </td>
            <td class="num-col val-paid">
                ${row.total_paid > 0 ? fmtCurrency(row.total_paid, false) : '-'}
            </td>
            <td class="num-col" style="color: #b45309;">
                ${row.accrued_unpaid_interest != null ? fmtCurrency(row.accrued_unpaid_interest, false) : '-'}
            </td>
            <td class="num-col val-balance">
                ${fmtCurrency(row.running_balance, false)}
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Footer totals
    tfoot.innerHTML = `
        <tr>
            <td colspan="3" style="text-align:right; color: var(--slate-mid); font-family: var(--font-ui);">
                TOTALS
            </td>
            <td class="num-col">${fmtCurrency(totPrincipal)}</td>
            <td class="num-col">${fmtCurrency(totInterest)}</td>
            <td class="num-col">${totCharges > 0 ? fmtCurrency(totCharges) : '-'}</td>
            <td class="num-col">—</td>
            <td class="num-col val-paid">${fmtCurrency(totPaid, false)}</td>
            <td class="num-col">—</td>
            <td class="num-col">—</td>
        </tr>
    `;
}

// ─── 9. Show / Hide UI States ─────────────────────────
function showLoading(on) {
    document.getElementById('loading-state').style.display = on ? 'flex' : 'none';
    document.getElementById('empty-state').style.display   = 'none';
    const btn = document.getElementById('generate-btn');
    if (on) { btn.classList.add('loading'); btn.innerHTML = '<span class="btn-icon">⏳</span> Generating…'; }
    else    { btn.classList.remove('loading'); btn.innerHTML = '<span class="btn-icon">⚡</span> Generate Ledger'; }
}

function showReports(rows) {
    document.getElementById('loading-state').style.display = 'none';
    document.getElementById('empty-state').style.display   = 'none';

    const stmtPanel   = document.getElementById('tab-account-statement');
    const ledgerPanel = document.getElementById('tab-internal-ledger');
    stmtPanel.style.display   = 'flex';
    ledgerPanel.style.display = 'none';
    stmtPanel.classList.add('visible');
    ledgerPanel.classList.remove('visible');

    // Activate the first tab button
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-btn')[0].classList.add('active');
}

// ─── 10. Tab switching ────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const target = btn.dataset.tab;
        if (!target) return;

        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        document.querySelectorAll('.tab-panel').forEach(panel => {
            panel.style.display   = 'none';
            panel.classList.remove('visible');
        });

        const targetPanel = document.getElementById(`tab-${target}`);
        if (targetPanel) {
            targetPanel.style.display = 'flex';
            targetPanel.classList.add('visible');
        }
    });
});

// ─── 11. CSV Export ───────────────────────────────────
let _cachedRows = [];

function exportCSV(view) {
    if (!_cachedRows.length) { alert('Generate ledger first.'); return; }
    const headers = view === 'statement'
        ? ['Post Date','Value Date','Ref/Batch','Description','Principal','Interest','Charges/Penalties','Running Balance']
        : ['Value Date','Description','Ref#','Principal(Dr)','Interest(Dr)','Penalty(Dr)','Accrued Int Receivable','Total Paid(Cr)','Accrued Unpaid Int','Principal Balance'];

    const rowsCSV = _cachedRows.map(r => {
        if (view === 'statement') {
            return [fmtDate(r.post_date), fmtDate(r.value_date), r.ref_batch, r.description,
                    r.principal, r.interest, r.charges_penalties, r.running_balance].join(',');
        } else {
            return [fmtDate(r.value_date), r.description, r.ref_batch, r.principal, r.interest,
                    r.charges_penalties, r.accrued_interest_receivable, r.total_paid,
                    r.accrued_unpaid_interest, r.running_balance].join(',');
        }
    });

    const csv  = [headers.join(','), ...rowsCSV].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `loan_ledger_${document.getElementById('account_number').value}_${view}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// ─── 12. Fetch and render from Supabase on load ───────
async function fetchAndRender() {
    const { data, error } = await db
        .from('loan_ledger')
        .select('*')
        .order('id', { ascending: true });

    if (error || !data || data.length === 0) return;

    _cachedRows = data;
    updateKPI(data);
    renderStatement(data);
    renderLedger(data);
    showReports(data);
    updateHeaderDisplay();
}

// ─── 13. Form Submit Handler ──────────────────────────
document.getElementById('loan-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoading(true);

    // Extract parameters
    const params = {
        selectedProduct:       document.getElementById('product_type').value,
        accountNumber:         document.getElementById('account_number').value,
        borrowerName:          document.getElementById('borrower_name').value,
        amount:                parseFloat(document.getElementById('loan_amount').value),
        startDate:             new Date(document.getElementById('start_date').value + 'T00:00:00'),
        annualRate:            parseFloat(document.getElementById('interest_rate').value) / 100,
        totalMonths:           parseInt(document.getElementById('loan_term').value),
        frequency:             document.getElementById('repayment_frequency').value,
        gracePeriodDays:       parseInt(document.getElementById('grace_period').value),
        flatPenaltyFee:        parseFloat(document.getElementById('flat_penalty').value),
        initialAccruedInterest: parseFloat(document.getElementById('total_accrued_estimate').value),
        includeProcessingFee:  document.getElementById('include_processing_fee').checked,
        simulateLatePayment:   document.getElementById('simulate_late_payment').checked,
    };

    // Build the rows locally first
    const rows = buildLedgerRows(params);

    // Update header display
    updateHeaderDisplay();

    // Wipe existing data
    const { error: delErr } = await db.from('loan_ledger').delete().neq('id', 0);
    if (delErr) {
        alert('Delete failed: ' + delErr.message);
        showLoading(false);
        return;
    }

    // Insert new rows (strip row_type before inserting — it's UI-only)
    const insertRows = rows.map(r => {
        const { row_type, ...rest } = r;
        return rest;
    });

    const { error: insErr } = await db.from('loan_ledger').insert(insertRows);
    if (insErr) {
        alert('Insert failed: ' + insErr.message);
        showLoading(false);
        return;
    }

    // Render
    _cachedRows = rows;
    updateKPI(rows);
    renderStatement(rows);
    renderLedger(rows);

    showLoading(false);
    showReports(rows);
});

// ─── 14. Live header sync as user types ──────────────
['account_number','borrower_name','product_type','loan_status',
 'loan_amount','interest_rate','loan_term','start_date','repayment_frequency']
    .forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateHeaderDisplay);
    });

// ─── 15. Init ─────────────────────────────────────────
updateHeaderDisplay();
fetchAndRender();
