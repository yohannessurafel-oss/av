/* ─────────────────────────────────────────────────────────
   Client Maintenance – client-maintenance.js
   Africa Village Microfinance CBS
   ───────────────────────────────────────────────────────── */

// ── Supabase Config ──────────────────────────────────────
const SUPABASE_URL      = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    db: { schema: 'public' },
    global: {
        headers: {
            'Accept-Profile': 'public',
            'Content-Profile': 'public'
        }
    }
});

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
  
  ['dobDay','dobMonth','dobYear','idExpiryDay','idExpiryMonth','idExpiryYear'].forEach(n => {
    const el = document.querySelector(`[name="${n}"]`);
    if (el) el.selectedIndex = 0;
  });
  
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
  set('openedOn', rec.opened_on);       
  set('ageAsOn', rec.age_as_on);        
  set('relManager', rec.relationship_manager); 

  if (rec.date_of_birth) {
    const [y, m, d] = rec.date_of_birth.split('-');
    set('dobDay', +d); set('dobMonth', +m); set('dobYear', +y);
  }
  if (rec.id_expiry_date) {
    const [y, m, d] = rec.id_expiry_date.split('-');
    set('idExpiryDay', +d); set('idExpiryMonth', +m); set('idExpiryYear', +y);
  }

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
  
  if (rec.employment_type) {
    const radio = document.querySelector(`[name="empType"][value="${rec.employment_type === 'Salaried' ? 'salaried' : 'selfEmployed'}"]`);
    if (radio) radio.checked = true;
  }
  computeEmploymentTotals();
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
    const val = labelMap[labelText];
    input.value = val ?? '';
  });
}

// ── Form → Record ─────────────────────────────────────────
function collectForm() {
  const get = (name) => {
    const el = document.querySelector(`[name="${name}"]`);
    if (!el) return null;
    if (el.type === 'checkbox') return el.checked;
    return el.value.trim() === '' ? null : el.value;
  };

  return {
    client_id:       document.getElementById('clientId').value.trim() || null,
    application_id:  document.getElementById('applicationId').value.trim() || null,
    client_name:     document.getElementById('clientName').value.trim() || null,
    client_type:     document.getElementById('clientType').value || 'Individual Client',
    base_id:         document.getElementById('baseId').value.trim() || null,
    // Personal
    title: get('title'), first_name: get('firstName'), middle_name: get('middleName'),
    last_name: get('lastName'), gender: get('gender'), nationality: get('nationality'),
    resident: get('resident'), id_type: get('idType'), issued_by: get('issuedBy'),
    id_no: get('idNo'), literacy_level: get('literacyLevel'),
    marital_status: get('maritalStatus'), 
    house_members: get('houseMembers') ? +get('houseMembers') : null,
    children: get('children') ? +get('children') : null,
    dependents: get('dependents') ? +get('dependents') : null,
    blood_group: get('bloodGroup'), can_donate: get('canDonate'),
    opened_by: get('openedBy'), age: get('age') ? +get('age') : null,
    opened_on: get('openedOn') || null,               
    age_as_on: get('ageAsOn') || null,                
    relationship_manager: get('relManager') || null,  
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
  
  if (!payload.first_name) { 
    showToast('First Name is required.', 'error'); 
    return; 
  }

  delete payload.total_income;
  delete payload.total_expenses;
  delete payload.net_savings;

  Object.keys(payload).forEach(key => {
    if (payload[key] === '' || payload[key] === null || payload[key] === undefined) {
      delete payload[key];
    }
  });

  try {
    if (mode === 'add') {
      delete payload.client_id;
      delete payload.application_id;

      showToast('Creating new client...', 'info');
      const data = await sbFetch('ClientMasterRecords', {
        method: 'POST',
        body: JSON.stringify(payload),
        prefer: 'return=representation'
      });
      
      currentRecord = Array.isArray(data) ? data[0] : data;
      showToast('Client saved successfully.', 'success');
    } else {
      if (!currentRecord || !currentRecord.client_id) {
        showToast('Update failed: Missing base record context tracking ID.', 'error');
        return;
      }

      const updatePayload = { ...payload };
      delete updatePayload.client_id; 

      showToast('Updating client details...', 'info');
      await sbFetch(`ClientMasterRecords?client_id=eq.${encodeURIComponent(currentRecord.client_id)}`, {
        method: 'PATCH',
        body: JSON.stringify(updatePayload),
        prefer: 'return=representation'
      });
      
      currentRecord = { ...currentRecord, ...payload };
      showToast('Client updated successfully.', 'success');
    }

    populateForm(currentRecord);
    setMode('view');
  } catch (e) {
    console.error('Database Operation Error:', e);
    showToast(`Save failed: ${e.message}`, 'error');
  }
}
// ── Personal Info Layout Builders & Business Rules ─────────────────

function initPersonalDropdowns() {
  const daySelectors   = document.querySelectorAll('[name="dobDay"], [name="idExpiryDay"]');
  const monthSelectors = document.querySelectorAll('[name="dobMonth"], [name="idExpiryMonth"]');
  const dobYearSel     = document.querySelector('[name="dobYear"]');
  const expiryYearSel  = document.querySelector('[name="idExpiryYear"]');

  // Populate Days (1-31)
  daySelectors.forEach(sel => {
    if (!sel) return;
    for (let i = 1; i <= 31; i++) {
      const opt = document.createElement('option');
      opt.value = i; opt.textContent = String(i).padStart(2, '0');
      sel.appendChild(opt);
    }
  });

  // Populate Months
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  monthSelectors.forEach(sel => {
    if (!sel) return;
    months.forEach((m, idx) => {
      const opt = document.createElement('option');
      opt.value = idx + 1; opt.textContent = m;
      sel.appendChild(opt);
    });
  });

  // Populate DOB Years (Retrograde generation from present down to 100 years past)
  if (dobYearSel) {
    const currentYear = new Date().getFullYear();
    for (let y = currentYear; y >= currentYear - 100; y--) {
      const opt = document.createElement('option');
      opt.value = y; opt.textContent = y;
      dobYearSel.appendChild(opt);
    }
  }

  // Populate ID Expiry Years (Forward mapping up to 25 years into future context)
  if (expiryYearSel) {
    const currentYear = new Date().getFullYear();
    for (let y = currentYear - 5; y <= currentYear + 25; y++) {
      const opt = document.createElement('option');
      opt.value = y; opt.textContent = y;
      expiryYearSel.appendChild(opt);
    }
  }
}

// Live Chronological Mathematical Engine for Age Values
function calculateLiveAge() {
  const day = document.querySelector('[name="dobDay"]').value;
  const mon = document.querySelector('[name="dobMonth"]').value;
  const yr  = document.querySelector('[name="dobYear"]').value;
  const ageInput = document.querySelector('[name="age"]');

  if (!day || !mon || !yr) {
    if (ageInput) ageInput.value = '';
    return;
  }

  const birthDate = new Date(parseInt(yr), parseInt(mon) - 1, parseInt(day));
  const today = new Date();
  
  let structuralAge = today.getFullYear() - birthDate.getFullYear();
  const monthDiff  = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    structuralAge--;
  }

  if (ageInput) {
    ageInput.value = structuralAge >= 0 ? structuralAge : 0;
  }
}

