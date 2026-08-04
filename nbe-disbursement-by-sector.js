/* ============================================================================
   nbe-disbursement-by-sector.js
   Groups actual disbursement events (loan_disbursement.amount_disbursed) by
   borrower category. The schema has no dedicated "sector" column, so the
   category is DERIVED from data that already exists:

     GROUP      (001) — loanmasterrecords.group_id IS NOT NULL
     CORPORATE  (003) — ClientMasterRecords.client_type = 'Corporate'
     STAFF LOAN (004) — lendingproductparametermatrix.product_name_title
                         contains "staff" (case-insensitive)
     INDIVIDUAL (002) — everything else

   If your NBE sector classification is meant to be something else (e.g.
   economic sector like Agriculture/Trade/Manufacturing), that needs a real
   column added to loanmasterrecords or ClientMasterRecords first — there is
   currently no data to derive it from.
   ============================================================================ */

const SUPABASE_URL = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';

async function sbFetch(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().catch(()=>'')}`);
  return res.json();
}

function fmt(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

const SECTORS = [
  { key: 'GROUP',      code: '001' },
  { key: 'INDIVIDUAL', code: '002' },
  { key: 'CORPORATE',  code: '003' },
  { key: 'STAFF LOAN', code: '004' },
];

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

let lastRows = []; // for export

/* ── Init filter controls ─────────────────────────────── */
async function initFilters() {
  // Month dropdown
  const mSel = document.getElementById('fMonth');
  mSel.innerHTML = MONTHS.map((m, i) => `<option value="${i+1}">${m}</option>`).join('');
  const today = new Date();
  mSel.value = today.getMonth() + 1;
  document.getElementById('fYear').value = today.getFullYear();

  // Branch dropdown
  try {
    const branches = await sbFetch('branchregistry?select=branch_id,branch_name&order=branch_name.asc');
    const bSel = document.getElementById('fBranch');
    bSel.innerHTML = '<option value="all">All Branches</option>' +
      branches.map(b => `<option value="${escapeHtml(b.branch_id)}">${escapeHtml(b.branch_name)}</option>`).join('');
  } catch (e) {
    console.warn('Could not load branches:', e.message);
  }

  // Type toggle
  document.getElementById('fType').addEventListener('change', function () {
    const isCustom = this.value === 'custom';
    const isAnnual = this.value === 'annual';
    document.getElementById('monthGroup').style.display = isCustom || isAnnual ? 'none' : 'flex';
    document.getElementById('yearGroup').style.display = isCustom ? 'none' : 'flex';
    document.getElementById('customGroup').style.display = isCustom ? 'flex' : 'none';
  });
}

function getDateRange() {
  const type = document.getElementById('fType').value;
  if (type === 'custom') {
    const from = document.getElementById('fFrom').value;
    const to = document.getElementById('fTo').value;
    if (!from || !to) throw new Error('Select both From and To dates.');
    return { from, to };
  }
  const year = parseInt(document.getElementById('fYear').value, 10);
  if (type === 'annual') {
    return { from: `${year}-01-01`, to: `${year}-12-31` };
  }
  // monthly
  const month = parseInt(document.getElementById('fMonth').value, 10);
  const from = `${year}-${String(month).padStart(2,'0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
  return { from, to };
}

function classify(loan, clientTypeById, staffProductIds) {
  if (loan.group_id) return 'GROUP';
  if (staffProductIds.has(loan.product_id)) return 'STAFF LOAN';
  const ctype = clientTypeById[loan.client_id];
  if (ctype === 'Corporate') return 'CORPORATE';
  return 'INDIVIDUAL';
}

async function runReport() {
  const tbody = document.getElementById('tbodySector');
  const sb = document.getElementById('statusBar');
  tbody.innerHTML = '<tr><td colspan="3" class="text-center gray-text italic">Running…</td></tr>';

  let range;
  try {
    range = getDateRange();
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="3" class="text-center" style="color:#dc2626;">${escapeHtml(e.message)}</td></tr>`;
    return;
  }

  const branchFilter = document.getElementById('fBranch').value;

  try {
    const [disbursements, loans, clients, products] = await Promise.all([
      sbFetch(`loan_disbursement?disbursement_date=gte.${range.from}&disbursement_date=lte.${range.to}&select=application_id,amount_disbursed,disbursement_date`),
      sbFetch('loanmasterrecords?select=application_id,branch_id,group_id,client_id,product_id'),
      sbFetch('ClientMasterRecords?select=client_id,client_type'),
      sbFetch('lendingproductparametermatrix?select=product_code_id,product_name_title')
    ]);

    const loanById = {};
    for (const l of loans) loanById[l.application_id] = l;

    const clientTypeById = {};
    for (const c of clients) clientTypeById[c.client_id] = c.client_type;

    const staffProductIds = new Set(
      products.filter(p => (p.product_name_title || '').toLowerCase().includes('staff'))
              .map(p => p.product_code_id)
    );

    const totals = { GROUP: 0, INDIVIDUAL: 0, CORPORATE: 0, 'STAFF LOAN': 0 };
    let matched = 0;

    for (const d of disbursements) {
      const loan = loanById[d.application_id];
      if (!loan) continue; // orphaned disbursement row, skip
      if (branchFilter !== 'all' && loan.branch_id !== branchFilter) continue;
      const sector = classify(loan, clientTypeById, staffProductIds);
      totals[sector] += parseFloat(d.amount_disbursed) || 0;
      matched++;
    }

    const rows = SECTORS.filter(s => totals[s.key] > 0);
    lastRows = rows.map(s => ({ item: s.key, code: s.code, amount: totals[s.key] }));
    const grandTotal = rows.reduce((sum, s) => sum + totals[s.key], 0);

    tbody.innerHTML = rows.map(s => `
      <tr>
        <td>${s.key}</td>
        <td>${s.code}</td>
        <td class="text-right">${fmt(totals[s.key])}</td>
      </tr>
    `).join('') + `
      <tr class="sector-total-row">
        <td>TOTAL</td>
        <td></td>
        <td class="text-right">${fmt(grandTotal)}</td>
      </tr>
    ` || '<tr><td colspan="3" class="text-center gray-text italic">No disbursements in this period.</td></tr>';

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="3" class="text-center gray-text italic">No disbursements in this period.</td></tr>';
    }

    sb.textContent = `${range.from} to ${range.to} — ${matched} disbursement(s) matched, ${fmt(grandTotal)} ETB total.`;
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="3" class="text-center" style="color:#dc2626;">Error: ${escapeHtml(e.message)}</td></tr>`;
    sb.textContent = 'Run failed.';
  }
}

function exportCSV() {
  if (!lastRows.length) { alert('Run the report first.'); return; }
  const header = 'Item,Code,Total Disbursed Amount\n';
  const body = lastRows.map(r => `${r.item},${r.code},${r.amount.toFixed(2)}`).join('\n');
  const total = lastRows.reduce((s, r) => s + r.amount, 0);
  const csv = header + body + `\nTOTAL,,${total.toFixed(2)}\n`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `loan-disbursement-by-sector-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

document.getElementById('btnRun').addEventListener('click', runReport);
document.getElementById('btnExport').addEventListener('click', exportCSV);
initFilters();
