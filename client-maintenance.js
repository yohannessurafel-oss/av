/* ─────────────────────────────────────────────────────────
   Client Maintenance – client-maintenance.js
   Africa Village Microfinance CBS
   ───────────────────────────────────────────────────────── */

// ── Supabase Config ──────────────────────────────────────
const SUPABASE_URL      = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';

async function sbFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': options.prefer || 'return=representation',
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    let msg = 'HTTP ' + res.status;
    try { const j = JSON.parse(errText); msg = j.message || j.hint || j.details || msg; } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  const body = await res.text();
  if (!body || !body.trim()) return null;
  try { return JSON.parse(body); } catch { return null; }
}

// ── State ────────────────────────────────────────────────
let mode = 'view'; // 'view' | 'add' | 'edit'
let currentRecord = null;
let allRecords = [];
let currentIndex = -1;

// ── System Date ──────────────────────────────────────────
(function initDate() {
  const el = document.getElementById('systemDate');
  if (el) el.textContent = new Date().toLocaleDateString('en-ET', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
  });
})();

// ── DOM refs ─────────────────────────────────────────────
const btnView   = document.getElementById('btnView');
const btnAdd    = document.getElementById('btnAdd');
const btnEdit   = document.getElementById('btnEdit');
const btnSave   = document.getElementById('btnSave');
const btnCancel = document.getElementById('btnCancel');
const btnClose  = document.getElementById('btnClose');
const btnPrev   = document.getElementById('btnPrev');
const btnNext   = document.getElementById('btnNext');
const _toastEl  = document.getElementById('toastNotification');
let _toastTimer = null;

