/* ============================================================================
   loan-repayment-posting.js  v1.0
   Africa Village Microfinance — Loan Repayment Posting

   This is the module that was missing from the system: recording an
   ordinary loan installment payment against the real loan ledger and
   amortization schedule. Everything is posted atomically via the
   post_loan_repayment() Postgres RPC — see post_loan_repayment.sql.
   ============================================================================ */

const SUPABASE_URL = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const SUPABASE_ANON_KEY = 'REPLACE_WITH_YOUR_ANON_KEY';

async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: opts.method || 'GET',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      ...(opts.prefer ? { Prefer: opts.prefer } : {})
    },
    body: opts.body
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(txt || `HTTP ${res.status}`);
  }
  if (opts.prefer === 'return=minimal') return null;
  return res.json();
}

async function sbRpc(fnName, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(params)
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // Postgres RAISE EXCEPTION messages arrive in data.message
    throw new Error((data && data.message) || `HTTP ${res.status}`);
  }
  return data;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function fmt(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toast(msg, type = '', duration = 4000) {
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = `
    position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
    background:${type === 'error' ? '#dc2626' : type === 'success' ? '#16a34a' : type === 'warning' ? '#d97706' : '#334155'};
    color:#fff; padding:12px 20px; border-radius:8px; font-size:14px; z-index:99999;
    box-shadow:0 8px 24px rgba(0,0,0,0.25); max-width:90vw;
  `;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

let _loadedLoan = null;
let _scheduleRows = [];

/* ── 1. Look up the loan by Application ID ─────────────────────────────── */
async function lookupLoan() {
  const appId = document.getElementById('rpAppId').value.trim();
  if (!appId) { toast('Enter an Application ID.', 'warning'); return; }

  const sb = document.getElementById('rpStatusBar');
  if (sb) sb.textContent = 'Looking up loan…';

  try {
    const rows = await sbFetch(`loanmasterrecords?application_id=eq.${encodeURIComponent(appId)}&limit=1`);
    if (!rows || !rows[0]) {
      toast(`No loan found for Application ID "${appId}".`, 'error');
      if (sb) sb.textContent = 'Not found.';
      return;
    }
    _loadedLoan = rows[0];

    if (_loadedLoan.application_status !== 'Disbursed') {
      toast(`This loan's status is "${_loadedLoan.application_status}" — only Disbursed loans can accept repayments.`, 'warning');
    }

    document.getElementById('rpClientName').textContent  = _loadedLoan.client_name || '—';
    document.getElementById('rpStatus').textContent      = _loadedLoan.application_status || '—';
    document.getElementById('rpProduct').textContent     = _loadedLoan.product_id || '—';

    const ledgerRows = await sbFetch(
      `loan_ledger?application_id=eq.${encodeURIComponent(appId)}&order=id.desc&limit=1`
    );
    const currentBalance = ledgerRows && ledgerRows[0] ? ledgerRows[0].running_balance : null;
    document.getElementById('rpCurrentBalance').textContent = currentBalance !== null ? `${fmt(currentBalance)} ETB` : '—';

    _scheduleRows = await sbFetch(
      `amortization_schedules?application_id=eq.${encodeURIComponent(appId)}&status=neq.PAID&order=installment_no.asc`
    ) || [];

    renderUpcomingInstallments(_scheduleRows);
    document.getElementById('rpLoanCard').style.display = 'block';
    if (sb) sb.textContent = `Loaded ${appId}.`;
  } catch (e) {
    toast('Lookup failed: ' + e.message, 'error');
    if (sb) sb.textContent = 'Lookup failed.';
  }
}

function renderUpcomingInstallments(rows) {
  const el = document.getElementById('rpUpcoming');
  if (!el) return;
  if (!rows.length) {
    el.innerHTML = '<p style="color:#16a34a;">All installments are fully paid.</p>';
    return;
  }
  el.innerHTML = `
    <table style="width:100%; border-collapse:collapse; font-size:13px;">
      <thead>
        <tr style="text-align:left; border-bottom:2px solid #e5e7eb;">
          <th style="padding:6px;">#</th><th>Due Date</th><th>Principal Due</th>
          <th>Interest Due</th><th>Paid So Far</th><th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:6px;">${escapeHtml(r.installment_no)}</td>
            <td>${escapeHtml(r.due_date)}</td>
            <td>${fmt(r.principal_due)}</td>
            <td>${fmt(r.interest_due)}</td>
            <td>${fmt((r.principal_paid || 0) + (r.interest_paid || 0))}</td>
            <td>${escapeHtml(r.status)}</td>
          </tr>`).join('')}
      </tbody>
    </table>
  `;
}

/* ── 2. Post the repayment ──────────────────────────────────────────────── */
async function postRepayment() {
  if (!_loadedLoan) { toast('Look up a loan first.', 'warning'); return; }

  const amount   = parseFloat(document.getElementById('rpAmount').value || 0);
  const penalty  = parseFloat(document.getElementById('rpPenalty').value || 0);
  const payDate  = document.getElementById('rpPayDate').value || new Date().toISOString().split('T')[0];
  const refNo    = document.getElementById('rpRefNo').value.trim();

  if (!amount || amount <= 0) { toast('Enter a valid amount received.', 'warning'); return; }

  const btn = document.getElementById('rpPostBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Posting…'; }

  try {
    const result = await sbRpc('post_loan_repayment', {
      p_application_id:    _loadedLoan.application_id,
      p_amount_received:   amount,
      p_penalty_collected: penalty || 0,
      p_payment_date:      payDate,
      p_ref_no:            refNo || null,
      p_posted_by:         (window.currentUserEmail || null)
    });

    let msg = `Posted ${result.ref}: ${fmt(result.total_principal_paid)} principal + ${fmt(result.total_interest_paid)} interest. New balance: ${fmt(result.new_balance)} ETB.`;
    if (result.unallocated_overpayment > 0) {
      msg += ` ⚠️ ${fmt(result.unallocated_overpayment)} ETB could not be allocated (loan fully paid ahead) — review manually.`;
    }
    if (result.loan_matured) {
      msg += ` 🎉 This loan is now fully repaid and has been marked Matured.`;
    }
    toast(msg, result.unallocated_overpayment > 0 ? 'warning' : 'success', 7000);

    document.getElementById('rpAmount').value = '';
    document.getElementById('rpPenalty').value = '';
    document.getElementById('rpRefNo').value = '';
    await lookupLoan(); // refresh balance + schedule display
  } catch (e) {
    toast('Posting failed: ' + e.message, 'error', 6000);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Post Repayment'; }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('rpLookupBtn')?.addEventListener('click', lookupLoan);
  document.getElementById('rpPostBtn')?.addEventListener('click', postRepayment);
  const dateInput = document.getElementById('rpPayDate');
  if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
});
