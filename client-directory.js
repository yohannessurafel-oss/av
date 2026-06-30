/* ═══════════════════════════════════════════════════════════
   Africa Village Microfinance — 00 Client Master Registry
   client-directory.js v2.1 — RESOLVED CONNECTION & ONBOARDING LINKAGE
═══════════════════════════════════════════════════════════ */

'use strict';

const SUPABASE_URL      = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';

// Initialize Supabase client globally [1]
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TABLE_CLIENTS = 'ClientMasterRecords';
let clientsData = [];

/* ── Toast Utility ─────────────────────────────────────── */
const toastEl = document.getElementById('toastNotification');
let _toastTimer = null;
function toast(msg, type = '', duration = 3000) {
  if (!toastEl) return;
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

/* ── Database Fetch — Safe execution ────────────────────── */
async function fetchClients() {
  const tbody = document.getElementById('clientTableBody');
  const countEl = document.getElementById('recordCount');
  
  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center gray-text italic" style="padding: 20px;">Fetching records from server...</td></tr>';
  }
  if (countEl) {
    countEl.textContent = 'Loading...';
  }

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
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center red-text font-bold" style="padding: 20px;">Database Error: ${err.message}</td></tr>`;
    }
    if (countEl) {
      countEl.textContent = '0 records found';
    }
    toast('Database connection failed.', 'error');
  }
}

/* ── Render Data Grid ──────────────────────────────────── */
function renderTable(data) {
  const tbody = document.getElementById('clientTableBody');
  const countEl = document.getElementById('recordCount');
  const btnEdit = document.getElementById('btnEditClient');
  
  if (btnEdit) btnEdit.disabled = true;
  if (countEl) countEl.textContent = `${data.length} record(s) found`;

  if (!tbody) return;

  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center gray-text italic" style="padding: 20px;">No client records found.</td></tr>';
    return;
  }

  const rowsHtml = data.map(r => {
    const fullName = r.client_name || `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Unknown';
    
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

  const rows = tbody.querySelectorAll('.data-row');
  rows.forEach(row => {
    row.addEventListener('click', () => {
      rows.forEach(r => r.classList.remove('selected-row'));
      row.classList.add('selected-row');
      if (btnEdit) btnEdit.disabled = false;
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
      row.classList.remove('selected-row');
    }
  });

  const countEl = document.getElementById('recordCount');
  if (countEl) countEl.textContent = `${visibleCount} record(s) found`;
  
  const btnEdit = document.getElementById('btnEditClient');
  if (btnEdit) btnEdit.disabled = true;
}

if (searchInput) searchInput.addEventListener('input', applyFilter);
document.getElementById('btnSearch')?.addEventListener('click', applyFilter);

/* ── Toolbar Actions — Linked directly to onboarding view ── */
document.getElementById('btnRefresh')?.addEventListener('click', () => {
  if (searchInput) searchInput.value = '';
  fetchClients();
});

document.getElementById('btnGlobalPrint')?.addEventListener('click', () => {
  window.print();
});

document.getElementById('btnAddClient')?.addEventListener('click', () => {
  toast('Redirecting to Client Maintenance & Onboarding...', 'info');
  setTimeout(() => {
    window.location.href = 'client-maintenance.html'; // Load onboarding page [1]
  }, 1000);
});

document.getElementById('btnEditClient')?.addEventListener('click', () => {
  const selected = document.querySelector('.selected-row');
  if (!selected) {
    toast('⚠ Select a client record to edit.', 'warning');
    return;
  }
  const clientId = selected.querySelector('td').innerText;
  toast(`Opening Client Profile ${clientId}...`, 'info');
  setTimeout(() => {
    // Navigate with query parameters to populate directly [1]
    window.location.href = `client-maintenance.html?clientId=${encodeURIComponent(clientId)}`;
  }, 1000);
});

/* ── Init ──────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', fetchClients);
