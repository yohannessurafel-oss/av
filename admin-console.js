/* ═══════════════════════════════════════════════════════════
   Africa Village Microfinance — Admin Console
   admin-console.js  v1.0
   Tables: branchregistry, lendingproductparametermatrix, chart_of_accounts
═══════════════════════════════════════════════════════════ */

'use strict';

const SUPABASE_URL = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';

async function sbFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: options.method || 'GET',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: options.prefer || 'return=representation',
      ...(options.headers || {})
    },
    body: options.body
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
  return text ? JSON.parse(text) : null;
}

const toastEl = document.getElementById('toastNotification');
let _toastTimer = null;
function toast(msg, type = '', duration = 3500) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.className = `toast show ${type}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { toastEl.className = 'toast'; }, duration);
}

(function initDate() {
  const el = document.getElementById('systemDate');
  if (el) el.textContent = new Date().toLocaleDateString('en-ET', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
  });
})();

/* ── Tab switching ──────────────────────────────────────── */
document.querySelectorAll('.adm-tab').forEach(tab => {
  tab.addEventListener('click', function () {
    document.querySelectorAll('.adm-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.adm-panel').forEach(p => p.classList.remove('active'));
    this.classList.add('active');
    document.getElementById('panel-' + this.dataset.tab)?.classList.add('active');
  });
});

const fmt = n => parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ═══════════════════════════════════════════════════════════
   BRANCHES
   Only branch_id / branch_name are used — the only columns
   confirmed against the live schema this session (they're the
   only ones ever selected in every other module's branch
   dropdown). Add more fields once real column names are known.
═══════════════════════════════════════════════════════════ */
let _branchSelected = null;

async function loadBranches() {
  const tbody = document.querySelector('#branchTable tbody');
  try {
    const rows = await sbFetch('branchregistry?select=branch_id,branch_name&order=branch_id.asc');
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="3" class="text-center gray-text italic">No branches found.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(b => `
      <tr data-id="${b.branch_id}">
        <td><code>${b.branch_id}</code></td>
        <td>${b.branch_name || ''}</td>
        <td><span class="search-btn" onclick="selectBranch('${b.branch_id}','${(b.branch_name || '').replace(/'/g, "\\'")}')">✏️</span></td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="3" class="text-center" style="color:#b3261e;">Error: ${e.message}</td></tr>`;
  }
}

function selectBranch(id, name) {
  _branchSelected = id;
  document.getElementById('fBranchId').value = id;
  document.getElementById('fBranchId').readOnly = true;
  document.getElementById('fBranchName').value = name;
  document.querySelectorAll('#branchTable tbody tr').forEach(tr =>
    tr.classList.toggle('selected', tr.dataset.id === id));
}

document.getElementById('btnBranchNew').addEventListener('click', () => {
  _branchSelected = null;
  document.getElementById('fBranchId').value = '';
  document.getElementById('fBranchId').readOnly = false;
  document.getElementById('fBranchName').value = '';
  document.querySelectorAll('#branchTable tbody tr').forEach(tr => tr.classList.remove('selected'));
});

document.getElementById('btnBranchSave').addEventListener('click', async () => {
  const branch_id = document.getElementById('fBranchId').value.trim();
  const branch_name = document.getElementById('fBranchName').value.trim();
  if (!branch_id || !branch_name) return toast('Branch ID and Name are both required.', 'warning');

  try {
    if (_branchSelected) {
      await sbFetch(`branchregistry?branch_id=eq.${encodeURIComponent(_branchSelected)}`, {
        method: 'PATCH', prefer: 'return=minimal',
        body: JSON.stringify({ branch_name })
      });
      toast(`Branch ${branch_id} updated.`, 'success');
    } else {
      await sbFetch('branchregistry', {
        method: 'POST', prefer: 'return=minimal',
        body: JSON.stringify({ branch_id, branch_name })
      });
      toast(`Branch ${branch_id} created.`, 'success');
    }
    document.getElementById('btnBranchNew').click();
    loadBranches();
  } catch (e) {
    toast('Save failed: ' + e.message, 'error');
  }
});

document.getElementById('btnBranchDelete').addEventListener('click', async () => {
  if (!_branchSelected) return toast('Select a branch first.', 'warning');
  if (!confirm(`Delete branch ${_branchSelected}? This cannot be undone, and will fail if other records (loans, accounts, staff) still reference it.`)) return;
  try {
    await sbFetch(`branchregistry?branch_id=eq.${encodeURIComponent(_branchSelected)}`, { method: 'DELETE', prefer: 'return=minimal' });
    toast('Branch deleted.', 'success');
    document.getElementById('btnBranchNew').click();
    loadBranches();
  } catch (e) {
    toast('Delete failed — likely still referenced by other records: ' + e.message, 'error');
  }
});

