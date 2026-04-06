(function () {
  const session = window.getHealthOneSession && window.getHealthOneSession();
  if (!session) return;

  const PATIENTS_KEY = 'healthone_patients';
  const form = document.getElementById('form-patient');
  const messageEl = document.getElementById('registry-message');

  if (!form) return;

  const CLINICAL_ROLES = ['Doctor', 'Dentist', 'Pediatre'];

  // ── Element refs ────────────────────────────────────────────────────────────
  const deptSelect          = form.querySelector('[name="department"]');
  const doctorInput         = document.getElementById('doctor-search-input');
  const dropdownList        = document.getElementById('doctor-suggestions-list');
  const fullNameInput       = document.getElementById('fullName-input');
  const registeredByDisplay = document.getElementById('registered-by-display');

  // Returning-patient elements
  const returningRadios        = form.querySelectorAll('[name="returningPatient"]');
  const existingSection        = document.getElementById('existing-patient-section');
  const existingSearch         = document.getElementById('existing-patient-search');
  const existingResults        = document.getElementById('existing-patient-results');
  const existingInfo           = document.getElementById('existing-patient-info');
  const existingIdInput        = document.getElementById('existing-patient-id');

  // Optional field elements
  const optTagBtns   = document.querySelectorAll('.opt-tag');
  const optFieldsArea = document.getElementById('opt-fields-area');

  // ── Fetch current user's fullName from users collection ────────────────────
  let resolvedFullName = session.fullName || session.username || '';

  async function fetchRegisteredByName() {
    try {
      const [{ initializeApp, getApps }, firestoreLite] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-lite.js'),
      ]);
      const config = window.__HEALTHONE_FIREBASE_CONFIG__;
      if (!config || !config.projectId) return;

      const app = getApps().length ? getApps()[0] : initializeApp(config);
      const db  = firestoreLite.getFirestore(app);
      const col = firestoreLite.collection(db, 'users');

      const snap = await firestoreLite.getDocs(
        firestoreLite.query(col, firestoreLite.where('username', '==', session.username))
      );
      const doc = snap && snap.docs && snap.docs[0];
      if (doc) {
        const data = typeof doc.data === 'function' ? doc.data() : doc.data;
        if (data && data.fullName) resolvedFullName = data.fullName;
      }
    } catch (e) {
      console.warn('registry: could not fetch user fullName', e && e.message ? e.message : e);
    }
    if (registeredByDisplay) registeredByDisplay.value = resolvedFullName;
  }

  fetchRegisteredByName().catch(console.error);

  // ── Optional extra fields ───────────────────────────────────────────────────
  const OPT_FIELD_CONFIG = {
    phone:            { label: 'Téléphone',        type: 'tel',   placeholder: '+33 6 00 00 00 00' },
    address:          { label: 'Adresse',           type: 'text',  placeholder: 'Rue, ville…' },
    email:            { label: 'Email',             type: 'email', placeholder: 'patient@example.com' },
    emergencyContact: { label: "Contact d'Urgence", type: 'text',  placeholder: 'Nom et téléphone…' },
    description:      { label: 'Description',       type: 'text',  placeholder: 'Informations complémentaires…' },
  };

  const activeOptFields = new Set();

  optTagBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.opt;
      if (activeOptFields.has(key)) {
        // Remove
        activeOptFields.delete(key);
        btn.classList.remove('is-active');
        btn.textContent = '+ ' + btn.dataset.label;
        const existing = optFieldsArea.querySelector(`[data-opt-field="${key}"]`);
        if (existing) existing.remove();
      } else {
        // Add
        activeOptFields.add(key);
        btn.classList.add('is-active');
        btn.textContent = '× ' + btn.dataset.label;
        const cfg = OPT_FIELD_CONFIG[key];
        const label = document.createElement('label');
        label.className = 'field field-span-2';
        label.dataset.optField = key;
        label.innerHTML = `
          <span class="field-label">${cfg.label}</span>
          <input type="${cfg.type}" name="${key}" class="input" placeholder="${cfg.placeholder}" />
        `;
        optFieldsArea.appendChild(label);
      }
    });
  });

  // ── Returning patient toggle ────────────────────────────────────────────────
  let cachedPatients = null;

  async function getPatients() {
    if (cachedPatients) return cachedPatients;
    const res = await window.loadData(PATIENTS_KEY);
    cachedPatients = (res && res.ok && Array.isArray(res.data)) ? res.data : [];
    return cachedPatients;
  }

  function setReturning(isReturning) {
    if (existingSection) existingSection.hidden = !isReturning;
    if (!isReturning) {
      // Reset existing patient state
      if (existingSearch)  existingSearch.value = '';
      if (existingResults) existingResults.hidden = true;
      if (existingInfo)    { existingInfo.style.display = 'none'; existingInfo.textContent = ''; }
      if (existingIdInput) existingIdInput.value = '';
      if (fullNameInput)   { fullNameInput.readOnly = false; fullNameInput.value = ''; }
    }
  }

  returningRadios.forEach(radio => {
    radio.addEventListener('change', () => setReturning(radio.value === 'yes' && radio.checked));
  });

  // Existing patient search
  if (existingSearch) {
    existingSearch.addEventListener('input', async () => {
      const q = existingSearch.value.trim().toLowerCase();
      if (!existingResults) return;

      if (!q) { existingResults.hidden = true; return; }

      const patients = await getPatients();
      const matches = patients.filter(p =>
        (p.fullName || '').toLowerCase().includes(q)
      );

      existingResults.innerHTML = '';
      existingResults.hidden = false;

      if (!matches.length) {
        const li = document.createElement('li');
        li.className = 'is-empty';
        li.textContent = 'Aucun dossier trouvé';
        existingResults.appendChild(li);
        return;
      }

      matches.slice(0, 8).forEach(p => {
        const li = document.createElement('li');
        const visits = Array.isArray(p.visits) ? p.visits.length : 0;
        li.textContent = p.fullName + (p.regDate ? '  —  ' + p.regDate : '') + (visits > 0 ? `  (${visits + 1} visite${visits > 0 ? 's' : ''})` : '');
        li.addEventListener('mousedown', (e) => {
          e.preventDefault();
          selectExistingPatient(p);
        });
        existingResults.appendChild(li);
      });
    });

    existingSearch.addEventListener('blur', () => {
      setTimeout(() => { if (existingResults) existingResults.hidden = true; }, 150);
    });
  }

  function selectExistingPatient(patient) {
    if (existingIdInput)  existingIdInput.value = patient.id;
    if (existingSearch)   existingSearch.value = patient.fullName;
    if (existingResults)  existingResults.hidden = true;
    if (fullNameInput) {
      fullNameInput.value = patient.fullName;
      fullNameInput.readOnly = true;
    }
    if (existingInfo) {
      const visits = Array.isArray(patient.visits) ? patient.visits.length : 0;
      existingInfo.textContent = `Dossier trouvé · ${visits + 1} visite(s) au total · Dernier service : ${patient.department || '—'}`;
      existingInfo.style.display = 'block';
    }
  }

  // ── Searchable doctor dropdown ──────────────────────────────────────────────
  let allDoctorNames = [];
  let dropdownOpen   = false;

  function buildListItems(names) {
    if (!dropdownList) return;
    dropdownList.innerHTML = '';
    if (!names.length) {
      const li = document.createElement('li');
      li.className = 'is-empty';
      li.textContent = 'Aucun médecin disponible';
      dropdownList.appendChild(li);
      return;
    }
    names.forEach(name => {
      const li = document.createElement('li');
      li.textContent = name;
      li.addEventListener('mousedown', (e) => { e.preventDefault(); selectDoctor(name); });
      dropdownList.appendChild(li);
    });
  }

  function selectDoctor(name) {
    if (doctorInput) { doctorInput.value = name; doctorInput.dataset.selected = name; }
    closeDropdown();
  }

  function openDropdown() {
    if (!dropdownList || !doctorInput) return;
    dropdownOpen = true;
    dropdownList.hidden = false;
    doctorInput.classList.add('is-open');
    doctorInput.readOnly = false;
    doctorInput.select && doctorInput.select();
    filterDoctorList('');
  }

  function closeDropdown() {
    if (!dropdownList || !doctorInput) return;
    dropdownOpen = false;
    dropdownList.hidden = true;
    doctorInput.classList.remove('is-open');
    doctorInput.readOnly = true;
    const val = (doctorInput.value || '').trim();
    if (val && !allDoctorNames.includes(val)) {
      doctorInput.value = '';
      doctorInput.dataset.selected = '';
    }
  }

  function filterDoctorList(query) {
    const q = query.trim().toLowerCase();
    buildListItems(q ? allDoctorNames.filter(n => n.toLowerCase().includes(q)) : allDoctorNames.slice());
  }

  if (doctorInput) {
    doctorInput.addEventListener('click', () => { if (dropdownOpen) closeDropdown(); else openDropdown(); });
    doctorInput.addEventListener('input', (e) => { filterDoctorList(e.target.value || ''); if (!dropdownOpen) openDropdown(); });
    doctorInput.addEventListener('blur', () => { setTimeout(closeDropdown, 150); });
    doctorInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeDropdown(); return; }
      if (!dropdownOpen) return;
      const items = Array.from(dropdownList.querySelectorAll('li:not(.is-empty)'));
      const active = dropdownList.querySelector('li.is-active');
      let idx = active ? items.indexOf(active) : -1;
      if      (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(idx + 1, items.length - 1); }
      else if (e.key === 'ArrowUp')   { e.preventDefault(); idx = Math.max(idx - 1, 0); }
      else if (e.key === 'Enter' && active) { e.preventDefault(); selectDoctor(active.textContent); return; }
      else return;
      items.forEach(li => li.classList.remove('is-active'));
      if (items[idx]) { items[idx].classList.add('is-active'); items[idx].scrollIntoView({ block: 'nearest' }); }
    });
  }

  // ── Fetch doctors from Firestore ────────────────────────────────────────────
  async function populateDoctors() {
    const userHospital = (session && session.hospital) ? session.hospital.toString() : null;

    function applyUsers(users) {
      allDoctorNames = users.filter(u => {
        const role = (u.role || u.roleName || '').toString();
        if (!role || CLINICAL_ROLES.indexOf(role) === -1) return false;
        if (userHospital) {
          return (u.hospital || u.hospitalName || '').toString() === userHospital;
        }
        return true;
      }).map(u => (u.fullName || u.displayName || u.username || '').toString()).filter(Boolean);
    }

    try {
      const [{ initializeApp, getApps }, firestoreLite] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-lite.js'),
      ]);
      const config = window.__HEALTHONE_FIREBASE_CONFIG__;
      if (!config || !config.projectId) throw new Error('Firebase config missing');

      const app = getApps().length ? getApps()[0] : initializeApp(config);
      const db = firestoreLite.getFirestore(app);
      const col = firestoreLite.collection(db, 'users');

      let snap;
      if (userHospital && firestoreLite.query && firestoreLite.where) {
        snap = await firestoreLite.getDocs(
          firestoreLite.query(col, firestoreLite.where('hospital', '==', userHospital))
        );
      } else {
        snap = await firestoreLite.getDocs(col);
      }

      const docUsers = (snap.docs || []).map(d => (typeof d.data === 'function' ? d.data() : d.data)).filter(Boolean);
      applyUsers(docUsers);
      window.usersCache = docUsers;
    } catch (err) {
      console.warn('registry: Firestore users query failed, trying shared array', err && err.message ? err.message : err);
      try {
        const res = await window.loadData && window.loadData('healthone_users');
        if (res && res.ok && Array.isArray(res.data) && res.data.length) applyUsers(res.data);
      } catch (e) {
        console.warn('registry: healthone_users fallback failed', e && e.message ? e.message : e);
      }
    }

    if (doctorInput) {
      doctorInput.value = '';
      doctorInput.dataset.selected = '';
      doctorInput.placeholder = allDoctorNames.length ? 'Chercher un médecin…' : 'Dr …';
    }
  }

  if (deptSelect) {
    deptSelect.addEventListener('change', () => populateDoctors().catch(console.error));
    populateDoctors().catch(console.error);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function fmtDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function fmtTime(d) {
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }

  // ── Form submit ──────────────────────────────────────────────────────────────
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (messageEl) {
      messageEl.hidden = true;
      messageEl.textContent = '';
      messageEl.classList.remove('is-error', 'is-success');
    }

    if (session.role !== 'Register' && session.role !== 'Nurse') {
      if (messageEl) {
        messageEl.textContent = 'Votre fonction ne permet pas d\u2019enregistrer de nouveaux patients.';
        messageEl.classList.add('is-error');
        messageEl.hidden = false;
      }
      return;
    }

    const fd = new FormData(form);
    const now = new Date();
    const isReturning = fd.get('returningPatient') === 'yes';
    const existingId  = (fd.get('existingPatientId') || '').trim();

    const registeredBy   = resolvedFullName;
    const fullName       = String(fd.get('fullName') || '').trim();
    const department     = String(fd.get('department') || '');
    const assignedDoctor = String(fd.get('assignedDoctor') || '').trim() || '\u2014';
    const status         = String(fd.get('status') || 'En attente');
    const visitReason    = String(fd.get('visitReason') || '').trim();

    // Collect optional fields
    const optionals = {};
    activeOptFields.forEach(key => {
      const val = String(fd.get(key) || '').trim();
      if (val) optionals[key] = val;
    });

    if (!fullName) {
      if (messageEl) {
        messageEl.textContent = 'Le nom complet est obligatoire.';
        messageEl.classList.add('is-error');
        messageEl.hidden = false;
      }
      return;
    }

    if (isReturning && !existingId) {
      if (messageEl) {
        messageEl.textContent = 'Veuillez rechercher et sélectionner le dossier existant du patient.';
        messageEl.classList.add('is-error');
        messageEl.hidden = false;
      }
      return;
    }

    const loadRes = await window.loadData(PATIENTS_KEY);
    const list = (loadRes.ok && Array.isArray(loadRes.data)) ? loadRes.data : [];

    const newVisit = {
      id:             crypto.randomUUID(),
      date:           fmtDate(now),
      time:           fmtTime(now),
      reason:         visitReason || '\u2014',
      department,
      assignedDoctor,
      status,
      registeredBy,
      ...optionals,
    };

    if (isReturning && existingId) {
      // Add new visit to existing patient record
      const idx = list.findIndex(p => p.id === existingId);
      if (idx === -1) {
        if (messageEl) {
          messageEl.textContent = 'Dossier introuvable. Veuillez resélectionner le patient.';
          messageEl.classList.add('is-error');
          messageEl.hidden = false;
        }
        return;
      }
      const patient = list[idx];
      if (!Array.isArray(patient.visits)) patient.visits = [];
      patient.visits.push(newVisit);
      // Update top-level current status/dept
      patient.status         = status;
      patient.department     = department;
      patient.assignedDoctor = assignedDoctor;
      list[idx] = patient;
    } else {
      // New patient
      const patient = {
        id: crypto.randomUUID(),
        fullName,
        department,
        assignedDoctor,
        regDate:      fmtDate(now),
        regTime:      fmtTime(now),
        registeredBy,
        hospital:     (session && session.hospital) ? session.hospital : null,
        status,
        visitReason:  visitReason || '\u2014',
        visits:       [newVisit],
        ...optionals,
      };
      list.push(patient);
    }

    // Invalidate cache so next search is fresh
    cachedPatients = null;

    const saveRes = await window.saveData(PATIENTS_KEY, list);
    if (!saveRes.ok) {
      if (messageEl) {
        messageEl.textContent = saveRes.error || '\u00c9chec de l\u2019enregistrement.';
        messageEl.classList.add('is-error');
        messageEl.hidden = false;
      }
      return;
    }

    if (window.HealthOneExcel) window.HealthOneExcel.syncPatients(list);

    // Reset form
    form.reset();
    activeOptFields.forEach(key => {
      const btn = form.querySelector(`.opt-tag[data-opt="${key}"]`);
      if (btn) { btn.classList.remove('is-active'); btn.textContent = '+ ' + btn.dataset.label; }
    });
    activeOptFields.clear();
    if (optFieldsArea) optFieldsArea.innerHTML = '';
    setReturning(false);
    if (deptSelect) populateDoctors().catch(console.error);
    if (registeredByDisplay) registeredByDisplay.value = resolvedFullName;

    if (messageEl) {
      messageEl.textContent = isReturning
        ? 'Nouvelle visite enregistrée sur le dossier existant.'
        : 'Patient enregistré avec succès.';
      messageEl.classList.add('is-success');
      messageEl.hidden = false;
    }

    if (typeof window.refreshPatientListUI === 'function') window.refreshPatientListUI();
    const cnt = document.getElementById('stat-count');
    if (cnt) cnt.textContent = String(list.filter(p => !p._deleted).length);
  });

    // Expose helper to open a patient in the registration form by id
    window.openPatientById = async function openPatientById(id) {
      if (!id) return false;
      try {
        const patients = await getPatients();
        const patient = (Array.isArray(patients) ? patients : []).find(p => p && p.id === id);
        if (!patient) return false;
        // Ensure form is in 'returning' mode and select the patient
        setReturning(true);
        selectExistingPatient(patient);
        // Set the hidden existing id input if present
        if (existingIdInput) existingIdInput.value = patient.id;
        // Show the register section
        const regLink = document.querySelector('.nav-link[data-section="register"]');
        if (regLink && !regLink.classList.contains('is-hidden')) regLink.click();
        return true;
      } catch (e) {
        console.warn('openPatientById failed', e && e.message ? e.message : e);
        return false;
      }
    };
})();
