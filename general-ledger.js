/* ═══════════════════════════════════════════════════════════
   Africa Village Microfinance — 12 General Ledger Engine
   general-ledger.js  v3.1 — RESOLVED SUMMARY TILES FILTER BUG
   Tables: chart_of_accounts, gl_transaction_journal, loan_ledger
═══════════════════════════════════════════════════════════ */

'use strict';

const SUPABASE_URL = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';

/* ── HTTP Helper ────────────────────────────────────────── */
async function sbFetch(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type':  'application/json'
    }
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(txt || `HTTP ${res.status}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

/* ── Toast ─────────────────────────────────────────────── */
const toastEl = document.getElementById('toastNotification');
let _toastTimer = null;
function toast(msg, type = '', duration = 3200) {
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

/* ── Format helpers ─────────────────────────────────────── */
const fmt = n => parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dash = n => parseFloat(n || 0) > 0 ? fmt(n) : '—';

/* ── Tab switching ──────────────────────────────────────── */
document.querySelectorAll('.gl-tab').forEach(tab => {
  tab.addEventListener('click', function () {
    document.querySelectorAll('.gl-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.gl-panel').forEach(p => p.classList.remove('active'));
    this.classList.add('active');
    const panelId = 'panel-' + this.dataset.tab;
    document.getElementById(panelId)?.classList.add('active');
  });
});

/* ── Build filter query strings ─────────────────────────── */
function getFilters() {
  return {
    appId:       document.getElementById('filterAppId')?.value?.trim()       || '',
    dateFrom:    document.getElementById('filterDateFrom')?.value?.trim()     || '',
    dateTo:      document.getElementById('filterDateTo')?.value?.trim()       || '',
    accountType: document.getElementById('filterAccountType')?.value?.trim()  || '',
  };
}

/* ── Load all three data sets ───────────────────────────── */
async function loadLedger() {
  const sb = document.getElementById('accountingStatusBar');
  if (sb) sb.textContent = 'Loading ledger data…';

  const f = getFilters();

  try {
    await Promise.all([
      loadCOA(f),
      loadJournal(f),
      loadLoanLedger(f),
    ]);
    if (sb) sb.textContent = 'Status: Ledger systems synchronized.';
  } catch (err) {
    toast('Load error: ' + err.message, 'error');
    if (sb) sb.textContent = `Error: ${err.message}`;
  }
}

/* ── 1. Chart of Accounts — Always computes totals from full COA ── */
async function loadCOA(f) {
  // Fetch complete COA to update tiles correctly, regardless of UI filtering [1]
  const allAccounts = await sbFetch('chart_of_accounts?select=*&order=gl_account_code.asc');
  updateSummaryTiles(allAccounts);

  // Apply UI filter only for table generation [1]
  let filteredAccounts = allAccounts;
  if (f.accountType) {
    filteredAccounts = allAccounts.filter(a => a.account_type === f.accountType);
  }
  
  renderCOA(filteredAccounts);
}

function renderCOA(accounts) {
  const tbody = document.querySelector('#coaTable tbody');
  if (!tbody) return;
  if (!accounts.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center gray-text italic">No accounts found.</td></tr>';
    return;
  }
  tbody.innerHTML = accounts.map(acc => `
    <tr>
      <td><code>${acc.gl_account_code}</code></td>
      <td><strong>${acc.account_name_title}</strong></td>
      <td><span class="badge-type ${acc.account_type}">${acc.account_type}</span></td>
      <td class="text-right" style="font-family:monospace;font-weight:bold;">${fmt(acc.current_balance)}</td>
    </tr>
  `).join('');
}

function updateSummaryTiles(accounts) {
  const sum = (type) => accounts
    .filter(a => a.account_type === type)
    .reduce((s, a) => s + parseFloat(a.current_balance || 0), 0);

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = fmt(val); };
  set('tileAssets',      sum('ASSET'));
  set('tileLiabilities', sum('LIABILITY'));
  set('tileIncome',      sum('INCOME'));
  set('tileExpense',     sum('EXPENSE'));
}

/* ── 2. GL Journal ──────────────────────────────────────── */
async function loadJournal(f) {
  let q = 'gl_transaction_journal?select=*&order=journal_entry_id.desc&limit=200';
  if (f.dateFrom) q += `&value_date=gte.${f.dateFrom}`;
  if (f.dateTo)   q += `&value_date=lte.${f.dateTo}`;

  const postings = await sbFetch(q);
  renderJournal(postings);

  const countEl = document.getElementById('tileJournalCount');
  if (countEl) countEl.textContent = postings.length;
}

function renderJournal(postings) {
  const tbody = document.querySelector('#journalTable tbody');
  if (!tbody) return;
  if (!postings.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center gray-text italic">No journal entries found.</td></tr>';
    return;
  }
  tbody.innerHTML = postings.map(p => `
    <tr>
      <td style="font-family:monospace;font-size:11px;">${p.journal_entry_id}</td>
      <td><small class="gray-text">${p.transaction_reference}</small></td>
      <td><code>${p.gl_account_code}</code></td>
      <td class="text-right color-dr">${dash(p.debit_amount)}</td>
      <td class="text-right color-cr">${dash(p.credit_amount)}</td>
      <td><small>${p.value_date || ''}</small></td>
    </tr>
  `).join('');
}

/* ── 3. Loan Ledger ─────────────────────────────────────── */
async function loadLoanLedger(f) {
  let q = 'loan_ledger?select=*&order=id.desc&limit=200';
  if (f.appId)    q += `&application_id=eq.${encodeURIComponent(f.appId)}`;
  if (f.dateFrom) q += `&post_date=gte.${f.dateFrom}`;
  if (f.dateTo)   q += `&post_date=lte.${f.dateTo}`;

  const rows = await sbFetch(q);
  renderLoanLedger(rows);
}

function renderLoanLedger(rows) {
  const tbody = document.querySelector('#loanLedgerTable tbody');
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="11" class="text-center gray-text italic">No loan ledger entries found.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td style="font-family:monospace;font-size:11px;">${r.id}</td>
      <td><code>${r.application_id || '—'}</code></td>
      <td>${r.borrower_name || '—'}</td>
      <td><small>${r.post_date || ''}</small></td>
      <td style="max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${r.description}</td>
      <td><small class="gray-text">${r.ref_batch}</small></td>
      <td class="text-right">${dash(r.principal)}</td>
      <td class="text-right">${dash(r.interest)}</td>
      <td class="text-right">${dash(r.charges_penalties)}</td>
      <td class="text-right">${dash(r.total_paid)}</td>
      <td class="text-right" style="font-weight:bold;font-family:monospace;">${fmt(r.running_balance)}</td>
    </tr>
  `).join('');
}

/* ── Toolbar / Buttons ──────────────────────────────────── */
document.getElementById('btnSyncLedger')?.addEventListener('click', loadLedger);
document.getElementById('btnPrintGL')?.addEventListener('click', () => window.print());
document.getElementById('btnGlobalPrint')?.addEventListener('click', () => window.print());

/* ── Enter key on filter inputs triggers refresh ─────────── */
['filterAppId','filterDateFrom','filterDateTo','filterAccountType'].forEach(id => {
  document.getElementById(id)?.addEventListener('keydown', e => {
    if (e.key === 'Enter') loadLedger();
  });
});

/* ── Init ───────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', loadLedger);