/* ═══════════════════════════════════════════════════════════
   LENDING PRODUCTS
   gl_loan_receivable_code / gl_interest_receivable_code are
   REQUIRED — post_loan_disbursement/repayment/settlement all
   RAISE EXCEPTION if either is missing for the product being
   used, so a product saved without both is not usable yet.
═══════════════════════════════════════════════════════════ */
let _productSelected = null;
let _glAccountOptions = [];

async function loadGlAccountOptionsForDropdowns() {
  const rows = await sbFetch('chart_of_accounts?select=gl_account_code,account_name_title&order=gl_account_code.asc');
  _glAccountOptions = rows;
  const optHtml = '<option value="">– Select GL Account –</option>' +
    rows.map(a => `<option value="${a.gl_account_code}">${a.account_name_title} (${a.gl_account_code})</option>`).join('');
  document.getElementById('fLoanRecCode').innerHTML = optHtml;
  document.getElementById('fInterestRecCode').innerHTML = optHtml;
}

async function loadProducts() {
  const tbody = document.querySelector('#productTable tbody');
  try {
    const rows = await sbFetch('lendingproductparametermatrix?select=product_code_id,product_name_title,maximum_permissible_limit,base_interest_rate,default_term_months,tax_rate_percentage,penalty_rate_daily,grace_period_days,interest_calculation_method,early_settlement_penalty_rate,security_requirement,gl_loan_receivable_code,gl_interest_receivable_code&order=product_code_id.asc');
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center gray-text italic">No products found.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(p => `
      <tr data-id="${p.product_code_id}">
        <td><code>${p.product_code_id}</code></td>
        <td>${p.product_name_title || ''}</td>
        <td class="text-right">${fmt(p.maximum_permissible_limit)}</td>
        <td>${p.gl_loan_receivable_code
          ? `<code>${p.gl_loan_receivable_code}</code>`
          : '<span style="color:#b3261e;">⚠ missing</span>'}</td>
        <td>${p.gl_interest_receivable_code
          ? `<code>${p.gl_interest_receivable_code}</code>`
          : '<span style="color:#b3261e;">⚠ missing</span>'}</td>
        <td><span class="search-btn" onclick='selectProduct(${JSON.stringify(p).replace(/'/g, "&apos;")})'>✏️</span></td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="color:#b3261e;">Error: ${e.message}</td></tr>`;
  }
}

function selectProduct(p) {
  _productSelected = p.product_code_id;
  document.getElementById('fProductCode').value = p.product_code_id;
  document.getElementById('fProductCode').readOnly = true;
  document.getElementById('fProductName').value = p.product_name_title || '';
  document.getElementById('fMaxLimit').value = p.maximum_permissible_limit ?? '';
  document.getElementById('fBaseRate').value = p.base_interest_rate ?? '0.00';
  document.getElementById('fTermMonths').value = p.default_term_months ?? '12';
  document.getElementById('fTaxRate').value = p.tax_rate_percentage ?? '0.00';
  document.getElementById('fPenaltyDaily').value = p.penalty_rate_daily ?? '0.00025';
  document.getElementById('fGracePeriod').value = p.grace_period_days ?? '5';
  document.getElementById('fCalcMethod').value = p.interest_calculation_method || 'declining_balance_actual_365';
  document.getElementById('fEarlyPenalty').value = p.early_settlement_penalty_rate ?? '0.02';
  document.getElementById('fSecurityReq').value = p.security_requirement || 'ANY';
  document.getElementById('fLoanRecCode').value = p.gl_loan_receivable_code || '';
  document.getElementById('fInterestRecCode').value = p.gl_interest_receivable_code || '';
  document.querySelectorAll('#productTable tbody tr').forEach(tr =>
    tr.classList.toggle('selected', tr.dataset.id === p.product_code_id));
}

document.getElementById('btnProductNew').addEventListener('click', () => {
  _productSelected = null;
  document.getElementById('fProductCode').value = '';
  document.getElementById('fProductCode').readOnly = false;
  document.getElementById('fProductName').value = '';
  document.getElementById('fMaxLimit').value = '';
  document.getElementById('fBaseRate').value = '0.00';
  document.getElementById('fTermMonths').value = '12';
  document.getElementById('fTaxRate').value = '0.00';
  document.getElementById('fPenaltyDaily').value = '0.00025';
  document.getElementById('fGracePeriod').value = '5';
  document.getElementById('fCalcMethod').value = 'declining_balance_actual_365';
  document.getElementById('fEarlyPenalty').value = '0.02';
  document.getElementById('fSecurityReq').value = 'ANY';
  document.getElementById('fLoanRecCode').value = '';
  document.getElementById('fInterestRecCode').value = '';
  document.querySelectorAll('#productTable tbody tr').forEach(tr => tr.classList.remove('selected'));
});

