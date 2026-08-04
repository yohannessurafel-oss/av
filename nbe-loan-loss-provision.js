/* ============================================================================
   nbe-loan-loss-provision.js
   Classifies each loan in arrears by the age of its MOST overdue unpaid
   installment (loan-level classification, not per-installment) and provisions
   the loan's total amount-in-arrears at the rate for that category. This is
   the standard regulatory-provisioning approach: once a loan crosses into a
   worse bucket, the whole arrears balance moves with it — it is not split
   installment-by-installment across multiple rates.

   "Amount In Arrears" = sum of (principal_due - principal_paid) across every
   installment whose due_date has passed and which is not fully PAID. This is
   deliberately narrower than total outstanding principal (which would also
   include not-yet-due future installments) — provisioning applies to money
   that is actually late, not the whole remaining loan book.

   Category buckets (days overdue, based on the loan's single most overdue
   installment) and provision rates:
     CURRENT      0 days          1%
     1-30 DAYS    1–30 days       5%
     31-90 DAYS   31–90 days      25%
     91-180 DAYS  91–180 days     50%
     181-360 DAYS 181–360 days    75%
     OVER 360 DAYS 361+ days      100%
   These are a standard 6-bucket MFI provisioning matrix. If your NBE
   directive specifies different day ranges or rates, update BUCKETS below —
   everything else in this file is generic to whatever bucket table you give it.
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

const BUCKETS = [
  { key: 'CURRENT',       min: 0,   max: 0,        rate: 0.01, css: 'cat-current'  },
  { key: '1-30 DAYS',     min: 1,   max: 30,       rate: 0.05, css: 'cat-1-30'     },
  { key: '31-90 DAYS',    min: 31,  max: 90,       rate: 0.25, css: 'cat-31-90'    },
  { key: '91-180 DAYS',   min: 91,  max: 180,      rate: 0.50, css: 'cat-91-180'   },
  { key: '181-360 DAYS',  min: 181, max: 360,      rate: 0.75, css: 'cat-181-360'  },
  { key: 'OVER 360 DAYS', min: 361, max: Infinity, rate: 1.00, css: 'cat-over360'  },
];

function bucketFor(days) {
  return BUCKETS.find(b => days >= b.min && days <= b.max) || BUCKETS[BUCKETS.length - 1];
}

let lastRows = []; // for export

async function initFilters() {
  document.getElementById('fAsOf').value = new Date().toISOString().split('T')[0];
  try {
    const branches = await sbFetch('branchregistry?select=branch_id,branch_name&order=branch_name.asc');
    const bSel = document.getElementById('fBranch');
    bSel.innerHTML = '<option value="all">All Branches</option>' +
      branches.map(b => `<option value="${escapeHtml(b.branch_id)}">${escapeHtml(b.branch_name)}</option>`).join('');
  } catch (e) {
    console.warn('Could not load branches:', e.message);
  }
}

function daysBetween(asOf, dueDate) {
  const a = new Date(asOf);
  const d = new Date(dueDate);
  return Math.round((a - d) / (1000 * 60 * 60 * 24));
}

async function runReport() {
  const tbody = document.getElementById('tbodyProvision');
  const sb = document.getElementById('statusBar');
  tbody.innerHTML = '<tr><td colspan="10" class="text-center gray-text italic">Running…</td></tr>';

  const asOf = document.getElementById('fAsOf').value || new Date().toISOString().split('T')[0];
  const branchFilter = document.getElementById('fBranch').value;

  try {
    const [loans, schedules, products] = await Promise.all([
      sbFetch(`loanmasterrecords?application_status=in.(Disbursed,Matured)&select=application_id,file_number,client_name,branch_id,product_id,disbursement_date,applied_amount`),
      sbFetch(`amortization_schedules?status=neq.PAID&due_date=lte.${asOf}&select=application_id,due_date,principal_due,principal_paid,status`),
      sbFetch('lendingproductparametermatrix?select=product_code_id,product_name_title')
    ]);

    const loanById = {};
    for (const l of loans) loanById[l.application_id] = l;

    const productNameByCode = {};
    for (const p of products) productNameByCode[p.product_code_id] = p.product_name_title;

    // Aggregate overdue installments per loan.
    const arrears = {}; // application_id -> { amount, maxDays }
    for (const s of schedules) {
      const loan = loanById[s.application_id];
      if (!loan) continue;
      if (branchFilter !== 'all' && loan.branch_id !== branchFilter) continue;

      const unpaid = (parseFloat(s.principal_due) || 0) - (parseFloat(s.principal_paid) || 0);
      if (unpaid <= 0) continue;

      const days = daysBetween(asOf, s.due_date);
      if (days <= 0) continue; // not actually overdue yet

      if (!arrears[s.application_id]) arrears[s.application_id] = { amount: 0, maxDays: 0 };
      arrears[s.application_id].amount += unpaid;
      arrears[s.application_id].maxDays = Math.max(arrears[s.application_id].maxDays, days);
    }

    const rows = Object.keys(arrears).map(appId => {
      const loan = loanById[appId];
      const a = arrears[appId];
      const bucket = bucketFor(a.maxDays);
      return {
        fileNo: loan.file_number || appId,
        customer: loan.client_name || '—',
        product: productNameByCode[loan.product_id] || loan.product_id,
        disbursementDate: loan.disbursement_date || '—',
        reqAmount: parseFloat(loan.applied_amount) || 0,
        arrears: a.amount,
        maxDays: a.maxDays,
        category: bucket.key,
        css: bucket.css,
        rate: bucket.rate,
        provision: a.amount * bucket.rate
      };
    }).sort((x, y) => y.maxDays - x.maxDays);

    lastRows = rows;

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="10" class="text-center gray-text italic">No loans in arrears as of this date.</td></tr>';
      sb.textContent = `As of ${asOf} — no loans in arrears.`;
      return;
    }

    const totalArrears = rows.reduce((s, r) => s + r.arrears, 0);
    const totalProvision = rows.reduce((s, r) => s + r.provision, 0);

    tbody.innerHTML = rows.map(r => `
      <tr>
        <td>${escapeHtml(r.fileNo)}</td>
        <td>${escapeHtml(r.customer)}</td>
        <td>${escapeHtml(r.product)}</td>
        <td>${escapeHtml(r.disbursementDate)}</td>
        <td class="text-right">${fmt(r.reqAmount)}</td>
        <td class="text-right">${fmt(r.arrears)}</td>
        <td class="text-right">${r.maxDays}</td>
        <td><span class="cat-pill ${r.css}">${r.category}</span></td>
        <td class="text-right">${(r.rate * 100).toFixed(0)}%</td>
        <td class="text-right">${fmt(r.provision)}</td>
      </tr>
    `).join('') + `
      <tr class="provision-total-row">
        <td colspan="5">TOTAL</td>
        <td class="text-right">${fmt(totalArrears)}</td>
        <td colspan="3"></td>
        <td class="text-right">${fmt(totalProvision)}</td>
      </tr>
    `;

    sb.textContent = `As of ${asOf} — ${rows.length} loan(s) in arrears, ${fmt(totalArrears)} ETB arrears, ${fmt(totalProvision)} ETB required provision.`;
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-center" style="color:#dc2626;">Error: ${escapeHtml(e.message)}</td></tr>`;
    sb.textContent = 'Run failed.';
  }
}

function exportCSV() {
  if (!lastRows.length) { alert('Run the report first.'); return; }
  const header = 'File No,Customer Name,Product,Disbursement Date,Req Amount,Amount In Arrears,Max Days Overdue,Category,Provision Rate,Provision Amount\n';
  const body = lastRows.map(r =>
    `${r.fileNo},"${String(r.customer).replace(/"/g,'""')}","${String(r.product).replace(/"/g,'""')}",${r.disbursementDate},${r.reqAmount.toFixed(2)},${r.arrears.toFixed(2)},${r.maxDays},${r.category},${(r.rate*100).toFixed(0)}%,${r.provision.toFixed(2)}`
  ).join('\n');
  const totalArrears = lastRows.reduce((s, r) => s + r.arrears, 0);
  const totalProvision = lastRows.reduce((s, r) => s + r.provision, 0);
  const csv = header + body + `\nTOTAL,,,,,${totalArrears.toFixed(2)},,,,${totalProvision.toFixed(2)}\n`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `loan-loss-provision-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

document.getElementById('btnRun').addEventListener('click', runReport);
document.getElementById('btnExport').addEventListener('click', exportCSV);
initFilters();
