/* ═══════════════════════════════════════════════════════════
   Africa Village Microfinance — Shared Loan Status Guard
   loan-status-guard.js  v1.0

   PURPOSE
   Single source of truth for the loanmasterrecords.application_status
   state machine. No module should PATCH application_status without
   asking this guard first — that's the whole point: today Module 05
   (Loan Account Maintenance) can push any status via a free dropdown,
   which bypasses Module 04 (Credit Sanction Console) entirely.

   HOW TO WIRE IT IN
   1. Add <script src="loan-status-guard.js"></script> to each module's
      HTML, BEFORE the module's own <script src="....js">.
   2. Before any PATCH that changes application_status, call:

        const check = LoanStatusGuard.canTransition(
          currentStatus,      // status the record currently has (fetch fresh, don't trust stale UI state)
          targetStatus,       // status you're trying to set
          'credit-sanction-console'   // a string identifying THIS module — see MODULE IDS below
        );
        if (!check.allowed) { toast(check.reason, 'error'); return; }

   MODULE IDS IN USE
     'loan-application'         → Module 01
     'credit-sanction-console'  → Module 04
     'loan-account-maintenance' → Module 05
     'disbursement'             → Module 10
     'settlement'               → Module 09 (Early Payoff / Settlement — wire in when ready)
     'loan-repayment-collection'→ Module 15 (routine installment repayments — NOT early payoff)

   This file has no dependencies and attaches itself to `window.LoanStatusGuard`.
═══════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  /* Mirrors the CHECK constraint on loanmasterrecords.application_status.
     If you ever add a status value in the DB, add it here too or every
     transition into/out of it will be rejected by this guard. */
  const VALID_STATUSES = [
    'Draft', 'Submitted', 'DataEntry', 'Appraisal',
    'Sanctioned', 'Disbursed', 'Matured', 'Closed', 'WrittenOff'
  ];

  /* The lifecycle graph. Each key is a "from" status; its value maps
     each allowed "to" status to the list of modules permitted to make
     that specific move. If a module isn't in the list, the move is
     rejected even if the transition itself is legal for some other module. */
  const TRANSITIONS = {
    Draft:       { Submitted:  ['loan-application'] },
    Submitted:   { DataEntry:  ['loan-application'] },
    DataEntry:   {
      Appraisal:  ['loan-application', 'credit-sanction-console'],
      Closed:     ['loan-account-maintenance']   // withdraw/cancel an application before it's ever sanctioned
    },
    Appraisal:   {
      Sanctioned: ['credit-sanction-console'],
      Closed:     ['loan-account-maintenance']   // reject/cancel before sanction
    },
    Sanctioned:  {
      Disbursed:  ['disbursement'],
      Appraisal:  ['credit-sanction-console']    // send back for re-appraisal
    },
    Disbursed:   {
      // Matured: reachable either by Module 09 (early payoff) or Module 15
      // (routine repayment that brings the schedule to zero naturally).
      Matured:    ['settlement', 'loan-repayment-collection'],
      Closed:     ['settlement'],                // full settlement/payoff — NOT loan-account-maintenance
      WrittenOff: ['settlement']
    },
    Matured:     {
      Closed:     ['settlement'],
      WrittenOff: ['settlement']
    },
    Closed:      {},   // terminal — no further transitions
    WrittenOff:  {}    // terminal — no further transitions
  };

  /**
   * Can `sourceModule` move a loan from `currentStatus` to `targetStatus`?
   * @returns {{allowed: boolean, reason: string}}
   */
  function canTransition(currentStatus, targetStatus, sourceModule) {
    if (currentStatus === targetStatus) {
      return { allowed: true, reason: 'No status change.' };
    }
    if (!VALID_STATUSES.includes(targetStatus)) {
      return { allowed: false, reason: `"${targetStatus}" is not a recognized application status.` };
    }
    const fromRow = TRANSITIONS[currentStatus];
    if (!fromRow) {
      return { allowed: false, reason: `Current status "${currentStatus}" is not recognized — cannot validate transition.` };
    }
    const authorizedModules = fromRow[targetStatus];
    if (!authorizedModules) {
      return {
        allowed: false,
        reason: `"${currentStatus}" → "${targetStatus}" is not a valid step in the loan lifecycle. ` +
                `Loans must move through: Appraisal → Sanctioned → Disbursed → Matured/Closed.`
      };
    }
    if (!authorizedModules.includes(sourceModule)) {
      return {
        allowed: false,
        reason: `"${currentStatus}" → "${targetStatus}" must be performed from ` +
                `${authorizedModules.join(' or ')}, not from here.`
      };
    }
    return { allowed: true, reason: 'Transition authorized.' };
  }

  /**
   * Confirms approvedAmount doesn't exceed the product's policy ceiling
   * (lendingproductparametermatrix.maximum_permissible_limit).
   * Pass in the calling module's own sbFetch so this stays transport-agnostic.
   */
  async function checkSanctionCeiling(sbFetch, productId, approvedAmount) {
    if (!productId) return { ok: true, reason: 'No product selected — skipping ceiling check.' };
    try {
      const rows = await sbFetch(
        `lendingproductparametermatrix?product_code_id=eq.${encodeURIComponent(productId)}&select=maximum_permissible_limit&limit=1`
      );
      const limit = rows && rows[0] ? parseFloat(rows[0].maximum_permissible_limit) : null;
      if (limit === null || isNaN(limit)) {
        return { ok: true, reason: 'Product policy limit not found — skipping ceiling check.' };
      }
      const amt = parseFloat(approvedAmount) || 0;
      if (amt > limit) {
        return {
          ok: false,
          limit,
          reason: `Approved amount (ETB ${amt.toLocaleString()}) exceeds the product's policy limit of ETB ${limit.toLocaleString()}.`
        };
      }
      return { ok: true, limit };
    } catch (e) {
      // Network/lookup failure — don't hard-block sanctioning over a connectivity blip,
      // but make sure the caller surfaces this rather than silently proceeding.
      return { ok: true, reason: 'Ceiling check could not run (' + e.message + ') — proceeding without it.' };
    }
  }

  /**
   * Before closing a loan, confirms loan_ledger's most recent running_balance is ~0.
   * Fails CLOSED (zero: false) if the check itself errors, so a network hiccup
   * can never accidentally let a loan with a real balance get closed.
   */
  async function checkZeroLedgerBalance(sbFetch, applicationId) {
    try {
      const rows = await sbFetch(
        `loan_ledger?application_id=eq.${encodeURIComponent(applicationId)}&order=id.desc&limit=1&select=running_balance`
      );
      if (!rows || !rows.length) return { zero: true, balance: 0 };
      const balance = parseFloat(rows[0].running_balance) || 0;
      return { zero: Math.abs(balance) < 0.01, balance };
    } catch (e) {
      return { zero: false, balance: null, reason: 'Could not verify loan ledger balance — closure blocked: ' + e.message };
    }
  }

  /**
   * Optional append-only audit trail. Requires the loan_status_audit_log
   * table (see migration_loan_status_audit.sql). Never blocks the caller's
   * save even if this table doesn't exist yet — it just warns to console.
   */
  async function logStatusTransition(sbFetch, { applicationId, fromStatus, toStatus, sourceModule, changedBy }) {
    try {
      await sbFetch('loan_status_audit_log', {
        method: 'POST',
        prefer: 'return=minimal',
        body: JSON.stringify({
          application_id: applicationId,
          from_status:    fromStatus,
          to_status:      toStatus,
          source_module:  sourceModule,
          changed_by:     changedBy || null,
          changed_on:     new Date().toISOString()
        })
      });
    } catch (e) {
      console.warn('Status audit log not recorded (table may not exist yet):', e.message);
    }
  }

  global.LoanStatusGuard = {
    VALID_STATUSES,
    TRANSITIONS,
    canTransition,
    checkSanctionCeiling,
    checkZeroLedgerBalance,
    logStatusTransition
  };

})(window);