document.getElementById('btnProductSave').addEventListener('click', async () => {
  const product_code_id = document.getElementById('fProductCode').value.trim();
  const product_name_title = document.getElementById('fProductName').value.trim();
  const maxLimitRaw = document.getElementById('fMaxLimit').value;
  const gl_loan_receivable_code = document.getElementById('fLoanRecCode').value || null;
  const gl_interest_receivable_code = document.getElementById('fInterestRecCode').value || null;

  if (!product_code_id || !product_name_title) return toast('Product Code and Name are both required.', 'warning');
  // FIX: maximum_permissible_limit is NOT NULL with no database default —
  // this previously converted a blank field to an explicit null and sent
  // it anyway, which is exactly what caused the 23502 not-null-violation
  // crash. Now blocked client-side with a clear message instead.
  if (maxLimitRaw === '') return toast('Max Limit is required — this column has no database default and cannot be blank.', 'warning');
  const maximum_permissible_limit = parseFloat(maxLimitRaw);

  if (!gl_loan_receivable_code || !gl_interest_receivable_code) {
    if (!confirm('No GL accounts assigned — this product cannot be disbursed, repaid, or settled until both are set. Save anyway?')) return;
  }

  const body = {
    product_name_title,
    maximum_permissible_limit,
    base_interest_rate: parseFloat(document.getElementById('fBaseRate').value) || 0,
    default_term_months: parseInt(document.getElementById('fTermMonths').value, 10) || 12,
    tax_rate_percentage: parseFloat(document.getElementById('fTaxRate').value) || 0,
    penalty_rate_daily: parseFloat(document.getElementById('fPenaltyDaily').value) || 0,
    grace_period_days: parseInt(document.getElementById('fGracePeriod').value, 10) || 0,
    interest_calculation_method: document.getElementById('fCalcMethod').value.trim() || 'declining_balance_actual_365',
    early_settlement_penalty_rate: parseFloat(document.getElementById('fEarlyPenalty').value) || 0,
    security_requirement: document.getElementById('fSecurityReq').value.trim() || null,
    gl_loan_receivable_code,
    gl_interest_receivable_code
  };

  try {
    if (_productSelected) {
      await sbFetch(`lendingproductparametermatrix?product_code_id=eq.${encodeURIComponent(_productSelected)}`, {
        method: 'PATCH', prefer: 'return=minimal',
        body: JSON.stringify(body)
      });
      toast(`Product ${product_code_id} updated.`, 'success');
    } else {
      await sbFetch('lendingproductparametermatrix', {
        method: 'POST', prefer: 'return=minimal',
        body: JSON.stringify({ product_code_id, ...body })
      });
      toast(`Product ${product_code_id} created.`, 'success');
    }
    document.getElementById('btnProductNew').click();
    loadProducts();
  } catch (e) {
    toast('Save failed: ' + e.message, 'error');
  }
});

document.getElementById('btnProductDelete').addEventListener('click', async () => {
  if (!_productSelected) return toast('Select a product first.', 'warning');
  if (!confirm(`Delete product ${_productSelected}? This will fail if any loan was ever disbursed under it.`)) return;
  try {
    await sbFetch(`lendingproductparametermatrix?product_code_id=eq.${encodeURIComponent(_productSelected)}`, { method: 'DELETE', prefer: 'return=minimal' });
    toast('Product deleted.', 'success');
    document.getElementById('btnProductNew').click();
    loadProducts();
  } catch (e) {
    toast('Delete failed — likely referenced by existing loans: ' + e.message, 'error');
  }
});

/* ═══════════════════════════════════════════════════════════
   CHART OF ACCOUNTS
   current_balance is intentionally never editable here — every
   report in this system now computes live from
   gl_transaction_journal rather than trusting that column.
═══════════════════════════════════════════════════════════ */
let _glSelected = null;

async function loadGlParentOptions() {
  const sel = document.getElementById('fGlParent');
  const current = sel.value;
  sel.innerHTML = '<option value="">(none — root)</option>' +
    _glAccountOptions.map(a => `<option value="${a.gl_account_code}">${a.account_name_title} (${a.gl_account_code})</option>`).join('');
  sel.value = current;
}

async function loadChartOfAccounts() {
  const tbody = document.querySelector('#coaAdminTable tbody');
  try {
    const rows = await sbFetch('chart_of_accounts?select=gl_account_code,account_name_title,account_type,parent_account_code,normal_side&order=gl_account_code.asc');
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center gray-text italic">No accounts found.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(a => `
      <tr data-id="${a.gl_account_code}">
        <td><code>${a.gl_account_code}</code></td>
        <td>${a.account_name_title || ''}</td>
        <td><span class="badge-type ${a.account_type}">${a.account_type}</span></td>
        <td>${a.parent_account_code ? `<code>${a.parent_account_code}</code>` : '—'}</td>
        <td>${a.normal_side || '—'}</td>
        <td><span class="search-btn" onclick='selectGlAccount(${JSON.stringify(a).replace(/'/g, "&apos;")})'>✏️</span></td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="color:#b3261e;">Error: ${e.message}</td></tr>`;
  }
}

