/* ═══════════════════════════════════════════════════════════
   Africa Village Microfinance — Client Financial Accounts Ledger
   account-maintenance.js 
═══════════════════════════════════════════════════════════ */

'use strict';

const SUPABASE_URL      = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';

const TABLE_ACCOUNTS = 'clientfinancialaccounts';
const TABLE_CLIENTS  = 'clients';
const TABLE_BRANCHES = 'branchregistry';

let systemEditMode = 'view'; // 'view' or 'add'

// Dynamic Supabase REST Query Helper
async function sbFetch(urlTarget, configurations = {}) {
  const fullUrl = urlTarget.startsWith('http') ? urlTarget : `${SUPABASE_URL}/rest/v1/${urlTarget}`;
  
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    ...(configurations.headers || {})
  };

  const response = await fetch(fullUrl, { ...configurations, headers });
  if (!response.ok) {
    const contextErr = await response.text();
    throw new Error(contextErr || `HTTP Failure: ${response.status}`);
  }
  
  if (configurations.prefer === 'return=minimal') return null;
  return await response.json();
}

// Global Notification Alert Utility
function notify(msg, alertStyle = 'info') {
  const element = document.getElementById('toastNotification');
  if (!element) return;
  element.textContent = msg;
  element.className = `toast-popup alert-${alertStyle}`;
  setTimeout(() => element.className = 'toast-popup panel-hidden', 4000);
}

// Hydrate Branch Selection List 
async function loadBranches() {
  try {
    const branches = await sbFetch(`${TABLE_BRANCHES}?select=branch_id,branch_name&is_operational_active=eq.true`);
    const selectBox = document.getElementById('accBranchId');
    if (!selectBox) return;
    
    branches.forEach(b => {
      const option = document.createElement('option');
      option.value = b.branch_id;
      option.textContent = `${b.branch_id} - ${b.branch_name}`;
      selectBox.appendChild(option);
    });
  } catch (err) {
    notify('Failed to load branches reference metadata.', 'error');
  }
}

// Look up client details using client ID
document.getElementById('btnVerifyClient')?.addEventListener('click', async () => {
  const idValue = document.getElementById('accClientId')?.value?.trim();
  if (!idValue) {
    notify('Please input a Client ID first.', 'warning');
    return;
  }
  
  try {
    const clients = await sbFetch(`${TABLE_CLIENTS}?client_id=eq.${encodeURIComponent(idValue)}&select=client_name`);
    if (clients && clients.length > 0) {
      document.getElementById('accClientName').value = clients[0].client_name;
      notify('✔ Client registry signature verified.', 'success');
    } else {
      document.getElementById('accClientName').value = '';
      notify('No registered client matching this ID was found.', 'error');
    }
  } catch (e) {
    notify('Error running validation query.', 'error');
  }
});

// Structural Account Generator Rule Engine
document.getElementById('btnGenAccNo')?.addEventListener('click', () => {
  const branch = document.getElementById('accBranchId').value;
  const client = document.getElementById('accClientId').value.trim();
  const typeCode = document.getElementById('accountType').value === 'Savings' ? 'SAV' : 'REP';

  if (!branch || !client) {
    notify('Select Branch and Client IDs to calculate an account matrix.', 'warning');
    return;
  }
  // Formulaic Pattern: BR-CLIENTID-TYPE-RAND
  const generatedId = `${branch}-${client.substring(0,5)}-${typeCode}-${Math.floor(100 + Math.random() * 900)}`;
  document.getElementById('accountNumber').value = generatedId.toUpperCase();
});

// UI Mode State Transitions (View vs Active Edit Form States)
function setModuleMode(mode) {
  systemEditMode = mode;
  const inputs = document.querySelectorAll('#accountForm input, #accountForm select, #accountForm textarea');
  
  inputs.forEach(field => {
    // Keep internal structural labels locked
    if (['accClientName', 'accCurrencyId', 'accountStatus'].includes(field.id)) return;
    field.disabled = (mode === 'view');
  });

  document.getElementById('btnAccSave').disabled   = (mode === 'view');
  document.getElementById('btnAccCancel').disabled = (mode === 'view');
  document.getElementById('btnAccNew').disabled    = (mode === 'add');
}

// Trigger Application Form Reset
document.getElementById('btnAccNew')?.addEventListener('click', () => {
  document.getElementById('accountForm').reset();
  document.getElementById('accClientName').value = '';
  setModuleMode('add');
  notify('Module configured into Account Opening Mode.', 'info');
});

document.getElementById('btnAccCancel')?.addEventListener('click', () => {
  document.getElementById('accountForm').reset();
  setModuleMode('view');
  notify('Changes dropped.', 'warning');
});

// Handle Account Registration Submission
document.getElementById('btnAccSave')?.addEventListener('click', async (e) => {
  e.preventDefault();
  
  const payload = {
    account_number:           document.getElementById('accountNumber').value.trim(),
    client_id:                document.getElementById('accClientId').value.trim(),
    branch_id:                document.getElementById('accBranchId').value,
    account_type:             document.getElementById('accountType').value,
    currency_id:              document.getElementById('accCurrencyId').value,
    initial_deposit_amount:   parseFloat(document.getElementById('initialDeposit').value || 0),
    current_balance:          parseFloat(document.getElementById('initialDeposit').value || 0),
    account_status:           document.getElementById('accountStatus').value,
    remarks:                  document.getElementById('accRemarks').value.trim()
  };

  if (!payload.account_number || !payload.client_id || !payload.branch_id) {
    notify('Missing mandatory accounting parameter metrics.', 'warning');
    return;
  }

  try {
    notify('Committing transactions to ledger...', 'info');
    
    await sbFetch(TABLE_ACCOUNTS, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Prefer': 'resolution=merge-duplicates' },
      prefer: 'return=minimal'
    });

    notify('✔ New financial account successfully opened.', 'success');
    setModuleMode('view');
  } catch (err) {
    console.error(err);
    notify(`Ledger write error: ${err.message}`, 'error');
  }
});

// Initialize context
async function startModule() {
  setModuleMode('view');
  await loadBranches();
}
startModule();
