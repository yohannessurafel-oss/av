<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>AVMF — 02 Group Loan Projection</title>
<link rel="stylesheet" href="style2.css"/>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
</head>
<body>

<div class="window-container">

  <div class="title-bar">
    <div class="title-branding-block">
      <svg class="header-logo-svg" viewBox="0 0 100 100">
        <path d="M25,35 C30,20 45,15 65,18 C75,20 85,28 88,38 C90,45 80,55 83,62 C85,68 92,72 90,78 C88,84 80,82 76,88 C72,94 65,88 60,82 C55,80 50,92 42,90 C30,88 35,75 28,70 C20,65 12,62 10,52 C8,42 15,38 25,35 Z" fill="#e69c24"/>
        <path d="M25,35 C30,20 45,15 65,18 C75,20 85,28 88,38 C90,45 80,55 83,62 C74,60 62,54 55,42 C50,48 44,52 38,58 Z" fill="#1b5199"/>
        <polygon points="45,45 45,35 50,35 50,45" fill="#ffffff"/>
        <polygon points="53,45 53,32 58,32 58,45" fill="#ffffff"/>
        <polygon points="61,45 61,30 66,30 66,45" fill="#ffffff"/>
        <polyline points="35,42 45,48 68,36" fill="none" stroke="#ffffff" stroke-width="2.5"/>
      </svg>
      <div class="title-text-block">
        <span class="title-main">Africa Village Microfinance</span>
        <span class="title-sub">02 — Group Loan Projection</span>
      </div>
    </div>
    <div class="title-meta">
      <span id="systemDate" class="title-date"></span>
      <span class="title-user">👤 Loan Officer</span>
    </div>
    <div class="window-controls">
      <span title="Minimize">─</span>
      <span title="Maximize">▢</span>
      <span title="Close" class="wc-close">✕</span>
    </div>
  </div>

  <div class="workspace">

    <div class="sidebar">
      <div class="sidebar-header">
        <span class="sidebar-header-icon">⚙</span>
        Credit Lifecycle Operations
      </div>
      <ul class="nav-menu">
        <li><span class="nav-num">01</span><a href="loan-application.html" class="nav-label">Loan Application</a></li>
        <li class="active"><span class="nav-num">02</span><a href="group-loan-projection.html" class="nav-label">Group Loan Projection</a></li>
        <li><span class="nav-num">03</span><a href="loan-appraisal-management.html" class="nav-label">Loan Appraisal Management</a></li>
        <li><span class="nav-num">04</span><a href="credit-sanction-console.html" class="nav-label">Credit Sanction Console</a></li>
        <li><span class="nav-num">05</span><a href="loan-account-maintenance.html" class="nav-label">Loan Account Maintenance</a></li>
        <li><span class="nav-num">06</span><a href="collateral-inventory-risk.html" class="nav-label">Collateral Inventory Risk</a></li>
        <li><span class="nav-num">07</span><a href="guarantor-asset-registry.html" class="nav-label">Guarantor Asset Registry</a></li>
        <li><span class="nav-num">08</span><a href="teller-cash-vault-control.html" class="nav-label">Teller Cash Vault Control</a></li>
        <li><span class="nav-num">09</span><a href="settlement-early-payoff.html" class="nav-label">Settlement / Early Payoff</a></li>
      </ul>
      <div class="sidebar-footer-brand">
        <svg viewBox="0 0 100 100" width="28" height="28">
          <path d="M25,35 C30,20 45,15 65,18 C75,20 85,28 88,38 C90,45 80,55 83,62 C74,60 62,54 55,42 C50,48 44,52 38,58 Z" fill="#e69c24" opacity="0.7"/>
        </svg>
        <span>AVMF CBS v2.0</span>
      </div>
    </div>

    <div class="main-content">
      <div class="module-view active" id="view-group-loan">
        <div class="context-badge-bar">
          <span class="badge-icon">👥</span>
          Data Entry — Group Loan Portfolio Projection &amp; Scheduling
        </div>

        <form class="module-form grid-two-column" autocomplete="off">
          <div class="sub-column">
            <div class="form-row">
              <label>Branch ID</label>
              <select id="glpBranchId" class="width-full" style="max-width:220px;" data-always-enabled="1"></select>
              <input type="text" id="glpBranchName" class="width-remaining" placeholder="Branch name" readonly/>
            </div>
            <div class="form-row"><label>Group ID <span class="req">*</span></label><div class="input-group width-full"><input type="text" id="glpGroupId"/><span class="search-btn">🔍</span></div></div>
            <div class="form-row"><label>Group Name</label><input type="text" id="glpGroupName" class="width-full" readonly placeholder="Auto-filled"/></div>
            <div class="form-row"><label>Operational Centre</label><div class="input-group width-full"><input type="text" id="glpCentreId"/><span class="search-btn">🔍</span></div></div>
            <div class="form-row"><label>Product ID <span class="req">*</span></label><select id="glpProductId" class="width-full" data-always-enabled="1"><option value="">-- Select Product --</option></select></div>
            <div class="section-divider"></div>
            <div class="form-row"><label>Meeting Date</label><input type="date" id="glpMeetingDate" class="width-full"/></div>
            <div class="form-row"><label>Disbursement Date</label><input type="date" id="glpDisbDate" class="width-full"/></div>
            <div class="form-row"><label>Loan Purpose</label>
              <select id="glpLoanPurpose" class="width-full">
                <option>OTHER</option><option>BUSINESS EXPANSION</option>
                <option>AGRICULTURE</option><option>EDUCATION</option>
                <option>HEALTH</option><option>HOUSING</option>
              </select>
            </div>
            <div class="form-row"><label>Credit Officer</label><div class="input-group width-full"><input type="text" id="glpOfficerId"/><span class="search-btn">🔍</span></div></div>
          </div>
          <div class="sub-column">
            <div class="form-row"><label class="shifted-label">Projection Date</label><input type="date" id="glpProjectionDate" class="width-full"/></div>
            <div class="form-row"><label class="shifted-label">Currency ID</label><input type="text" id="glpCurrencyId" value="ETB" class="font-bold width-full"/></div>
            <div class="form-row"><label class="shifted-label">Interest Rate (%)</label><input type="number" id="glpInterestRate" class="text-right width-full" step="0.01"/></div>
            <div class="form-row"><label class="shifted-label">Term (Months)</label><input type="number" id="glpTerm" value="12" class="text-right width-full" min="1"/></div>
            <div class="form-row"><label class="shifted-label">Repayment Frequency</label>
              <select id="glpFrequency" class="width-full">
                <option>Monthly</option><option>Bi-Weekly</option><option>Weekly</option>
              </select>
            </div>
            <div class="form-row"><label class="shifted-label">Total Group Members</label><input type="number" id="glpMemberCount" class="text-right width-full" min="1"/></div>
            <div class="form-row"><label class="shifted-label">Total Group Loan (ETB)</label><input type="number" id="glpTotalAmount" class="text-right width-full" min="0"/></div>
            <div class="form-row"><label class="shifted-label">Avg. Per Member (ETB)</label><input type="number" id="glpAvgAmount" class="text-right width-full" readonly/></div>
            <div class="form-row"><label class="shifted-label">Projection Status</label>
              <input type="text" id="glpStatus" value="Draft" readonly class="width-full status-badge"/>
            </div>
          </div>
        </form>

        <!-- Group Members Grid -->
        <div class="grid-container margin-top-sm">
          <table class="ledger-grid" id="tblGroupMembers">
            <thead>
              <tr>
                <th>#</th>
                <th>Client ID</th>
                <th>Client Name</th>
                <th>Loan Amount (ETB)</th>
                <th>Installment (ETB)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colspan="6" class="text-center gray-text italic">No group members loaded. Enter a Group ID and click View.</td></tr>
            </tbody>
          </table>
        </div>

        <div class="sub-footer-token" id="statusBar">Status: Ready</div>
      </div>
    </div>

    <div class="action-sidebar">
      <button id="btnGlobalView"   class="action-btn">🔍 View</button>
      <button id="btnGlobalAdd"    class="action-btn">➕ Add</button>
      <button id="btnGlobalEdit"   class="action-btn">✏️ Edit</button>
      <button id="btnGlobalClose"  class="action-btn">✕ Close</button>
      <div class="sidebar-spacer"></div>
      <button id="btnGlobalSave"   class="action-btn" disabled>💾 Save</button>
      <button id="btnGlobalCancel" class="action-btn" disabled>🚫 Cancel</button>
      <button id="btnGlobalDelete" class="action-btn" style="background:linear-gradient(to bottom,#f8d0d0,#f0a0a0);border-color:#c06060;color:#7a0000;" disabled>🗑 Delete</button>
      <button id="btnGlobalPrint"  class="action-btn">🖨 Print</button>
      <div class="sidebar-footer">AVMF CBS v2.0</div>
    </div>

  </div>
</div>

<div id="toastNotification" class="toast" role="alert" aria-live="polite"></div>

<script>
  // Initialise system date
  const sdEl = document.getElementById('systemDate');
  if (sdEl) sdEl.textContent = new Date().toLocaleDateString('en-ET', { weekday:'short', year:'numeric', month:'short', day:'numeric' });
  // Placeholder: replace with group-loan-projection.js when ready
</script>
</body>
</html>
