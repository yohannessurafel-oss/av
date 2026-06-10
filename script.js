const SUPABASE_URL = 'https://oxzthrubidohuwwhxsrk.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';

const dbClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

document.getElementById('disbursement_date').valueAsDate = new Date();

function formatCurrency(val) {
    if (val === null || val === undefined || val === '') return '-';
    if (val < 0) return `(${Math.abs(val).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})})`;
    return val.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

async function fetchLedger() {
    const { data, error } = await dbClient
        .from('loan_ledger')
        .select('*')
        .order('id', { ascending: true });

    if (error) {
        console.error("Error loading ledger:", error);
        return;
    }
    renderTableRows(data);
}

function renderTableRows(records) {
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';
    
    records.forEach((row) => {
        const displayDate = new Date(row.date).toLocaleDateString('en-GB', {
            day: '2-digit', month: 'short', year: '2-digit'
        });

        // Format principal debit string natively to embrace standard bracket formats
        let printablePrincipal = '-';
        if (row.principal_debit !== null && row.principal_debit !== 0) {
            printablePrincipal = row.principal_debit < 0 ? formatCurrency(row.principal_debit) : formatCurrency(-row.principal_debit);
        }

        tbody.innerHTML += `
            <tr>
                <td>${row.month_label}</td>
                <td>${displayDate}</td>
                <td>${row.description}</td>
                <td>${row.ref_number || '-'}</td>
                <td class="text-right">${row.description === "Loan Disbursement" ? formatCurrency(row.principal_debit) : printablePrincipal}</td>
                <td class="text-right">${formatCurrency(row.interest_debit)}</td>
                <td class="text-right" style="color: #dc2626;">${formatCurrency(row.penalty_debit)}</td>
                <td class="text-right" style="color: #475569;">${formatCurrency(row.accrued_interest_receivable)}</td>
                <td class="text-right" style="color: #16a34a; font-weight: 500;">${formatCurrency(row.total_paid)}</td>
                <td class="text-right" style="color: #b45309;">${formatCurrency(row.accrued_unpaid_interest)}</td>
                <td class="text-right font-bold">${formatCurrency(row.principal_balance)}</td>
            </tr>`;
    });
}

document.getElementById('loan-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const amount = parseFloat(document.getElementById('loan_amount').value);
    const annualRate = parseFloat(document.getElementById('interest_rate').value) / 100;
    const months = parseInt(document.getElementById('loan_term').value);
    const initialAccruedInput = parseFloat(document.getElementById('total_accrued_estimate').value);
    const startDate = new Date(document.getElementById('disbursement_date').value);

    const monthlyRate = annualRate / 12;
    
    // Equal Monthly Installment Standard Formulation
    const monthlyPayment = (amount * monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);

    let currentBalance = amount;
    let scheduleBatch = [];

    // Row 0: Initial Loan Disbursement (Matches row 1 of your ledger screenshot)
    scheduleBatch.push({
        month_label: "Disbursement",
        date: startDate.toISOString().split('T')[0],
        description: "Loan Disbursement",
        ref_number: "DISB-001",
        principal_debit: amount,
        interest_debit: null,
        penalty_debit: null,
        accrued_interest_receivable: initialAccruedInput, // Label point (a)
        total_paid: 0,
        accrued_unpaid_interest: null,
        principal_balance: amount
    });

    let currentDate = new Date(startDate);

    // Calculate months 1 through 12 sequentially
    for (let i = 1; i <= months; i++) {
        // Handle varying days per month correctly
        currentDate.setMonth(currentDate.getMonth() + 1);
        let lastDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

        let interestPayment = currentBalance * monthlyRate;
        let principalPayment = monthlyPayment - interestPayment;
        currentBalance -= principalPayment;

        if (i === months) {
            principalPayment += currentBalance;
            currentBalance = 0;
        }

        // Simulating the exact snapshot parameters from your provided source ledger:
        let accruedUnpaidValue = null;
        if (i === 1) {
            // Month 1 manually simulates your marker (b) and (c) parameters for illustration
            interestPayment = 1000.00; // Label point (b)
            accruedUnpaidValue = 24000.00; // Label point (c)
        }

        scheduleBatch.push({
            month_label: `Month ${i}`,
            date: lastDayOfMonth.toISOString().split('T')[0],
            description: "Monthly Installment",
            ref_number: `RCPT-0${41 + i}`,
            principal_debit: parseFloat(principalPayment.toFixed(2)),
            interest_debit: parseFloat(interestPayment.toFixed(2)),
            penalty_debit: null,
            accrued_interest_receivable: null,
            total_paid: parseFloat(monthlyPayment.toFixed(2)),
            accrued_unpaid_interest: accruedUnpaidValue,
            principal_balance: parseFloat(Math.max(0, currentBalance).toFixed(2))
        });
    }

    // Append late penalty placeholder item dynamically matching Row 4 of your sample image
    let penaltyDate = new Date(startDate);
    penaltyDate.setMonth(penaltyDate.getMonth() + 2); // March 15th sequence
    penaltyDate.setDate(15);

    scheduleBatch.push({
        month_label: "Adjustment",
        date: penaltyDate.toISOString().split('T')[0],
        description: "Late Penalty Fee",
        ref_number: "JRNL-102",
        principal_debit: 0,
        interest_debit: null,
        penalty_debit: 150.00,
        accrued_interest_receivable: null,
        total_paid: 150.00,
        accrued_unpaid_interest: null,
        // The balance remains unaffected by standalone penalty events
        principal_balance: scheduleBatch[2] ? scheduleBatch[2].principal_balance : amount 
    });

    // Clear old data rows in Supabase before adding the new schedule
    await dbClient.from('loan_ledger').delete().neq('id', 0);

    // Save rows to Supabase
    const { error } = await dbClient.from('loan_ledger').insert(scheduleBatch);

    if (error) {
        alert("Database execution error: " + error.message);
    } else {
        alert("Fully detailed ledger generated successfully!");
        fetchLedger();
    }
});

fetchLedger();
