/* ═══════════════════════════════════════════════════════════
   Africa Village Microfinance — 02 Group Loan Projection
   group-loan-projection.js  v1.0
   Supabase REST · Toast Notifications · Branch / Client / Product
═══════════════════════════════════════════════════════════ */

'use strict';

/* ── Supabase Config ───────────────────────────────────── */
const SUPABASE_URL      = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';

const TABLE_CLIENTS = 'ClientMasterRecords';

/* ── HTTP Helper ────────────────────────────────────────── */
async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      'apikey':        SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        opts.prefer || 'return=representation',
      ...(opts.headers || {})
    }
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  const text = await res.text();
  if (!text || !text.trim()) return null;
  try { return JSON.parse(text); } catch { return null; }
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

/* ── Branch Dropdown ───────────────────────────────────── */
let _branchCache = [];

function populateBranchSelect(preserveValue) {
  const sel = document.getElementById('groupBranchId');
  if (!sel) return;
  const keep = preserveValue ? sel.value : '';
  sel.innerHTML = '<option value="">-- Select Branch --</option>';
  _branchCache.forEach(r => {
    const o = document.createElement('option');
    o.value = r.branch_id;
    o.textContent = r.branch_id + (r.branch_name ? ' — ' + r.branch_name : '');
    sel.appendChild(o);
  });
  sel.disabled = false;
  if (keep) sel.value = keep;
}

async function loadBranches() {
  const sel = document.getElementById('groupBranchId');
  if (sel) { sel.innerHTML = '<option value="">Loading branches…</option>'; sel.disabled = true; }
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/branchregistry?select=branch_id,branch_name&order=branch_id`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Accept': 'application/json' } }
    );
    if (!res.ok) { toast(`Branch list error ${res.status}`, 'error'); return; }
    const rows = await res.json();
    _branchCache = Array.isArray(rows) ? rows : [];
    populateBranchSelect(true);
  } catch (e) {
    toast('Could not load branch list.', 'error');
  } finally {
    // Guard against any later code accidentally leaving the select disabled.
    const sel2 = document.getElementById('groupBranchId');
    if (sel2) sel2.disabled = false;
  }
}

document.getElementById('groupBranchId')?.addEventListener('change', function () {
  const nameEl = document.getElementById('groupBranchName');
  const chosen = _branchCache.find(b => b.branch_id === this.value);
  if (nameEl) nameEl.value = chosen ? (chosen.branch_name || '') : '';
});

/* ── Product Dropdown ──────────────────────────────────── */
let _productCache = [];

async function loadProducts() {
  const sel = document.getElementById('groupProductId');
  if (!sel) return;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/lendingproductparametermatrix?select=product_code_id,product_name_title,base_interest_rate&order=product_code_id`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Accept': 'application/json' } }
    );
    if (!res.ok) { console.error('Product load failed:', res.status); toast(`Product list error ${res.status}`, 'error'); return; }
    const rows = await res.json();
    _productCache = Array.isArray(rows) ? rows : [];
    const keep = sel.value;
    sel.innerHTML = '<option value="">-- Select Product --</option>';
    _productCache.forEach(r => {
      const o = document.createElement('option');
      o.value = r.product_code_id;
      o.textContent = r.product_code_id + (r.product_name_title ? ' — ' + r.product_name_title : '');
      o.dataset.rate = r.base_interest_rate || '';
      sel.appendChild(o);
    });
    sel.disabled = false;
    if (keep) sel.value = keep;
  } catch (e) {
    console.error('loadProducts exception:', e);
    toast('Could not load product list.', 'error');
  }
}

document.getElementById('groupProductId')?.addEventListener('change', function () {
  const chosen = _productCache.find(p => p.product_code_id === this.value);
  const rateEl = document.getElementById('groupInterestRate');
  if (chosen && chosen.base_interest_rate && rateEl && !rateEl.value) {
    rateEl.value = chosen.base_interest_rate;
  }
});

/* ── Client ID Lookup & Validation ─────────────────────── */
async function lookupClient(clientId) {
  const val = (clientId || '').trim();
  if (!val) return null;
  const rows = await sbFetch(`${TABLE_CLIENTS}?client_id=eq.${encodeURIComponent(val)}&select=client_name&limit=1`);
  return (rows && rows[0]) ? rows[0] : null;
}

document.getElementById('groupClientId')?.addEventListener('blur', async function () {
  const val = this.value.trim();
  const nameEl = document.getElementById('groupClientName');
  if (!nameEl) return;
  if (!val) { nameEl.value = ''; return; }
  try {
    const client = await lookupClient(val);
    if (client) {
      nameEl.value = client.client_name || '';
      this.classList.remove('input-invalid');
    } else {
      nameEl.value = '';
      this.classList.add('input-invalid');
      toast('Client ID not found in registry.', 'warning');
    }
  } catch (e) {
    nameEl.value = '';
    toast('Could not verify Client ID.', 'error');
  }
});

// Clear the invalid flag as soon as the user starts editing again.
document.getElementById('groupClientId')?.addEventListener('input', function () {
  this.classList.remove('input-invalid');
});

/* ── Init ──────────────────────────────────────────────── */
async function init() {
  await Promise.all([loadBranches(), loadProducts()]);
}
init();
