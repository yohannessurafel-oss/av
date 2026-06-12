// ═══════════════════════════════════════════════════════
//  Africa Village Microfinance — Loan Ledger System
//  Full CRUD Engine — aligned to LoanMasterRecords schema
// ═══════════════════════════════════════════════════════

const SUPABASE_URL      = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TABLE = 'LoanMasterRecords';

// ── App State ─────────────────────────────────────────
let appState = {
    mode: 'view',           // 'view' | 'add' | 'edit'
    currentRecordId: null   // application_id (PK) of the loaded record
};

// ── Status Bar ────────────────────────────────────────
function setStatus(msg) {
    const el = document.querySelector('.sub-footer-token');
    if (el) el.textContent = 'Status: ' + msg;
}

// ── Lock / Unlock Form Fields ─────────────────────────
function lockForm(locked) {
    const activeView = document.querySelector('.module-view.active');
    if (!activeView) return;
    // Only touch editable inputs — never touch readonly ones
    activeView.querySelectorAll(
        'input:not([readonly]):not([type="checkbox"]), select, textarea'
    ).forEach(el => {
        el.disabled = locked;
    });
}

// ── Read Form → DB Payload (matches LoanMasterRecords) ─
function getFormData() {
    const v = id => document.getElementById(id)?.value?.trim() || null;
    const n = id => { const val = parseFloat(document.getElementById(id)?.value); return isNaN(val) ? null : val; };
    const i = id => { const val = parseInt(document.getElementById(id)?.value); return isNaN(val) ? null : val; };

    return {
        application_id:             v('fApplicationId'),
        branch_id:                  v('loanBranchId'),
        group_id:                   v('fGroupId'),
        sub_group_id:               v('fSubGroupId'),
        client_id:                  v('fClientId'),
        product_id:                 v('fProductId'),
        main_repayment_account_id:  v('fRepaymentAccId'),
        donor_id:                   v('fDonorId'),
        loan_purpose:               v('fLoanPurpose'),
        credit_officer_id:          v('fOfficerId'),
        sales_officer:              v('fSalesOfficer'),
        file_number:                v('fFileNumber'),
        applied_amount:             n('fLoanAmount'),
        term_months:                i('fTerm'),
        commission_rate:            n('fCommissionRate'),
        effective_rate:             n('fEffectiveRate'),
        spread:                     n('fSpread'),
        application_date:           v('fDate') || null,
        line_of_business:           v('fLineOfBusiness'),
        currency_id:                v('fCurrencyId') || 'ETB',
        interest_rate:              n('fInterestRate'),
        tax_rate:                   n('fTaxRate'),
        disbursement_date:          v('fDisbursementDate') || null,
        application_status:         v('fApplicationStatus') || 'DataEntry',
        modified_on:                new Date().toISOString()
    };
}

// ── Write DB Row → Form Fields ─────────────────────────
function populateForm(row) {
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val ?? '';
    };

    set('loanBranchId',       row.branch_id);
    set('loanBranchName',     row.branch_name || '');   // from BranchRegistry join if available
    set('fGroupId',           row.group_id);
    set('fSubGroupId',        row.sub_group_id);
    set('fApplicationId',     row.application_id);
    set('fClientId',          row.client_id);
    set('fProductId',         row.product_id);
    set('fRepaymentAccId',    row.main_repayment_account_id);
    set('fDonorId',           row.donor_id);
    set('fLoanPurpose',       row.loan_purpose);
    set('fOfficerId',         row.credit_officer_id);
    set('fSalesOfficer',      row.sales_officer);
    set('fFileNumber',        row.file_number);
    set('fLoanAmount',        row.applied_amount);
    set('fTerm',              row.term_months);
    set('fCommissionRate',    row.commission_rate);
    set('fEffectiveRate',     row.effective_rate);
    set('fSpread',            row.spread);
    set('fDate',              row.application_date);
    set('fLineOfBusiness',    row.line_of_business);
    set('fCurrencyId',        row.currency_id || 'ETB');
    set('fInterestRate',      row.interest_rate);
    set('fTaxRate',           row.tax_rate);
    set('fDisbursementDate',  row.disbursement_date);
    set('fApplicationStatus', row.application_status || 'DataEntry');

    appState.currentRecordId = row.application_id;
}

