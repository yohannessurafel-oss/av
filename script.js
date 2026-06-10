const SUPABASE_URL = 'https://oxzthrubidohuwwhxsrk.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';

const dbClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Default configuration variables for real-world banking terms
const CONFIG = {
    GRACE_PERIOD_DAYS: 5,        // Grace allowance window 
    FLAT_PENALTY_FEE: 150.00,    // Penalty applied on violation (matches JRNL-102 layout)
    INITIAL_ACCRUED_INT: 25000   // Point (a) from source visual asset
};

function formatCurrency(val, displayBrackets = true) {
    if (val === null || val === undefined || val === '' || val === 0) return '-';
    if (val < 0 && displayBrackets) {
        return `(${Math.abs(val).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})})`;
    }
    return val.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: '2-digit'
    });
}

// 1. Unified Render Pipeline mapping data straight to your 11-column layouts
async function fetchAndRenderViews() {
    const { data, error } = await dbClient.from('loan_ledger').select('*').order('id', { ascending: true });
    if (error) { console.error("Fetch Error:", error); return; }

    const stmtBody = document.getElementById('statement-body');
    const ledgerBody = document.getElementById('ledger-body');
    
    stmtBody.innerHTML = '';
    ledgerBody.innerHTML = '';

    if(data.length > 0 && document.getElementById('meta-product')) {
        document.getElementById('meta-product').innerText = data[0].product_name;
    }

    data.forEach(row => {
        // View A: Customer Transaction Statement Rendering
        stmtBody.innerHTML += `
            <tr>
                <td>${formatDate(row.post_date)}</td>
                <td>${formatDate(row.value_date)}</td>
                <td class="font-bold">${row.ref_batch}</td>
                <td>${row.description}</td>
                <td class="text-right">${formatCurrency(row.principal)}</td>
                <td class="text-right">${formatCurrency(row.interest)}</td>
                <td class="text-right" style="color: #dc2626;">${formatCurrency(row.charges_penalties)}</td>
                <td class="text-right font-bold">${formatCurrency(row.running_balance, false)}</td>
            </tr>`;

        // View B: Advanced Internal Accounting Ledger Rendering
        ledgerBody.innerHTML += `
            <tr>
                <td>${formatDate(row.value_date)}</td>
                <td>${row.description}</td>
                <td>${row.ref_batch}</td>
                <td class="text-right">${formatCurrency(row.principal)}</td>
                <td class="text-right">${formatCurrency(row.interest)}</td>
                <td class="text-right" style="color: #dc2626;">${formatCurrency(row.charges_penalties)}</td>
                <td class="text-right" style="color: #475569;">${formatCurrency(row.accrued_interest_receivable, false)}</td>
                <td class="text-right" style="color: #16a34a;">${formatCurrency(row.total_paid, false)}</td>
                <td class="text-right" style="color: #b45309;">${formatCurrency(row.accrued_unpaid_interest, false)}</td>
                <td class="text-right font-bold">${formatCurrency(row.running_balance, false)}</td>
            </tr>`;
    });
}

