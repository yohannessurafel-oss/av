const SUPABASE_URL = 'https://oxzthrubidohuwwhxsrk.supabase.co'; // Replace with your project URL
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA'';    // Replace with your API key
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// 1. Fetch data and render table rows ordered by date
async function fetchLedger() {
    const { data, error } = await _supabase
        .from('loan_ledger')
        .select('*')
        .order('date', { ascending: true });

    if (error) {
        console.error("Error fetching data:", error);
        return;
    }
    
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = ''; // Clear existing rows before reloading
    
    data.forEach(row => {
        // Format numbers to look clean; format negatives into parentheses like your ledger image
        const formatCurrency = (val) => {
            if (val === null || val === undefined || val === '') return '-';
            if (val < 0) return `(${Math.abs(val).toLocaleString(undefined, {minimumFractionDigits: 2})})`;
            return val.toLocaleString(undefined, {minimumFractionDigits: 2});
        };

        tbody.innerHTML += `
            <tr>
                <td>${new Date(row.date).toLocaleDateString('en-GB', {day: '2-digit', month: 'short', year: '2-digit'})}</td>
                <td>${row.description}</td>
                <td>${row.ref_number || '-'}</td>
                <td class="text-right">${formatCurrency(row.principal_debit)}</td>
                <td class="text-right">${formatCurrency(row.total_paid)}</td>
                <td class="text-right font-bold">${formatCurrency(row.principal_balance)}</td>
            </tr>`;
    });
}

// 2. Handle Form Submission to Database
document.getElementById('ledger-form').addEventListener('submit', async (e) => {
    e.preventDefault(); // Stop page from refreshing

    // Gather values from the inputs
    const date = document.getElementById('date').value;
    const description = document.getElementById('description').value;
    const ref_number = document.getElementById('ref_number').value;
    const principal_debit = document.getElementById('principal_debit').value ? parseFloat(document.getElementById('principal_debit').value) : null;
    const total_paid = document.getElementById('total_paid').value ? parseFloat(document.getElementById('total_paid').value) : null;
    const principal_balance = parseFloat(document.getElementById('principal_balance').value);

    // Insert statement into Supabase
    const { error } = await _supabase
        .from('loan_ledger')
        .insert([{ 
            date, 
            description, 
            ref_number, 
            principal_debit, 
            total_paid, 
            principal_balance 
        }]);

    if (error) {
        alert("Error saving transaction: " + error.message);
    } else {
        document.getElementById('ledger-form').reset(); // Clear form inputs
        fetchLedger(); // Refresh table visualization
    }
});

// Run automatically on page load
fetchLedger();
