/* ─────────────────────────────────────────────────────────
   Client Maintenance – client-maintenance.js
   Africa Village Microfinance CBS
   ───────────────────────────────────────────────────────── */

// ── Supabase Config ──────────────────────────────────────
const SUPABASE_URL = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY'; // replace with your anon key

async function sbFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': options.prefer || 'return=representation',
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

// ── State ────────────────────────────────────────────────
let mode = 'view'; // 'view' | 'add' | 'edit'
let currentRecord = null;
let allRecords = [];
let currentIndex = -1;

// ── DOM refs ─────────────────────────────────────────────
const btnView   = document.getElementById('btnView');
const btnAdd    = document.getElementById('btnAdd');
const btnEdit   = document.getElementById('btnEdit');
const btnSave   = document.getElementById('btnSave');
const btnCancel = document.getElementById('btnCancel');
const btnClose  = document.getElementById('btnClose');
const btnPrev   = document.getElementById('btnPrev');
const btnNext   = document.getElementById('btnNext');
const toast     = document.getElementById('toast');

// ── Toast ────────────────────────────────────────────────
function showToast(msg, type = '') {
  toast.textContent = msg;
  toast.className = `toast show ${type}`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.className = 'toast', 3000);
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
  return document.querySelectorAll('.tab-panel input:not([readonly]), .tab-panel select, .tab-panel textarea');
}

function setFormEnabled(enabled) {
  getAllInputs().forEach(el => el.disabled = !enabled);
}

function clearForm() {
  getAllInputs().forEach(el => {
    if (el.type === 'checkbox') el.checked = false;
    else if (el.type === 'radio') el.checked = el.value === 'salaried';
    else el.value = '';
  });
  document.getElementById('clientId').value = '';
  document.getElementById('applicationId').value = '';
  document.getElementById('clientName').value = '';
  document.getElementById('clientType').value = 'Individual Client';
  document.getElementById('baseId').value = '';
  clearBTS();
}

function clearBTS() {
  document.querySelectorAll('.bts-field input').forEach(el => el.value = '');
}

function setMode(m) {
  mode = m;
  const isEdit = m === 'edit' || m === 'add';
  setFormEnabled(isEdit);
  document.getElementById('clientId').disabled = m !== 'add';
  btnSave.disabled   = !isEdit;
  btnCancel.disabled = !isEdit;
  btnAdd.disabled    = isEdit;
  btnEdit.disabled   = isEdit || !currentRecord;
  btnView.disabled   = false;
}

// ── Record → Form ─────────────────────────────────────────
function populateForm(rec) {
  if (!rec) return;
  const set = (name, val) => {
    const el = document.querySelector(`[name="${name}"]`);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = !!val;
    else el.value = val ?? '';
  };

  document.getElementById('clientId').value = rec.client_id ?? '';
  document.getElementById('applicationId').value = rec.application_id ?? '';
  document.getElementById('clientName').value = rec.client_name ?? '';
  document.getElementById('clientType').value = rec.client_type ?? 'Individual Client';
  document.getElementById('baseId').value = rec.base_id ?? '';

  // Personal
  set('title', rec.title); set('firstName', rec.first_name); set('middleName', rec.middle_name);
  set('lastName', rec.last_name); set('gender', rec.gender); set('nationality', rec.nationality);
  set('resident', rec.resident); set('idType', rec.id_type); set('issuedBy', rec.issued_by);
  set('idNo', rec.id_no); set('literacyLevel', rec.literacy_level);
  set('maritalStatus', rec.marital_status); set('houseMembers', rec.house_members);
  set('children', rec.children); set('dependents', rec.dependents);
  set('bloodGroup', rec.blood_group); set('canDonate', rec.can_donate);
  set('openedBy', rec.opened_by); set('age', rec.age);

  // Address
  set('addressType', rec.address_type); set('postalAddress', rec.postal_address);
  set('physicalAddress', rec.physical_address); set('city', rec.city);
  set('zipCode', rec.zip_code); set('country', rec.country);
  set('phoneHome', rec.phone_home); set('phoneWork', rec.phone_work);
  set('mobile', rec.mobile); set('faxNo', rec.fax_no); set('email', rec.email);

  // Employment
  set('occupation', rec.occupation); set('designation', rec.designation);
  set('companyType', rec.company_type); set('workingSince', rec.working_since);
  set('companyName', rec.company_name); set('employerCode', rec.employer_code);
  set('employeeNo', rec.employee_no); set('grossIncome', rec.gross_income);
  set('rentExpenses', rec.rent_expenses); set('familyIncome', rec.family_income);
  set('otherExpenses', rec.other_expenses); set('otherIncome', rec.other_income);
  computeEmploymentTotals();

  // BTS
  populateBTS(rec);
}

function populateBTS(rec) {
  document.querySelectorAll('.bts-field').forEach(field => {
    const label = field.querySelector('label')?.textContent?.trim().replace(/\s/g,'_').toLowerCase();
    const input = field.querySelector('input');
    if (!input || !label) return;
    const map = {
      'status': rec.status, 'open_date': rec.open_date, 'closed_date': rec.closed_date,
      'created_by': rec.created_by, 'modified_by': rec.modified_by, 'supervised_by': rec.supervised_by,
      'created_on': rec.created_on, 'modified_on': rec.modified_on, 'supervised_on': rec.supervised_on
    };
    input.value = map[label] ?? '';
  });
}

