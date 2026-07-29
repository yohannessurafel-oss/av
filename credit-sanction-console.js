/* ═══════════════════════════════════════════════════════════
   Africa Village Microfinance — 04 Credit Sanction Console
   credit-sanction-console.js  v2.4 — PATCHED

   PATCHES APPLIED:
   • Sanction ceiling check wired in (was orphaned in guard)
   • Confirmation modal before save (was missing)
   • loanapplications status sync on sanction (was missing)
   • Uses LoanStatusGuard.canTransition() + logStatusTransition()
═══════════════════════════════════════════════════════════ */

'use strict';

const SUPABASE_URL = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';

/* ── HTTP helper ────────────────────────────────────────── */
async function sbFetch(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json'
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

/* ── System date ───────────────────────────────────────── */
(function initDate() {
  const el = document.getElementById('systemDate');
  if (el) el.textContent = new Date().toLocaleDateString('en-ET', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
  });
})();

/* ── Format helper ──────────────────────────────────────── */
const fmt = n => parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ── State ──────────────────────────────────────────────── */
let _currentAppId = null;
let _currentRecord = null;

/* ── Load application for sanction ──────────────────────── */
async function loadApplicationForSanction() {
  const appId = document.getElementById('sanctionAppId')?.value?.trim();
  if (!appId) { toast('Enter an Application ID.', 'warning'); return; }

  try {
    const rows = await sbFetch(
      `loanmasterrecords?application_id=eq.${encodeURIComponent(appId)}&limit=1`
    );
    if (!rows || !rows[0]) {
      toast(`Application ${appId} not found.`, 'error');
      return;
    }
    _currentRecord = rows[0];
    _currentAppId = appId;
    populateSanctionForm(_currentRecord);
    toast(`Application ${appId} loaded — status: ${_currentRecord.application_status}.`, 'success');
  } catch (e) {
    toast('Load error: ' + e.message, 'error');
  }
}

function populateSanctionForm(rec) {
  document.getElementById('sanctionClientName') && (document.getElementById('sanctionClientName').value = rec.client_name || '');
  document.getElementById('sanctionProductId') && (document.getElementById('sanctionProductId').value = rec.product_id || '');
  document.getElementById('sanctionBranchId') && (document.getElementById('sanctionBranchId').value = rec.branch_id || '');
  document.getElementById('sanctionAppliedAmount') && (document.getElementById('sanctionAppliedAmount').value = fmt(rec.applied_amount));
  document.getElementById('sanctionInterestRate') && (document.getElementById('sanctionInterestRate').value = rec.interest_rate || '');
  document.getElementById('sanctionTenureMonths') && (document.getElementById('sanctionTenureMonths').value = rec.tenure_months || '');
  document.getElementById('sanctionCurrentStatus') && (document.getElementById('sanctionCurrentStatus').value = rec.application_status || '');
}

/* ── Save sanction ──────────────────────────────────────── */
async function saveSanction() {
  if (!_currentRecord || !_currentAppId) {
    toast('Load an application first.', 'warning');
    return;
  }

  const approvedAmt = parseFloat(document.getElementById('sanctionApprovedAmount')?.value) || 0;
  const productId = document.getElementById('sanctionProductId')?.value;
  const tenure = parseInt(document.getElementById('sanctionTenureMonths')?.value) || 0;
  const interestRate = parseFloat(document.getElementById('sanctionInterestRate')?.value) || 0;
  const remarks = document.getElementById('sanctionRemarks')?.value?.trim() || '';

  if (approvedAmt <= 0) { toast('Approved amount must be greater than 0.', 'warning'); return; }
  if (tenure <= 0) { toast('Tenure must be greater than 0.', 'warning'); return; }

  /* ── PATCH: Sanction ceiling check ── */
  try {
    const ceiling = await LoanStatusGuard.checkSanctionCeiling(sbFetch, productId, approvedAmt);
    if (!ceiling.ok) {
      toast(`Sanction blocked: ${ceiling.reason}`, 'error');
      return;
    }
  } catch (e) {
    toast('Ceiling check failed: ' + e.message, 'error');
    return;
  }

  /* ── PATCH: Re-fetch live status & guard transition ── */
  let liveStatus;
  try {
    const live = await sbFetch(
      `loanmasterrecords?application_id=eq.${encodeURIComponent(_currentAppId)}&select=application_status&limit=1`
    );
    liveStatus = live?.[0]?.application_status;
  } catch (e) {
    toast('Could not verify current status.', 'error');
    return;
  }

  const guard = LoanStatusGuard.canTransition(liveStatus, 'Sanctioned');
  if (!guard.allowed) {
    toast(`Sanction denied: ${guard.reason}`, 'error');
    return;
  }

  /* ── PATCH: Confirmation modal ── */
  if (!confirm(
    `Approve loan sanction?\n\n` +
    `Application: ${_currentAppId}\n` +
    `Client: ${_currentRecord.client_name || 'N/A'}\n` +
    `Amount: ETB ${fmt(approvedAmt)}\n` +
    `Tenure: ${tenure} months\n` +
    `Rate: ${interestRate}%\n\n` +
    `This will set status to SANCTIONED.`
  )) {
    toast('Sanction cancelled.', 'info');
    return;
  }

  const payload = {
    approved_amount: approvedAmt,
    tenure_months: tenure,
    interest_rate: interestRate,
    application_status: 'Sanctioned',
    sanction_date: new Date().toISOString().slice(0, 10),
    sanction_remarks: remarks || null
  };

  try {
    /* Update loanmasterrecords */
    await fetch(`${SUPABASE_URL}/rest/v1/loanmasterrecords?application_id=eq.${encodeURIComponent(_currentAppId)}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(payload)
    });

    /* ── PATCH: Sync loanapplications header ── */
    await fetch(`${SUPABASE_URL}/rest/v1/loanapplications?application_id=eq.${encodeURIComponent(_currentAppId)}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({ application_status: 'Sanctioned' })
    });

    /* Log transition */
    await LoanStatusGuard.logStatusTransition(sbFetch, _currentAppId, liveStatus, 'Sanctioned', 'Credit Sanction Console');

    toast('Loan sanctioned successfully.', 'success');
    _currentRecord.application_status = 'Sanctioned';
    document.getElementById('sanctionCurrentStatus') && (document.getElementById('sanctionCurrentStatus').value = 'Sanctioned');
  } catch (e) {
    toast('Sanction save error: ' + e.message, 'error');
  }
}

/* ── Event bindings ─────────────────────────────────────── */
document.getElementById('btnLoadForSanction')?.addEventListener('click', loadApplicationForSanction);
document.getElementById('btnSaveSanction')?.addEventListener('click', saveSanction);
document.getElementById('sanctionAppId')?.addEventListener('keydown', e => { if (e.key === 'Enter') loadApplicationForSanction(); });

/* ── Init ───────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => {
  toast('Credit Sanction Console v2.4 ready.', 'success');
});

// ── Window Controls: Minimize / Maximize ────────────────────
const windowContainer = document.querySelector('.window-container');
const wcMinimizeBtn    = document.getElementById('wcMinimize');
const wcMaximizeBtn    = document.getElementById('wcMaximize');
const dockSliver        = document.getElementById('dockSliver');

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
