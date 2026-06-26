/* ═══════════════════════════════════════════════════════════
   Africa Village Microfinance — 00 Client Master Registry
   client-directory.js v2.0
═══════════════════════════════════════════════════════════ */

'use strict';

const TABLE_CLIENTS = 'ClientMasterRecords';
let clientsData = [];

/* ── Toast Utility ─────────────────────────────────────── */
const toastEl = document.getElementById('toastNotification');
let _toastTimer = null;
function toast(msg, type = '', duration = 3000) {
  toastEl.textContent = msg;
  toastEl.className = `toast show ${type}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { toastEl.className = 'toast'; }, duration);
}

/* ── System Date ───────────────────────────────────────── */
(function initDate() {
  const el = document.getElementById('systemDate');
  if (el) el.textContent = new Date().toLocaleDateString('en-ET', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
  });
})();

/* ── Database Fetch ────────────────────────────────────── */
async function fetchClients() {
  const tbody = document.getElementById('clientTableBody');
  const countEl = document.getElementById('recordCount');
  
  tbody.innerHTML = '<tr><td colspan="7" class="text-center gray-text italic" style="padding: 20px;">Fetching records from server...</td></tr>';
  countEl.textContent = 'Loading...';

  try {
    const { data, error } = await _supabase
      .from(TABLE_CLIENTS)
      .select('id, client_id, client_name, first_name, last_name, client_type, gender, mobile, status, open_date')
      .order('created_on', { ascending: false });

    if (error) throw error;

    clientsData = data || [];
    renderTable(clientsData);
    toast('✔ Records synchronized successfully.', 'success');

  } catch (err) {
    console.error("Fetch Error:", err.message);
    tbody.innerHTML = `<tr><td colspan="7" class="text-center red-text font-bold" style="padding: 20px;">Database Error: ${err.message}</td></tr>`;
    countEl.textContent = '0 records found';
    toast('Database connection failed.', 'error');
  }
}

/* ── Render Data Grid ──────────────────────────────────── */
function renderTable(data) {
  const tbody = document.getElementById('clientTableBody');
  const countEl = document.getElementById('recordCount');
  const btnEdit = document.getElementById('btnEditClient');
  
  btnEdit.disabled = true; // reset edit button
  countEl.textContent = `${data.length} record(s) found`;

  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center gray-text italic" style="padding: 20px;">No client records found.</td></tr>';
    return;
  }

  const rowsHtml = data.map(r => {
    // Construct Name
    const fullName = r.client_name || `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Unknown';
    
    // Status Coloring
    let statusBg = '#eef4fb';
    let statusColor = '#0d3460';
    if (r.status === 'Active') { statusBg = '#d4edda'; statusColor = '#155724'; }
    if (r.status === 'Suspended') { statusBg = '#fde8e8'; statusColor = '#7a0000'; }
    if (r.status === 'Closed') { statusBg = '#e2e3e5'; statusColor = '#383d41'; }

    return `
      <tr class="data-row" data-id="${r.id}" style="cursor: pointer;">
        <td class="font-bold" style="color: var(--navy-700);">${r.client_id || '—'}</td>
        <td class="search-target">${fullName}</td>
        <td>${r.client_type || '—'}</td>
        <td>${r.gender || '—'}</td>
        <td class="search-target">${r.mobile || '—'}</td>
        <td><span style="background:${statusBg}; color:${statusColor}; padding:1px 7px; border-radius:10px; font-weight:700; font-size:9.5px;">${r.status || 'Unknown'}</span></td>
        <td>${r.open_date ? new Date(r.open_date).toLocaleDateString('en-GB') : '—'}</td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = rowsHtml;

  // Add click listener for row selection (CBS styling behavior)
  const rows = tbody.querySelectorAll('.data-row');
  rows.forEach(row => {
    row.addEventListener('click', () => {
      rows.forEach(r => r.classList.remove('selected-row'));
      row.classList.add('selected-row');
      btnEdit.disabled = false; // Enable action buttons when row is selected
    });
  });
}

/* ── Live Search Filter ────────────────────────────────── */
const searchInput = document.getElementById('searchClientInput');

function applyFilter() {
  const query = searchInput.value.toLowerCase().trim();
  const rows = document.querySelectorAll('#clientTableBody .data-row');
  let visibleCount = 0;

  rows.forEach(row => {
    const textData = row.textContent.toLowerCase();
    if (textData.includes(query)) {
      row.style.display = '';
      visibleCount++;
    } else {
      row.style.display = 'none';
      row.classList.remove('selected-row'); // deselect if hidden
    }
  });

  document.getElementById('recordCount').textContent = `${visibleCount} record(s) found`;
  document.getElementById('btnEditClient').disabled = true;
}

searchInput.addEventListener('input', applyFilter);
document.getElementById('btnSearch').addEventListener('click', applyFilter);

/* ── Toolbar Actions ───────────────────────────────────── */
document.getElementById('btnRefresh').addEventListener('click', () => {
  searchInput.value = '';
  fetchClients();
});

document.getElementById('btnGlobalPrint').addEventListener('click', () => {
  window.print();
});

document.getElementById('btnAddClient').addEventListener('click', () => {
  toast('Redirecting to Client Onboarding Module...', 'info');
  // Example: window.location.href = 'client-onboarding.html';
});

document.getElementById('btnEditClient').addEventListener('click', () => {
  const selected = document.querySelector('.selected-row');
  if (!selected) {
    toast('⚠ Select a client record to edit.', 'warning');
    return;
  }
  const clientId = selected.querySelector('td').innerText;
  toast(`Opening editor for Client ID: ${clientId}`, 'info');
});

/* ── Init ──────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', fetchClients);
