(function () {
  const session = window.getHealthOneSession && window.getHealthOneSession();
  if (!session) return;

  const PATIENTS_KEY = 'healthone_patients';
  const ROLE_CLINICAL = ['Doctor', 'Dentist', 'Pediatre'];

  const pageTitle          = document.getElementById('page-title');
  const sidebarUser        = document.getElementById('sidebar-user-display');
  const statRole           = document.getElementById('stat-role');
  const statCount          = document.getElementById('stat-count');
  const statStorage        = document.getElementById('stat-storage');
  const patientCards       = document.getElementById('patient-cards');
  const patientsEmpty      = document.getElementById('patients-empty');
  const patientsNoResults  = document.getElementById('patients-no-results');
  const patientSectionCount = document.getElementById('patient-count');
  
  // Search elements
  const patientSearchInput = document.getElementById('patient-search');
  const patientSearchClear = document.getElementById('patient-search-clear');
  const searchResultsInfo  = document.getElementById('search-results-info');
  const filteredCountSpan  = document.getElementById('filtered-count');
  const totalCountSpan     = document.getElementById('total-count');
  
  // Personnel search elements
  const personnelSearchInput = document.getElementById('personnel-search');
  const personnelSearchClear = document.getElementById('personnel-search-clear');
  const personnelSearchResultsInfo = document.getElementById('personnel-search-results-info');
  const personnelFilteredCountSpan = document.getElementById('personnel-filtered-count');
  const personnelTotalCountSpan = document.getElementById('personnel-total-count');
  const personnelNoResults = document.getElementById('personnel-no-results');
  
  // Hospital badge elements
  const hospitalBadge = document.getElementById('hospital-badge');
  const hospitalNameSpan = document.getElementById('hospital-name');

  const ROLE_LABELS_FR = {
    Register: 'Admissions',
    Nurse:    'Infirmier(e)',
    Doctor:   'M\u00e9decin',
    Dentist:  'Dentiste',
    Pediatre: 'P\u00e9diatre',
  };
  const DEPT_LABELS_FR = {
    General:  'G\u00e9n\u00e9ral',
    Pediatre: 'P\u00e9diatrie',
    Dental:   'Dentaire',
    Surgery:  'Chirurgie',
    ER:       'Urgences',
  };

  function formatRole(r)   { return ROLE_LABELS_FR[r] || r; }
  function formatDept(d)   { return DEPT_LABELS_FR[d] || d; }
  function formatStatus(s) {
    if (!s) return '\u2014';
    const map = { Waiting: 'En attente', 'In triage': 'En triage', 'In treatment': 'En traitement', 'Discharged': 'Sorti(e)' };
    return map[s] || s;
  }

  // ── In-memory patients cache (populated from Firestore) ─────────────────────
  let patientsCache = [];

  function filterPatientsForRole(list) {
    if (session.role === 'Register' || session.role === 'Nurse') return list;
    if (session.role === 'Pediatre') return list.filter((p) => p.department === 'Pediatre');
    if (session.role === 'Dentist')  return list.filter((p) => p.department === 'Dental');
    if (ROLE_CLINICAL.includes(session.role)) {
      return list.filter((p) => p.department !== 'Dental' && p.department !== 'Pediatre');
    }
    return list;
  }

  function searchPatients(list, searchTerm) {
    if (!searchTerm || searchTerm.trim() === '') return list;
    
    const term = searchTerm.toLowerCase().trim();
    return list.filter(patient => {
      // Search in multiple fields
      const searchableText = [
        patient.fullName || '',
        patient.firstName || '',
        patient.lastName || '',
        patient.assignedDoctor || '',
        formatDept(patient.department) || '',
        patient.registeredBy || '',
        formatStatus(patient.status) || ''
      ].join(' ').toLowerCase();
      
      return searchableText.includes(term);
    });
  }

  function searchPersonnel(list, searchTerm) {
    if (!searchTerm || searchTerm.trim() === '') return list;
    
    const term = searchTerm.toLowerCase().trim();
    return list.filter(person => {
      // Search in multiple fields
      const searchableText = [
        person.fullName || '',
        person.name || '',
        person.username || '',
        person.email || '',
        person.phone || '',
        person.mobile || '',
        person.hospital || '',
        formatRole(person.role) || ''
      ].join(' ').toLowerCase();
      
      return searchableText.includes(term);
    });
  }

  function updatePersonnelSearchResultsInfo(filteredCount, totalCount, searchTerm) {
    if (!personnelSearchResultsInfo) return;
    
    const hasSearch = searchTerm.trim() !== '';
    personnelSearchResultsInfo.hidden = !hasSearch;
    
    if (hasSearch) {
      if (personnelFilteredCountSpan) personnelFilteredCountSpan.textContent = String(filteredCount);
      if (personnelTotalCountSpan) personnelTotalCountSpan.textContent = String(totalCount);
    }
  }

  function applyRoleNav() {
    document.querySelectorAll('[data-roles]').forEach((el) => {
      const roles = (el.getAttribute('data-roles') || '').split(/\s+/).filter(Boolean);
      const show  = roles.length === 0 || roles.includes(session.role);
      el.classList.toggle('is-hidden', !show);
      if (el.tagName === 'A') el[show ? 'removeAttribute' : 'setAttribute']('tabindex', '-1');
    });
    document.querySelectorAll('.content-section[data-roles]').forEach((s) => {
      const roles   = (s.getAttribute('data-roles') || '').split(/\s+/).filter(Boolean);
      s.dataset.roleAllowed = (roles.length === 0 || roles.includes(session.role)) ? 'true' : 'false';
    });
    document.querySelectorAll('.content-section:not([data-roles])').forEach((s) => {
      s.dataset.roleAllowed = 'true';
    });
  }

  function showSection(id) {
    const titles = { overview: 'Vue d\u2019ensemble', patients: 'Patients', register: 'Nouvelle inscription', storage: 'Stockage', personnel: 'Personnels' };
    document.querySelectorAll('.content-section').forEach((sec) => {
      const key     = sec.getAttribute('data-section');
      const visible = key === id && sec.dataset.roleAllowed !== 'false';
      sec.hidden = !visible;
      sec.classList.toggle('is-visible', visible);
    });
    document.querySelectorAll('.nav-link').forEach((l) => {
      l.classList.toggle('is-active', l.getAttribute('data-section') === id);
    });
    if (pageTitle) pageTitle.textContent = titles[id] || 'Tableau de bord';

    // section-specific renderers
    if (id === 'patients') renderPatientCards();
    if (id === 'personnel') renderPersonnel();
  }

  function initNav() {
    document.querySelectorAll('.nav-link').forEach((link) => {
      link.addEventListener('click', (e) => {
        if (link.classList.contains('is-hidden')) { e.preventDefault(); return; }
        const id = link.getAttribute('data-section');
        if (!id) return;
        e.preventDefault();
        showSection(id);
        if (id === 'patients') renderPatientCards();
      });
    });
    const hash = (window.location.hash || '#overview').replace('#', '');
    const canRegister = session.role === 'Register' || session.role === 'Nurse';
    if (hash === 'register' && !canRegister) showSection('overview');
    else if (document.querySelector(`.nav-link[data-section="${hash}"]:not(.is-hidden)`)) showSection(hash);
    else showSection('overview');
  }

  function renderPatientCards() {
    if (!patientCards) return;
    
    // First filter by role
    let roleFilteredList = filterPatientsForRole(patientsCache);
    
    // Then apply search filter
    const searchTerm = patientSearchInput ? patientSearchInput.value : '';
    const finalList = searchPatients(roleFilteredList, searchTerm);
    
    // Update counts
    if (statCount) statCount.textContent = String(patientsCache.length);
    if (patientSectionCount) patientSectionCount.textContent = String(roleFilteredList.length);
    
    // Update search results info
    updateSearchResultsInfo(finalList.length, roleFilteredList.length, searchTerm);
    
    // Clear and populate cards
    patientCards.innerHTML = '';
    
    // Show/hide empty states
    const hasSearch = searchTerm.trim() !== '';
    const hasResults = finalList.length > 0;
    const hasData = roleFilteredList.length > 0;
    
    if (patientsEmpty) patientsEmpty.hidden = hasData;
    if (patientsNoResults) patientsNoResults.hidden = !hasSearch || hasResults || !hasData;
    
    finalList.forEach((p) => {
      const card = document.createElement('article');
      card.className = 'patient-card card';
      card.innerHTML = `
        <header class="patient-card-head">
          <h4 class="patient-name"></h4>
          <span class="badge"></span>
        </header>
        <dl class="patient-meta">
          <div><dt>Service</dt><dd class="dd-dept"></dd></div>
          <div><dt>M\u00e9decin</dt><dd class="dd-doc"></dd></div>
          <div><dt>Enregistr\u00e9 le</dt><dd class="dd-reg"></dd></div>
          <div><dt>Par</dt><dd class="dd-by"></dd></div>
        </dl>`;
      card.querySelector('.patient-name').textContent = p.fullName || '\u2014';
      card.querySelector('.badge').textContent        = formatStatus(p.status);
      card.querySelector('.dd-dept').textContent      = formatDept(p.department) || '\u2014';
      card.querySelector('.dd-doc').textContent       = p.assignedDoctor || '\u2014';
      card.querySelector('.dd-reg').textContent       = `${p.regDate || ''} ${p.regTime || ''}`.trim() || '\u2014';
      card.querySelector('.dd-by').textContent        = p.registeredBy || '\u2014';
      patientCards.appendChild(card);
      
      // Click on a patient card opens the read-only patient description overlay
      card.addEventListener('click', () => {
        if (typeof window.showPatientDescription === 'function') {
          window.showPatientDescription(p);
        }
      });
    });
  }

  function updateSearchResultsInfo(filteredCount, totalCount, searchTerm) {
    if (!searchResultsInfo) return;
    
    const hasSearch = searchTerm.trim() !== '';
    searchResultsInfo.hidden = !hasSearch;
    
    if (hasSearch) {
      if (filteredCountSpan) filteredCountSpan.textContent = String(filteredCount);
      if (totalCountSpan) totalCountSpan.textContent = String(totalCount);
    }
  }

  // Expose so registry.js can trigger a re-render after saving
  window.refreshPatientListUI = async function () {
    const res = await window.loadData(PATIENTS_KEY);
    if (res.ok && Array.isArray(res.data)) patientsCache = res.data;
    renderPatientCards();
  };

  // Expose personnel refresh function
  window.refreshPersonnelListUI = async function () {
    window.usersCache = null; // Force reload
    renderPersonnel();
  };

  /**
   * Render personnel list filtered by the logged-in user's hospital
   */
  async function renderPersonnel() {
    const container = document.getElementById('personnel-list');
    if (!container) return;
    container.innerHTML = '<div class="loading">Chargement...</div>';
    
    // load session & users
    const session = window.getHealthOneSession ? window.getHealthOneSession() : JSON.parse(localStorage.getItem('healthone_session') || 'null');
    const hospital = session && session.hospital ? session.hospital : null;

    // load users from storage (legacy healthone_users array) or from window.usersCache
    let users = window.usersCache || [];
    try {
      if (!users || !users.length) {
        const res = await window.loadData('healthone_users');
        users = Array.isArray(res) ? res : (res && res.data) ? res.data : (res || []);
        window.usersCache = users;
      }
    } catch (e) {
      console.warn('Unable to load users for personnel view', e);
      users = window.usersCache || [];
    }

    // load patients to count assignments
    let patients = [];
    try {
      const patientsRes = await window.loadData(PATIENTS_KEY);
      if (patientsRes.ok && Array.isArray(patientsRes.data)) {
        patients = patientsRes.data;
      }
    } catch (e) {
      console.warn('Unable to load patients for personnel view', e);
    }

    // filter by hospital if available
    const hospitalFiltered = hospital ? users.filter((u) => u && u.hospital === hospital) : users;
    
    // Apply search filter
    const searchTerm = personnelSearchInput ? personnelSearchInput.value : '';
    const finalFiltered = searchPersonnel(hospitalFiltered, searchTerm);
    
    // Update search results info
    updatePersonnelSearchResultsInfo(finalFiltered.length, hospitalFiltered.length, searchTerm);

    // Show/hide empty states
    const hasSearch = searchTerm.trim() !== '';
    const hasResults = finalFiltered.length > 0;
    const hasData = hospitalFiltered.length > 0;
    
    if (personnelNoResults) personnelNoResults.hidden = !hasSearch || hasResults || !hasData;

    if (!hasData) {
      container.innerHTML = '<div class="empty">Aucun personnel trouv\u00e9 pour votre h\u00f4pital.</div>';
      return;
    }

    if (!hasResults && hasSearch) {
      container.innerHTML = '';
      return;
    }

    // render list
    const listEl = document.createElement('div');
    listEl.className = 'personnel-grid';
    finalFiltered.forEach((u) => {
      // Count patients assigned to this person
      const assignedPatients = patients.filter(p => {
        const doctorName = u.fullName || u.name || u.username || '';
        return p.assignedDoctor === doctorName;
      }).length;
      
      const card = document.createElement('div');
      card.className = 'personnel-card'; // card class is on the parent now
      const roleLabel = u.role ? formatRole(u.role) : '—';
      card.innerHTML = `
        <div class="personnel-card-avatar">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" class="personnel-avatar-icon">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
        </div>
        <div class="personnel-card-body">
          <h4 class="personnel-card-name">${escapeHtml(u.fullName || u.name || u.username || '—')}</h4>
          <div class="personnel-card-details">
            <span class="personnel-detail">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
              ${escapeHtml(roleLabel)}
            </span>
            <span class="personnel-detail">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
              ${escapeHtml(u.phone || u.mobile || '—')}
            </span>
            <span class="personnel-detail">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
              ${escapeHtml(u.hospital || '—')}
            </span>
          </div>
        </div>
        <div class="personnel-card-stats">
          <span class="personnel-patient-count">
            ${assignedPatients}
            <span class="personnel-patient-label">patient${assignedPatients !== 1 ? 's' : ''}</span>
          </span>
        </div>
      `;
      listEl.appendChild(card);
    });
    container.innerHTML = '';
    container.appendChild(listEl);
  }

  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>\"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || c));
  }

  function updateHospitalBanner() {
    if (!hospitalBadge || !hospitalNameSpan) return;
    
    const hospitalName = session.hospital;
    
    if (hospitalName && hospitalName.trim()) {
      hospitalNameSpan.textContent = hospitalName;
      hospitalBadge.hidden = false;
    } else {
      hospitalBadge.hidden = true;
    }
  }

  // ── Init ────────────────────────────────────────────────────────────────────

  sidebarUser.textContent = `${session.username} \u00b7 ${formatRole(session.role)}`;
  if (statRole)    statRole.textContent    = formatRole(session.role);
  if (statStorage) statStorage.textContent = 'Cloud';
  
  // Update hospital banner
  updateHospitalBanner();

  // Remove the now-pointless storage toggle from the header if present
  const storagePill = document.querySelector('.storage-pill');
  if (storagePill) storagePill.hidden = true;

  applyRoleNav();
  initNav();

  // Load patients from Firestore then render
  window.loadData(PATIENTS_KEY).then((res) => {
    if (res.ok && Array.isArray(res.data)) patientsCache = res.data;
    renderPatientCards();
  }).catch((e) => {
    console.warn('dashboard: failed to load patients', e);
    renderPatientCards();
  });

  // "Add patient" button
  const btnAddPatient = document.getElementById('btn-add-patient');
  if (btnAddPatient) {
    btnAddPatient.addEventListener('click', () => {
      const link = document.querySelector('.nav-link[data-section="register"]');
      if (link && !link.classList.contains('is-hidden')) {
        link.click();
        setTimeout(() => {
          const first = document.querySelector('#section-register input[name="fullName"]');
          if (first) first.focus();
        }, 120);
      } else {
        const msg = 'Votre fonction ne permet pas d\u2019ajouter des patients.';
        if (typeof window.showInfo === 'function') window.showInfo('Acc\u00e8s refus\u00e9', msg);
        else alert(msg);
      }
    });
  }

  // Patient search functionality
  if (patientSearchInput) {
    let searchTimeout;
    
    patientSearchInput.addEventListener('input', (e) => {
      const value = e.target.value;
      
      // Show/hide clear button
      if (patientSearchClear) {
        patientSearchClear.hidden = value.length === 0;
      }
      
      // Debounce search to avoid too many renders
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        renderPatientCards();
      }, 300);
    });
    
    // Clear button functionality
    if (patientSearchClear) {
      patientSearchClear.addEventListener('click', () => {
        patientSearchInput.value = '';
        patientSearchClear.hidden = true;
        renderPatientCards();
        patientSearchInput.focus();
      });
    }
    
    // Handle Enter key
    patientSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(searchTimeout);
        renderPatientCards();
      }
    });
  }

  // Personnel search functionality
  if (personnelSearchInput) {
    let personnelSearchTimeout;
    
    personnelSearchInput.addEventListener('input', (e) => {
      const value = e.target.value;
      
      // Show/hide clear button
      if (personnelSearchClear) {
        personnelSearchClear.hidden = value.length === 0;
      }
      
      // Debounce search to avoid too many renders
      clearTimeout(personnelSearchTimeout);
      personnelSearchTimeout = setTimeout(() => {
        renderPersonnel();
      }, 300);
    });
    
    // Clear button functionality
    if (personnelSearchClear) {
      personnelSearchClear.addEventListener('click', () => {
        personnelSearchInput.value = '';
        personnelSearchClear.hidden = true;
        renderPersonnel();
        personnelSearchInput.focus();
      });
    }
    
    // Handle Enter key
    personnelSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(personnelSearchTimeout);
        renderPersonnel();
      }
    });
  }
})();
