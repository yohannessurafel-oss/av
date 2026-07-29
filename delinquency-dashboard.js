/* ═══════════════════════════════════════════════════════════
   Africa Village Microfinance — 14 Delinquency & PAR Dashboard
   delinquency-dashboard.js  v3.3 — PATCHED
   Tables: loan_delinquency_registry (read + limited PATCH)

   PATCHES APPLIED:
   • par_bucket and days_past_due removed from editable payload
   • Added "last calculated" timestamp display
   • Added RPC name safety check for refresh function
   • Added data-staleness warning if registry is >24h old
═══════════════════════════════════════════════════════════ */

'use strict';

const SUPABASE_URL = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';

/* ── HTTP Helper ────────────────────────────────────────── */
async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': opts.prefer || 'return=representation',
      ...(opts.headers || {})
    }
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(txt || `HTTP ${res.status}`);
  }
  const text = await res.text();
  if (!text || !text.trim()) return null;
  try { return JSON.parse(text); } catch { return null; }
}

/* ── RPC Helper ─────────────────────────────────────────── */
async function sbRpc(fnName, params = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(params)
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(txt || `HTTP ${res.status}`);
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

/* ── Format helpers ─────────────────────────────────────── */
const fmt = n => parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtK = n => {
  const v = parseFloat(n || 0);
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000) return (v / 1_000).toFixed(1) + 'K';
  return fmt(v);
};

/* ── Global state ───────────────────────────────────────── */
let portfolioData = [];
let _editingId = null;
let _lastCalculatedAt = null;

/* ── Load all records ───────────────────────────────────── */
async function loadDelinquencyRecords() {
  const sb = document.getElementById('statusBar');
  if (sb) sb.textContent = 'Fetching delinquency records…';

  try {
    /* Also fetch max(calculated_at) to show staleness */
    const calcRows = await sbFetch('loan_delinquency_registry?select=calculated_at&order=calculated_at.desc&limit=1');
    _lastCalculatedAt = calcRows?.[0]?.calculated_at || null;
    updateStalenessBanner();

    portfolioData = await sbFetch(
      'loan_delinquency_registry?select=*&order=days_past_due.desc'
    ) || [];

    calculateKpis(portfolioData);
    applyFiltersAndRender();

    if (sb) sb.textContent = `Status: ${portfolioData.length} records loaded.`;
  } catch (err) {
    toast('Load error: ' + err.message, 'error');
    if (sb) sb.textContent = `Error: ${err.message}`;
  }
}

function updateStalenessBanner() {
  const banner = document.getElementById('stalenessBanner');
  if (!banner) return;
  if (!_lastCalculatedAt) {
    banner.textContent = '⚠ Delinquency data has never been calculated.';
    banner.className = 'staleness-banner stale';
    return;
  }
  const hoursOld = (Date.now() - new Date(_lastCalculatedAt).getTime()) / 3600000;
  if (hoursOld > 24) {
    banner.textContent = `⚠ Data is ${Math.round(hoursOld)} hours old. Click Recalculate for current numbers.`;
    banner.className = 'staleness-banner stale';
  } else {
    banner.textContent = `✓ Data current as of ${new Date(_lastCalculatedAt).toLocaleString('en-ET')}.`;
    banner.className = 'staleness-banner fresh';
  }
}

/* ── KPI calculation ───────────────────────────────────── */
function calculateKpis(data) {
  const bucketSum = b => data.filter(r => r.par_bucket === b)
    .reduce((s, r) => s + parseFloat(r.overdue_principal||0) + parseFloat(r.overdue_interest||0) + parseFloat(r.accrued_penalties||0), 0);
  const bucketCount = b => data.filter(r => r.par_bucket === b).length;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  set('kpiTotalActive', data.length + ' Accounts');

  const par30Rows = data.filter(r => ['PAR-30','PAR-60','PAR-90','NPL'].includes(r.par_bucket));
  const par30Total = par30Rows.reduce((s,r) => s + parseFloat(r.overdue_principal||0) + parseFloat(r.overdue_interest||0) + parseFloat(r.accrued_penalties||0), 0);
  set('kpiPAR30', fmtK(par30Total) + ' ETB');
  set('kpiPAR30Count', par30Rows.length + ' accounts');

  set('kpiPAR60', fmtK(bucketSum('PAR-60') + bucketSum('PAR-90') + bucketSum('NPL')) + ' ETB');
  set('kpiPAR60Count', (bucketCount('PAR-60') + bucketCount('PAR-90') + bucketCount('NPL')) + ' accounts');

  set('kpiPAR90', fmtK(bucketSum('PAR-90') + bucketSum('NPL')) + ' ETB');
  set('kpiPAR90Count', (bucketCount('PAR-90') + bucketCount('NPL')) + ' accounts');

  set('kpiNPL', fmtK(bucketSum('NPL')) + ' ETB');
  set('kpiNPLCount', bucketCount('NPL') + ' accounts');
}

/* ── Client-side filter ─────────────────────────────────── */
function applyFiltersAndRender() {
  const appTerm = document.getElementById('searchAppId')?.value?.trim()?.toLowerCase() || '';
  const parFilter = document.getElementById('filterPAR')?.value || '';
  const colFilter = document.getElementById('filterCollStatus')?.value || '';

  const filtered = portfolioData.filter(row => {
    if (appTerm && !row.application_id.toLowerCase().includes(appTerm)) return false;
    if (parFilter && row.par_bucket !== parFilter) return false;
    if (colFilter && (row.collection_status || '') !== colFilter) return false;
    return true;
  });

  renderGrid(filtered);
  const sb = document.getElementById('statusBar');
  if (sb) sb.textContent = `Showing ${filtered.length} of ${portfolioData.length} records.`;
}

