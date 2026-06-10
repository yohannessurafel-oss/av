// 1. Database connection config
const SUPABASE_URL = 'https://oxzthrubidohuwwhxsrk.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';

const dbClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Set default disbursement date value placeholder automatically on load
document.getElementById('start_date').valueAsDate = new Date();

// 2. Financial Currency Formatter Rule Engine
function formatCurrency(val, displayBracketsIfNegative = true) {
    if (val === null || val === undefined || val === '' || val === 0) return '-';
    if (val < 0 && displayBracketsIfNegative) {
        return `(${Math.abs(val).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})})`;
    }
    return val.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

// 3. Simple Date Formatter Utility (Output: 31-Jan-26)
function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: '2-digit'
    });
}

// 4. Unified Render Pipeline: Pulls from Supabase and fills BOTH HTML views
async function fetchAndRenderViews() {
    const { data, error } = await dbClient.from('loan_ledger').select('*').order('id', { ascending: true });
    if (error) { 
        console.error("Fetch Execution Error:", error); 
        return; 
    }

    const stmtBody = document.getElementById('statement-body');
    const ledgerBody = document.getElementById('ledger-body');
    
    stmtBody.innerHTML = '';
    ledgerBody.innerHTML = '';

    if (data.length > 0 && document.getElementById('meta-product')) {
        document.getElementById('meta-product').innerText = data[0].product_name;
    }

    data.forEach(row => {
        // --- View A: Customer Account Statement Table Row Mapping ---
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

        // --- View B: Internal Accounting Ledger Table Row Mapping ---
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

// 5. Core Mathematical & Operational Engine Event Handler
document.getElementById('loan-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Extract dynamic UI parameters
    const selectedProduct = document.getElementById('product_type').value;
    const amount = parseFloat(document.getElementById('loan_amount').value);
    const startDate = new Date(document.getElementById('start_date').value);
    const annualRate = parseFloat(document.getElementById('interest_rate').value) / 100;
    const totalMonths = parseInt(document.getElementById('loan_term').value);
    const frequency = document.getElementById('repayment_frequency').value;

    // Extract advanced custom parameter configurations
    const gracePeriodDays = parseInt(document.getElementById('grace_period').value);
    const flatPenaltyFee = parseFloat(document.getElementById('flat_penalty').value);
    const initialAccruedInterest = parseFloat(document.getElementById('total_accrued_estimate').value);

    const isoDate = startDate.toISOString().split('T')[0];
    let initializedDataset = [];

    // Base Allocation Row 0: Initial Loan Disbursement 
    initializedDataset.push({
        product_name: selectedProduct, post_date: isoDate, value_date: isoDate,
        description: "Loan Disbursement", ref_batch: "SYS-DSB01",
        principal: amount, interest: 0, charges_penalties: 0,
        accrued_interest_receivable: initialAccruedInterest, total_paid: 0, running_balance: amount
    });

    // Base Allocation Row 1: Add dynamic Processing Fee context exclusively for Agri-business terms
    if (selectedProduct === "Agri-business Term Loan") {
        initializedDataset.push({
            product_name: selectedProduct, post_date: isoDate, value_date: isoDate,
            description: "Admin/ Processing Fee", ref_batch: "SYS-FEE01",
            principal: 0, interest: 0, charges_penalties: 1000.00,
            accrued_interest_receivable: 0, total_paid: 0, running_balance: amount
        });
    }

    // Set scheduling intervals depending on frequency selections
    let intervals = totalMonths;
    let ratePerPeriod = annualRate / 12;
    let monthStep = 1;

    if (frequency === 'yearly') {
        intervals = Math.max(1, Math.round(totalMonths / 12));
        ratePerPeriod = annualRate; 
        monthStep = 12;
    }

    // Standard Periodic Equal Installment (EMI) Calculation
    const periodicPayment = (amount * ratePerPeriod * Math.pow(1 + ratePerPeriod, intervals)) / (Math.pow(1 + ratePerPeriod, intervals) - 1);

    let currentBalance = amount;
    let calculationDate = new Date(startDate);
    
    // Internal trackers to accurately balance target accrual targets
    let dynamicUnpaidInterestTracker = initialAccruedInterest - 1000.00; 

    for (let i = 1; i <= intervals; i++) {
        calculationDate.setMonth(calculationDate.getMonth() + monthStep);
        
        // Find last calendar day of respective period targeting value dating parameters
        let periodDueDate = new Date(calculationDate.getFullYear(), calculationDate.getMonth() + 1, 0);
        let currentIsoStr = periodDueDate.toISOString().split('T')[0];

        let interestComponent = currentBalance * ratePerPeriod;
        let principalComponent = periodicPayment - interestComponent;
        currentBalance -= principalComponent;

        // Final period residual execution cleanup
        if (i === intervals) {
            principalComponent += currentBalance;
            currentBalance = 0;
        }

        // --- Grace Window & Penalty Violation Verification Engine ---
        // Simulating an explicit late payment on payment interval 1 for illustrative visualization
        if (i === 1) {
            let actualTransactionProcessingDate = new Date(periodDueDate);
            actualTransactionProcessingDate.setDate(actualTransactionProcessingDate.getDate() + 15); // Paid 15 days late
            
            let daysOverdue = Math.round((actualTransactionProcessingDate - periodDueDate) / (1000 * 60 * 60 * 24));

            // Inject standalone penalty adjustment row if grace validation boundaries breach
            if (daysOverdue > gracePeriodDays) {
                let penaltyPostIsoStr = new Date(periodDueDate.getFullYear(), periodDueDate.getMonth() + 1, 15).toISOString().split('T')[0];
                
                initializedDataset.push({
                    product_name: selectedProduct, post_date: penaltyPostIsoStr, value_date: penaltyPostIsoStr,
                    description: "Late Penalty Fee", ref_batch: "JRNL-102",
                    principal: 0, interest: 0, charges_penalties: flatPenaltyFee,
                    accrued_interest_receivable: 0, total_paid: flatPenaltyFee,
                    accrued_unpaid_interest: 0, 
                    // Standalone fees temporarily increase the operational running liability column before installment matching
                    running_balance: parseFloat(currentBalance.toFixed(2)) + parseFloat(principalComponent.toFixed(2))
                });
            }
        }

        // Add regular periodic installment data block
        initializedDataset.push({
            product_name: selectedProduct,
            post_date: currentIsoStr, value_date: currentIsoStr,
            description: frequency === 'yearly' ? `Yearly Installment ${i}` : `Monthly Installment ${i}`,
            ref_batch: frequency === 'yearly' ? `YRT-${100+i}` : `RCPT-0${41 + i}`,
            principal: parseFloat((-principalComponent).toFixed(2)),
            // Override point (b) simulation criteria mapping context on initial record matrix parameters
            interest: i === 1 ? -1000.00 : parseFloat((-interestComponent).toFixed(2)),
            charges_penalties: 0,
            accrued_interest_receivable: 0,
            total_paid: parseFloat(periodicPayment.toFixed(2)),
            accrued_unpaid_interest: i === 1 ? dynamicUnpaidInterestTracker : null, // Mapped target point (c)
            running_balance: parseFloat(Math.max(0, currentBalance).toFixed(2))
        });
    }

    // Wipe previous entries 
    await dbClient.from('loan_ledger').delete().neq('id', 0);
    
    // Bulk dispatch data blocks securely to Supabase
    const { error } = await dbClient.from('loan_ledger').insert(initializedDataset);

    if (error) {
        alert("Data Synchronization Failure: " + error.message);
    } else {
        alert("Advanced Loan Amortization Matrix generated and saved!");
        fetchAndRenderViews();
    }
});

// Run rendering script initialization immediately when browser opens
fetchAndRenderViews();