// ── Clear Form to Defaults ─────────────────────────────
function clearForm() {
    const activeForm = document.querySelector('.module-view.active form');
    if (activeForm) activeForm.reset();

    // Restore sensible defaults
    const def = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    def('loanBranchId',       '001');
    def('loanBranchName',     'Koinange Street Branch');
    def('fTerm',              '12');
    def('fCurrencyId',        'ETB');
    def('fApplicationStatus', 'DataEntry');
    def('fLoanPurpose',       'OTHER');
    def('fLineOfBusiness',    'Proprietary');

    appState.currentRecordId = null;
}

// ── Sync Button Enabled/Disabled States ───────────────
function updateButtonStates() {
    const inEdit    = appState.mode === 'add' || appState.mode === 'edit';
    const hasRecord = !!appState.currentRecordId;

    const btn = id => document.getElementById(id);
    if (btn('btnGlobalView'))   btn('btnGlobalView').disabled   = inEdit;
    if (btn('btnGlobalAdd'))    btn('btnGlobalAdd').disabled    = inEdit;
    if (btn('btnGlobalEdit'))   btn('btnGlobalEdit').disabled   = !hasRecord || inEdit;
    if (btn('btnGlobalDelete')) btn('btnGlobalDelete').disabled = !hasRecord || inEdit;
    if (btn('btnGlobalSave'))   btn('btnGlobalSave').disabled   = !inEdit;
    if (btn('btnGlobalCancel')) btn('btnGlobalCancel').disabled = !inEdit;
}