function selectGlAccount(a) {
  _glSelected = a.gl_account_code;
  document.getElementById('fGlCode').value = a.gl_account_code;
  document.getElementById('fGlCode').readOnly = true;
  document.getElementById('fGlName').value = a.account_name_title || '';
  document.getElementById('fGlType').value = a.account_type || 'ASSET';
  document.getElementById('fGlParent').value = a.parent_account_code || '';
  document.getElementById('fGlSide').value = a.normal_side || '';
  document.querySelectorAll('#coaAdminTable tbody tr').forEach(tr =>
    tr.classList.toggle('selected', tr.dataset.id === a.gl_account_code));
}

document.getElementById('btnGlNew').addEventListener('click', () => {
  _glSelected = null;
  document.getElementById('fGlCode').value = '';
  document.getElementById('fGlCode').readOnly = false;
  document.getElementById('fGlName').value = '';
  document.getElementById('fGlType').value = 'ASSET';
  document.getElementById('fGlParent').value = '';
  document.getElementById('fGlSide').value = '';
  document.querySelectorAll('#coaAdminTable tbody tr').forEach(tr => tr.classList.remove('selected'));
});

document.getElementById('btnGlSave').addEventListener('click', async () => {
  const gl_account_code = document.getElementById('fGlCode').value.trim();
  const account_name_title = document.getElementById('fGlName').value.trim();
  const account_type = document.getElementById('fGlType').value;
  const parent_account_code = document.getElementById('fGlParent').value || null;
  const normal_side = document.getElementById('fGlSide').value || null;

  if (!gl_account_code || !account_name_title) return toast('GL Code and Name are both required.', 'warning');
  if (parent_account_code === gl_account_code) return toast('An account cannot be its own parent.', 'warning');

  try {
    if (_glSelected) {
      await sbFetch(`chart_of_accounts?gl_account_code=eq.${encodeURIComponent(_glSelected)}`, {
        method: 'PATCH', prefer: 'return=minimal',
        body: JSON.stringify({ account_name_title, account_type, parent_account_code, normal_side })
      });
      toast(`Account ${gl_account_code} updated.`, 'success');
    } else {
      await sbFetch('chart_of_accounts', {
        method: 'POST', prefer: 'return=minimal',
        body: JSON.stringify({ gl_account_code, account_name_title, account_type, parent_account_code, normal_side, current_balance: 0.00 })
      });
      toast(`Account ${gl_account_code} created.`, 'success');
    }
    document.getElementById('btnGlNew').click();
    await loadGlAccountOptionsForDropdowns();
    await loadGlParentOptions();
    loadChartOfAccounts();
  } catch (e) {
    toast('Save failed: ' + e.message, 'error');
  }
});

document.getElementById('btnGlDelete').addEventListener('click', async () => {
  if (!_glSelected) return toast('Select an account first.', 'warning');
  if (!confirm(`Delete GL account ${_glSelected}? This will fail if it has child accounts, is referenced by a lending product, appears in gl_account_crosswalk, or has ever been posted to.`)) return;
  try {
    await sbFetch(`chart_of_accounts?gl_account_code=eq.${encodeURIComponent(_glSelected)}`, { method: 'DELETE', prefer: 'return=minimal' });
    toast('Account deleted.', 'success');
    document.getElementById('btnGlNew').click();
    await loadGlAccountOptionsForDropdowns();
    await loadGlParentOptions();
    loadChartOfAccounts();
  } catch (e) {
    toast('Delete failed — likely still referenced elsewhere: ' + e.message, 'error');
  }
});

/* ═══════════════════════════════════════════════════════════
   SYSTEM HEALTH
   Turns the diagnostic checks run manually throughout this
   session into a live, refreshable panel.
═══════════════════════════════════════════════════════════ */
async function loadTrialBalanceHealth() {
  const el = document.getElementById('healthTrialBalance');
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_trial_balance`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = await res.json();
    const debit = parseFloat(data?.total_debit) || 0;
    const credit = parseFloat(data?.total_credit) || 0;
    const diff = Math.round((debit - credit) * 100) / 100;
    el.innerHTML = Math.abs(diff) < 0.01
      ? `<span style="color:#1a7a3c;font-weight:700;">✓ Balanced</span> — Total Dr ${fmt(debit)} = Total Cr ${fmt(credit)}`
      : `<span style="color:#b3261e;font-weight:700;">⚠ Off by ${fmt(Math.abs(diff))}</span> — Total Dr ${fmt(debit)} vs Total Cr ${fmt(credit)}`;
  } catch (e) {
    el.innerHTML = `<span style="color:#b3261e;">Error: ${e.message}</span>`;
  }
}

async function loadUnbalancedEntries() {
  const tbody = document.querySelector('#healthUnbalancedTable tbody');
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/check_unbalanced_journal_entries`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const rows = await res.json();
    if (!res.ok) throw new Error(rows?.message || `HTTP ${res.status}`);
    tbody.innerHTML = !rows.length
      ? '<tr><td colspan="4" class="text-center" style="color:#1a7a3c;">✓ None found — every transaction_reference balances.</td></tr>'
      : rows.map(r => `
        <tr><td><code>${r.transaction_reference}</code></td>
          <td class="text-right">${fmt(r.total_debit)}</td>
          <td class="text-right">${fmt(r.total_credit)}</td>
          <td class="text-right" style="color:#b3261e;font-weight:700;">${fmt(r.imbalance)}</td></tr>
      `).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center" style="color:#b3261e;">Error: ${e.message} — has 2026-08-13_admin_system_health_functions.sql been run yet?</td></tr>`;
  }
}