// ── Form → Record ─────────────────────────────────────────
function collectForm() {
  const get = (name) => {
    const el = document.querySelector(`[name="${name}"]`);
    if (!el) return null;
    if (el.type === 'checkbox') return el.checked;
    return el.value || null;
  };
  return {
    client_id:       document.getElementById('clientId').value || null,
    application_id:  document.getElementById('applicationId').value || null,
    client_name:     document.getElementById('clientName').value || null,
    client_type:     document.getElementById('clientType').value || null,
    base_id:         document.getElementById('baseId').value || null,
    // Personal
    title: get('title'), first_name: get('firstName'), middle_name: get('middleName'),
    last_name: get('lastName'), gender: get('gender'), nationality: get('nationality'),
    resident: get('resident'), id_type: get('idType'), issued_by: get('issuedBy'),
    id_no: get('idNo'), literacy_level: get('literacyLevel'),
    marital_status: get('maritalStatus'), house_members: get('houseMembers') ? +get('houseMembers') : null,
    children: get('children') ? +get('children') : null,
    dependents: get('dependents') ? +get('dependents') : null,
    blood_group: get('bloodGroup'), can_donate: get('canDonate'),
    opened_by: get('openedBy'), age: get('age') ? +get('age') : null,
    // Address
    address_type: get('addressType'), postal_address: get('postalAddress'),
    physical_address: get('physicalAddress'), city: get('city'),
    zip_code: get('zipCode'), country: get('country'),
    phone_home: get('phoneHome'), phone_work: get('phoneWork'),
    mobile: get('mobile'), fax_no: get('faxNo'), email: get('email'),
    // Employment
    occupation: get('occupation'), designation: get('designation'),
    company_type: get('companyType'), working_since: get('workingSince'),
    company_name: get('companyName'), employer_code: get('employerCode'),
    employee_no: get('employeeNo'),
    gross_income: get('grossIncome') ? +get('grossIncome') : null,
    rent_expenses: get('rentExpenses') ? +get('rentExpenses') : null,
    family_income: get('familyIncome') ? +get('familyIncome') : null,
    other_expenses: get('otherExpenses') ? +get('otherExpenses') : null,
    other_income: get('otherIncome') ? +get('otherIncome') : null,
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
  document.querySelector('[name="totalExpenses"]').value = totalExp || '';
  document.querySelector('[name="totalIncome"]').value   = totalInc || '';
  document.querySelector('[name="netSavings"]').value    = net || '';
}
['grossIncome','familyIncome','otherIncome','rentExpenses','otherExpenses'].forEach(n => {
  const el = document.querySelector(`[name="${n}"]`);
  if (el) el.addEventListener('input', computeEmploymentTotals);
});

// ── CRUD Operations ───────────────────────────────────────
async function loadRecord(clientId) {
  try {
    const data = await sbFetch(`ClientMasterRecords?client_id=eq.${clientId}&limit=1`);
    if (data && data.length) {
      currentRecord = data[0];
      populateForm(currentRecord);
      setMode('view');
      showToast(`Loaded: ${currentRecord.client_name || clientId}`, 'success');
    } else {
      showToast('No record found.', 'error');
    }
  } catch (e) {
    showToast(`Error: ${e.message}`, 'error');
  }
}

async function saveRecord() {
  const payload = collectForm();
  if (!payload.first_name) { showToast('First Name is required.', 'error'); return; }

  try {
    if (mode === 'add') {
      const data = await sbFetch('ClientMasterRecords', {
        method: 'POST',
        body: JSON.stringify(payload),
        prefer: 'return=representation'
      });
      currentRecord = Array.isArray(data) ? data[0] : data;
      showToast('Client saved successfully.', 'success');
    } else {
      await sbFetch(`ClientMasterRecords?client_id=eq.${currentRecord.client_id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
        prefer: 'return=representation'
      });
      currentRecord = { ...currentRecord, ...payload };
      showToast('Client updated successfully.', 'success');
    }
    populateForm(currentRecord);
    setMode('view');
  } catch (e) {
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
  setMode('add');
  document.getElementById('clientId').focus();
  showToast('Enter new client details.');
});

btnEdit.addEventListener('click', () => {
  if (!currentRecord) { showToast('Load a record first.', 'error'); return; }
  setMode('edit');
  showToast('Editing record – make your changes then Save.');
});

btnSave.addEventListener('click', saveRecord);

btnCancel.addEventListener('click', () => {
  if (currentRecord) populateForm(currentRecord);
  else clearForm();
  setMode('view');
  showToast('Changes cancelled.');
});

btnClose.addEventListener('click', () => {
  clearForm();
  currentRecord = null;
  setMode('view');
  showToast('Record closed.');
});

btnPrev.addEventListener('click', () => {
  if (currentIndex > 0) { currentIndex--; populateForm(allRecords[currentIndex]); }
});
btnNext.addEventListener('click', () => {
  if (currentIndex < allRecords.length - 1) { currentIndex++; populateForm(allRecords[currentIndex]); }
});

// Lookup btn on Client ID
document.querySelector('.identity-bar .lookup-btn').addEventListener('click', async () => {
  const cid = document.getElementById('clientId').value.trim();
  if (!cid) { showToast('Enter a Client ID.', 'error'); return; }
  await loadRecord(cid);
});

// ── Init ─────────────────────────────────────────────────
setMode('view');
setFormEnabled(false);