// ═══════════════════════════════════════════════════════
//  VIEW MODAL — Search & Select Records
// ═══════════════════════════════════════════════════════
function buildViewModal() {
    if (document.getElementById('viewModal')) return;

    const modal = document.createElement('div');
    modal.id = 'viewModal';
    modal.style.cssText = 'display:none;position:fixed;inset:0;z-index:2000;';
    modal.innerHTML = `
    <div id="vmBackdrop" style="position:absolute;inset:0;background:rgba(0,0,0,0.5);">
      <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
                  background:#fff;border:2px solid #1a4d80;border-top:4px solid #e69c24;
                  border-radius:4px;width:760px;max-height:82vh;display:flex;
                  flex-direction:column;box-shadow:0 10px 40px rgba(0,0,0,0.55);font-size:11px;">

        <!-- Modal Header -->
        <div style="background:linear-gradient(to right,#0d3460,#2e6da4);color:#fff;
                    padding:6px 10px;font-weight:bold;font-size:12px;
                    display:flex;justify-content:space-between;align-items:center;
                    border-bottom:2px solid #e69c24;">
          <span>🔍&nbsp; Loan Records — Search &amp; Select</span>
          <button id="vmClose" style="background:none;border:none;color:#fff;font-size:16px;
                  cursor:pointer;line-height:1;padding:0 4px;" title="Close">✕</button>
        </div>

        <!-- Search Bar -->
        <div style="display:flex;gap:6px;align-items:center;padding:6px 10px;
                    background:#f4f8fc;border-bottom:1px solid #9bbcdb;flex-wrap:wrap;">
          <label style="font-weight:bold;color:#0d3460;white-space:nowrap;">Search by:</label>
          <select id="vmField" style="height:20px;border:1px solid #9bbcdb;padding:1px 4px;font-size:11px;">
            <option value="application_id">Application ID</option>
            <option value="client_id">Client ID</option>
            <option value="client_name">Client Name</option>
            <option value="branch_id">Branch ID</option>
            <option value="loan_purpose">Loan Purpose</option>
            <option value="application_status">Status</option>
            <option value="credit_officer_id">Officer ID</option>
            <option value="product_id">Product ID</option>
          </select>
          <input id="vmValue" type="text" placeholder="Type search value..."
                 style="flex:1;min-width:140px;height:20px;border:1px solid #9bbcdb;padding:1px 6px;font-size:11px;">
          <button id="vmSearchBtn"
                  style="background:linear-gradient(to bottom,#2e7abf,#1a4d80);color:#fff;
                         border:1px solid #0d3460;border-bottom:2px solid #07203a;
                         height:22px;padding:0 12px;font-size:11px;font-weight:bold;
                         cursor:pointer;border-radius:2px;">Search</button>
          <button id="vmAllBtn"
                  style="background:linear-gradient(to bottom,#f8f9fa,#dde8f0);
                         border:1px solid #8eaac8;border-bottom:2px solid #6a8fb0;
                         height:22px;padding:0 10px;font-size:11px;font-weight:bold;
                         cursor:pointer;border-radius:2px;">Show All</button>
        </div>

        <!-- Results Grid -->
        <div style="overflow:auto;flex:1;">
          <table style="width:100%;border-collapse:collapse;white-space:nowrap;font-size:11px;">
            <thead>
              <tr style="background:linear-gradient(to bottom,#ddeaf7,#c8ddf0);">
                <th style="padding:4px 7px;border-right:1px solid #9bbcdb;border-bottom:2px solid #9bbcdb;color:#0d3460;text-align:left;position:sticky;top:0;">Application ID</th>
                <th style="padding:4px 7px;border-right:1px solid #9bbcdb;border-bottom:2px solid #9bbcdb;color:#0d3460;text-align:left;position:sticky;top:0;">Client ID</th>
                <th style="padding:4px 7px;border-right:1px solid #9bbcdb;border-bottom:2px solid #9bbcdb;color:#0d3460;text-align:left;position:sticky;top:0;">Client Name</th>
                <th style="padding:4px 7px;border-right:1px solid #9bbcdb;border-bottom:2px solid #9bbcdb;color:#0d3460;text-align:left;position:sticky;top:0;">Branch</th>
                <th style="padding:4px 7px;border-right:1px solid #9bbcdb;border-bottom:2px solid #9bbcdb;color:#0d3460;text-align:right;position:sticky;top:0;">Applied Amt (ETB)</th>
                <th style="padding:4px 7px;border-right:1px solid #9bbcdb;border-bottom:2px solid #9bbcdb;color:#0d3460;text-align:left;position:sticky;top:0;">Purpose</th>
                <th style="padding:4px 7px;border-right:1px solid #9bbcdb;border-bottom:2px solid #9bbcdb;color:#0d3460;text-align:left;position:sticky;top:0;">Status</th>
                <th style="padding:4px 7px;border-bottom:2px solid #9bbcdb;color:#0d3460;text-align:left;position:sticky;top:0;background:linear-gradient(to bottom,#ddeaf7,#c8ddf0);">Date</th>
              </tr>
            </thead>
            <tbody id="vmBody">
              <tr><td colspan="8" style="text-align:center;padding:14px;color:#667788;font-style:italic;">
                Click Search or Show All to load records.
              </td></tr>
            </tbody>
          </table>
        </div>

        <!-- Footer -->
        <div id="vmFooter" style="padding:4px 10px;font-size:10px;font-weight:bold;
             color:#667788;border-top:1px solid #cde0f0;background:#eef4fb;">
          Ready.
        </div>
      </div>
    </div>`;

    document.body.appendChild(modal);

    document.getElementById('vmClose').addEventListener('click', closeViewModal);
    document.getElementById('vmBackdrop').addEventListener('click', e => { if (e.target.id === 'vmBackdrop') closeViewModal(); });
    document.getElementById('vmSearchBtn').addEventListener('click', () => runSearch(false));
    document.getElementById('vmAllBtn').addEventListener('click', () => runSearch(true));
    document.getElementById('vmValue').addEventListener('keydown', e => { if (e.key === 'Enter') runSearch(false); });
}

function openViewModal() {
    buildViewModal();
    document.getElementById('viewModal').style.display = 'block';
    document.getElementById('vmValue').value = '';
    document.getElementById('vmBody').innerHTML = '<tr><td colspan="8" style="text-align:center;padding:14px;color:#667788;font-style:italic;">Click Search or Show All to load records.</td></tr>';
    document.getElementById('vmFooter').textContent = 'Ready.';
    setTimeout(() => document.getElementById('vmValue').focus(), 80);
}

