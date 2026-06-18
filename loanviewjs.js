// Mocking data based strictly on your production schema rows
const API_APPLICATION_RESPONSE = {
    "002_0020000001": {
        branch_name: "OTC",
        application_date: "05/May/2014",
        group_id: "",
        sub_group_id: "",
        client_branch_id: "OTC",
        client_id: "000001304",
        client_name: "RAHABU KENYATTA",
        product_id: "L001",
        product_name_title: "FAULU MILELE MORTGAGE",
        main_repayment_account_id: "",
        donor_id: "",
        loan_purpose: "TRANSPORT",
        line_of_business: "Proprietary",
        officer_id: "10366153",
        loan_amount: "1,000,000.00",
        currency_id: "KES",
        term_months: "20",
        interest_rate: "18.50",
        commission_rate: "",
        tax_rate: "",
        effective_rate: "18.50",
        spread: "0.00",
        disbursement_date: "05/May/2014",
        application_status: "Pending at Sanction Stage",
        file_number: ""
    }
};

const API_CLIENT_GRID_RESPONSE = {
    "0020000001": [
        // Populate if records exist; empty lists will fall back to "No records to display."
    ]
};

document.getElementById('btnView').addEventListener('click', function() {
    const branchId = document.getElementById('branch_id').value.trim();
    const appId = document.getElementById('application_id').value.trim();
    
    const appRecord = API_APPLICATION_RESPONSE[`${branchId}_${appId}`];

    if (appRecord) {
        // Hydrate inputs matching production schema properties
        Object.keys(appRecord).forEach(key => {
            const el = document.getElementById(key);
            if (el) el.value = appRecord[key];
        });

        // Hydrate bottom sub-grid
        const gridData = API_CLIENT_GRID_RESPONSE[appId] || [];
        const tbody = document.getElementById('clientsGrid').querySelector('tbody');
        
        if (gridData.length > 0) {
            tbody.innerHTML = gridData.map(row => `
                <tr>
                    <td><input type="checkbox" ${row.apply_flag ? 'checked' : ''} disabled></td>
                    <td>${row.client_id}</td>
                    <td>${row.client_name}</td>
                </tr>
            `).join('');
        } else {
            tbody.innerHTML = `<tr><td colspan="3" class="no-records">No records to display.</td></tr>`;
        }
    } else {
        alert("No application record matching the provided criteria was discovered.");
    }
});