async function loadProductsMissingGl() {
  const tbody = document.querySelector('#healthProductsTable tbody');
  try {
    const rows = await sbFetch('lendingproductparametermatrix?select=product_code_id,product_name_title,gl_loan_receivable_code,gl_interest_receivable_code&or=(gl_loan_receivable_code.is.null,gl_interest_receivable_code.is.null)');
    tbody.innerHTML = !rows.length
      ? '<tr><td colspan="4" class="text-center" style="color:#1a7a3c;">✓ Every product has both GL accounts mapped.</td></tr>'
      : rows.map(p => `
        <tr><td><code>${p.product_code_id}</code></td><td>${p.product_name_title || ''}</td>
          <td>${p.gl_loan_receivable_code ? `<code>${p.gl_loan_receivable_code}</code>` : '<span style="color:#b3261e;">missing</span>'}</td>
          <td>${p.gl_interest_receivable_code ? `<code>${p.gl_interest_receivable_code}</code>` : '<span style="color:#b3261e;">missing</span>'}</td></tr>
      `).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center" style="color:#b3261e;">Error: ${e.message}</td></tr>`;
  }
}

async function loadRlsStatus() {
  const tbody = document.querySelector('#healthRlsTable tbody');
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/check_rls_status`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const rows = await res.json();
    if (!res.ok) throw new Error(rows?.message || `HTTP ${res.status}`);
    tbody.innerHTML = rows.map(r => {
      const risky = r.rls_enabled && !r.has_write_policy;
      return `<tr>
        <td><code>${r.table_name}</code></td>
        <td>${r.rls_enabled ? 'Yes' : 'No'}</td>
        <td>${r.has_write_policy ? 'Yes' : 'No'}</td>
        <td>${r.policy_count}</td>
        <td>${risky
          ? '<span style="color:#b3261e;font-weight:700;">⚠ RLS on, no write policy — writes will fail</span>'
          : '<span style="color:#1a7a3c;">✓ OK</span>'}</td>
      </tr>`;
    }).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center" style="color:#b3261e;">Error: ${e.message} — has 2026-08-13_admin_system_health_functions.sql been run yet?</td></tr>`;
  }
}

async function loadSystemHealth() {
  await Promise.all([loadTrialBalanceHealth(), loadUnbalancedEntries(), loadProductsMissingGl(), loadRlsStatus()]);
}
document.getElementById('btnRefreshHealth').addEventListener('click', loadSystemHealth);

