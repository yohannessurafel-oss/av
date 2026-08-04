/* ============================================================================
   nbe-disbursement-by-product.js
   Groups actual disbursement events (loan_disbursement.amount_disbursed) by
   lending product — a direct group-by, unlike the Sector report, since
   loanmasterrecords.product_id references
   lendingproductparametermatrix.product_code_id directly.
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

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

let lastRows = []; // for export

/* ── Init filter controls ─────────────────────────────── */
async function initFilters() {
  const mSel = document.getElementById('fMonth');
  mSel.innerHTML = MONTHS.map((m, i) => `<option value="${i+1}">${m}</option>`).join('');
  const today = new Date();
  mSel.value = today.getMonth() + 1;
  document.getElementById('fYear').value = today.getFullYear();

  try {
    const branches = await sbFetch('branchregistry?select=branch_id,branch_name&order=branch_name.asc');
    const bSel = document.getElementById('fBranch');
    bSel.innerHTML = '<option value="all">All Branches</option>' +
      branches.map(b => `<option value="${escapeHtml(b.branch_id)}">${escapeHtml(b.branch_name)}</option>`).join('');
  } catch (e) {
    console.warn('Could not load branches:', e.message);
  }

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
  const month = parseInt(document.getElementById('fMonth').value, 10);
  const from = `${year}-${String(month).padStart(2,'0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
  return { from, to };
}

async function runReport() {
  const tbody = document.getElementById('tbodyProduct');
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
    const [disbursements, loans, products] = await Promise.all([
      sbFetch(`loan_disbursement?disbursement_date=gte.${range.from}&disbursement_date=lte.${range.to}&select=application_id,amount_disbursed,disbursement_date`),
      sbFetch('loanmasterrecords?select=application_id,branch_id,product_id'),
      sbFetch('lendingproductparametermatrix?select=product_code_id,product_name_title')
    ]);

    const loanById = {};
    for (const l of loans) loanById[l.application_id] = l;

    const productNameByCode = {};
    for (const p of products) productNameByCode[p.product_code_id] = p.product_name_title;

    const totals = {}; // product_code_id -> amount
    let matched = 0;

    for (const d of disbursements) {
      const loan = loanById[d.application_id];
      if (!loan) continue; // orphaned disbursement row, skip
      if (branchFilter !== 'all' && loan.branch_id !== branchFilter) continue;
      const code = loan.product_id || 'UNASSIGNED';
      totals[code] = (totals[code] || 0) + (parseFloat(d.amount_disbursed) || 0);
      matched++;
    }

    const codes = Object.keys(totals).sort((a, b) => totals[b] - totals[a]);
    lastRows = codes.map(code => ({
      item: productNameByCode[code] || code,
      code,
      amount: totals[code]
    }));
    const grandTotal = lastRows.reduce((sum, r) => sum + r.amount, 0);

    if (!lastRows.length) {
      tbody.innerHTML = '<tr><td colspan="3" class="text-center gray-text italic">No disbursements in this period.</td></tr>';
    } else {
      tbody.innerHTML = lastRows.map(r => `
        <tr>
          <td>${escapeHtml(r.item)}</td>
          <td>${escapeHtml(r.code)}</td>
          <td class="text-right">${fmt(r.amount)}</td>
        </tr>
      `).join('') + `
        <tr class="product-total-row">
          <td>TOTAL</td>
          <td></td>
          <td class="text-right">${fmt(grandTotal)}</td>
        </tr>
      `;
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
  const body = lastRows.map(r => `"${r.item.replace(/"/g,'""')}",${r.code},${r.amount.toFixed(2)}`).join('\n');
  const total = lastRows.reduce((s, r) => s + r.amount, 0);
  const csv = header + body + `\nTOTAL,,${total.toFixed(2)}\n`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `loan-disbursement-by-product-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

document.getElementById('btnRun').addEventListener('click', runReport);
document.getElementById('btnExport').addEventListener('click', exportCSV);
initFilters();
