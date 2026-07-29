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

  async function logStatusTransition(sbFetch, applicationId, fromStatus, toStatus, changedBy, remarks) {
    try {
      await sbFetch('loan_status_audit_log', {
        method: 'POST',
        prefer: 'return=minimal',
        body: JSON.stringify({
          application_id: applicationId,
          from_status: fromStatus,
          to_status: toStatus,
          changed_by: changedBy || 'system',
          changed_at: new Date().toISOString(),
          remarks: remarks || null
        })
      });
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
