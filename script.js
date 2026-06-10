const SUPABASE_URL = 'https://oxzthrubidohuwwhxsrk.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';

const dbClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Set default disbursement date to today for user convenience
document.getElementById('disbursement_date').valueAsDate = new Date();

// Helper to format currency values to look like a clean financial ledger
function formatCurrency(val) {
    if (val === null || val === undefined || val === '') return '-';
    if (val < 0) return `(${Math.abs(val).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})})`;
    return val.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

// 1. Fetch existing entries from Supabase to show on page load
async function fetchLedger() {
    const { data, error } = await dbClient
        .from('loan_ledger')
        .select('*')
        .order('date', { ascending: true });

    if (error) {
        console.error("Error loading ledger:", error);
        return;
    }
    
    renderTableRows(data);
}

// 2. Render UI Table Rows
function renderTableRows(records) {
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';
    
    records.forEach((row, index) => {
        const displayDate = new Date(row.date).toLocaleDateString('en-GB', {
            day: '2-digit', month: 'short', year: '2-digit'
        });

        // Highlight values using negative formats where applicable for visual consistency
        const printablePrincipal = row.principal_debit < 0 ? row.principal_debit : -row.principal_debit;

        tbody.innerHTML += `
            <tr>
                <td>${index === 0 ? 'Disbursement' : 'Month ' + index}</td>
                <td>${displayDate}</td>
                <td>${row.description}</td>
                <td>${row.ref_number || '-'}</td>
                <td class="text-right">${index === 0 ? formatCurrency(row.principal_debit) : formatCurrency(printablePrincipal)}</td>
                <td class="text-right">${formatCurrency(row.interest_debit)}</td>
                <td class="text-right">${formatCurrency(row.total_paid)}</td>
                <td class="text-right font-bold">${formatCurrency(row.principal_balance)}</td>
            </tr>`;
    });
}

// 3. Mathematical generation of schedule & DB Save on Submit
document.getElementById('loan-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const amount = parseFloat(document.getElementById('loan_amount').value);
    const annualRate = parseFloat(document.getElementById('interest_rate').value) / 100;
    const months = parseInt(document.getElementById('loan_term').value);
    const startDate = new Date(document.getElementById('disbursement_date').value);

    const monthlyRate = annualRate / 12;
    
    // Equal Monthly Installment (EMI) standard financial formula
    const monthlyPayment = (amount * monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);

    let currentBalance = amount;
    let scheduleBatch = [];

    // Row 0: Initial Loan Disbursement Row
    scheduleBatch.push({
        date: startDate.toISOString().split('T')[0],
        description: "Loan Disbursement",
        ref_number: "DISB-001",
        principal_debit: amount,
        interest_debit: null,
        total_paid: 0,
        principal_balance: amount
    });

    // Calculate months 1 through 12 sequentially
    let currentDate = new Date(startDate);
    for (let i = 1; i <= months; i++) {
        currentDate.setMonth(currentDate.getMonth() + 1);
        
        let interestPayment = currentBalance * monthlyRate;
        let principalPayment = monthlyPayment - interestPayment;
        currentBalance -= principalPayment;

        // Clean up rounding variations on the final payment installment
        if (i === months) {
            principalPayment += currentBalance;
            currentBalance = 0;
        }

        scheduleBatch.push({
            date: currentDate.toISOString().split('T')[0],
            description: "Monthly Installment",
            ref_number: `RCPT-0${41 + i}`,
            principal_debit: parseFloat(principalPayment.toFixed(2)),
            interest_debit: parseFloat(interestPayment.toFixed(2)),
            total_paid: parseFloat(monthlyPayment.toFixed(2)),
            principal_balance: parseFloat(Math.max(0, currentBalance).toFixed(2))
        });
    }

    // Optional: Wipe out previous table contents in Supabase before adding new schedule
    // To enable safety overrides, clear out old values first:
    await dbClient.from('loan_ledger').delete().neq('id', 0);

    // Bulk save the newly generated array directly to your database
    const { error } = await dbClient.from('loan_ledger').insert(scheduleBatch);

    if (error) {
        alert("Database transaction error: " + error.message);
    } else {
        alert("Schedule generated and synced cleanly to Supabase!");
        fetchLedger();
    }
});

// Run automatically on page load initialization
fetchLedger();
