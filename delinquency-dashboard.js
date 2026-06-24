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
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || res.statusText);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

// Global Core State Elements
let portfolioData = [];

async function loadDelinquencyRecords() {
  try {
    document.getElementById('statusBar').textContent = 'Fetching delinquency records...';
    
    // Read directly from the newly implemented loan_delinquency_registry schema layout
    portfolioData = await sbFetch('loan_delinquency_registry?select=*&order=days_past_due.desc');
    renderGrid(portfolioData);
    calculateKpis(portfolioData);
    
    document.getElementById('statusBar').textContent = `Status: Grid updated with ${portfolioData.length} records.`;
  } catch (err) {
    console.error(err);
    document.getElementById('statusBar').textContent = `Error loading data: ${err.message}`;
  }
}

function calculateKpis(data) {
  let par30Sum = 0;
  let nplSum = 0;
  
  data.forEach(row => {
    const totalOverdue = parseFloat(row.overdue_principal || 0) + parseFloat(row.overdue_interest || 0);
    if (row.par_bucket === 'PAR-30' || row.par_bucket === 'PAR-60') par30Sum += totalOverdue;
    if (row.par_bucket === 'NPL') nplSum += totalOverdue;
  });

  document.getElementById('kpiTotalActive').textContent = data.length.toString() + ' Accounts';
  document.getElementById('kpiPAR30').textContent = par30Sum.toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' ETB';
  document.getElementById('kpiNPL').textContent = nplSum.toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' ETB';
}

function renderGrid(data) {
  const tbody = document.querySelector('#delinquencyTable tbody');
  tbody.innerHTML = '';

  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center gray-text italic">No past-due accounts in portfolio. All records clear!</td></tr>`;
    return;
  }

  data.forEach(row => {
    let badgeClass = 'badge-par0';
    if (row.days_past_due > 30) badgeClass = 'badge-par30';
    if (row.days_past_due > 90) badgeClass = 'badge-par90';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${row.application_id}</strong></td>
      <td class="text-right">${row.days_past_due} Days</td>
      <td class="text-right">${parseFloat(row.overdue_principal).toFixed(2)}</td>
      <td class="text-right">${parseFloat(row.overdue_interest).toFixed(2)}</td>
      <td class="text-right">${parseFloat(row.accrued_penalties).toFixed(2)}</td>
      <td><span class="status-badge ${badgeClass}">${row.par_bucket}</span></td>
      <td><span class="italic gray-text">${row.collection_status || 'UNASSIGNED'}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// Search and UI Event Handling Hooks
document.getElementById('searchAppId').addEventListener('input', (e) => {
  const term = e.target.value.trim().toLowerCase();
  const filtered = portfolioData.filter(row => row.application_id.toLowerCase().includes(term));
  renderGrid(filtered);
});

document.getElementById('btnRefresh').addEventListener('click', loadDelinquencyRecords);

// Run Initialization Hook
window.addEventListener('DOMContentLoaded', loadDelinquencyRecords);
