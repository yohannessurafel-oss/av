/**
 * Africa Village Microfinance — Core Banking System v2.0
 * account-maintenance.js
 * Core logic for Module 12: Client Financial Account Maintenance
 */

// --- 1. CONFIGURATION & STATE MANAGMENT ---
// Assumes Supabase CDN script is loaded in html header
let supabaseClient = null; 
let isEditMode = false;
let currentSelectedAccount = null;

// Form DOM Elements
const branchSelect      = document.getElementById('accBranchId');
const branchNameInput   = document.getElementById('accBranchName');
const clientIdInput     = document.getElementById('accClientId');
const clientNameInput   = document.getElementById('accClientName');
const accountNoInput    = document.getElementById('accountNumber');
const accountTypeSelect = document.getElementById('accountType');
const currencySelect    = document.getElementById('accCurrencyId');
const initDepositInput  = document.getElementById('initialDeposit');
const currBalanceInput  = document.getElementById('currentBalance');
const statusSelect      = document.getElementById('accountStatus');
const remarksTextarea   = document.getElementById('accRemarks');
const createdByInput    = document.getElementById('accCreatedBy');
const createdOnInput    = document.getElementById('accCreatedOn');
const accountTableBody  = document.getElementById('tbodyAccountList');
const statusBar         = document.getElementById('statusBar');

// Action Sidebar Buttons
const btnView   = document.getElementById('btnGlobalView');
const btnAdd    = document.getElementById('btnGlobalAdd');
const btnEdit   = document.getElementById('btnGlobalEdit');
const btnClose  = document.getElementById('btnGlobalClose');
const btnSave   = document.getElementById('btnGlobalSave');
const btnCancel = document.getElementById('btnGlobalCancel');
const btnDelete = document.getElementById('btnGlobalDelete');
const btnPrint  = document.getElementById('btnGlobalPrint');

// Inline Utility Buttons
const btnVerifyClient = document.getElementById('btnVerifyClient');
const btnLookupAcc    = document.getElementById('btnLookupAccount');
const btnGenAccNo     = document.getElementById('btnGenAccNo');

// --- 2. INITIALIZATION ---
document.addEventListener("DOMContentLoaded", () => {
    initializeSupabase();
    loadBranches();
    setupEventListeners();
    resetFormState();
});

function initializeSupabase() {
    // Replace placeholder strings with actual project secrets if not globally set
    if (window.supabase) {
        supabaseClient = window.supabase.createClient(
            'YOUR_SUPABASE_URL', 
            'YOUR_SUPABASE_ANON_KEY'
        );
        updateStatus("Ready (Connected to Supabase)");
    } else {
        updateStatus("Error: Supabase SDK missing", true);
    }
}

// Populate sample operational branches
function loadBranches() {
    const branches = [
        { id: "001", name: "Addis Ababa Main" },
        { id: "002", name: "Arada Sub-Branch" },
        { id: "003", name: "Bole Area Branch" }
    ];
    
    branchSelect.innerHTML = branches.map(b => `<option value="${b.id}">${b.id} — ${b.name}</option>`).join('');
    branchNameInput.value = branches[0].name;
    
    branchSelect.addEventListener('change', (e) => {
        const selected = branches.find(b => b.id === e.target.value);
        branchNameInput.value = selected ? selected.name : '';
    });
}

// --- 3. EVENT BINDINGS ---
function setupEventListeners() {
    // Inline Actions
    btnVerifyClient.addEventListener('click', verifyClientFromRegistry);
    btnGenAccNo.addEventListener('click', generateEthiopianAccountNumber);
    btnLookupAcc.addEventListener('click', lookupSpecificAccount);
    
    // Sidebar Controls
    btnAdd.addEventListener('click', () => setFormEditMode(true, 'add'));
    btnEdit.addEventListener('click', () => setFormEditMode(true, 'edit'));
    btnCancel.addEventListener('click', () => {
        resetFormState();
        updateStatus("Operation cancelled.");
    });
    btnSave.addEventListener('click', handleSaveAccount);
    btnDelete.addEventListener('click', handleDeleteAccount);
    btnClose.addEventListener('click', () => window.location.href = 'index.html'); // Back to dashboard
    btnPrint.addEventListener('click', () => window.print());
}

