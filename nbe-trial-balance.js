/* ============================================================================
   nbe-trial-balance.js
   Computes Trial Balance LIVE from gl_transaction_journal, not from
   chart_of_accounts.current_balance — that column is only updated by
   post_loan_disbursement(), never by post_loan_repayment(), so income
   accounts (INT_INCOME, PENALTY_INC) would show wrong balances if this
   report trusted it. Summing the journal directly is both the fix and the
   textbook-correct way to build a trial balance anyway — its whole purpose
   is proving the journal's debits equal its credits.
   ============================================================================ */

const SUPABASE_URL = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const SUPABASE_ANON_KEY = 'REPLACE_WITH_YOUR_ANON_KEY';

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

// Normal balance side per account type — determines which column
// (Debit/Credit) each account's NET balance is displayed under.
const NORMAL_DEBIT_TYPES = ['ASSET', 'EXPENSE'];

async function runTrialBalance() {
  const asOf = document.getElementById('asOfDate').value || new Date().toISOString().split('T')[0];
  const tbody = document.getElementById('tbodyTB');
  const sb = document.getElementById('statusBar');
  const checkEl = document.getElementById('balanceCheck');
  tbody.innerHTML = '<tr><td colspan="5" class="text-center gray-text italic">Running…</td></tr>';
  checkEl.style.display = 'none';

  try {
    const [accounts, journal] = await Promise.all([
      sbFetch('chart_of_accounts?select=gl_account_code,account_name_title,account_type&order=gl_account_code.asc'),
      sbFetch(`gl_transaction_journal?value_date=lte.${asOf}&select=gl_account_code,debit_amount,credit_amount`)
    ]);

    // Sum debits/credits per account directly from the journal.
    const totals = {};
    for (const j of journal) {
      if (!totals[j.gl_account_code]) totals[j.gl_account_code] = { debit: 0, credit: 0 };
      totals[j.gl_account_code].debit += parseFloat(j.debit_amount) || 0;
      totals[j.gl_account_code].credit += parseFloat(j.credit_amount) || 0;
    }

    let totalDebit = 0, totalCredit = 0;
    const rows = accounts.map(acc => {
      const t = totals[acc.gl_account_code] || { debit: 0, credit: 0 };
      const net = t.debit - t.credit;
      const isNormalDebit = NORMAL_DEBIT_TYPES.includes(acc.account_type);

      // Net debit balance shows in Debit column if positive (normal),
      // or flips to Credit column if negative (abnormal but still shown,
      // not hidden — an abnormal balance is itself useful information).
      let debitCol = 0, creditCol = 0;
      if (isNormalDebit) {
        if (net >= 0) debitCol = net; else creditCol = -net;
      } else {
        if (-net >= 0) creditCol = -net; else debitCol = net;
      }
      totalDebit += debitCol;
      totalCredit += creditCol;

      return { acc, debitCol, creditCol };
    }).filter(r => r.debitCol !== 0 || r.creditCol !== 0);

    tbody.innerHTML = rows.map(r => `
      <tr>
        <td>${escapeHtml(r.acc.gl_account_code)}</td>
        <td>${escapeHtml(r.acc.account_name_title)}</td>
        <td>${escapeHtml(r.acc.account_type)}</td>
        <td class="text-right">${r.debitCol ? fmt(r.debitCol) : '—'}</td>
        <td class="text-right">${r.creditCol ? fmt(r.creditCol) : '—'}</td>
      </tr>
    `).join('') || '<tr><td colspan="5" class="text-center gray-text italic">No journal activity as of this date.</td></tr>';

    document.getElementById('tbTotalDebit').textContent = fmt(totalDebit);
    document.getElementById('tbTotalCredit').textContent = fmt(totalCredit);

    const diff = Math.round((totalDebit - totalCredit) * 100) / 100;
    checkEl.style.display = 'block';
    if (diff === 0) {
      checkEl.style.background = '#e8f8ee';
      checkEl.style.color = '#1a7a3c';
      checkEl.textContent = `✅ Balanced — total debits equal total credits (${fmt(totalDebit)} ETB).`;
    } else {
      checkEl.style.background = '#fee2e2';
      checkEl.style.color = '#dc2626';
      checkEl.textContent = `⚠️ OUT OF BALANCE by ${fmt(Math.abs(diff))} ETB — debits and credits do not match. This should never happen if every posting went through the atomic RPCs; investigate any journal rows inserted outside of them.`;
    }

    sb.textContent = `Trial Balance as of ${asOf} — ${rows.length} account(s) with activity.`;
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center" style="color:#dc2626;">Error: ${escapeHtml(e.message)}</td></tr>`;
    sb.textContent = 'Run failed.';
  }
}

document.getElementById('btnRun').addEventListener('click', runTrialBalance);
document.getElementById('asOfDate').value = new Date().toISOString().split('T')[0];
