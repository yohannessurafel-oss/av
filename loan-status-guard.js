/* ═══════════════════════════════════════════════════════════
   Africa Village Microfinance — Loan Status Guard
   loan-status-guard.js  v1.1 — PATCHED

   PATCH APPLIED:
   • Added 'Closed' to Disbursed transitions (was missing, blocking
     early payoff from Disbursed status in Module 09)
═══════════════════════════════════════════════════════════ */

'use strict';

const LoanStatusGuard = (function () {

  const STATUS_LABELS = {
    Draft:         'Draft',
    Submitted:     'Submitted',
    DataEntry:     'Data Entry',
    Appraisal:     'Appraisal',
    Sanctioned:    'Sanctioned',
    Disbursed:     'Disbursed',
    Matured:       'Matured',
    Closed:        'Closed',
    WrittenOff:    'Written Off'
  };

  const TRANSITIONS = {
    Draft:      ['Submitted', 'DataEntry'],
    Submitted:  ['DataEntry', 'Draft'],
    DataEntry:  ['Appraisal', 'Submitted', 'Draft'],
    Appraisal:  ['Sanctioned', 'DataEntry', 'Draft'],
    Sanctioned: ['Disbursed', 'Appraisal', 'DataEntry'],
    Disbursed:  ['Matured', 'Closed', 'WrittenOff'],  // ← PATCHED: Added 'Closed'
    Matured:    ['Closed', 'WrittenOff'],
    Closed:     [],
    WrittenOff: []
  };

  const MODULES = {
    'loan-application':      ['Draft', 'DataEntry'],
    'appraisal':             ['DataEntry', 'Appraisal'],
    'credit-sanction':       ['Appraisal', 'Sanctioned'],
    'disbursement':          ['Sanctioned', 'Disbursed'],
    'repayment':             ['Disbursed', 'Matured'],
    'settlement':            ['Disbursed', 'Matured', 'Closed'],
    'writeoff':              ['Disbursed', 'Matured', 'WrittenOff']
  };

  function canTransition(from, to, sourceModule) {
    if (!from || !to) {
      return { allowed: false, reason: 'Missing from/to status.' };
    }
    if (from === to) {
      return { allowed: true, reason: 'No change.' };
    }
    const validNext = TRANSITIONS[from] || [];
    if (!validNext.includes(to)) {
      return {
        allowed: false,
        reason: `Cannot transition from ${STATUS_LABELS[from] || from} to ${STATUS_LABELS[to] || to}.`
      };
    }
    if (sourceModule && MODULES[sourceModule]) {
      const moduleStatuses = MODULES[sourceModule];
      if (!moduleStatuses.includes(to)) {
        return {
          allowed: false,
          reason: `Module ${sourceModule} is not authorized to set status to ${STATUS_LABELS[to] || to}.`
        };
      }
    }
    return { allowed: true, reason: 'Valid transition.' };
  }

  // FIX (3 issues, found together):
  //  1. Wrote 'changed_at' — not a real column; the table has
  //     'changed_on'.
  //  2. Never sent 'source_module' at all, which is NOT NULL on
  //     loan_status_audit_log.
  //  3. Relied on the caller's sbFetch(path, options) supporting a
  //     POST body — but credit-sanction-console.js's own sbFetch only
  //     accepts a path and silently ignores any options object,
  //     meaning this call was actually firing a GET request instead.
  //     No error was thrown (a GET to a real table succeeds fine), so
  //     even the console.error fallback never fired — this looked
  //     completely successful while writing nothing. Since this is a
  //     SHARED helper and other callers' sbFetch implementations
  //     can't be assumed to support options either, this now makes
  //     its own direct request instead of trusting the passed-in
  //     sbFetch's capabilities at all.
  //
  //  sourceModule is a new final parameter (appended, not inserted
  //  into the middle) so any existing 6-argument caller still works —
  //  it just won't get an attributed source_module until updated.
  const _SUPABASE_URL = 'https://oxzthrubidohuwwhxsrk.supabase.co';
  const _SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';

  async function logStatusTransition(sbFetch, applicationId, fromStatus, toStatus, changedBy, remarks, sourceModule) {
    try {
      const res = await fetch(`${_SUPABASE_URL}/rest/v1/loan_status_audit_log`, {
        method: 'POST',
        headers: {
          apikey: _SUPABASE_ANON_KEY,
          Authorization: `Bearer ${_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({
          application_id: applicationId,
          from_status: fromStatus,
          to_status: toStatus,
          source_module: sourceModule || 'unknown',
          changed_by: changedBy || 'system',
          changed_on: new Date().toISOString(),
          remarks: remarks || null
        })
      });
      if (!res.ok) {
        console.error('Failed to log status transition:', await res.text().catch(() => `HTTP ${res.status}`));
      }
    } catch (e) {
      console.error('Failed to log status transition:', e);
    }
  }

  async function checkSanctionCeiling(sbFetch, productId, approvedAmount) {
    if (!productId) return { ok: true };
    try {
      const rows = await sbFetch(
        `lendingproductparametermatrix?product_code_id=eq.${encodeURIComponent(productId)}&select=maximum_permissible_limit&limit=1`
      );
      const limit = rows?.[0]?.maximum_permissible_limit;
      if (limit != null && approvedAmount > parseFloat(limit)) {
        return {
          ok: false,
          reason: `Approved amount ETB ${approvedAmount.toLocaleString()} exceeds product ceiling of ETB ${parseFloat(limit).toLocaleString()}.`
        };
      }
      return { ok: true };
    } catch (e) {
      console.warn('Sanction ceiling check failed:', e);
      return { ok: true }; // Fail open if product data unavailable
    }
  }

  async function checkZeroLedgerBalance(sbFetch, applicationId) {
    try {
      const rows = await sbFetch(
        `loan_ledger?application_id=eq.${encodeURIComponent(applicationId)}&order=id.desc&limit=1&select=running_balance`
      );
      const balance = rows?.[0]?.running_balance;
      if (balance != null && parseFloat(balance) !== 0) {
        return {
          ok: false,
          reason: `Loan ledger balance is ETB ${parseFloat(balance).toLocaleString()} — must be zero before settlement.`
        };
      }
      return { ok: true };
    } catch (e) {
      console.warn('Zero balance check failed:', e);
      return { ok: true };
    }
  }

  return {
    STATUS_LABELS,
    TRANSITIONS,
    MODULES,
    canTransition,
    logStatusTransition,
    checkSanctionCeiling,
    checkZeroLedgerBalance
  };
})();

// Expose to window for modules that reference it directly
window.LoanStatusGuard = LoanStatusGuard;
