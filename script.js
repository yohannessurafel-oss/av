const SUPABASE_URL = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';
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