/* ═══════════════════════════════════════════════════════════
   AUDIT LOG VIEWER (read-only)
═══════════════════════════════════════════════════════════ */
async function loadAuditLog() {
  const tbody = document.querySelector('#auditLogTable tbody');
  const appId = document.getElementById('fAuditAppId').value.trim();
  const module = document.getElementById('fAuditModule').value.trim();
  let q = 'loan_status_audit_log?select=*&order=changed_on.desc&limit=200';
  if (appId) q += `&application_id=eq.${encodeURIComponent(appId)}`;
  if (module) q += `&source_module=eq.${encodeURIComponent(module)}`;

  try {
    const rows = await sbFetch(q);
    tbody.innerHTML = !rows.length
      ? '<tr><td colspan="7" class="text-center gray-text italic">No matching entries.</td></tr>'
      : rows.map(r => `
        <tr>
          <td><code>${r.application_id}</code></td>
          <td>${r.from_status || '—'}</td>
          <td>${r.to_status}</td>
          <td>${r.source_module}</td>
          <td>${r.changed_by || '—'}</td>
          <td><small>${r.changed_on ? new Date(r.changed_on).toLocaleString() : ''}</small></td>
          <td>${r.remarks || ''}</td>
        </tr>
      `).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="color:#b3261e;">Error: ${e.message}</td></tr>`;
  }
}
document.getElementById('btnAuditRefresh').addEventListener('click', loadAuditLog);
document.getElementById('btnAuditClear').addEventListener('click', () => {
  document.getElementById('fAuditAppId').value = '';
  document.getElementById('fAuditModule').value = '';
  loadAuditLog();
});

/* ═══════════════════════════════════════════════════════════
   GL CROSSWALK MANAGER
═══════════════════════════════════════════════════════════ */
async function loadCrosswalkOpCodeOptions() {
  const sel = document.getElementById('fCrosswalkOpCode');
  sel.innerHTML = _glAccountOptions.map(a => `<option value="${a.gl_account_code}">${a.account_name_title} (${a.gl_account_code})</option>`).join('');
}
async function loadCrosswalkDetCodeOptions() {
  const sel = document.getElementById('fCrosswalkDetCode');
  sel.innerHTML = '<option value="">(unresolved)</option>' +
    _glAccountOptions.map(a => `<option value="${a.gl_account_code}">${a.account_name_title} (${a.gl_account_code})</option>`).join('');
}

async function loadCrosswalk() {
  const tbody = document.querySelector('#crosswalkTable tbody');
  try {
    const rows = await sbFetch('gl_account_crosswalk?select=*&order=mapping_confidence.asc,operational_code.asc');
    const badge = c => {
      const colors = { confirmed: '#1a7a3c', high: '#2560a0', ambiguous: '#b45309', no_counterpart: '#b3261e' };
      return `<span style="color:${colors[c] || '#555'};font-weight:700;">${c}</span>`;
    };
    tbody.innerHTML = !rows.length
      ? '<tr><td colspan="5" class="text-center gray-text italic">No crosswalk entries found.</td></tr>'
      : rows.map(r => `
        <tr data-op="${r.operational_code}">
          <td><code>${r.operational_code}</code></td>
          <td>${r.detailed_code ? `<code>${r.detailed_code}</code>` : '—'}</td>
          <td>${badge(r.mapping_confidence)}</td>
          <td style="max-width:280px;white-space:normal;">${r.note || ''}</td>
          <td><span class="search-btn" onclick='selectCrosswalk(${JSON.stringify(r).replace(/'/g, "&apos;")})'>✏️</span></td>
        </tr>
      `).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center" style="color:#b3261e;">Error: ${e.message}</td></tr>`;
  }
}

function selectCrosswalk(r) {
  document.getElementById('fCrosswalkOpCode').value = r.operational_code;
  document.getElementById('fCrosswalkDetCode').value = r.detailed_code || '';
  document.getElementById('fCrosswalkConfidence').value = r.mapping_confidence || 'ambiguous';
  document.getElementById('fCrosswalkNote').value = r.note || '';
}

document.getElementById('btnCrosswalkSave').addEventListener('click', async () => {
  const operational_code = document.getElementById('fCrosswalkOpCode').value;
  const detailed_code = document.getElementById('fCrosswalkDetCode').value || null;
  const mapping_confidence = document.getElementById('fCrosswalkConfidence').value;
  const note = document.getElementById('fCrosswalkNote').value.trim() || null;
  if (!operational_code) return toast('Select an operational code.', 'warning');

  try {
    // Upsert: try PATCH first (existing row), fall back to POST if none matched.
    const existing = await sbFetch(`gl_account_crosswalk?operational_code=eq.${encodeURIComponent(operational_code)}&select=operational_code`);
    if (existing.length) {
      await sbFetch(`gl_account_crosswalk?operational_code=eq.${encodeURIComponent(operational_code)}`, {
        method: 'PATCH', prefer: 'return=minimal',
        body: JSON.stringify({ detailed_code, mapping_confidence, note })
      });
    } else {
      await sbFetch('gl_account_crosswalk', {
        method: 'POST', prefer: 'return=minimal',
        body: JSON.stringify({ operational_code, detailed_code, mapping_confidence, note })
      });
    }
    toast(`Crosswalk mapping for ${operational_code} saved.`, 'success');
    loadCrosswalk();
  } catch (e) {
    toast('Save failed: ' + e.message, 'error');
  }
});

/* ═══════════════════════════════════════════════════════════
   TEST RUNNER
   Works against an existing Sanctioned test loan. Calls the same
   RPCs the real modules use, and re-runs the unbalanced-journal
   check before and after every step so drift is caught immediately.
═══════════════════════════════════════════════════════════ */
let _trLoan = null;

function trLog(action, result, ok) {
  const tbody = document.querySelector('#trLogTable tbody');
  if (tbody.querySelector('.gray-text')) tbody.innerHTML = '';
  const row = document.createElement('tr');
  row.innerHTML = `<td><small>${new Date().toLocaleTimeString()}</small></td><td>${action}</td>
    <td style="color:${ok ? '#1a7a3c' : '#b3261e'};">${result}</td>`;
  tbody.prepend(row);
}