function closeViewModal() {
    const m = document.getElementById('viewModal');
    if (m) m.style.display = 'none';
}

async function runSearch(showAll) {
    const footer = document.getElementById('vmFooter');
    const tbody  = document.getElementById('vmBody');
    footer.textContent = 'Querying...';
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:14px;color:#667788;">Loading records...</td></tr>';

    try {
        let query = db
            .from(TABLE)
            .select('application_id, client_id, client_name, branch_id, applied_amount, loan_purpose, application_status, application_date, interest_rate, term_months, currency_id')
            .order('created_on', { ascending: false })
            .limit(300);

        if (!showAll) {
            const field = document.getElementById('vmField').value;
            const val   = document.getElementById('vmValue').value.trim();
            if (val) query = query.ilike(field, `%${val}%`);
        }

        const { data, error } = await query;
        if (error) throw error;

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:14px;color:#667788;font-style:italic;">No records found.</td></tr>';
            footer.textContent = '0 records found.';
            return;
        }

        footer.textContent = `${data.length} record(s) found. Click a row to load it into the form.`;

        tbody.innerHTML = data.map((row, i) => {
            const even = i % 2 === 0;
            const bg   = even ? '#f5f9fd' : '#ffffff';
            const amt  = row.applied_amount != null
                ? Number(row.applied_amount).toLocaleString('en-ET', { minimumFractionDigits: 2 })
                : '—';
            const statusColor = {
                'DataEntry':  '#ddeaf7',
                'Approved':   '#d4edda',
                'Rejected':   '#f8d7da',
                'Disbursed':  '#fff3cd',
                'Closed':     '#e2e3e5'
            }[row.application_status] || '#eef4fb';

            return `<tr data-appid="${row.application_id}"
                        style="cursor:pointer;background:${bg};"
                        onmouseover="this.style.background='#d8edfb'"
                        onmouseout="this.style.background='${bg}'">
                <td style="padding:3px 7px;border-right:1px solid #cde0f0;border-bottom:1px solid #cde0f0;font-weight:bold;color:#0d3460;">${row.application_id || '—'}</td>
                <td style="padding:3px 7px;border-right:1px solid #cde0f0;border-bottom:1px solid #cde0f0;">${row.client_id || '—'}</td>
                <td style="padding:3px 7px;border-right:1px solid #cde0f0;border-bottom:1px solid #cde0f0;">${row.client_name || '—'}</td>
                <td style="padding:3px 7px;border-right:1px solid #cde0f0;border-bottom:1px solid #cde0f0;">${row.branch_id || '—'}</td>
                <td style="padding:3px 7px;border-right:1px solid #cde0f0;border-bottom:1px solid #cde0f0;text-align:right;">${amt}</td>
                <td style="padding:3px 7px;border-right:1px solid #cde0f0;border-bottom:1px solid #cde0f0;">${row.loan_purpose || '—'}</td>
                <td style="padding:3px 7px;border-right:1px solid #cde0f0;border-bottom:1px solid #cde0f0;">
                    <span style="background:${statusColor};padding:1px 6px;border-radius:2px;font-size:10px;font-weight:bold;">${row.application_status || '—'}</span>
                </td>
                <td style="padding:3px 7px;border-bottom:1px solid #cde0f0;">${row.application_date || '—'}</td>
            </tr>`;
        }).join('');

        // Row click → fetch full record, populate form
        tbody.querySelectorAll('tr[data-appid]').forEach(tr => {
            tr.addEventListener('click', async () => {
                const appId = tr.getAttribute('data-appid');
                footer.textContent = 'Loading full record...';
                try {
                    const { data: full, error: err2 } = await db
                        .from(TABLE)
                        .select('*')
                        .eq('application_id', appId)
                        .single();
                    if (err2) throw err2;
                    populateForm(full);
                    appState.mode = 'view';
                    lockForm(true);
                    updateButtonStates();
                    setStatus('Record loaded — ' + appId);
                    closeViewModal();
                } catch (e) {
                    footer.textContent = 'Failed to load record: ' + e.message;
                }
            });
        });

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:14px;color:#cc2222;font-weight:bold;">
            ❌ Error: ${err.message}
        </td></tr>`;
        footer.textContent = 'Query failed.';
        console.error('View search error:', err);
    }
}

// ═══════════════════════════════════════════════════════
//  DOMContentLoaded — Wire Everything Up
// ═══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function () {
    console.log('Africa Village Microfinance — System Online.');

    // ── Sidebar Navigation ─────────────────────────────
    const menuLinks   = document.querySelectorAll('#globalModuleRouter li');
    const moduleViews = document.querySelectorAll('.module-view');

    menuLinks.forEach(link => {
        link.addEventListener('click', function () {
            menuLinks.forEach(i  => i.classList.remove('active'));
            moduleViews.forEach(v => v.classList.remove('active'));
            this.classList.add('active');
            const target = document.getElementById('view-' + this.getAttribute('data-module'));
            if (target) target.classList.add('active');
            // Reset state on module switch
            appState = { mode: 'view', currentRecordId: null };
            lockForm(true);
            updateButtonStates();
            setStatus('Ready');
        });
    });

    // ── Sub-tabs ───────────────────────────────────────
    document.querySelectorAll('.sub-tab').forEach(tab => {
        tab.addEventListener('click', function () {
            const strip = this.closest('.tab-interface-strip');
            const body  = strip?.nextElementSibling;
            strip?.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
            body?.querySelectorAll('.sub-tab-view').forEach(v => v.classList.remove('active'));
            this.classList.add('active');
            const target = body?.querySelector('#subview-' + this.getAttribute('data-target'));
            if (target) target.classList.add('active');
        });
    });

    // ── Initial state ──────────────────────────────────
    lockForm(true);
    updateButtonStates();
    setStatus('Ready');

    // ══════════════════════════════════════════════════
    //  VIEW — Open search modal
    // ══════════════════════════════════════════════════
    document.getElementById('btnGlobalView')?.addEventListener('click', openViewModal);

    // ══════════════════════════════════════════════════
    //  ADD — Clear form, unlock for new entry
    // ══════════════════════════════════════════════════
    document.getElementById('btnGlobalAdd')?.addEventListener('click', () => {
        clearForm();
        appState.mode = 'add';
        appState.currentRecordId = null;
        lockForm(false);
        updateButtonStates();
        setStatus('New Record — Fill in all required fields, then click Save');
        document.getElementById('fApplicationId')?.focus();
    });

    // ══════════════════════════════════════════════════
    //  EDIT — Unlock loaded record for changes
    // ══════════════════════════════════════════════════
    document.getElementById('btnGlobalEdit')?.addEventListener('click', () => {
        if (!appState.currentRecordId) {
            alert('No record loaded.\n\nUse View to search and load a record first, then click Edit.');
            return;
        }
        appState.mode = 'edit';
        lockForm(false);
        // Keep Application ID read-only — it's the primary key, never change it
        const appIdField = document.getElementById('fApplicationId');
        if (appIdField) appIdField.disabled = true;
        updateButtonStates();
        setStatus('Edit Mode — Modify fields and click Save to update');
    });

    // ══════════════════════════════════════════════════
    //  SAVE — Insert (Add) or Update (Edit) to Supabase
    // ══════════════════════════════════════════════════
    document.getElementById('btnGlobalSave')?.addEventListener('click', async () => {
        if (appState.mode !== 'add' && appState.mode !== 'edit') {
            alert('Nothing to save.\n\nClick Add to create a new record, or use View + Edit to modify an existing one.');
            return;
        }

        const payload = getFormData();

        // ── Required field validation ──────────────────
        const missing = [];
        if (!payload.application_id)            missing.push('Application ID');
        if (!payload.client_id)                 missing.push('Client ID');
        if (!payload.product_id)                missing.push('Product ID');
        if (!payload.main_repayment_account_id) missing.push('Main Repayment AccID');
        if (!payload.applied_amount)            missing.push('Loan Amount');
        if (!payload.term_months)               missing.push('Term');
        if (!payload.interest_rate && payload.interest_rate !== 0) missing.push('Interest Rate');

        if (missing.length > 0) {
            alert('⚠️  Required fields are missing:\n\n• ' + missing.join('\n• ') + '\n\nPlease fill in all required fields before saving.');
            return;
        }

        setStatus('Saving to database...');

        try {
            let result;

            if (appState.mode === 'add') {
                payload.created_on  = new Date().toISOString();
                payload.modified_on = new Date().toISOString();
                result = await db.from(TABLE).insert([payload]).select();
            } else {
                // Edit — update by primary key
                payload.modified_on = new Date().toISOString();
                // Remove PK from update payload — never update the PK column itself
                const { application_id, ...updatePayload } = payload;
                result = await db.from(TABLE).update(updatePayload)
                    .eq('application_id', appState.currentRecordId)
                    .select();
            }

            const { data, error } = result;
            if (error) throw error;

            if (data && data.length > 0) {
                populateForm(data[0]);
            }

            appState.mode = 'view';
            lockForm(true);
            updateButtonStates();
            setStatus('Saved — ' + payload.application_id);
            alert('✅  Record saved successfully!\n\nApplication ID: ' + payload.application_id);

        } catch (err) {
            setStatus('Save failed');
            console.error('Save error:', err);
            let hint = err.message;
            if (err.message.includes('duplicate') || err.message.includes('unique'))
                hint += '\n\nHint: Application ID "' + payload.application_id + '" already exists. Use a unique ID.';
            if (err.message.includes('foreign key'))
                hint += '\n\nHint: Branch ID or Client ID does not exist in the reference tables.';
            alert('❌  Save failed!\n\n' + hint);
        }
    });

    // ══════════════════════════════════════════════════
    //  DELETE — Permanently remove the loaded record
    // ══════════════════════════════════════════════════
    document.getElementById('btnGlobalDelete')?.addEventListener('click', async () => {
        if (!appState.currentRecordId) {
            alert('No record is loaded.\n\nUse View to find and load a record first.');
            return;
        }

        const appId = appState.currentRecordId;
        const clientId = document.getElementById('fClientId')?.value || '';
        if (!confirm(
            `⚠️  Permanently delete this record?\n\n` +
            `Application ID : ${appId}\n` +
            `Client ID      : ${clientId}\n\n` +
            `This action cannot be undone.`
        )) return;

        setStatus('Deleting...');
        try {
            const { error } = await db.from(TABLE).delete().eq('application_id', appId);
            if (error) throw error;

            clearForm();
            appState = { mode: 'view', currentRecordId: null };
            lockForm(true);
            updateButtonStates();
            setStatus('Record deleted — ' + appId);
            alert('✅  Record deleted successfully.\n\nApplication ID: ' + appId);

        } catch (err) {
            setStatus('Delete failed');
            console.error('Delete error:', err);
            let hint = err.message;
            if (err.message.includes('foreign key'))
                hint += '\n\nHint: This record has linked Guarantors or Collateral entries. Delete those first.';
            alert('❌  Delete failed!\n\n' + hint);
        }
    });

    // ══════════════════════════════════════════════════
    //  CANCEL — Discard changes, re-lock form
    // ══════════════════════════════════════════════════
    document.getElementById('btnGlobalCancel')?.addEventListener('click', () => {
        const wasAdding = appState.mode === 'add';
        const msg = wasAdding
            ? 'Discard new record? All entered data will be lost.'
            : 'Cancel edits? Any unsaved changes will be lost.';

        if (!confirm(msg)) return;

        if (wasAdding) {
            clearForm();
            appState.currentRecordId = null;
        }
        // If editing, just re-lock — data already in form remains visible (read-only)
        appState.mode = 'view';
        lockForm(true);
        updateButtonStates();
        setStatus(appState.currentRecordId
            ? 'Edit cancelled — record unchanged'
            : 'Ready');
    });

    // ── Print ──────────────────────────────────────────
    document.getElementById('btnGlobalPrint')?.addEventListener('click', () => window.print());
});
