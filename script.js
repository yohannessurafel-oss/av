const SUPABASE_URL = 'https://oxzthrubidohuwwhxsrk.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';

const dbClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
document.getElementById('start_date').valueAsDate = new Date();

function formatCurrency(val, displayBracketsIfNegative = true) {
    if (val === null || val === undefined || val === '' || val === 0) return '-';
    if (val < 0 && displayBracketsIfNegative) {
        return `(${Math.abs(val).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})})`;
    }
    return val.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: '2-digit'
    });
}

async function fetchAndRenderViews() {
    const { data, error } = await dbClient.from('loan_ledger').select('*').order('id', { ascending: true });
    if (error) { console.error(error); return; }

    const stmtBody = document.getElementById('statement-body');
    const ledgerBody = document.getElementById('ledger-body');
    
    stmtBody.innerHTML = '';
    ledgerBody.innerHTML = '';

    data.forEach(row => {
        // --- View A: Customer Statement Rendering ---
        stmtBody.innerHTML += `
            <tr>
                <td>${formatDate(row.post_date)}</td>
                <td>${formatDate(row.value_date)}</td>
                <td class="font-bold">${row.ref_batch}</td>
                <td>${row.description}</td>
                <td class="text-right">${formatCurrency(row.principal)}</td>
                <td class="text-right">${formatCurrency(row.interest)}</td>
                <td class="text-right">${formatCurrency(row.charges_penalties)}</td>
                <td class="text-right font-bold">${formatCurrency(row.running_balance, false)}</td>
            </tr>`;

        // --- View B: Accounting Ledger Rendering ---
        ledgerBody.innerHTML += `
            <tr>
                <td>${formatDate(row.value_date)}</td>
                <td>${row.description}</td>
                <td>${row.ref_batch}</td>
                <td class="text-right">${formatCurrency(row.principal)}</td>
                <td class="text-right">${formatCurrency(row.interest)}</td>
                <td class="text-right">${formatCurrency(row.charges_penalties)}</td>
                <td class="text-right">${formatCurrency(row.accrued_interest_receivable, false)}</td>
                <td class="text-right">${formatCurrency(row.total_paid, false)}</td>
                <td class="text-right">${formatCurrency(row.accrued_unpaid_interest, false)}</td>
                <td class="text-right font-bold">${formatCurrency(row.running_balance, false)}</td>
            </tr>`;
    });
}

document.getElementById('loan-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = parseFloat(document.getElementById('loan_amount').value);
    const startDate = new Date(document.getElementById('start_date').value);
    
    const isoDate = startDate.toISOString().split('T')[0];

    // Mock arrays structured dynamically to simulate the transactional data inside your files
    const initializedDataset = [
        {
            post_date: isoDate, value_date: isoDate,
            description: "Loan Disbursement", ref_batch: "SYS-DSB01",
            principal: amount, interest: 0, charges_penalties: 0,
            accrued_interest_receivable: 25000, running_balance: amount
        },
        {
            post_date: isoDate, value_date: isoDate,
            description: "Admin/ Processing Fee", ref_batch: "SYS-FEE01",
            principal: 0, interest: 0, charges_penalties: 1000,
            running_balance: amount
        }
    ];

    // Simulate next period entries
    let month1Date = new Date(startDate);
    month1Date.setMonth(month1Date.getMonth() + 1);
    const isoMonth1 = month1Date.toISOString().split('T')[0];

    initializedDataset.push(
        {
            post_date: isoMonth1, value_date: isoMonth1,
            description: "Interest Paid (Monthly)", ref_batch: "SYS-INT01",
            principal: 0, interest: 500, charges_penalties: 0,
            running_balance: amount
        },
        {
            post_date: isoMonth1, value_date: isoMonth1,
            description: "Repayment via Branch Transfer", ref_batch: "FT-2604-01",
            principal: -4166.67, interest: -500.00, charges_penalties: -1000.00,
            accrued_unpaid_interest: 24000, running_balance: amount - 4166.67
        }
    );

    await dbClient.from('loan_ledger').delete().neq('id', 0);
    const { error } = await dbClient.from('loan_ledger').insert(initializedDataset);

    if (error) alert(error.message);
    else fetchAndRenderViews();
});

fetchAndRenderViews();
