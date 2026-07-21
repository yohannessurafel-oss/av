/* ============================================================================
   system-file-directory.js
   For every module registered in modules-registry.js, actually checks (via
   HEAD request, same-origin — no GitHub API, no rate limits, works reliably
   for every visitor) whether its .html and matching .js file are really
   present on the server, not just listed in the dashboard. This is the
   difference between "16 modules are registered" and "16 modules are
   actually deployed" — the same distinction that mattered when we found
   loan-repayment-collection.html sitting built but never linked, or
   admin.js sitting linked but never actually used.
   ============================================================================ */

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

async function fileExists(path) {
  try {
    const res = await fetch(path, { method: 'HEAD', cache: 'no-store' });
    return res.ok;
  } catch (e) {
    return false;
  }
}

async function scanAll() {
  const tbody = document.getElementById('tbodyDirectory');
  const sb = document.getElementById('statusBar');
  tbody.innerHTML = '';

  let htmlOk = 0, jsOk = 0, missing = 0;
  const rows = [];

  for (const m of MODULES) {
    const htmlPath = m.path;
    const jsPath = htmlPath.replace(/\.html$/, '.js');

    const [htmlFound, jsFound] = await Promise.all([
      fileExists(htmlPath),
      fileExists(jsPath)
    ]);

    if (htmlFound) htmlOk++; else missing++;
    if (jsFound) jsOk++;

    let note = '';
    if (!htmlFound) {
      note = '🔴 HTML file not found — registered on dashboard but missing on server';
    } else if (!jsFound) {
      note = '🟡 No matching .js file — may be intentional if this page has no separate script';
    } else {
      note = '✅ Verified';
    }

    rows.push({ m, htmlFound, jsFound, note });
  }

  tbody.innerHTML = rows.map(({ m, htmlFound, jsFound, note }) => `
    <tr>
      <td>${escapeHtml(m.num)}</td>
      <td>${m.icon || ''} ${escapeHtml(m.name)}</td>
      <td>${escapeHtml(m.cat)}</td>
      <td>${htmlFound ? '✅' : '🔴'} <code>${escapeHtml(m.path)}</code></td>
      <td>${jsFound ? '✅' : '⚪'} <code>${escapeHtml(m.path.replace(/\.html$/, '.js'))}</code></td>
      <td>${note}</td>
    </tr>
  `).join('');

  document.getElementById('countModules').textContent = MODULES.length;
  document.getElementById('countHtmlOk').textContent = htmlOk;
  document.getElementById('countJsOk').textContent = jsOk;
  document.getElementById('countMissing').textContent = missing;

  sb.textContent = missing > 0
    ? `Scan complete — ${missing} module(s) have a missing HTML file. See rows marked 🔴 above.`
    : `Scan complete — all ${MODULES.length} registered modules have their HTML file present.`;
}

document.getElementById('btnRescan')?.addEventListener('click', scanAll);
document.addEventListener('DOMContentLoaded', scanAll);
