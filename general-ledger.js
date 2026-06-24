'use strict';

const SUPABASE_URL = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';

async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...opts.headers
    }
  });
  if (!res.ok) throw new Error(await res.text());
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

async function loadAccountingFramework() {
  try {
    document.getElementById('accountingStatusBar').textContent = 'Fetching current balances...';
    
    // 1. Fetch data from chart_of_accounts table structure
    const accounts = await sbFetch('chart_of_accounts?select=*&order=gl_account_code.asc');
    renderCOA(accounts);

    // 2. Fetch data from double-entry audit engine table journal
    const postings = await sbFetch('gl_transaction_journal?select=*&order=journal_entry_id.desc&limit=50');
    renderJournal(postings);

    document.getElementById('accountingStatusBar').textContent = 'Status: Ledger systems synchronized and balanced.';
  } catch (err) {
    document.getElementById('accountingStatusBar').textContent = `Accounting Error: ${err.message}`;
  }
}

function renderCOA(accounts) {
  const tbody = document.querySelector('#coaTable tbody');
  tbody.innerHTML = '';
  
  if(accounts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center gray-text">No ledger accounts registered.</td></tr>`;
    return;
  }

  accounts.forEach(acc => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><code>${acc.gl_account_code}</code></td>
      <td><strong>${acc.account_name_title}</strong></td>
      <td><span class="gray-text" style="font-size:11px;">${acc.account_type}</span></td>
      <td class="text-right" style="font-family:monospace; font-weight:bold;">
        ${parseFloat(acc.current_balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderJournal(postings) {
  const tbody = document.querySelector('#journalTable tbody');
  tbody.innerHTML = '';

  if(postings.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center gray-text">No double entries written yet.</td></tr>`;
    return;
  }

  postings.forEach(p => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><small class="gray-text">${p.transaction_reference}</small></td>
      <td><code>${p.gl_account_code}</code></td>
      <td class="text-right color-green">${p.debit_amount > 0 ? p.debit_amount.toFixed(2) : '—'}</td>
      <td class="text-right color-red">${p.credit_amount > 0 ? p.credit_amount.toFixed(2) : '—'}</td>
      <td><small>${p.value_date}</small></td>
    `;
    tbody.appendChild(tr);
  });
}

document.getElementById('btnSyncLedger').addEventListener('click', loadAccountingFramework);
window.addEventListener('DOMContentLoaded', loadAccountingFramework);
