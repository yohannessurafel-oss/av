/* ═══════════════════════════════════════════════════════════
   Africa Village Microfinance — 03 Loan Appraisal Management
   loan-appraisal-management.js  v3.1 — RESOLVED DSR FORMULA & PARSING
   
   Design: This module READS an existing loanmasterrecords row
   (created in Module 01) and UPDATEs only the appraisal fields:
     - recommended_amount
     - approved_amount
     - application_status  → 'Appraisal'
   
   Appraisal-specific fields (risk rating, DSR, collateral
   coverage, conditions) are UI-only analysis aids and are NOT
   persisted — loanmasterrecords has no columns for them.
═══════════════════════════════════════════════════════════ */

'use strict';

const SUPABASE_URL      = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';

/* ── HTTP Helper — Hardened raw text parsing ────────────────── */
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
    const errText = await res.text().catch(() => '');
    let msg = 'HTTP ' + res.status;
    try { const j = JSON.parse(errText); msg = j.message || j.hint || j.details || msg; } catch {}
    throw new Error(msg);
  }
  const text = await res.text();
  if (!text || !text.trim()) return null;
  try { return JSON.parse(text); } catch { return null; }
}

/* ── Toast ─────────────────────────────────────────────── */
const toastEl = document.getElementById('toastNotification');
let _toastTimer = null;
function toast(msg, type = '', duration = 3500) {
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

async function loadBranches() {
  const sel = document.getElementById('apprBranchId');
  if (sel) { sel.innerHTML = '<option value="">Loading branches…</option>'; sel.disabled = true; }
  try {
    const rows = await sbFetch('branchregistry?select=branch_id,branch_name&order=branch_id');
    _branchCache = Array.isArray(rows) ? rows : [];
    const sel2 = document.getElementById('apprBranchId');
    if (!sel2) return;
    sel2.innerHTML = '<option value="">-- Select Branch --</option>';
    _branchCache.forEach(r => {
      const o = document.createElement('option');
      o.value = r.branch_id;
      o.textContent = r.branch_id + (r.branch_name ? ' — ' + r.branch_name : '');
      sel2.appendChild(o);
    });
    sel2.disabled = false;
  } catch (e) {
    toast('Could not load branch list.', 'error');
    const sel2 = document.getElementById('apprBranchId');
    if (sel2) { sel2.innerHTML = '<option value="">-- Select Branch --</option>'; sel2.disabled = false; }
  }
}

document.getElementById('apprBranchId')?.addEventListener('change', function () {
  const nameEl = document.getElementById('apprBranchName');
  const chosen = _branchCache.find(b => b.branch_id === this.value);
  if (nameEl) nameEl.value = chosen ? (chosen.branch_name || '') : '';
});

/* ── Mode Control ──────────────────────────────────────── */
let currentMode = 'view';

function setMode(mode) {
  currentMode = mode;
  const isEdit = mode === 'edit';
  const view = document.querySelector('.module-view.active') || document.body;

  view.querySelectorAll('input, select, textarea').forEach(el => {
    if (el.dataset.alwaysEnabled !== undefined) { el.disabled = false; return; }
    if (el.hasAttribute('readonly'))            { el.disabled = false; return; }
    el.disabled = !isEdit;
  });

  const appIdEl = document.getElementById('apprApplicationId');
  if (appIdEl) appIdEl.disabled = false;

  const btnSave   = document.getElementById('btnGlobalSave');
  const btnCancel = document.getElementById('btnGlobalCancel');
  const btnAdd    = document.getElementById('btnGlobalAdd');
  const btnEdit   = document.getElementById('btnGlobalEdit');
  const btnClose  = document.getElementById('btnGlobalClose');
  const btnDelete = document.getElementById('btnGlobalDelete');

  if (btnSave)   btnSave.disabled   = !isEdit;
  if (btnCancel) btnCancel.disabled = !isEdit;
  if (btnAdd)    btnAdd.disabled    = isEdit;
  if (btnEdit)   btnEdit.disabled   = isEdit || !_loadedAppId;
  if (btnDelete) btnDelete.disabled = true;
  if (btnClose)  btnClose.disabled  = isEdit;

  const sb = document.getElementById('statusBar');
  if (sb) sb.textContent = `Mode: ${mode.charAt(0).toUpperCase() + mode.slice(1)} — Ready`;
}

/* ── Track currently loaded record ─────────────────────── */
let _loadedAppId = null;

/* ── Load record into form ─────────────────────────── */
function populateForm(rec) {
  const v = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };

  v('apprApplicationId',    rec.application_id);
  v('apprClientId',         rec.client_id);
  v('apprClientName',       rec.client_name);
  v('apprProductId',        rec.product_id);
  v('apprAppliedAmount',    rec.applied_amount);
  v('apprTermMonths',       rec.term_months);
  v('apprInterestRate',     rec.interest_rate);
  v('apprRecommendedAmount',rec.recommended_amount ?? '');
  v('apprApprovedAmount',   rec.approved_amount ?? '');
  v('apprStatus',           rec.application_status);
  v('apprRepayAccountId',   rec.main_repayment_account_id);
  v('apprLoanPurpose',      rec.loan_purpose);
  v('apprCreditOfficer',    rec.credit_officer_id);

  const brSel = document.getElementById('apprBranchId');
  if (brSel) {
    brSel.value = rec.branch_id || '';
    brSel.dispatchEvent(new Event('change'));
  }

  ['apprNetIncome','apprObligations','apprDisposable','apprDSR',
   'apprRiskRating','apprCreditScore','apprCollateralCoverage','apprLTV',
   'apprOutcome','apprConditions','apprRemarks'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

function clearForm() {
  document.querySelectorAll('#view-appraisal input, #view-appraisal select, #view-appraisal textarea')
    .forEach(el => { el.value = ''; });
  _loadedAppId = null;
}

/* ── DSR / Disposable Auto-Calc — Aligned to annuity formula ── */
function recalcDSR() {
  const income      = parseFloat(document.getElementById('apprNetIncome')?.value  || 0);
  const obligations = parseFloat(document.getElementById('apprObligations')?.value || 0);
  const loanAmt     = parseFloat(document.getElementById('apprRecommendedAmount')?.value ||
                                  document.getElementById('apprAppliedAmount')?.value || 0);
  const termMonths  = parseInt(document.getElementById('apprTermMonths')?.value || 12) || 12;
  const rate        = parseFloat(document.getElementById('apprInterestRate')?.value || 12) || 12;

  const monthlyRate = (rate / 100) / 12;
  let installment;
  if (monthlyRate === 0) {
    installment = loanAmt / termMonths;
  } else {
    installment = loanAmt * (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) /
                  (Math.pow(1 + monthlyRate, termMonths) - 1);
  }

  const disposable    = income - obligations;
  const totalObligation = obligations + installment;
  const dsr           = income > 0 ? ((totalObligation / income) * 100).toFixed(2) : '';

  const dispEl = document.getElementById('apprDisposable');
  const dsrEl  = document.getElementById('apprDSR');
  if (dispEl) dispEl.value = disposable.toFixed(2);
  if (dsrEl)  dsrEl.value  = dsr;
}

['apprNetIncome','apprObligations','apprRecommendedAmount'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', recalcDSR);
});

/* ── Group Context — NEW: shows whether this loan is part of a group
   batch, and which member it is. Purely informational — every group
   member gets its own normal loanmasterrecords row, so nothing else
   in this module needs group_id for its actual logic. ── */
async function loadGroupContext(rec) {
  const banner = document.getElementById('groupContextBanner');
  const text   = document.getElementById('groupContextText');
  if (!banner || !text) return;

  if (!rec.group_id) {
    banner.style.display = 'none';
    return;
  }

  try {
    const [members, groupRows] = await Promise.all([
      sbFetch(`loanmasterrecords?group_id=eq.${encodeURIComponent(rec.group_id)}&select=application_id&order=application_id.asc`),
      sbFetch(`portfoliogrouphierarchy?group_registry_id=eq.${encodeURIComponent(rec.group_id)}&select=group_name_alias&limit=1`)
    ]);
    const total = Array.isArray(members) ? members.length : 1;
    const idx   = Array.isArray(members) ? members.findIndex(m => m.application_id === rec.application_id) + 1 : 1;
    const groupName = (groupRows && groupRows[0] && groupRows[0].group_name_alias) ? ` — ${groupRows[0].group_name_alias}` : '';

    text.textContent = `${rec.group_id}${groupName} — Member ${idx > 0 ? idx : '?'} of ${total}`;
    banner.style.display = '';
  } catch (e) {
    text.textContent = `${rec.group_id} (could not load member count)`;
    banner.style.display = '';
  }
}

/* ── View / Lookup ──────────────────────────────────────── */
async function viewRecord() {
  const appId = document.getElementById('apprApplicationId')?.value?.trim();
  if (!appId) { toast('Enter an Application ID to search.', 'warning'); return; }

  const sb = document.getElementById('statusBar');
  if (sb) sb.textContent = 'Searching…';

  try {
    const rows = await sbFetch(
      `loanmasterrecords?application_id=eq.${encodeURIComponent(appId)}&select=*&limit=1`
    );
    if (rows && rows[0]) {
      populateForm(rows[0]);
      _loadedAppId = rows[0].application_id;
      setMode('view');
      toast(`Loaded: ${_loadedAppId}`);
      loadGroupContext(rows[0]);
    } else {
      toast('Application ID not found in loan master records.', 'warning');
      if (sb) sb.textContent = 'Status: Not found';
    }
  } catch (e) {
    toast('Lookup error: ' + e.message, 'error');
    if (sb) sb.textContent = 'Status: Error';
  }
}

/* ── Save (PATCH only) ─────────────────────────────────── */
async function saveRecord() {
  if (!_loadedAppId) { toast('Load a record first, then Edit to make changes.', 'warning'); return; }

  const sb = document.getElementById('statusBar');

  // Fetch the record's CURRENT status fresh from the DB — don't trust
  // whatever the UI last showed, since another module could have moved
  // this loan forward (or backward) since it was loaded on this page.
  let currentStatus;
  try {
    const fresh = await sbFetch(
      `loanmasterrecords?application_id=eq.${encodeURIComponent(_loadedAppId)}&select=application_status&limit=1`
    );
    if (!fresh || !fresh[0]) {
      toast('Could not re-verify this record — it may have been deleted. Reload and try again.', 'error');
      return;
    }
    currentStatus = fresh[0].application_status;
  } catch (e) {
    toast('Could not verify current status before saving: ' + e.message, 'error');
    return;
  }

  // Ask the shared guard whether THIS module is allowed to move this loan
  // into 'Appraisal' from whatever status it's actually in right now.
  // Same-status saves (already 'Appraisal') are always allowed — that's
  // this module's normal, everyday use. Anything else (Sanctioned,
  // Disbursed, etc.) means this loan has already moved past appraisal,
  // and this module has no authority to pull it back — so the guard
  // blocks it, preventing an accidental regression of an already-sanctioned
  // or disbursed loan.
  if (!window.LoanStatusGuard) {
    toast('Loan Status Guard is not loaded — cannot safely save. Add loan-status-guard.js to this page.', 'error');
    return;
  }
  const check = window.LoanStatusGuard.canTransition(currentStatus, 'Appraisal', 'loan-appraisal-management');
  if (!check.allowed) {
    toast(`Cannot save: ${check.reason}`, 'error');
    if (sb) sb.textContent = `Blocked — record is currently "${currentStatus}", not editable here.`;
    return;
  }

  const recAmt  = parseFloat(document.getElementById('apprRecommendedAmount')?.value || 0);
  const appAmt  = parseFloat(document.getElementById('apprApprovedAmount')?.value    || 0);

  const payload = {
    recommended_amount: recAmt   || null,
    approved_amount:    appAmt   || null,
    application_status: 'Appraisal',
    modified_on:        new Date().toISOString()
  };

  if (sb) sb.textContent = 'Saving…';

  try {
    await sbFetch(
      `loanmasterrecords?application_id=eq.${encodeURIComponent(_loadedAppId)}`,
      { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify(payload) }
    );

    // Best-effort audit trail — never blocks the save if it fails.
    window.LoanStatusGuard?.logStatusTransition(sbFetch, {
      applicationId: _loadedAppId,
      fromStatus:    currentStatus,
      toStatus:      'Appraisal',
      sourceModule:  'loan-appraisal-management'
    });

    toast(`Appraisal saved — status set to Appraisal for ${_loadedAppId}`, 'success');
    document.getElementById('apprStatus').value = 'Appraisal';
    setMode('view');
  } catch (e) {
    toast('Save error: ' + e.message, 'error');
    if (sb) sb.textContent = 'Save failed — see toast.';
  }
}

/* ── Toolbar ────────────────────────────────────────────── */
document.getElementById('btnGlobalView')?.addEventListener('click', viewRecord);
document.getElementById('btnSearchAppId')?.addEventListener('click', viewRecord);

document.getElementById('btnGlobalEdit')?.addEventListener('click', () => {
  if (!_loadedAppId) { toast('Load a record first before editing.', 'warning'); return; }
  setMode('edit');
  toast('Edit mode — update amounts then Save.');
});

document.getElementById('btnGlobalSave')?.addEventListener('click', saveRecord);

document.getElementById('btnGlobalCancel')?.addEventListener('click', () => {
  if (_loadedAppId) {
    viewRecord();
  } else {
    clearForm();
    setMode('view');
  }
  toast('Changes discarded.');
});

document.getElementById('btnGlobalAdd')?.addEventListener('click', () => {
  toast('Use Module 01 — Loan Application to create a new application.', 'warning');
});

document.getElementById('btnGlobalClose')?.addEventListener('click', () => {
  clearForm();
  setMode('view');
  toast('Record closed.');
});

document.getElementById('btnGlobalDelete')?.addEventListener('click', () => {
  toast('Appraisal records cannot be deleted here. Use Module 01.', 'warning');
});

document.getElementById('btnGlobalPrint')?.addEventListener('click', () => window.print());

/* ── Init ───────────────────────────────────────────────── */
async function init() {
  setMode('view');
  await loadBranches();
}
init();
