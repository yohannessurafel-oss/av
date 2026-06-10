const SUPABASE_URL = 'YOUR_PROJECT_URL';
const SUPABASE_KEY = 'YOUR_ANON_KEY';
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

async function fetchLedger() {
    const { data, error } = await supabase.from('loan_ledger').select('*');
    if (error) {
        console.error("Error fetching data:", error);
        return;
    }
    
    const tbody = document.getElementById('table-body');
    data.forEach(row => {
        tbody.innerHTML += `
            <tr>
                <td>${row.date}</td>
                <td>${row.description}</td>
                <td>${row.principal_debit}</td>
                <td>${row.total_paid}</td>
                <td>${row.principal_balance}</td>
            </tr>`;
    });
}

fetchLedger();