// ── Toast ────────────────────────────────────────────────
function showToast(msg, type = '', duration = 3200) {
  _toastEl.textContent = msg;
  _toastEl.className = `toast show ${type}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { _toastEl.className = 'toast'; }, duration);
}

// ── Tabs ─────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// ── Form helpers ─────────────────────────────────────────
function getAllInputs() {
  return document.querySelectorAll(
    '.tab-panel input:not([readonly]):not([type="radio"]):not([type="checkbox"]), ' +
    '.tab-panel select, .tab-panel textarea'
  );
}

function setFormEnabled(enabled) {
  getAllInputs().forEach(el => el.disabled = !enabled);
  // Radio and checkbox controls need separate handling
  document.querySelectorAll('.tab-panel input[type="radio"], .tab-panel input[type="checkbox"]')
    .forEach(el => el.disabled = !enabled);
  // clientName is always readonly (auto-computed)
  document.getElementById('clientName').disabled = true;
}

function clearForm() {
  getAllInputs().forEach(el => {
    if (el.type === 'checkbox') el.checked = false;
    else el.value = '';
  });
  document.getElementById('clientId').value = '';
  document.getElementById('applicationId').value = '';
  document.getElementById('clientName').value = '';
  document.getElementById('clientType').value = 'Individual Client';
  document.getElementById('baseId').value = '';

  const defaultRadio = document.querySelector('[name="empType"][value="salaried"]');
  if (defaultRadio) defaultRadio.checked = true;
  clearBTS();
}

function clearBTS() {
  document.querySelectorAll('.bts-field input').forEach(el => el.value = '');
}

function setMode(m) {
  mode = m;
  const isEdit = m === 'edit' || m === 'add';
  setFormEnabled(isEdit);
  // clientId: editable only in add mode
  document.getElementById('clientId').disabled = m !== 'add';
  // Identity bar fields always editable in add/edit
  ['clientType', 'applicationId', 'baseId'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !isEdit;
  });

  btnSave.disabled   = !isEdit;
  btnCancel.disabled = !isEdit;
  btnAdd.disabled    = isEdit;
  btnEdit.disabled   = isEdit || !currentRecord;
  btnView.disabled   = false;

  // Update status bar
  const sb = document.getElementById('statusBar');
  if (sb) sb.textContent = `Mode: ${m.charAt(0).toUpperCase() + m.slice(1)}${currentRecord ? ' — ' + (currentRecord.client_id || '') + (currentRecord.client_name ? ' | ' + currentRecord.client_name : '') : ''}`;

  updateNavArrows();
}

function updateNavArrows() {
  btnPrev.disabled = currentIndex <= 0;
  btnNext.disabled = currentIndex < 0 || currentIndex >= allRecords.length - 1;
}

// ── Auto-fill Client Name from first/middle/last ─────────
function syncClientName() {
  const first  = document.querySelector('[name="firstName"]')?.value?.trim() || '';
  const middle = document.querySelector('[name="middleName"]')?.value?.trim() || '';
  const last   = document.querySelector('[name="lastName"]')?.value?.trim() || '';
  document.getElementById('clientName').value = [first, middle, last].filter(Boolean).join(' ');
}
['firstName','middleName','lastName'].forEach(n => {
  const el = document.querySelector(`[name="${n}"]`);
  if (el) el.addEventListener('input', syncClientName);
});

// ── Record → Form ─────────────────────────────────────────
function populateForm(rec) {
  if (!rec) return;
  const set = (name, val) => {
    const el = document.querySelector(`[name="${name}"]`);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = !!val;
    else el.value = val ?? '';
  };

  document.getElementById('clientId').value      = rec.client_id ?? '';
  document.getElementById('applicationId').value = rec.application_id ?? '';
  document.getElementById('clientName').value    = rec.client_name ?? '';
  document.getElementById('clientType').value    = rec.client_type ?? 'Individual Client';
  document.getElementById('baseId').value        = rec.base_id ?? '';

  // Personal
  set('title', rec.title);
  set('firstName', rec.first_name);
  set('middleName', rec.middle_name);
  set('lastName', rec.last_name);
  set('gender', rec.gender);
  set('nationality', rec.nationality);
  set('resident', rec.resident);
  set('idType', rec.id_type);
  set('issuedBy', rec.issued_by);
  set('idNo', rec.id_no);
  set('literacyLevel', rec.literacy_level);
  set('maritalStatus', rec.marital_status);
  set('houseMembers', rec.house_members);
  set('children', rec.children);
  set('dependents', rec.dependents);
  set('bloodGroup', rec.blood_group);
  set('canDonate', rec.can_donate);
  set('openedBy', rec.opened_by);
  set('openedOn', rec.opened_on);
  set('ageAsOn', rec.age_as_on);
  set('relManager', rec.relationship_manager);
  set('age', rec.age);

  if (rec.date_of_birth) {
    const [y, m, d] = rec.date_of_birth.split('-');
    set('dobDay', +d); set('dobMonth', +m); set('dobYear', +y);
  } else {
    set('dobDay', ''); set('dobMonth', ''); set('dobYear', '');
  }
  if (rec.id_expiry_date) {
    const [y, m, d] = rec.id_expiry_date.split('-');
    set('idExpiryDay', +d); set('idExpiryMonth', +m); set('idExpiryYear', +y);
  } else {
    set('idExpiryDay', ''); set('idExpiryMonth', ''); set('idExpiryYear', '');
  }

  // Address
  set('addressType', rec.address_type);
  set('postalAddress', rec.postal_address);
  set('physicalAddress', rec.physical_address);
  set('city', rec.city);
  set('zipCode', rec.zip_code);
  set('country', rec.country);
  set('phoneHome', rec.phone_home);
  set('phoneWork', rec.phone_work);
  set('mobile', rec.mobile);
  set('faxNo', rec.fax_no);
  set('email', rec.email);

  // Employment
  set('occupation', rec.occupation);
  set('designation', rec.designation);
  set('companyType', rec.company_type);
  set('workingSince', rec.working_since);
  set('companyName', rec.company_name);
  set('employerCode', rec.employer_code);
  set('employeeNo', rec.employee_no);
  set('grossIncome', rec.gross_income);
  set('rentExpenses', rec.rent_expenses);
  set('familyIncome', rec.family_income);
  set('otherExpenses', rec.other_expenses);
  set('otherIncome', rec.other_income);

  if (rec.employment_type) {
    const val = rec.employment_type === 'Salaried' ? 'salaried' : 'selfEmployed';
    const radio = document.querySelector(`[name="empType"][value="${val}"]`);
    if (radio) radio.checked = true;
  }
  computeEmploymentTotals();

  // Special Offers
  set('offerType', rec.offer_type);
  set('offerCode', rec.offer_code);
  set('validFrom', rec.valid_from);
  set('validTo', rec.valid_to);
  set('remarks', rec.remarks);

  populateBTS(rec);
}

function populateBTS(rec) {
  const labelMap = {
    'status':        rec.status,
    'open date':     rec.open_date,
    'closed date':   rec.closed_date,
    'created by':    rec.created_by,
    'modified by':   rec.modified_by,
    'supervised by': rec.supervised_by,
    'created on':    rec.created_on,
    'modified on':   rec.modified_on,
    'supervised on': rec.supervised_on,
  };
  document.querySelectorAll('.bts-field').forEach(field => {
    const labelText = field.querySelector('label')?.textContent?.trim().toLowerCase();
    const input = field.querySelector('input');
    if (!input || !labelText) return;
    input.value = labelMap[labelText] ?? '';
  });
}

// ── Form → Record ─────────────────────────────────────────
function collectForm() {
  const get = (name) => {
    const el = document.querySelector(`[name="${name}"]`);
    if (!el) return null;
    if (el.type === 'checkbox') return el.checked;
    return el.value.trim() === '' ? null : el.value.trim();
  };

  return {
    client_id:      document.getElementById('clientId').value.trim() || null,
    application_id: document.getElementById('applicationId').value.trim() || null,
    client_name:    document.getElementById('clientName').value.trim() || null,
    client_type:    document.getElementById('clientType').value || 'Individual Client',
    base_id:        document.getElementById('baseId').value || null,
    // Personal
    title: get('title'), first_name: get('firstName'), middle_name: get('middleName'),
    last_name: get('lastName'), gender: get('gender'), nationality: get('nationality'),
    resident: get('resident'), id_type: get('idType'), issued_by: get('issuedBy'),
    id_no: get('idNo'), literacy_level: get('literacyLevel'),
    marital_status: get('maritalStatus'),
    house_members: get('houseMembers') ? +get('houseMembers') : null,
    children:      get('children')     ? +get('children')     : null,
    dependents:    get('dependents')   ? +get('dependents')   : null,
    blood_group: get('bloodGroup'),
    can_donate: (() => { const v = get('canDonate'); return v === 'Yes' ? true : v === 'No' ? false : null; })(),
    opened_by: get('openedBy'), opened_on: get('openedOn') || null,
    age_as_on: get('ageAsOn') || null,
    relationship_manager: get('relManager') || null,
    age: get('age') ? +get('age') : null,
    date_of_birth: (() => {
      const d = get('dobDay'), m = get('dobMonth'), y = get('dobYear');
      return (d && m && y) ? `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}` : null;
    })(),
    id_expiry_date: (() => {
      const d = get('idExpiryDay'), m = get('idExpiryMonth'), y = get('idExpiryYear');
      return (d && m && y) ? `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}` : null;
    })(),
    employment_type: (() => {
      const r = document.querySelector('[name="empType"]:checked');
      return r ? (r.value === 'salaried' ? 'Salaried' : 'Self Employed') : null;
    })(),
    // Address
    address_type: get('addressType'), postal_address: get('postalAddress'),
    physical_address: get('physicalAddress'), city: get('city'),
    zip_code: get('zipCode'), country: get('country'),
    region: get('region'), zone: get('zone'), kebele: get('kebele'),
    house_no: get('houseNo'), po_box: get('poBox'),
    phone_home: get('phoneHome'), phone_work: get('phoneWork'),
    mobile: get('mobile'), fax_no: get('faxNo'), email: get('email'),
    // Employment
    occupation: get('occupation'), designation: get('designation'),
    company_type: get('companyType'), working_since: get('workingSince'),
    company_name: get('companyName'), employer_code: get('employerCode'),
    employee_no: get('employeeNo'),
    gross_income:   get('grossIncome')   ? +get('grossIncome')   : null,
    rent_expenses:  get('rentExpenses')  ? +get('rentExpenses')  : null,
    family_income:  get('familyIncome')  ? +get('familyIncome')  : null,
    other_expenses: get('otherExpenses') ? +get('otherExpenses') : null,
    other_income:   get('otherIncome')   ? +get('otherIncome')   : null,
    // Special Offers
    offer_type: get('offerType'), offer_code: get('offerCode'),
    valid_from: get('validFrom'), valid_to: get('validTo'),
    remarks: get('remarks'),
  };
}

// ── Employment auto-compute ───────────────────────────────
function computeEmploymentTotals() {
  const g = (n) => +document.querySelector(`[name="${n}"]`)?.value || 0;
  const totalExp = g('rentExpenses') + g('otherExpenses');
  const totalInc = g('grossIncome') + g('familyIncome') + g('otherIncome');
  const net = totalInc - totalExp;
  const setV = (n, v) => { const el = document.querySelector(`[name="${n}"]`); if (el) el.value = v || ''; };
  setV('totalExpenses', totalExp || '');
  setV('totalIncome',   totalInc || '');
  setV('netSavings',    net !== 0 ? net.toFixed(2) : '');
}
['grossIncome','familyIncome','otherIncome','rentExpenses','otherExpenses'].forEach(n => {
  const el = document.querySelector(`[name="${n}"]`);
  if (el) el.addEventListener('input', computeEmploymentTotals);
});

// ── Personal dropdowns ────────────────────────────────────
function initPersonalDropdowns() {
  const daySelectors   = document.querySelectorAll('[name="dobDay"], [name="idExpiryDay"]');
  const monthSelectors = document.querySelectorAll('[name="dobMonth"], [name="idExpiryMonth"]');
  const dobYearSel     = document.querySelector('[name="dobYear"]');
  const expiryYearSel  = document.querySelector('[name="idExpiryYear"]');

  daySelectors.forEach(sel => {
    for (let i = 1; i <= 31; i++) {
      const opt = document.createElement('option');
      opt.value = i; opt.textContent = String(i).padStart(2, '0');
      sel.appendChild(opt);
    }
  });

  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  monthSelectors.forEach(sel => {
    months.forEach((m, idx) => {
      const opt = document.createElement('option');
      opt.value = idx + 1; opt.textContent = m;
      sel.appendChild(opt);
    });
  });

  const curYear = new Date().getFullYear();
  if (dobYearSel) {
    for (let y = curYear; y >= curYear - 100; y--) {
      const opt = document.createElement('option');
      opt.value = y; opt.textContent = y;
      dobYearSel.appendChild(opt);
    }
  }
  if (expiryYearSel) {
    for (let y = curYear - 5; y <= curYear + 25; y++) {
      const opt = document.createElement('option');
      opt.value = y; opt.textContent = y;
      expiryYearSel.appendChild(opt);
    }
  }

  // Working Since year dropdown
  const wsSel = document.querySelector('[name="workingSince"]');
  if (wsSel) {
    for (let y = curYear; y >= curYear - 50; y--) {
      const opt = document.createElement('option');
      opt.value = y; opt.textContent = y;
      wsSel.appendChild(opt);
    }
  }
}

function calculateLiveAge() {
  const day = document.querySelector('[name="dobDay"]')?.value;
  const mon = document.querySelector('[name="dobMonth"]')?.value;
  const yr  = document.querySelector('[name="dobYear"]')?.value;
  const ageInput = document.querySelector('[name="age"]');
  if (!day || !mon || !yr) { if (ageInput) ageInput.value = ''; return; }
  const birth = new Date(parseInt(yr), parseInt(mon) - 1, parseInt(day));
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() ||
     (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
  if (ageInput) ageInput.value = age >= 0 ? age : 0;
}
['dobDay','dobMonth','dobYear'].forEach(name => {
  const el = document.querySelector(`[name="${name}"]`);
  if (el) el.addEventListener('change', calculateLiveAge);
});

// ── Load branches from BranchRegistry ────────────────────
async function loadBranches() {
  try {
    const data = await sbFetch('branchregistry?select=branch_id,branch_name&order=branch_name');
    const sel = document.getElementById('baseId');
    if (!sel || !data) return;
    // keep the default "– Select –" option
    data.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.branch_id;
      opt.textContent = b.branch_name || b.branch_id;
      sel.appendChild(opt);
    });
  } catch (e) {
    // Silently fail — branches will fall back to empty list; form still works
    console.warn('Branch load failed:', e.message);
  }
}

// ── CRUD Operations ───────────────────────────────────────
async function loadAllRecords() {
  try {
    const data = await sbFetch('ClientMasterRecords?order=client_id.asc');
    allRecords = data || [];
  } catch (e) {
    allRecords = [];
  }
}

async function loadRecord(clientId) {
  try {
    // Reload full list for Prev/Next navigation
    await loadAllRecords();
    const idx = allRecords.findIndex(r => r.client_id === clientId);
    if (idx >= 0) {
      currentIndex = idx;
      currentRecord = allRecords[idx];
      populateForm(currentRecord);
      setMode('view');
      showToast(`Loaded: ${currentRecord.client_name || clientId}`, 'success');
      updateRecentsList(currentRecord);
    } else {
      // Try direct fetch if not in cache
      const data = await sbFetch(`ClientMasterRecords?client_id=eq.${encodeURIComponent(clientId)}&limit=1`);
      if (data && data.length) {
        currentRecord = data[0];
        currentIndex = -1;
        populateForm(currentRecord);
        setMode('view');
        showToast(`Loaded: ${currentRecord.client_name || clientId}`, 'success');
        updateRecentsList(currentRecord);
      } else {
        showToast('No record found for that Client ID.', 'error');
      }
    }
  } catch (e) {
    showToast(`Error: ${e.message}`, 'error');
  }
}

// ── Recent activity sidebar ───────────────────────────────
const recentIds = [];
function updateRecentsList(rec) {
  if (!rec?.client_id) return;
  const exists = recentIds.indexOf(rec.client_id);
  if (exists >= 0) recentIds.splice(exists, 1);
  recentIds.unshift(rec.client_id);
  if (recentIds.length > 2) recentIds.length = 2;
  ['recent1','recent2'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = recentIds[i] || '';
    el.style.display = recentIds[i] ? '' : 'none';
    if (recentIds[i]) {
      el.onclick = (e) => { e.preventDefault(); loadRecord(recentIds[i]); };
    }
  });
}

// ── Required field validation ─────────────────────────────
const REQUIRED_FIELDS = [
  { key: 'first_name',    label: 'First Name',          name: 'firstName',   tab: 'personal'   },
  { key: 'middle_name',   label: 'Middle Name',         name: 'middleName',  tab: 'personal'   },
  { key: 'last_name',     label: 'Last Name',           name: 'lastName',    tab: 'personal'   },
  { key: 'date_of_birth', label: 'Date of Birth',       name: 'dobDay',      tab: 'personal'   },
  { key: 'resident',      label: 'Resident',            name: 'resident',    tab: 'personal'   },
  { key: 'id_type',       label: 'Identification Type', name: 'idType',      tab: 'personal'   },
  { key: 'id_expiry_date',label: 'ID Expiry Date',      name: 'idExpiryDay', tab: 'personal'   },
  { key: 'city',          label: 'City',                name: 'city',        tab: 'address'    },
  { key: 'country',       label: 'Country',             name: 'country',     tab: 'address'    },
  { key: 'phone_work',    label: 'Phone (Work)',        name: 'phoneWork',   tab: 'address'    },
  { key: 'mobile',        label: 'Mobile',              name: 'mobile',      tab: 'address'    },
  { key: 'occupation',    label: 'Occupation',          name: 'occupation',  tab: 'employment' },
];

function validateForm(payload) {
  document.querySelectorAll('.field-error').forEach(el => el.classList.remove('field-error'));
  const errors = [];
  REQUIRED_FIELDS.forEach(({ key, label, name, tab }) => {
    if (!payload[key] && payload[key] !== 0) {
      errors.push({ label, name, tab });
      const el = document.querySelector(`[name="${name}"]`);
      if (el) el.classList.add('field-error');
    }
  });
  return errors;
}

REQUIRED_FIELDS.forEach(({ name }) => {
  const el = document.querySelector(`[name="${name}"]`);
  if (el) {
    el.addEventListener('change', () => el.classList.remove('field-error'));
    el.addEventListener('input',  () => el.classList.remove('field-error'));
  }
});

async function saveRecord() {
  const payload = collectForm();

  const errors = validateForm(payload);
  if (errors.length > 0) {
    const firstTab = errors[0].tab;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    const tabBtn = document.querySelector(`.tab[data-tab="${firstTab}"]`);
    if (tabBtn) tabBtn.classList.add('active');
    const tabPanel = document.getElementById(`tab-${firstTab}`);
    if (tabPanel) tabPanel.classList.add('active');
    showToast(`Required: ${errors.map(e => e.label).join(', ')}`, 'error');
    return;
  }

  // total_income/expenses/net_savings are DEFAULT computed cols — let DB recalculate them
  delete payload.total_income;
  delete payload.total_expenses;
  delete payload.net_savings;

  // Remove nulls/empty to avoid overwriting with blanks
  Object.keys(payload).forEach(key => {
    if (payload[key] === '' || payload[key] === null || payload[key] === undefined) {
      delete payload[key];
    }
  });

  try {
    if (mode === 'add') {
      // Generate unique Client ID using timestamp + random suffix (collision-safe)
      payload.client_id = 'CLI-' + Date.now().toString(36).toUpperCase().slice(-5) +
                          Math.random().toString(36).slice(2,5).toUpperCase();
      delete payload.application_id;
      showToast('Creating new client…');
      const data = await sbFetch('ClientMasterRecords', {
        method: 'POST',
        body: JSON.stringify(payload),
        prefer: 'return=representation'
      });
      currentRecord = Array.isArray(data) ? data[0] : data;
      if (currentRecord) {
        await loadAllRecords();
        currentIndex = allRecords.findIndex(r => r.client_id === currentRecord.client_id);
        updateRecentsList(currentRecord);
      }
      showToast('Client saved successfully.', 'success');
    } else {
      if (!currentRecord?.client_id) {
        showToast('Cannot update: no record loaded.', 'error');
        return;
      }
      const updatePayload = { ...payload };
      delete updatePayload.client_id;
      showToast('Updating client…');
      await sbFetch(`ClientMasterRecords?client_id=eq.${encodeURIComponent(currentRecord.client_id)}`, {
        method: 'PATCH',
        body: JSON.stringify(updatePayload),
        prefer: 'return=representation'
      });
      currentRecord = { ...currentRecord, ...payload };
      // Sync in allRecords array
      if (currentIndex >= 0) allRecords[currentIndex] = currentRecord;
      showToast('Client updated successfully.', 'success');
    }
    populateForm(currentRecord);
    setMode('view');
  } catch (e) {
    console.error('Save error:', e);
    showToast(`Save failed: ${e.message}`, 'error');
  }
}

// ── Toolbar Button Events ─────────────────────────────────
btnView.addEventListener('click', async () => {
  const cid = document.getElementById('clientId').value.trim();
  if (!cid) { showToast('Enter a Client ID to view.', 'error'); return; }
  await loadRecord(cid);
});

btnAdd.addEventListener('click', () => {
  clearForm();
  currentRecord = null;
  currentIndex = -1;
  setMode('add');
  document.querySelector('[name="firstName"]')?.focus();
  showToast('Form ready. Fill in the details then click Save.');
});

btnEdit.addEventListener('click', () => {
  if (!currentRecord) { showToast('Load a record first before editing.', 'error'); return; }
  setMode('edit');
  showToast('Form unlocked. Make your changes then Save.');
});

btnSave.addEventListener('click', saveRecord);

btnCancel.addEventListener('click', () => {
  if (currentRecord) {
    populateForm(currentRecord);
    setMode('view');
    showToast('Changes discarded.');
  } else {
    clearForm();
    setMode('view');
    showToast('Cancelled.');
  }
});

// Close (X in window header) — clear and reset
btnClose.addEventListener('click', () => {
  clearForm();
  currentRecord = null;
  currentIndex = -1;
  setMode('view');
  showToast('Record closed.');
});

btnPrev.addEventListener('click', () => {
  if (currentIndex > 0) {
    currentIndex--;
    currentRecord = allRecords[currentIndex];
    populateForm(currentRecord);
    updateNavArrows();
  }
});
btnNext.addEventListener('click', () => {
  if (currentIndex < allRecords.length - 1) {
    currentIndex++;
    currentRecord = allRecords[currentIndex];
    populateForm(currentRecord);
    updateNavArrows();
  }
});

// Lookup by Client ID
document.getElementById('lookupClientId')?.addEventListener('click', async () => {
  const cid = document.getElementById('clientId').value.trim();
  if (!cid) { showToast('Enter a Client ID.', 'error'); return; }
  await loadRecord(cid);
});

// Lookup by Application ID
document.getElementById('lookupAppId')?.addEventListener('click', async () => {
  const aid = document.getElementById('applicationId').value.trim();
  if (!aid) { showToast('Enter an Application ID.', 'error'); return; }
  try {
    const data = await sbFetch(`ClientMasterRecords?application_id=eq.${encodeURIComponent(aid)}&limit=1`);
    if (data && data.length) {
      await loadRecord(data[0].client_id);
    } else {
      showToast('No record found for that Application ID.', 'error');
    }
  } catch (e) {
    showToast(`Error: ${e.message}`, 'error');
  }
});

// ── Delete ────────────────────────────────────────────────
document.getElementById('btnDelete')?.addEventListener('click', async () => {
  if (!currentRecord?.client_id) {
    showToast('Load a record first before deleting.', 'error');
    return;
  }
  const name = currentRecord.client_name || currentRecord.client_id;
  if (!confirm(`Permanently delete client "${name}"?\n\nThis cannot be undone.`)) return;
  try {
    await sbFetch(
      `ClientMasterRecords?client_id=eq.${encodeURIComponent(currentRecord.client_id)}`,
      { method: 'DELETE', prefer: 'return=minimal' }
    );
    showToast(`Client ${currentRecord.client_id} deleted.`, 'success');
    clearForm();
    currentRecord = null;
    currentIndex  = -1;
    await loadAllRecords();
    setMode('view');
  } catch (e) {
    showToast(`Delete failed: ${e.message}`, 'error');
  }
});

// ── Init ─────────────────────────────────────────────────
initPersonalDropdowns();
loadBranches();
loadAllRecords();
setMode('view');
setFormEnabled(false);

// Hide recents initially
['recent1','recent2'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
});
