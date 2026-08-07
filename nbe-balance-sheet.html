<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>AVMF — Balance Sheet</title>
<link rel="stylesheet" href="style2.css"/>
<style>
  .gl-filter-bar {
    display: flex; align-items: center; gap: 10px; padding: 8px 12px;
    background: var(--bg-alt, #f4f6f9); border: 1px solid var(--border, #d0d4da);
    border-radius: 4px; margin-bottom: 12px; flex-wrap: wrap;
  }
  .gl-filter-bar label { font-size: 11px; font-weight: 600; color: var(--label, #555); white-space: nowrap; }
  .gl-filter-bar input, .gl-filter-bar select {
    font-size: 12px; padding: 3px 7px; border: 1px solid var(--border, #c8cdd5);
    border-radius: 3px; height: 26px;
  }
  .gl-filter-bar input[type="date"] { width: 130px; }
  .gl-filter-bar input[type="number"] { width: 80px; }
  .gl-filter-bar select { width: 130px; }
  .table-scroll { max-height: 520px; overflow-y: auto; }
  #bsTable th, #bsTable td { font-size: 11.5px; }
  #bsTable td.num { text-align: right; font-family: monospace; }
  .bs-row-section td:first-child { font-weight: 700; text-transform: uppercase; color: var(--navy-700, #1b5199); }
  .bs-row-header td:first-child { font-weight: 700; }
  .bs-row-leaf td:first-child { color: var(--text-dark, #0d2a4a); }
  .bs-final-total { border-top: 2px solid var(--navy-900, #0d2a4a); font-weight: 700; background: #f4f6f9; }
  #balanceCheck { margin-top: 12px; padding: 10px 14px; border-radius: 6px; font-size: 12.5px; font-weight: 600; display: none; }
</style>
</head>
<body>

<div class="desktop-backdrop">
  <iframe src="indexll.html" title="AVMF Dashboard"></iframe>
</div>

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
        <span class="title-sub">Balance Sheet</span>
      </div>
    </div>
    <div class="title-meta">
      <span id="systemDate" class="title-date"></span>
    </div>
    <div class="window-controls">
      <span title="Close" class="wc-close" onclick="window.location='nbe-reports.html'">✕</span>
    </div>
  </div>

  <div class="workspace">
    <div class="sidebar">
      <div class="sidebar-header" style="cursor:pointer; background: var(--navy-900);" onclick="window.location='nbe-reports.html'">
        📊 NBE Reports
      </div>
      <div class="sidebar-footer-brand">
        <svg viewBox="0 0 100 100" width="28" height="28">
          <path d="M25,35 C30,20 45,15 65,18 C75,20 85,28 88,38 C90,45 80,55 83,62 C74,60 62,54 55,42 C50,48 44,52 38,58 Z" fill="#e69c24" opacity="0.7"/>
        </svg>
        <span>AVMF CBS v2.0</span>
      </div>
    </div>

    <div class="main-content">
      <div class="module-view active">
        <div class="context-badge-bar">
          <span class="badge-icon">🏢</span>
          Balance Sheet — <span id="bsPeriodLabel">snapshot of financial position, computed live from the GL journal</span>
        </div>

        <div class="gl-filter-bar">
          <label>Period</label>
          <select id="fType">
            <option value="month">Month</option>
            <option value="annual">Annual</option>
            <option value="custom">Custom Range</option>
          </select>
          <span id="monthGroup" style="display:flex; gap:10px; align-items:center;">
            <label>Month</label><select id="fMonth"></select>
          </span>
          <span id="yearGroup" style="display:flex; gap:10px; align-items:center;">
            <label>Year</label><input type="number" id="fYear"/>
          </span>
          <span id="customGroup" style="display:none; gap:10px; align-items:center;">
            <label>From</label><input type="date" id="fFrom"/>
            <label>To</label><input type="date" id="fTo"/>
          </span>
          <button id="btnRun" class="action-btn" style="width:auto;padding:0 14px;height:26px;font-size:12px;">▶ Run Report</button>
          <button id="btnExport" class="action-btn" style="width:auto;padding:0 14px;height:26px;font-size:12px;">⬇ Export CSV</button>
        </div>

        <div class="table-scroll">
          <table class="ledger-grid" id="bsTable">
            <thead>
              <tr>
                <th>Account</th>
                <th>Side</th>
                <th>Acc No</th>
                <th class="text-right">Beg Balance</th>
                <th class="text-right">Period Debits</th>
                <th class="text-right">Period Credits</th>
                <th class="text-right">Ending Balance</th>
              </tr>
            </thead>
            <tbody id="tbodyBS">
              <tr><td colspan="7" class="text-center gray-text italic">Select a period and click Run Report.</td></tr>
            </tbody>
          </table>
        </div>

        <div id="balanceCheck"></div>

        <div class="sub-footer-token" id="statusBar" style="margin:16px 0 0;"></div>
      </div>
    </div>

    <div class="action-sidebar">
      <div class="sidebar-footer">AVMF CBS v2.0</div>
    </div>
  </div>
</div>

<script src="nbe-balance-sheet.js"></script>
</body>
</html>