/* ── Render grid ────────────────────────────────────────── */
function renderGrid(data) {
  const tbody = document.querySelector('#delinquencyTable tbody');
  if (!tbody) return;

  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="11" class="text-center gray-text italic">No records match the current filter.</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(row => {
    const total = parseFloat(row.overdue_principal||0)
      + parseFloat(row.overdue_interest||0)
      + parseFloat(row.accrued_penalties||0);

    return `
      <tr data-id="${row.delinquency_id}" style="cursor:pointer;">
        <td style="font-family:monospace;font-size:11px;">${row.delinquency_id}</td>
        <td><strong>${row.application_id}</strong></td>
        <td>${row.days_past_due}</td>
        <td class="text-right">${fmt(row.overdue_principal)}</td>
        <td class="text-right">${fmt(row.overdue_interest)}</td>
        <td class="text-right">${fmt(row.accrued_penalties)}</td>
        <td class="text-right" style="font-weight:600;">${fmt(total)}</td>
        <td><span class="badge-par ${row.par_bucket}">${row.par_bucket}</span></td>
        <td>${row.collection_status || 'PENDING_VISIT'}</td>
        <td><small>${row.last_unannounced_visit_date || '—'}</small></td>
        <td style="max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${row.remarks || ''}</td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('tr[data-id]').forEach(tr => {
    tr.addEventListener('click', () => openDetailPanel(parseInt(tr.dataset.id)));
  });
}

/* ── Detail / Edit Panel ─────────────────────────────────── */
function openDetailPanel(delinquencyId) {
  const row = portfolioData.find(r => r.delinquency_id === delinquencyId);
  if (!row) return;

  _editingId = delinquencyId;

  const v = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };
  v('detailAppId', row.application_id);
  v('detailDPD', row.days_past_due + ' days');
  v('detailPARBucket', row.par_bucket);
  v('detailCollStatus', row.collection_status || 'PENDING_VISIT');
  v('detailLastVisit', row.last_unannounced_visit_date || '');
  v('detailRemarks', row.remarks || '');

  /* Disable computed fields */
  const parEl = document.getElementById('detailPARBucket');
  const dpdEl = document.getElementById('detailDPD');
  if (parEl) { parEl.disabled = true; parEl.title = 'PAR bucket is computed automatically from days past due'; }
  if (dpdEl) { dpdEl.disabled = true; dpdEl.title = 'Days past due is computed from payment schedule'; }

  document.getElementById('detailPanel')?.classList.add('open');
}

function closeDetailPanel() {
  document.getElementById('detailPanel')?.classList.remove('open');
  _editingId = null;
}

/* ── Save only editable fields ──────────────────────────── */
async function saveDetailPanel() {
  if (!_editingId) return;

  const getVal = id => { const el = document.getElementById(id); return el ? el.value.trim() || null : null; };

  /* Only send user-editable fields — par_bucket and days_past_due are computed */
  const payload = {
    collection_status: getVal('detailCollStatus'),
    last_unannounced_visit_date: getVal('detailLastVisit') || null,
    remarks: getVal('detailRemarks'),
  };

  /* Validate visit date is not in the future */
  if (payload.last_unannounced_visit_date) {
    const visitDate = new Date(payload.last_unannounced_visit_date);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (visitDate > today) {
      toast('Visit date cannot be in the future.', 'warning');
      return;
    }
  }

  try {
    await sbFetch(
      `loan_delinquency_registry?delinquency_id=eq.${_editingId}`,
      { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify(payload) }
    );
    toast(`Record ${_editingId} updated.`, 'success');
    closeDetailPanel();
    await loadDelinquencyRecords();
  } catch (e) {
    toast('Save error: ' + e.message, 'error');
  }
}

/* ── Manual Recalculate ──────────────────────────────────── */
async function recalculateDelinquency() {
  const sb = document.getElementById('statusBar');
  if (sb) sb.textContent = 'Recalculating delinquency from amortization schedules…';

  /* Try both RPC names for safety */
  let result = null;
  try {
    result = await sbRpc('refresh_loan_delinquency_registry');
  } catch (e1) {
    try {
      result = await sbRpc('refresh_delinquency_registry');
    } catch (e2) {
      toast('Recalculate failed: ' + e2.message, 'error');
      if (sb) sb.textContent = `Error: ${e2.message}`;
      return;
    }
  }

  toast(
    `Recalculated — ${result?.rows_upserted ?? 0} active loans, ${result?.rows_removed ?? 0} closed loans removed.`,
    'success'
  );
  await loadDelinquencyRecords();
}

/* ── Event wiring ────────────────────────────────────────── */
document.getElementById('searchAppId')?.addEventListener('input', applyFiltersAndRender);
document.getElementById('filterPAR')?.addEventListener('change', applyFiltersAndRender);
document.getElementById('filterCollStatus')?.addEventListener('change', applyFiltersAndRender);
document.getElementById('btnRefresh')?.addEventListener('click', loadDelinquencyRecords);
document.getElementById('btnRecalculate')?.addEventListener('click', recalculateDelinquency);
document.getElementById('btnPrint')?.addEventListener('click', () => window.print());
document.getElementById('btnGlobalPrint')?.addEventListener('click', () => window.print());
document.getElementById('btnCloseDetail')?.addEventListener('click', closeDetailPanel);
document.getElementById('btnCancelDetail')?.addEventListener('click', closeDetailPanel);
document.getElementById('btnSaveDetail')?.addEventListener('click', saveDetailPanel);

/* ── Init ───────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', loadDelinquencyRecords);

// ── Window Controls: Minimize / Maximize ────────────────────
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