// 2. Core Operational Engine logic mapping parameters dynamically
document.getElementById('loan-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const selectedProduct = document.getElementById('product_type').value;
    const amount = parseFloat(document.getElementById('loan_amount').value);
    const startDate = new Date(document.getElementById('start_date').value);
    const annualRate = parseFloat(document.getElementById('interest_rate').value) / 100;
    const totalMonths = parseInt(document.getElementById('loan_term').value);
    const frequency = document.getElementById('repayment_frequency').value;

    const isoDate = startDate.toISOString().split('T')[0];
    let initializedDataset = [];

    // Row 0: Set initial values with reference to marker point (a)
    initializedDataset.push({
        product_name: selectedProduct, post_date: isoDate, value_date: isoDate,
        description: "Loan Disbursement", ref_batch: "SYS-DSB01",
        principal: amount, interest: 0, charges_penalties: 0,
        accrued_interest_receivable: CONFIG.INITIAL_ACCRUED_INT, total_paid: 0, running_balance: amount
    });

    // Optional conditional check for processing fee additions
    if (selectedProduct === "Agri-business Term Loan") {
        initializedDataset.push({
            product_name: selectedProduct, post_date: isoDate, value_date: isoDate,
            description: "Admin/ Processing Fee", ref_batch: "SYS-FEE01",
            principal: 0, interest: 0, charges_penalties: 1000.00,
            accrued_interest_receivable: 0, total_paid: 0, running_balance: amount
        });
    }

    let currentBalance = amount;
    let calculationDate = new Date(startDate);
    let stepMonths = frequency === 'yearly' ? 12 : 1;
    let totalPeriods = frequency === 'yearly' ? Math.round(totalMonths / 12) : totalMonths;
    let periodicRate = frequency === 'yearly' ? annualRate : (annualRate / 12);

    const installmentEMI = (amount * periodicRate * Math.pow(1 + periodicRate, totalPeriods)) / (Math.pow(1 + periodicRate, totalPeriods) - 1);

    // Track accrued balances over time
    let totalUnpaidInterestTracker = CONFIG.INITIAL_ACCRUED_INT - 1000.00; 

    for (let i = 1; i <= totalPeriods; i++) {
        let lastDueDate = new Date(calculationDate);
        calculationDate.setMonth(calculationDate.getMonth() + stepMonths);
        
        let paymentDueDate = new Date(calculationDate.getFullYear(), calculationDate.getMonth() + 1, 0);
        let isoDueDateStr = paymentDueDate.toISOString().split('T')[0];

        // 1. Accrued Interest Tracking Calculation
        let daysInPeriod = Math.round((paymentDueDate - lastDueDate) / (1000 * 60 * 60 * 24));
        let monthlyAccruedInterest = currentBalance * periodicRate; 

        let principalComponent = installmentEMI - monthlyAccruedInterest;
        currentBalance -= principalComponent;

        if (i === totalPeriods) {
            principalComponent += currentBalance;
            currentBalance = 0;
        }

        // 2. Grace Period Check Simulation
        // Simulating a late payment event on Month 1 to match the "Late Penalty Fee" layout
        if (i === 1) {
            let actualPaymentDate = new Date(paymentDueDate);
            actualPaymentDate.setDate(actualPaymentDate.getDate() + 15); // Paid 15 days late (breaching the 5-day grace period)
            
            let daysLate = Math.round((actualPaymentDate - paymentDueDate) / (1000 * 60 * 60 * 24));

            if (daysLate > CONFIG.GRACE_PERIOD_DAYS) {
                let penaltyIsoStr = new Date(paymentDueDate.getFullYear(), paymentDueDate.getMonth() + 1, 15).toISOString().split('T')[0];
                
                // Inject Adjustment Row (Matches JRNL-102 sequence row 4)
                initializedDataset.push({
                    product_name: selectedProduct,
                    post_date: penaltyIsoStr, value_date: penaltyIsoStr,
                    description: "Late Penalty Fee", ref_batch: "JRNL-102",
                    principal: 0, interest: 0, charges_penalties: CONFIG.FLAT_PENALTY_FEE,
                    accrued_interest_receivable: 0, total_paid: CONFIG.FLAT_PENALTY_FEE,
                    accrued_unpaid_interest: 0, running_balance: parseFloat(currentBalance.toFixed(2)) + parseFloat(principalComponent.toFixed(2))
                });
            }
        }

        // Add standard schedule record
        initializedDataset.push({
            product_name: selectedProduct,
            post_date: isoDueDateStr, value_date: isoDueDateStr,
            description: "Monthly Installment", ref_batch: `RCPT-0${41 + i}`,
            principal: parseFloat((-principalComponent).toFixed(2)),
            interest: i === 1 ? -1000.00 : parseFloat((-monthlyAccruedInterest).toFixed(2)), // Row point (b) override simulation
            charges_penalties: 0,
            accrued_interest_receivable: 0,
            total_paid: parseFloat(installmentEMI.toFixed(2)),
            accrued_unpaid_interest: i === 1 ? totalUnpaidInterestTracker : null, // Row point (c) mapping
            running_balance: parseFloat(Math.max(0, currentBalance).toFixed(2))
        });
    }

    // Database push processing
    await dbClient.from('loan_ledger').delete().neq('id', 0);
    const { error } = await dbClient.from('loan_ledger').insert(initializedDataset);

    if (error) alert("Sync Failure: " + error.message);
    else fetchAndRenderViews();
});

fetchAndRenderViews();