// --- 4. ENGINE LOGIC & CORE DATABASE CALLS ---

// Verify Client Existence in Registry & Fetch Current Linked Accounts
async function verifyClientFromRegistry() {
    const clientId = clientIdInput.value.trim();
    if (!clientId) return showToast("Please input a valid Client ID", "warning");

    updateStatus(`Verifying client ${clientId}...`);
    
    try {
        // Querying assuming a table named 'clients' exists
        const { data: client, error } = await supabaseClient
            .from('clients')
            .select('first_name, last_name')
            .eq('id', clientId)
            .single();

        if (error || !client) {
            clientNameInput.value = "";
            showToast("Client record not found in system registry.", "error");
            updateStatus("Verification failed.", true);
            return;
        }

        clientNameInput.value = `${client.first_name} ${client.last_name}`;
        showToast("Client valid and verified.", "success");
        
        // Pull account array
        fetchClientAccountList(clientId);

    } catch (err) {
        console.error(err);
        updateStatus("Verification infrastructure error.", true);
    }
}

// Pull active financial ledgers into the UI table grid
async function fetchClientAccountList(clientId) {
    accountTableBody.innerHTML = `<tr><td colspan="4" class="text-center gray-text italic">Loading accounts...</td></tr>`;
    
    const { data: accounts, error } = await supabaseClient
        .from('financial_accounts')
        .select('*')
        .eq('client_id', clientId);

    if (error || !accounts || accounts.length === 0) {
        accountTableBody.innerHTML = `<tr><td colspan="4" class="text-center gray-text italic">No accounts mapped to this client profile.</td></tr>`;
        return;
    }

    accountTableBody.innerHTML = accounts.map(acc => `
        <tr onclick="populateFormFromRow(${JSON.stringify(acc).replace(/"/g, '&quot;')})">
            <td>${acc.account_number}</td>
            <td>${acc.account_type}</td>
            <td class="text-right font-bold">${parseFloat(acc.current_balance).toFixed(2)}</td>
            <td><span class="status-badge" style="padding:1px 6px;">${acc.account_status}</span></td>
        </tr>
    `).join('');
    updateStatus(`Fetched ${accounts.length} linked account records.`);
}

// Format template standard parameters for standard bank identification accounts
function generateEthiopianAccountNumber() {
    const branchCode = branchSelect.value;
    const typeMap = { "Savings": "10", "Repayment": "20", "Current": "30" };
    const typeCode = typeMap[accountTypeSelect.value] || "10";
    const uniqueSequence = Math.floor(100000 + Math.random() * 900000); // 6 random operational digits
    
    // Structure format matching localized core models: AVMF-BRANCH-TYPE-SEQ
    accountNoInput.value = `AVMF-${branchCode}-${typeCode}-${uniqueSequence}`;
    showToast("Generated unique account number structure", "success");
}

// Look up unique targeted single profile parameters
async function lookupSpecificAccount() {
    const accNo = accountNoInput.value.trim();
    if (!accNo) return showToast("Enter account number to fetch", "warning");

    const { data: acc, error } = await supabaseClient
        .from('financial_accounts')
        .select('*')
        .eq('account_number', accNo)
        .single();

    if (error || !acc) {
        showToast("Account number not registered.", "error");
        return;
    }
    populateFormFromRow(acc);
}

function populateFormFromRow(acc) {
    currentSelectedAccount = acc;
    clientIdInput.value = acc.client_id;
    clientNameInput.value = acc.client_name || "Verified Client Profile";
    accountNoInput.value = acc.account_number;
    accountTypeSelect.value = acc.account_type;
    currencySelect.value = acc.currency || "ETB";
    initDepositInput.value = acc.initial_deposit || 0;
    currBalanceInput.value = acc.current_balance;
    statusSelect.value = acc.account_status;
    remarksTextarea.value = acc.remarks || "";
    createdByInput.value = acc.created_by || "";
    createdOnInput.value = acc.created_at ? new Date(acc.created_at).toLocaleDateString() : "";
    
    // Enable workflow update paths
    btnEdit.disabled = false;
    btnDelete.disabled = false;
    updateStatus(`Active account context selected: ${acc.account_number}`);
}