// Bind calculations to execute whenever date parameters are altered
['dobDay', 'dobMonth', 'dobYear'].forEach(name => {
  const el = document.querySelector(`[name="${name}"]`);
  if (el) el.addEventListener('change', calculateLiveAge);
});

// Run dropdown generation routines within the application initialization setup block
initPersonalDropdowns();
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
  showToast('Form cleared. Type the data, then click Save.');
});

btnEdit.addEventListener('click', () => {
  if (!currentRecord) { showToast('Please load a record first before trying to edit.', 'error'); return; }
  setMode('edit');
  showToast('Form unlocked. Make your changes then click Save.');
});

btnSave.addEventListener('click', saveRecord);

btnCancel.addEventListener('click', () => {
  clearForm();
  currentRecord = null;
  setMode('view');
  showToast('Record closed and selected data cleared.');
});

btnClose.addEventListener('click', () => {
  clearForm();
  currentRecord = null;
  setMode('view');
  showToast('Current record closed.');
});

btnPrev.addEventListener('click', () => {
  if (currentIndex > 0) { currentIndex--; populateForm(allRecords[currentIndex]); }
});
btnNext.addEventListener('click', () => {
  if (currentIndex < allRecords.length - 1) { currentIndex++; populateForm(allRecords[currentIndex]); }
});

const lookupBtns = document.querySelectorAll('.identity-bar .lookup-btn');

if (lookupBtns[0]) {
  lookupBtns[0].addEventListener('click', async () => {
    const cid = document.getElementById('clientId').value.trim();
    if (!cid) { showToast('Enter a Client ID.', 'error'); return; }
    await loadRecord(cid);
  });
}

if (lookupBtns[1]) {
  lookupBtns[1].addEventListener('click', async () => {
    const aid = document.getElementById('applicationId').value.trim();
    if (!aid) { showToast('Enter an Application ID.', 'error'); return; }
    try {
      const data = await sbFetch(`ClientMasterRecords?application_id=eq.${aid}&limit=1`);
      if (data && data.length) {
        currentRecord = data[0];
        populateForm(currentRecord);
        setMode('view');
        showToast(`Loaded: ${currentRecord.client_name || aid}`, 'success');
      } else {
        showToast('No record found for that Application ID.', 'error');
      }
    } catch (e) {
      showToast(`Error: ${e.message}`, 'error');
    }
  });
}

// ── Init ─────────────────────────────────────────────────
setMode('view');
setFormEnabled(false);