async function trCheckBalance(label) {
  const el = document.getElementById('trBalanceCheck');
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/check_unbalanced_journal_entries`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const rows = await res.json();
    if (!res.ok) throw new Error(rows?.message || `HTTP ${res.status}`);
    const ok = !rows.length;
    el.innerHTML = `<strong>${label}:</strong> ${ok
      ? '<span style="color:#1a7a3c;">✓ Journal still balanced — no unbalanced transaction_reference found.</span>'
      : `<span style="color:#b3261e;">⚠ ${rows.length} unbalanced entr${rows.length === 1 ? 'y' : 'ies'} found — check System Health tab.</span>`}`;
    return ok;
  } catch (e) {
    el.innerHTML = `<strong>${label}:</strong> <span style="color:#b3261e;">Check failed: ${e.message} — has the System Health migration been run?</span>`;
    return null;
  }
}

async function trLoadBankAccounts() {
  const sel = document.getElementById('trBankAccount');
  sel.innerHTML = _glAccountOptions
    .filter(a => a.gl_account_code === '11101004' || (a.gl_account_code.length === 8 && a.gl_account_code.startsWith('1110')))
    .map(a => `<option value="${a.gl_account_code}">${a.account_name_title} (${a.gl_account_code})</option>`).join('');
}

document.getElementById('btnTrLoad').addEventListener('click', async () => {
  const appId = document.getElementById('trAppId').value.trim();
  const statusBlock = document.getElementById('trStatusBlock');
  if (!appId) return toast('Enter an Application ID.', 'warning');

  try {
    const rows = await sbFetch(`loanmasterrecords?application_id=eq.${encodeURIComponent(appId)}&select=application_id,application_status,product_id,client_name`);
    if (!rows.length) { statusBlock.innerHTML = `<span style="color:#b3261e;">Application ${appId} not found.</span>`; return; }
    _trLoan = rows[0];

    const ledgerRows = await sbFetch(`loan_ledger?application_id=eq.${encodeURIComponent(appId)}&order=id.desc&limit=1&select=running_balance`);
    const balance = ledgerRows[0]?.running_balance ?? null;

    statusBlock.innerHTML = `<strong>${_trLoan.client_name || appId}</strong> — Product: <code>${_trLoan.product_id}</code>
      — Status: <strong>${_trLoan.application_status}</strong>
      — Ledger balance: ${balance !== null ? fmt(balance) : '(none yet)'}`;

    document.getElementById('btnTrDisburse').disabled = _trLoan.application_status !== 'Sanctioned';
    document.getElementById('btnTrRepay').disabled = _trLoan.application_status !== 'Disbursed';
    document.getElementById('btnTrSettle').disabled = !['Disbursed', 'Matured'].includes(_trLoan.application_status);

    await trLoadBankAccounts();
    trLog('Load', `Loaded ${appId} (${_trLoan.application_status})`, true);
  } catch (e) {
    statusBlock.innerHTML = `<span style="color:#b3261e;">Error: ${e.message}</span>`;
  }
});

document.getElementById('btnTrDisburse').addEventListener('click', async () => {
  if (!_trLoan) return;
  const principal = parseFloat(document.getElementById('trPrincipal').value);
  const rate = parseFloat(document.getElementById('trRate').value);
  const paymentMode = document.getElementById('trPaymentMode').value;
  const bankAccount = document.getElementById('trBankAccount').value;
  if (!principal || principal <= 0) return toast('Enter a principal amount.', 'warning');
  if (!bankAccount) return toast('Select a cash/bank account.', 'warning');
  if (!confirm(`Disburse ETB ${fmt(principal)} against ${_trLoan.application_id}? This posts real GL entries.`)) return;

  await trCheckBalance('Before disbursement');

  // Minimal single-installment schedule — enough to exercise the GL
  // posting mechanics without replicating full amortization logic.
  const dueDate = new Date(); dueDate.setMonth(dueDate.getMonth() + 1);
  const interest = Math.round(principal * (rate / 100) * 100) / 100;
  const schedule = [{ installment_no: 1, due_date: dueDate.toISOString().slice(0, 10), principal_due: principal, interest_due: interest }];

  const refBatch = 'TEST-DISB-' + Date.now();
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/post_loan_disbursement`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_application_id: _trLoan.application_id,
        p_customer_name: _trLoan.client_name,
        p_principal: principal,
        p_disbursement_date: new Date().toISOString().slice(0, 10),
        p_payment_mode: paymentMode,
        p_interest_rate: rate,
        p_tenor_months: 1,
        p_account_number: bankAccount,
        p_schedule: schedule,
        p_ref_batch: refBatch,
        p_gl_cash_account_code: bankAccount
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
    trLog('Disbursement', `Success — ref ${refBatch}`, true);
    toast('Test disbursement posted.', 'success');
  } catch (e) {
    trLog('Disbursement', `Failed: ${e.message}`, false);
    toast('Disbursement failed: ' + e.message, 'error');
  }
  await trCheckBalance('After disbursement');
  document.getElementById('btnTrLoad').click();
});