// Commit payload arrays back upstream to data tables
async function handleSaveAccount() {
    const payload = {
        branch_id: branchSelect.value,
        client_id: clientIdInput.value.trim(),
        account_number: accountNoInput.value.trim(),
        account_type: accountTypeSelect.value,
        currency: currencySelect.value,
        initial_deposit: parseFloat(initDepositInput.value) || 0,
        current_balance: isEditMode && currentSelectedAccount ? parseFloat(currBalanceInput.value) : parseFloat(initDepositInput.value),
        account_status: statusSelect.value,
        remarks: remarksTextarea.value.trim(),
        created_by: createdByInput.value.trim()
    };

    // Validations
    if (!payload.client_id || !payload.account_number) {
        showToast("Missing required structural data validation points (*)", "error");
        return;
    }

    updateStatus("Committing records to remote core structures...");

    let response;
    if (currentSelectedAccount && isEditMode) {
        // Handle database mutation update pathway
        response = await supabaseClient
            .from('financial_accounts')
            .update(payload)
            .eq('account_number', currentSelectedAccount.account_number);
    } else {
        // Handle database generation append entry record
        response = await supabaseClient
            .from('financial_accounts')
            .insert([payload]);
    }

    if (response.error) {
        showToast(`Transaction Write Rejected: ${response.error.message}`, "error");
        updateStatus("Database commit exception encountered.", true);
    } else {
        showToast("Account entry structurally synchronized successfully.", "success");
        resetFormState();
        clientIdInput.value = payload.client_id;
        verifyClientFromRegistry(); // Re-index matching list automatically
    }
}

async function handleDeleteAccount() {
    if (!currentSelectedAccount) return;
    if (!confirm(`Are you absolutely sure you want to delete account ${currentSelectedAccount.account_number}?`)) return;

    updateStatus("Purging operational sequence record...");
    const { error } = await supabaseClient
        .from('financial_accounts')
        .delete()
        .eq('account_number', currentSelectedAccount.account_number);

    if (error) {
        showToast(`Error removing account: ${error.message}`, "error");
    } else {
        showToast("Account entry cleanly purged from records.", "success");
        resetFormState();
    }
}

// --- 5. INTERFACE CONFIGURATION UTILITIES ---
function setFormEditMode(enabled, mode = 'add') {
    isEditMode = enabled;
    
    // Input state matrix toggle management
    const formFields = [clientIdInput, accountNoInput, accountTypeSelect, currencySelect, initDepositInput, statusSelect, remarksTextarea, createdByInput];
    formFields.forEach(field => field.disabled = !enabled);

    if (mode === 'add') {
        const memoizedClientId = clientIdInput.value; // Keep current ID active
        document.querySelector(".module-form").reset();
        clientIdInput.value = memoizedClientId;
        currBalanceInput.value = "0.00";
        createdOnInput.value = new Date().toLocaleDateString();
        btnDelete.disabled = true;
    }

    // Toggle Action bar configurations safely
    btnAdd.disabled = enabled;
    btnEdit.disabled = enabled;
    btnSave.disabled = !enabled;
    btnCancel.disabled = !enabled;
}

function resetFormState() {
    setFormEditMode(false);
    document.querySelector(".module-form").reset();
    accountTableBody.innerHTML = `<tr><td colspan="4" class="text-center gray-text italic">Verify a Client ID to see their accounts.</td></tr>`;
    btnEdit.disabled = true;
    btnDelete.disabled = true;
    currentSelectedAccount = null;
    updateStatus("Ready");
}

function updateStatus(text, isError = false) {
    statusBar.textContent = `Status: ${text}`;
    statusBar.style.color = isError ? "var(--red)" : "var(--text-muted)";
}

function showToast(message, type = "success") {
    const toast = document.getElementById('toastNotification');
    toast.className = `toast show ${type}`; // Maps cleanly directly down into toast.success/toast.error classes[cite: 1]
    toast.textContent = message;
    
    setTimeout(() => {
        toast.className = 'toast';
    }, 4000);
}
