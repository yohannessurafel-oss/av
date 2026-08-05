/* ============================================================================
   nbe-balance-sheet.js
   Builds a nested Balance Sheet tree from chart_of_accounts' parent_account_code
   / normal_side columns, with balances computed LIVE from gl_transaction_journal
   (same principle as the Trial Balance report — current_balance on
   chart_of_accounts is not trustworthy since it isn't updated by every posting
   path, so this sums the journal directly instead).

   For each account:
     beg_balance    = signed net of every journal line dated BEFORE the period
                       (sign convention: normal_side 'D' -> debit-positive,
                        normal_side 'C' -> credit-positive)
     period_debits  = raw sum of debit_amount within the period (unsigned)
     period_credits = raw sum of credit_amount within the period (unsigned)
     ending_balance = beg_balance + period_debits - period_credits   (if D)
                     = beg_balance + period_credits - period_debits  (if C)

   Header/section accounts (anything referenced as a parent_account_code by
   another row) roll up as: own totals + sum of all descendants' totals,
   computed recursively. This mirrors how the reference report shows a
   category like "CASH AT BANK" as the sum of CBE, COOP, Awash, etc.

   Requires chart_of_accounts to have parent_account_code and normal_side
   populated (see add_coa_hierarchy.sql). Accounts with no normal_side default
   to the ASSET/EXPENSE=D, else C convention client-side as a fallback.
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
  const v = Number(n || 0);
  const abs = Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v < -0.005 ? `(${abs})` : abs;
}
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

async function initFilters() {
  const mSel = document.getElementById('fMonth');
  mSel.innerHTML = MONTHS.map((m, i) => `<option value="${i+1}">${m}</option>`).join('');
  const today = new Date();
  mSel.value = today.getMonth() + 1;
  document.getElementById('fYear').value = today.getFullYear();

  document.getElementById('fType').addEventListener('change', function () {
    const isCustom = this.value === 'custom';
    const isAnnual = this.value === 'annual';
    document.getElementById('monthGroup').style.display = isCustom || isAnnual ? 'none' : 'flex';
    document.getElementById('yearGroup').style.display = isCustom ? 'none' : 'flex';
    document.getElementById('customGroup').style.display = isCustom ? 'flex' : 'none';
  });
}

function getPeriod() {
  const type = document.getElementById('fType').value;
  if (type === 'custom') {
    const from = document.getElementById('fFrom').value;
    const to = document.getElementById('fTo').value;
    if (!from || !to) throw new Error('Select both From and To dates.');
    return { from, to, label: `${from} to ${to}` };
  }
  const year = parseInt(document.getElementById('fYear').value, 10);
  if (type === 'annual') {
    return { from: `${year}-01-01`, to: `${year}-12-31`, label: `As of the year ${year}` };
  }
  const month = parseInt(document.getElementById('fMonth').value, 10);
  const from = `${year}-${String(month).padStart(2,'0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
  return { from, to, label: `As of the month ${MONTHS[month-1]} of the year ${year}` };
}

function defaultSide(accountType) {
  return (accountType === 'ASSET' || accountType === 'EXPENSE') ? 'D' : 'C';
}

async function runReport() {
  const tbody = document.getElementById('tbodyBS');
  const sb = document.getElementById('statusBar');
  const checkEl = document.getElementById('balanceCheck');
  tbody.innerHTML = '<tr><td colspan="7" class="text-center gray-text italic">Running…</td></tr>';
  checkEl.style.display = 'none';

  let period;
  try {
    period = getPeriod();
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="color:#dc2626;">${escapeHtml(e.message)}</td></tr>`;
    return;
  }
  document.getElementById('bsPeriodLabel').textContent = period.label;

  try {
    const [accounts, beforeJournal, periodJournal] = await Promise.all([
      sbFetch('chart_of_accounts?select=gl_account_code,account_name_title,account_type,parent_account_code,normal_side,display_order'),
      sbFetch(`gl_transaction_journal?value_date=lt.${period.from}&select=gl_account_code,debit_amount,credit_amount`),
      sbFetch(`gl_transaction_journal?value_date=gte.${period.from}&value_date=lte.${period.to}&select=gl_account_code,debit_amount,credit_amount`)
    ]);

    if (!accounts.some(a => a.parent_account_code)) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="color:#dc2626;">
        chart_of_accounts has no parent_account_code data yet — run add_coa_hierarchy.sql and populate the hierarchy before this report can render a tree.
      </td></tr>`;
      sb.textContent = 'Missing hierarchy data.';
      return;
    }

    // Sum before/period debit+credit per account code.
    const before = {}, inPeriod = {};
    for (const j of beforeJournal) {
      if (!before[j.gl_account_code]) before[j.gl_account_code] = { debit: 0, credit: 0 };
      before[j.gl_account_code].debit += parseFloat(j.debit_amount) || 0;
      before[j.gl_account_code].credit += parseFloat(j.credit_amount) || 0;
    }
    for (const j of periodJournal) {
      if (!inPeriod[j.gl_account_code]) inPeriod[j.gl_account_code] = { debit: 0, credit: 0 };
      inPeriod[j.gl_account_code].debit += parseFloat(j.debit_amount) || 0;
      inPeriod[j.gl_account_code].credit += parseFloat(j.credit_amount) || 0;
    }

    // Build tree.
    const nodeByCode = {};
    accounts.forEach(a => {
      nodeByCode[a.gl_account_code] = { ...a, children: [] };
    });
    const roots = [];
    accounts.forEach(a => {
      const node = nodeByCode[a.gl_account_code];
      if (a.parent_account_code && nodeByCode[a.parent_account_code]) {
        nodeByCode[a.parent_account_code].children.push(node);
      } else {
        roots.push(node);
      }
    });
    const sortFn = (a, b) => (a.display_order || 0) - (b.display_order || 0) || String(a.gl_account_code).localeCompare(String(b.gl_account_code));
    Object.values(nodeByCode).forEach(n => n.children.sort(sortFn));
    roots.sort(sortFn);

    // Recursively compute own + rolled-up totals.
    function compute(node) {
      const side = node.normal_side || defaultSide(node.account_type);
      const b = before[node.gl_account_code] || { debit: 0, credit: 0 };
      const p = inPeriod[node.gl_account_code] || { debit: 0, credit: 0 };

      let beg = side === 'D' ? (b.debit - b.credit) : (b.credit - b.debit);
      let pDebit = p.debit;
      let pCredit = p.credit;
      let end = beg + (side === 'D' ? (p.debit - p.credit) : (p.credit - p.debit));

      for (const child of node.children) {
        const c = compute(child);
        beg += c.beg;
        pDebit += c.pDebit;
        pCredit += c.pCredit;
        end += c.end;
      }
      node._totals = { beg, pDebit, pCredit, end, side };
      return node._totals;
    }
    roots.forEach(compute);

    // Render.
    const rowsHtml = [];
    function render(node, depth) {
      const t = node._totals;
      const hasChildren = node.children.length > 0;
      const rowClass = depth === 0 ? 'bs-row-section' : (hasChildren ? 'bs-row-header' : 'bs-row-leaf');
      rowsHtml.push(`
        <tr class="${rowClass}">
          <td style="padding-left:${8 + depth * 18}px;">${escapeHtml(node.account_name_title)}</td>
          <td>${escapeHtml(t.side)}</td>
          <td>${escapeHtml(node.gl_account_code)}</td>
          <td class="num">${fmt(t.beg)}</td>
          <td class="num">${fmt(t.pDebit)}</td>
          <td class="num">${fmt(t.pCredit)}</td>
          <td class="num">${fmt(t.end)}</td>
        </tr>
      `);
      node.children.forEach(c => render(c, depth + 1));
    }
    roots.forEach(r => render(r, 0));

    // Grand total: Liability + Capital ending balances (matches reference report's final line).
    const liabRoot = roots.find(r => r.account_type === 'LIABILITY');
    const capRoot = roots.find(r => r.account_type === 'EQUITY' || /capital/i.test(r.account_name_title || ''));
    const assetRoot = roots.find(r => r.account_type === 'ASSET');
    const liabCapTotal = (liabRoot ? liabRoot._totals.end : 0) + (capRoot ? capRoot._totals.end : 0);

    rowsHtml.push(`
      <tr class="bs-final-total">
        <td colspan="6">LIABILITY &amp; CAPITAL</td>
        <td class="num">${fmt(liabCapTotal)}</td>
      </tr>
    `);

    tbody.innerHTML = rowsHtml.join('');

    if (assetRoot) {
      const assetEnd = assetRoot._totals.end;
      const diff = Math.round((assetEnd - liabCapTotal) * 100) / 100;
      checkEl.style.display = 'block';
      if (Math.abs(diff) < 0.01) {
        checkEl.style.background = '#e8f8ee';
        checkEl.style.color = '#1a7a3c';
        checkEl.textContent = `✅ Balanced — Assets (${fmt(assetEnd)}) equal Liability + Capital (${fmt(liabCapTotal)}).`;
      } else {
        checkEl.style.background = '#fee2e2';
        checkEl.style.color = '#dc2626';
        checkEl.textContent = `⚠️ OUT OF BALANCE — Assets (${fmt(assetEnd)}) vs Liability + Capital (${fmt(liabCapTotal)}), difference ${fmt(Math.abs(diff))} ETB.`;
      }
    }

    sb.textContent = `${period.label} — ${accounts.length} account(s) loaded.`;
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="color:#dc2626;">Error: ${escapeHtml(e.message)}</td></tr>`;
    sb.textContent = 'Run failed.';
  }
}

function exportCSV() {
  const rows = document.querySelectorAll('#tbodyBS tr');
  if (!rows.length) { alert('Run the report first.'); return; }
  let csv = 'Name,Side,Acc No,Beg Balance,Period Debits,Period Credits,Ending Balance\n';
  rows.forEach(tr => {
    const cells = Array.from(tr.querySelectorAll('td')).map(td => `"${td.textContent.trim().replace(/"/g,'""')}"`);
    csv += cells.join(',') + '\n';
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `balance-sheet-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

document.getElementById('btnRun').addEventListener('click', runReport);
document.getElementById('btnExport').addEventListener('click', exportCSV);
initFilters();