document.getElementById('btnTrRepay').addEventListener('click', async () => {
  if (!_trLoan) return;
  const amount = parseFloat(document.getElementById('trRepayAmount').value);
  if (!amount || amount <= 0) return toast('Enter a repayment amount.', 'warning');
  if (!confirm(`Post a repayment of ETB ${fmt(amount)} against ${_trLoan.application_id}?`)) return;

  await trCheckBalance('Before repayment');
  const refBatch = 'TEST-REPAY-' + Date.now();
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/post_loan_repayment`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_application_id: _trLoan.application_id,
        p_amount_received: amount,
        p_payment_date: new Date().toISOString().slice(0, 10),
        p_ref_batch: refBatch,
        p_payment_mode: 'Cash Vault Handout',
        p_penalty_collected: 0,
        p_posted_by: 'admin-test-runner'
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
    trLog('Repayment', `Success — ref ${refBatch}`, true);
    toast('Test repayment posted.', 'success');
  } catch (e) {
    trLog('Repayment', `Failed: ${e.message}`, false);
    toast('Repayment failed: ' + e.message, 'error');
  }
  await trCheckBalance('After repayment');
  document.getElementById('btnTrLoad').click();
});

document.getElementById('btnTrSettle').addEventListener('click', async () => {
  if (!_trLoan) return;
  const waiver = parseFloat(document.getElementById('trWaiver').value) || 0;
  const bankAccount = document.getElementById('trBankAccount').value;
  if (!bankAccount) return toast('Select a cash/bank account.', 'warning');

  const ledgerRows = await sbFetch(`loan_ledger?application_id=eq.${encodeURIComponent(_trLoan.application_id)}&order=id.desc&limit=1&select=running_balance`);
  const balance = parseFloat(ledgerRows[0]?.running_balance || 0);
  if (balance <= 0) return toast('Ledger balance is already zero or negative — nothing to settle.', 'warning');

  const principal = Math.max(balance - waiver, 0);
  const netAmount = principal;

  if (!confirm(`Settle ${_trLoan.application_id} — principal ${fmt(principal)}, waiver ${fmt(waiver)}, net ${fmt(netAmount)}?`)) return;

  await trCheckBalance('Before settlement');
  const refBatch = 'TEST-SETTLE-' + Date.now();
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/post_loan_settlement`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_application_id: _trLoan.application_id,
        p_settlement_date: new Date().toISOString().slice(0, 10),
        p_amount_received: netAmount,
        p_penalty_amount: 0,
        p_interest_amount: 0,
        p_waiver_amount: waiver,
        p_principal_amount: principal,
        p_reference_no: refBatch,
        p_narration: 'Test Runner settlement',
        p_payment_mode: 'Cash Vault Handout',
        p_settled_by: 'admin-test-runner',
        p_gl_cash_account_code: bankAccount
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
    trLog('Settlement', `Success — ref ${refBatch}`, true);
    toast('Test settlement posted.', 'success');
  } catch (e) {
    trLog('Settlement', `Failed: ${e.message}`, false);
    toast('Settlement failed: ' + e.message, 'error');
  }
  await trCheckBalance('After settlement');
  document.getElementById('btnTrLoad').click();
});

/* ── Init ───────────────────────────────────────────────── */
async function init() {
  await loadBranches();
  await loadGlAccountOptionsForDropdowns();
  await loadGlParentOptions();
  await loadProducts();
  await loadChartOfAccounts();
  await loadCrosswalkOpCodeOptions();
  await loadCrosswalkDetCodeOptions();
  await loadAuditLog();
  await loadCrosswalk();
  await loadSystemHealth();
}
init();

/* ── Window Controls ──────────────────────────────────────── */
const windowContainer = document.querySelector('.window-container');
const wcMinimizeBtn = document.getElementById('wcMinimize');
const wcMaximizeBtn = document.getElementById('wcMaximize');
const dockSliver = document.getElementById('dockSliver');

function toggleMinimize() {
  if (!windowContainer || !dockSliver) return;
  windowContainer.classList.remove('is-maximized');
  if (wcMaximizeBtn) wcMaximizeBtn.textContent = '▢';
  windowContainer.classList.toggle('is-minimized');
  const minimized = windowContainer.classList.contains('is-minimized');
  dockSliver.classList.toggle('show', minimized);
  if (wcMinimizeBtn) wcMinimizeBtn.title = minimized ? 'Restore' : 'Minimize';
}

function toggleMaximize() {
  if (!windowContainer) return;
  if (windowContainer.classList.contains('is-minimized')) {
    windowContainer.classList.remove('is-minimized');
    if (dockSliver) dockSliver.classList.remove('show');
    if (wcMinimizeBtn) wcMinimizeBtn.title = 'Minimize';
  }
  windowContainer.classList.toggle('is-maximized');
  const maximized = windowContainer.classList.contains('is-maximized');
  if (wcMaximizeBtn) {
    wcMaximizeBtn.textContent = maximized ? '❐' : '▢';
    wcMaximizeBtn.title = maximized ? 'Restore Down' : 'Maximize';
  }
}
