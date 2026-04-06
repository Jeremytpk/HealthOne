(function () {
  // ── Auth guard ──────────────────────────────────────────────────────────────
  const session = window.getHealthOneSession && window.getHealthOneSession();
  if (!session || session.role !== 'Admin') {
    window.location.href = 'dashboard.html';
    return;
  }

  // ── Constants ───────────────────────────────────────────────────────────────
  const USERS_KEY    = 'healthone_users';
  const PATIENTS_KEY = 'healthone_patients';

  // ── In-memory caches (hydrated from Firestore on init) ──────────────────────
  let usersCache     = [];
  let patientsCache  = [];
  let hospitalsCache = [];

  const DEPARTMENTS = [
    { key: 'General',  label: 'Général'   },
    { key: 'Pediatre', label: 'Pédiatrie' },
    { key: 'Dental',   label: 'Dentaire'  },
    { key: 'Surgery',  label: 'Chirurgie' },
    { key: 'ER',       label: 'Urgences'  },
  ];

  const ROLES = [
    { value: 'Admin',    label: 'Admin'        },
    { value: 'Register', label: 'Admissions'   },
    { value: 'Nurse',    label: 'Infirmier(e)' },
    { value: 'Doctor',   label: 'Médecin'      },
    { value: 'Dentist',  label: 'Dentiste'     },
    { value: 'Pediatre', label: 'Pédiatre'     },
  ];

  const STATUS_OPTIONS = [
    { value: 'En attente',    label: 'En attente'    },
    { value: 'En triage',     label: 'En triage'     },
    { value: 'En traitement', label: 'En traitement' },
    { value: 'Sorti(e)',      label: 'Sorti(e)'      },
  ];

  const DEPT_DOCTORS = {
    General:  ['Dr. Martin', 'Dr. Bernard', 'Dr. Lefebvre', 'Dr. Moreau'],
    Pediatre: ['Dr. Petit',  'Dr. Dubois',  'Dr. Simon',    'Dr. Laurent'],
    Dental:   ['Dr. Leroy',  'Dr. Garcia',  'Dr. Roux',     'Dr. Fournier'],
    Surgery:  ['Dr. Girard', 'Dr. Morel',   'Dr. Dupont',   'Dr. Bertrand'],
    ER:       ['Dr. Gauthier','Dr. Lemaire','Dr. Chevalier','Dr. Robin'],
  };

  // ── Escape helpers ──────────────────────────────────────────────────────────
  function escHtml(str) {
    return String(str)
      .replace(/&/g,  '&amp;')
      .replace(/</g,  '&lt;')
      .replace(/>/g,  '&gt;')
      .replace(/"/g,  '&quot;')
      .replace(/'/g,  '&#039;');
  }

  function escAttr(str) {
    return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
  
  
  // ── Cache accessors & writers ────────────────────────────────────────────────
  function readUsers()    { return usersCache;    }
  function readPatients() { return patientsCache; }

  function writeUsers(list) {
    usersCache = list;
    window.saveData(USERS_KEY, list).catch(e => console.warn('writeUsers failed', e));
  }

  function writePatients(list) {
    patientsCache = list;
    window.saveData(PATIENTS_KEY, list).catch(e => console.warn('writePatients failed', e));
  }

  function deptLabel(key) {
    const dept = DEPARTMENTS.find(d => d.key === key);
    return dept ? dept.label : (key || '—');
  }

  function roleLabel(role) {
    const r = ROLES.find(r => r.value === role);
    return r ? r.label : (role || '—');
  }

  // ── Overview ─────────────────────────────────────────────────────────────────
  // Load all collections from Firestore then render
  (async function initFromFirestore() {
    try {
      const [uRes, pRes, hRes] = await Promise.all([
        window.loadData(USERS_KEY),
        window.loadData(PATIENTS_KEY),
        window.loadData('healthone_hospitals'),
      ]);
      if (uRes.ok && Array.isArray(uRes.data)) usersCache    = uRes.data;
      if (pRes.ok && Array.isArray(pRes.data)) patientsCache  = pRes.data;
      if (hRes.ok && Array.isArray(hRes.data)) hospitalsCache = hRes.data;
    } catch (e) {
      console.warn('initFromFirestore failed', e);
    }
    renderOverview();
    renderStaffRows();
    renderHospitals();
    renderServices();
    renderPatientRows();
    // Show overview after data finished loading to ensure counts are populated
    try { showSection('overview'); } catch (e) { /* ignore */ }
  })();

  // ── Sidebar / logout ─────────────────────────────────────────────────────────
  const sidebarUser = document.getElementById('sidebar-user-display');
  if (sidebarUser) sidebarUser.textContent = `${session.username} · Admin`;

  // ── Hospital banner ──────────────────────────────────────────────────────────
  const hospitalBadge = document.getElementById('hospital-badge');
  const hospitalNameSpan = document.getElementById('hospital-name');
  
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
  
  // Update hospital banner
  updateHospitalBanner();

  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('Admin logout button clicked');
      
      try {
        const ok = typeof window.showConfirm === 'function'
          ? await window.showConfirm('Déconnexion', 'Voulez-vous vous déconnecter ?')
          : window.confirm('Voulez-vous vous déconnecter ?');
          
        console.log('Admin logout confirmation:', ok);
        
        if (ok) {
          console.log('User confirmed logout, proceeding...');
          
          // Immediate logout with timeout fallback
          if (typeof window.logoutHealthOne === 'function') {
            window.logoutHealthOne();
          } else {
            console.error('logoutHealthOne function not found, forcing logout');
            localStorage.removeItem('healthone_session');
            window.location.href = 'index.html';
          }
        } else {
          console.log('User cancelled logout');
        }
      } catch (error) {
        console.error('Admin logout error, forcing logout:', error);
        localStorage.removeItem('healthone_session');
        window.location.replace('index.html');
      }
    });
  }

  // ── Navigation ───────────────────────────────────────────────────────────────
  const pageTitle = document.getElementById('page-title');
  const SECTION_TITLES = {
    overview: 'Vue d\'ensemble',
    staff:    'Personnel',
    hospitals:'Hôpitaux',
    services: 'Services',
    patients: 'Dossiers patients',
    files:    'Fichiers de données',
  };

  function showSection(id) {
    document.querySelectorAll('.content-section').forEach(sec => {
      const key = sec.getAttribute('data-section');
      sec.hidden = key !== id;
      sec.classList.toggle('is-visible', key === id);
    });
    document.querySelectorAll('.nav-link[data-section]').forEach(l => {
      l.classList.toggle('is-active', l.getAttribute('data-section') === id);
    });
    if (pageTitle) pageTitle.textContent = SECTION_TITLES[id] || 'Admin';
    if (id === 'overview') renderOverview();
    if (id === 'staff')    renderStaffRows();
    if (id === 'patients') renderPatientRows();
  if (id === 'hospitals') renderHospitals();
  if (id === 'services')  renderServices();
    // files section is static HTML — no render needed
  }

  document.querySelectorAll('.nav-link[data-section]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      showSection(link.getAttribute('data-section'));
    });
  });

  // ── Drawer ───────────────────────────────────────────────────────────────────
  const drawerOverlay = document.getElementById('drawer-overlay');
  const drawer        = document.getElementById('drawer');
  const drawerTitle   = document.getElementById('drawer-title');
  const drawerBody    = document.getElementById('drawer-body');

  function openDrawer(title, html, onReady) {
    drawerTitle.textContent = title;
    drawerBody.innerHTML = html;
    drawer.hidden = false;
    drawerOverlay.hidden = false;
    document.body.style.overflow = 'hidden';
    if (typeof onReady === 'function') onReady();
  }

  function closeDrawer() {
    drawer.hidden = true;
    drawerOverlay.hidden = true;
    document.body.style.overflow = '';
  }

  document.getElementById('btn-drawer-close').addEventListener('click', closeDrawer);
  drawerOverlay.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !drawer.hidden) closeDrawer();
  });

  function showDrawerError(el, msg) {
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
  }

  // ── Dept chips ───────────────────────────────────────────────────────────────
  function deptChipsHtml(depts) {
    if (!depts || depts.length === 0) return '<span class="dept-chip dept-chip--none">—</span>';
    return depts.map(d => `<span class="dept-chip">${escHtml(deptLabel(d))}</span>`).join('');
  }

  function deptCheckboxesHtml(selected) {
    return DEPARTMENTS.map(d => `
      <label class="dept-check">
        <input type="checkbox" name="departments" value="${d.key}"${(selected || []).includes(d.key) ? ' checked' : ''} />
        <span>${d.label}</span>
      </label>`).join('');
  }

  function buildDoctorOptions(dept) {
    return (DEPT_DOCTORS[dept] || []).map(n => `<option value="${escAttr(n)}"></option>`).join('');
  }

  // ── Overview ─────────────────────────────────────────────────────────────────
  function renderOverview() {
    const users    = readUsers();
    const patients = readPatients();
    const statsEl  = document.getElementById('admin-stats');
    const deptEl   = document.getElementById('dept-overview');

    if (statsEl) {
      statsEl.innerHTML = `
        <article class="stat-card card stat-clickable" data-section="staff"><h3>Personnel total</h3><p class="stat-value">${users.length}</p></article>
        <article class="stat-card card stat-clickable" data-section="hospitals"><h3>Hôpitaux</h3><p class="stat-value">${hospitalsCache.length}</p></article>
        <article class="stat-card card stat-clickable" data-section="patients"><h3>Patients enregistrés</h3><p class="stat-value">${patients.length}</p></article>
        <article class="stat-card card stat-clickable" data-section="services"><h3>Services</h3><p class="stat-value">${DEPARTMENTS.length}</p></article>
  <article class="stat-card card stat-clickable" data-section="staff" data-filter-role="Admin"><h3>Comptes Admin</h3><p class="stat-value">${users.filter(u => u.role === 'Admin').length}</p></article>
      `;
      // Wire click handlers to navigate to the corresponding section
      statsEl.querySelectorAll('.stat-clickable').forEach(card => {
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => {
          const target = card.getAttribute('data-section');
          if (!target) return;
          // handle simple filters (e.g., show only Admins)
          const filterRole = card.getAttribute('data-filter-role');
          if (target === 'staff' && filterRole) {
            const sel = document.getElementById('staff-role-filter');
            if (sel) { sel.value = filterRole; staffRole = filterRole; }
          }
          showSection(target);
        });
      });
    }

    if (deptEl) {
      const cards = DEPARTMENTS.map(dept => {
        const staffCount   = users.filter(u => (u.departments || []).includes(dept.key)).length;
        const patientCount = patients.filter(p => p.department === dept.key).length;
        return `<div class="dept-card card">
          <h4 class="dept-card-name">${dept.label}</h4>
          <div class="dept-card-stats">
            <span><strong>${staffCount}</strong> personnel</span>
            <span><strong>${patientCount}</strong> patient${patientCount !== 1 ? 's' : ''}</span>
          </div>
        </div>`;
      }).join('');
      deptEl.innerHTML = `
        <h3 class="section-heading" style="margin:2rem 0 1rem;">Répartition par service</h3>
        <div class="dept-grid">${cards}</div>`;
    }
  }

  // ── Staff ─────────────────────────────────────────────────────────────────────
  let staffSearch   = '';
  let staffRole     = '';
  let staffDept     = '';

  document.getElementById('staff-search').addEventListener('input',  e => { staffSearch = e.target.value.toLowerCase(); renderStaffRows(); });
  document.getElementById('staff-role-filter').addEventListener('change', e => { staffRole = e.target.value; renderStaffRows(); });
  document.getElementById('staff-dept-filter').addEventListener('change', e => { staffDept = e.target.value; renderStaffRows(); });

  function renderStaffRows() {
    const tbody   = document.getElementById('staff-tbody');
    const emptyEl = document.getElementById('staff-empty');
    const countEl = document.getElementById('staff-count');
    const users   = readUsers();

    if (countEl) countEl.textContent = String(users.length);

    const filtered = users.filter(u => {
      const q = staffSearch;
      return (!q || (u.fullName || '').toLowerCase().includes(q) || (u.username || '').toLowerCase().includes(q))
        && (!staffRole || u.role === staffRole)
        && (!staffDept || (u.departments || []).includes(staffDept));
    });

    tbody.innerHTML = '';
    emptyEl.hidden = filtered.length > 0;

    filtered.forEach(user => {
      const lastLogin = user.lastLogin
        ? new Date(user.lastLogin).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
        : '—';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="td-name">${escHtml(user.fullName || '—')}</span></td>
        <td><code class="td-code">${escHtml(user.username)}</code></td>
        <td><span class="role-badge role-badge--${escAttr((user.role||'').toLowerCase())}">${escHtml(roleLabel(user.role))}</span></td>
        <td class="td-muted">${escHtml(user.hospital || '—')}</td>
        <td class="td-depts">${deptChipsHtml(user.departments)}</td>
        <td class="td-muted">${escHtml(lastLogin)}</td>
        <td class="col-actions">
          <button class="btn btn-sm btn-outline" data-action="edit-staff" data-username="${escAttr(user.username)}">Modifier</button>
          <button class="btn btn-sm btn-danger"  data-action="del-staff"  data-username="${escAttr(user.username)}">Supprimer</button>
        </td>`;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('[data-action="edit-staff"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const u = readUsers().find(u => u.username === btn.dataset.username);
        if (u) openEditStaff(u);
      });
    });

    tbody.querySelectorAll('[data-action="del-staff"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const uname = btn.dataset.username;
        if (uname === session.username) {
          await window.showInfo('Action impossible', 'Vous ne pouvez pas supprimer votre propre compte.');
          return;
        }
        const ok = await window.showConfirm('Supprimer ce membre ?', `L'utilisateur « ${uname} » sera définitivement supprimé.`);
        if (!ok) return;
        writeUsers(readUsers().filter(u => u.username !== uname));
        renderStaffRows();
        renderOverview();
      });
    });
  }

  // ── Hospitals rendering ───────────────────────────────────────────────────
  let hospitalSearch = '';

  document.getElementById('hospital-search').addEventListener('input', e => {
    hospitalSearch = e.target.value.toLowerCase();
    renderHospitals();
  });

  function renderHospitals() {
    const container = document.getElementById('hospitals-list');
    if (!container) return;
    if (!hospitalsCache || hospitalsCache.length === 0) {
      container.innerHTML = '<p class="muted">Aucun hôpital configuré. Cliquez sur "Ajouter un hôpital" pour en créer un.</p>';
      return;
    }
    const q = hospitalSearch;
    const filtered = hospitalsCache.filter(h => {
      if (!q) return true;
      const name    = (typeof h === 'string') ? h : (h && h.name    ? h.name    : '');
      const address = (typeof h === 'string') ? '' : (h && h.address ? h.address : '');
      const email   = (typeof h === 'string') ? '' : (h && h.email   ? h.email   : '');
      return name.toLowerCase().includes(q) || address.toLowerCase().includes(q) || email.toLowerCase().includes(q);
    });
    if (filtered.length === 0) {
      container.innerHTML = '<p class="muted" style="padding:1rem;">Aucun hôpital ne correspond à la recherche.</p>';
      return;
    }
    const items = filtered.map(h => {
      const name = (typeof h === 'string') ? h : (h && h.name ? h.name : '');
      const address = (typeof h === 'string') ? '' : (h && h.address ? h.address : '');
      const email = (typeof h === 'string') ? '' : (h && h.email ? h.email : '');
      const phone = (typeof h === 'string') ? '' : (h && h.phone ? h.phone : '');
      return `<li class="hospital-row"><div class="hospital-main"><strong>${escHtml(name)}</strong>${address||email||phone?`<div class="hospital-meta">${escHtml(address||'')}${email?` · <a href="mailto:${escAttr(email)}">${escHtml(email)}</a>`:''}${phone?` · ${escHtml(phone)}`:''}</div>`:''}</div> <div class="hospital-actions"><button class="btn btn-sm btn-ghost" data-action="edit-hospital" data-name="${escAttr(name)}">Modifier</button> <button class="btn btn-sm btn-danger" data-action="del-hospital" data-name="${escAttr(name)}">Supprimer</button></div></li>`;
    }).join('');
    container.innerHTML = `<ul class="list-plain">${items}</ul>`;
    container.querySelectorAll('[data-action="edit-hospital"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.name;
        // find existing hospital object if present
        const existing = hospitalsCache.find(h => ((typeof h === 'string') ? h : (h && h.name)) === name) || null;
        const existingAddress = existing && typeof existing !== 'string' ? (existing.address || '') : '';
        const existingEmail = existing && typeof existing !== 'string' ? (existing.email || '') : '';
        const existingPhone = existing && typeof existing !== 'string' ? (existing.phone || '') : '';
        openDrawer('Modifier l\'hôpital', `
          <form id="drawer-form" class="drawer-form">
            <div class="field">
              <span class="field-label">Nom de l'hôpital</span>
              <input name="newHospital" class="input" value="${escAttr(name)}" required />
            </div>
            <div class="field">
              <span class="field-label">Adresse (optionnelle)</span>
              <input name="newHospitalAddress" class="input" value="${escAttr(existingAddress)}" placeholder="Adresse complète" />
            </div>
            <div class="field">
              <span class="field-label">Email (optionnel)</span>
              <input name="newHospitalEmail" type="email" class="input" value="${escAttr(existingEmail)}" placeholder="contact@hopital.tld" />
            </div>
            <div class="field">
              <span class="field-label">Téléphone (optionnel)</span>
              <input name="newHospitalPhone" class="input" value="${escAttr(existingPhone)}" placeholder="+22890123456" />
            </div>
            <p class="form-message is-error" id="drawer-error" hidden></p>
            <div class="drawer-actions">
              <button type="button" class="btn btn-ghost" id="btn-drawer-cancel">Annuler</button>
              <button type="submit" class="btn btn-primary">Enregistrer</button>
            </div>
          </form>
        `, () => {
          const form = document.getElementById('drawer-form');
          const err = document.getElementById('drawer-error');
          form.addEventListener('submit', (ev) => {
            ev.preventDefault();
            const fd = new FormData(form);
            const val = String(fd.get('newHospital') || '').trim();
            if (!val) { showDrawerError(err, 'Le nom est requis.'); return; }
            const addr = String(fd.get('newHospitalAddress') || '').trim();
            const email = String(fd.get('newHospitalEmail') || '').trim();
            const phone = String(fd.get('newHospitalPhone') || '').trim();
            // replace existing by name
            hospitalsCache = hospitalsCache.map(h => {
              const hname = (typeof h === 'string') ? h : (h && h.name);
              if (hname === name) return { name: val, address: addr || '', email: email || '', phone: phone || '' };
              return (typeof h === 'string') ? { name: h } : h;
            });
            writeHospitals(hospitalsCache);
            closeDrawer();
            renderHospitals();
            renderOverview();
          });
          document.getElementById('btn-drawer-cancel').addEventListener('click', closeDrawer);
        });
      });
    });
    container.querySelectorAll('[data-action="del-hospital"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const name = btn.dataset.name;
        const ok = await window.showConfirm('Supprimer cet hôpital ?', `L\'hôpital « ${name} » sera supprimé.`);
        if (!ok) return;
        hospitalsCache = hospitalsCache.filter(h => ((typeof h === 'string') ? h : (h && h.name)) !== name);
        writeHospitals(hospitalsCache);
        renderHospitals();
        renderOverview();
      });
    });
  }

  document.getElementById('btn-create-hospital').addEventListener('click', () => {
    openDrawer('Ajouter un hôpital', `
      <form id="drawer-form" class="drawer-form">
        <div class="field">
          <span class="field-label">Nom de l'hôpital</span>
          <input name="newHospital" class="input" placeholder="Ex : Hôpital Central" required />
        </div>
        <div class="field">
          <span class="field-label">Adresse (optionnelle)</span>
          <input name="newHospitalAddress" class="input" placeholder="Adresse complète" />
        </div>
        <div class="field">
          <span class="field-label">Email (optionnel)</span>
          <input name="newHospitalEmail" type="email" class="input" placeholder="contact@hopital.tld" />
        </div>
        <div class="field">
          <span class="field-label">Téléphone (optionnel)</span>
          <input name="newHospitalPhone" class="input" placeholder="+22890123456" />
        </div>
        <p class="form-message is-error" id="drawer-error" hidden></p>
        <div class="drawer-actions">
          <button type="button" class="btn btn-ghost" id="btn-drawer-cancel">Annuler</button>
          <button type="submit" class="btn btn-primary">Ajouter</button>
        </div>
      </form>
    `, () => {
      const form = document.getElementById('drawer-form');
      const err = document.getElementById('drawer-error');
      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const fd = new FormData(form);
        const val = String(fd.get('newHospital') || '').trim();
        const addr = String(fd.get('newHospitalAddress') || '').trim();
        const email = String(fd.get('newHospitalEmail') || '').trim();
        const phone = String(fd.get('newHospitalPhone') || '').trim();
        if (!val) { showDrawerError(err, 'Le nom est requis.'); return; }
        const exists = hospitalsCache.some(h => ((typeof h === 'string') ? h : (h && h.name)) === val);
        if (!exists) {
          hospitalsCache.push({ name: val, address: addr || '', email: email || '', phone: phone || '' });
          writeHospitals(hospitalsCache);
        }
        closeDrawer();
        renderHospitals();
        renderOverview();
      });
      document.getElementById('btn-drawer-cancel').addEventListener('click', closeDrawer);
    });
  });

  // ── Services rendering ───────────────────────────────────────────────────
  function renderServices() {
    const container = document.getElementById('services-list');
    if (!container) return;
    const items = DEPARTMENTS.map(d => `<li><strong>${escHtml(d.label)}</strong> <small class="muted">(${escHtml(d.key)})</small></li>`).join('');
    container.innerHTML = `<ul class="list-plain">${items}</ul>`;
  }

  // Create staff
  document.getElementById('btn-create-staff').addEventListener('click', openCreateStaff);

  function rolesOptionsHtml(selected) {
    return ROLES.map(r =>
      `<option value="${r.value}"${r.value === selected ? ' selected' : ''}>${r.label}</option>`
    ).join('');
  }

  function hospitalsOptionsHtml(selected) {
    const opts = hospitalsCache.map(h => {
      const name = (typeof h === 'string') ? h : (h && h.name ? h.name : '');
      return `<option value="${escAttr(name)}"${name === selected ? ' selected' : ''}>${escHtml(name)}</option>`;
    }).join('');
    return opts + `<option value="__new__">+ Ajouter un nouvel hôpital…</option>`;
  }

  function wireHospitalSelect(form) {
    const sel      = form.querySelector('#hospital-select');
    const newField = form.querySelector('#field-new-hospital');
    if (!sel || !newField) return;
    sel.addEventListener('change', () => {
      newField.style.display = sel.value === '__new__' ? '' : 'none';
      const inp = newField.querySelector('input');
      if (inp) inp.required = sel.value === '__new__';
    });
  }

  function resolveHospital(fd, errEl) {
    // Returns the hospital name, or null if validation fails (sets error).
    let hospital = String(fd.get('hospital') || '').trim();
    if (hospital === '__new__') {
      const newName = String(fd.get('newHospital') || '').trim();
      const newAddress = String(fd.get('newHospitalAddress') || '').trim();
      const newEmail = String(fd.get('newHospitalEmail') || '').trim();
      const newPhone = String(fd.get('newHospitalPhone') || '').trim();
      if (!newName) {
        showDrawerError(errEl, 'Veuillez saisir le nom du nouvel hôpital.');
        return null;
      }
      hospital = newName;
      // add structured object if not present
      const exists = hospitalsCache.some(h => ((typeof h === 'string') ? h : (h && h.name)) === hospital);
      if (!exists) {
        hospitalsCache.push({ name: newName, address: newAddress || '', email: newEmail || '', phone: newPhone || '' });
        writeHospitals(hospitalsCache);
      }
    }
    if (!hospital) {
      showDrawerError(errEl, 'L\'hôpital est obligatoire.');
      return null;
    }
    return hospital;
  }

  function openEditStaff(user) {
    openDrawer('Modifier le membre', `
      <form id="drawer-form" class="drawer-form" novalidate>
        <div class="field">
          <span class="field-label">Nom complet</span>
          <input type="text" name="fullName" class="input" value="${escAttr(user.fullName || '')}" required />
        </div>
        <div class="field">
          <span class="field-label">Identifiant</span>
          <input type="text" class="input" value="${escAttr(user.username)}" disabled />
          <span class="field-hint">L'identifiant ne peut pas être modifié.</span>
        </div>
        <div class="field">
          <span class="field-label">Hôpital</span>
          <select name="hospital" id="hospital-select" class="input select" required>
            <option value="">Choisir un hôpital…</option>
            ${hospitalsOptionsHtml(user.hospital || '')}
          </select>
        </div>
        <div class="field" id="field-new-hospital" style="display:none;">
          <span class="field-label">Nom du nouvel hôpital</span>
          <input type="text" name="newHospital" class="input" placeholder="Ex : Hôpital Central de Lomé" />
        </div>
        <div class="field">
          <span class="field-label">Rôle</span>
          <select name="role" class="input select" required>${rolesOptionsHtml(user.role)}</select>
        </div>
        <div class="field">
          <span class="field-label">Services assignés <em class="field-optional">(un ou plusieurs)</em></span>
          <div class="dept-checks">${deptCheckboxesHtml(user.departments)}</div>
        </div>
        <div class="field">
          <span class="field-label">Nouveau mot de passe <em class="field-optional">(laisser vide pour conserver)</em></span>
          <input type="password" name="newPassword" class="input" placeholder="Minimum 6 caractères" autocomplete="new-password" />
        </div>
        <p class="form-message is-error" id="drawer-error" hidden></p>
        <div class="drawer-actions">
          <button type="button" class="btn btn-ghost" id="btn-drawer-cancel">Annuler</button>
          <button type="submit" class="btn btn-primary">Enregistrer</button>
        </div>
      </form>`, () => {
      const form = document.getElementById('drawer-form');
      wireHospitalSelect(form);
      document.getElementById('btn-drawer-cancel').addEventListener('click', closeDrawer);
      form.addEventListener('submit', e => {
        e.preventDefault();
        const fd          = new FormData(e.target);
        const fullName    = String(fd.get('fullName') || '').trim();
        const role        = String(fd.get('role') || '');
        const departments = fd.getAll('departments');
        const newPw       = String(fd.get('newPassword') || '');
        const errEl       = document.getElementById('drawer-error');
        if (!fullName) { showDrawerError(errEl, 'Le nom complet est obligatoire.'); return; }
        if (newPw && newPw.length < 6) { showDrawerError(errEl, 'Le mot de passe doit contenir au moins 6 caractères.'); return; }
        const hospital = resolveHospital(fd, errEl);
        if (hospital === null) return;

        const list = readUsers();
        const idx  = list.findIndex(u => u.username === user.username);
        if (idx === -1) return;
        list[idx] = { ...list[idx], fullName, hospital, role, departments, ...(newPw ? { password: newPw } : {}) };
        writeUsers(list);
        // If cloud helper exists, update the individual users/{uid} doc as well so Firestore stays in sync
        try {
          if (typeof window.healthoneUpdateCloudUser === 'function') {
            const uid = list[idx] && list[idx].uid;
            const updates = { fullName, hospital, role, departments };
            if (newPw) updates.password = newPw;
            if (uid) {
              window.healthoneUpdateCloudUser(uid, updates).catch(e => console.warn('healthoneUpdateCloudUser failed', e));
            } else {
              // If we don't have uid locally, try to find a matching record in healthone_users and update by uid
              (async () => {
                try {
                  const res = await window.loadData('healthone_users');
                  if (res && res.ok && Array.isArray(res.data)) {
                    const match = res.data.find(u => u && (u.username === list[idx].username));
                    if (match && match.uid) {
                      window.healthoneUpdateCloudUser(match.uid, updates).catch(() => {});
                    }
                  }
                } catch (e) { /* noop */ }
              })();
            }
          }
        } catch (e) { console.warn('Error while syncing cloud user', e); }
        closeDrawer();
        renderStaffRows();
        renderOverview();
      });
    });
  }

  function openCreateStaff() {
    openDrawer('Nouveau membre', `
      <form id="drawer-form" class="drawer-form" novalidate>
        <div class="field">
          <span class="field-label">Nom complet</span>
          <input type="text" name="fullName" class="input" required placeholder="Prénom Nom" />
        </div>
        <div class="field">
          <span class="field-label">Identifiant</span>
          <input type="text" name="username" class="input" required placeholder="ex. jmartin" autocomplete="username" />
        </div>
        <div class="field">
          <span class="field-label">Téléphone (E.164)</span>
          <input type="tel" name="phone" class="input" required placeholder="+22890123456" autocomplete="tel" />
        </div>
        <div class="field">
          <span class="field-label">Hôpital</span>
          <select name="hospital" id="hospital-select" class="input select" required>
            <option value="">Choisir un hôpital…</option>
            ${hospitalsOptionsHtml('')}
          </select>
        </div>
        <div class="field" id="field-new-hospital" style="display:none;">
          <span class="field-label">Nom du nouvel hôpital</span>
          <input type="text" name="newHospital" class="input" placeholder="Ex : Hôpital Central de Lomé" />
        </div>
        <div class="field">
          <span class="field-label">Rôle</span>
          <select name="role" class="input select" required>
            <option value="">Choisir…</option>
            ${rolesOptionsHtml('')}
          </select>
        </div>
        <div class="field">
          <span class="field-label">Services assignés <em class="field-optional">(un ou plusieurs)</em></span>
          <div class="dept-checks">${deptCheckboxesHtml([])}</div>
        </div>
        <div class="field">
          <span class="field-label">Mot de passe</span>
          <input type="password" name="password" class="input" required placeholder="Minimum 6 caractères" autocomplete="new-password" />
        </div>
        <p class="form-message is-error" id="drawer-error" hidden></p>
        <div class="drawer-actions">
          <button type="button" class="btn btn-ghost" id="btn-drawer-cancel">Annuler</button>
          <button type="submit" class="btn btn-primary">Créer le compte</button>
        </div>
      </form>`, () => {
      const form = document.getElementById('drawer-form');
      wireHospitalSelect(form);
      document.getElementById('btn-drawer-cancel').addEventListener('click', closeDrawer);
      form.addEventListener('submit', e => {
        e.preventDefault();
        const fd          = new FormData(e.target);
        const fullName    = String(fd.get('fullName') || '').trim();
        const username    = String(fd.get('username') || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
        const phone       = String(fd.get('phone') || '').trim();
        const role        = String(fd.get('role') || '');
        const departments = fd.getAll('departments');
        const password    = String(fd.get('password') || '');
        const errEl       = document.getElementById('drawer-error');

        if (!fullName)                    { showDrawerError(errEl, 'Le nom complet est obligatoire.'); return; }
        if (!username)                    { showDrawerError(errEl, 'L\'identifiant est obligatoire.'); return; }
        if (!/^\+\d{7,15}$/.test(phone))  { showDrawerError(errEl, 'Numéro de téléphone invalide (ex: +22890123456).'); return; }
        if (!role)                        { showDrawerError(errEl, 'Le rôle est obligatoire.'); return; }
        if (password.length < 6)          { showDrawerError(errEl, 'Le mot de passe doit contenir au moins 6 caractères.'); return; }

        const hospital = resolveHospital(fd, errEl);
        if (hospital === null) return;

        const list = readUsers();
        if (list.some(u => u.username === username)) {
          showDrawerError(errEl, 'Cet identifiant est déjà utilisé.'); return;
        }
        if (list.some(u => u.phone === phone)) {
          showDrawerError(errEl, 'Ce numéro de téléphone est déjà utilisé.'); return;
        }

        const newMember = { fullName, username, phone, hospital, password, role, departments, schedule: [], lastLogin: null };

        // Always create in Firebase Auth + Firestore when the helper is available
        if (typeof window.healthoneCreateCloudUser === 'function') {
          {
            // Disable submit button while creating
            const submitBtn = e.target.querySelector('[type="submit"]');
            if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Création...'; }

            window.healthoneCreateCloudUser(newMember).then((result) => {
              if (!result.ok) {
                showDrawerError(errEl, 'Erreur Firebase : ' + (result.error || 'Impossible de créer le compte.'));
                if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Créer le compte'; }
                return;
              }
              // Merge uid/email returned from Firebase into local record
              list.push({ ...newMember, uid: result.uid, email: result.user && result.user.email });
              writeUsers(list);
              closeDrawer();
              renderStaffRows();
              renderOverview();
            }).catch((err2) => {
              showDrawerError(errEl, 'Erreur inattendue : ' + (err2.message || err2));
              if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Créer le compte'; }
            });
            return; // wait for async
          }
        }

        // Local mode
        list.push(newMember);
        writeUsers(list);
        closeDrawer();
        renderStaffRows();
        renderOverview();
      });
    });
  }

  // ── Patients ─────────────────────────────────────────────────────────────────
  let patientSearch = '';
  let patientDept   = '';
  let patientStatus = '';

  document.getElementById('patient-search').addEventListener('input',  e => { patientSearch = e.target.value.toLowerCase(); renderPatientRows(); });
  document.getElementById('patient-dept-filter').addEventListener('change',   e => { patientDept   = e.target.value; renderPatientRows(); });
  document.getElementById('patient-status-filter').addEventListener('change', e => { patientStatus = e.target.value; renderPatientRows(); });

  function renderPatientRows() {
    const tbody   = document.getElementById('patient-tbody');
    const emptyEl = document.getElementById('patient-empty');
    const countEl = document.getElementById('patient-count');
    const patients = readPatients();

    if (countEl) countEl.textContent = String(patients.length);

    const filtered = patients.filter(p => {
      const q = patientSearch;
      return (!q || (p.fullName || '').toLowerCase().includes(q) || (p.assignedDoctor || '').toLowerCase().includes(q))
        && (!patientDept   || p.department === patientDept)
        && (!patientStatus || p.status     === patientStatus);
    });

    tbody.innerHTML = '';
    emptyEl.hidden = filtered.length > 0;

    filtered.forEach(patient => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escHtml(patient.fullName || '—')}</strong></td>
        <td>${escHtml(deptLabel(patient.department))}</td>
        <td>${escHtml(patient.assignedDoctor || '—')}</td>
        <td><span class="status-badge">${escHtml(patient.status || '—')}</span></td>
        <td class="td-muted">${escHtml((patient.regDate || '') + ' ' + (patient.regTime || '')).trim() || '—'}</td>
        <td class="td-muted">${escHtml(patient.registeredBy || '—')}</td>
        <td class="col-actions">
          <button class="btn btn-sm btn-outline" data-action="edit-patient" data-id="${escAttr(patient.id)}">Modifier</button>
          <button class="btn btn-sm btn-danger"  data-action="del-patient"  data-id="${escAttr(patient.id)}">Supprimer</button>
        </td>`;
      tbody.appendChild(tr);
      // clicking the row (outside action buttons) should open the read-only patient description
      tr.addEventListener('click', (e) => {
        if (e.target.closest('button') || e.target.closest('a')) return;
        if (typeof window.showPatientDescription === 'function') {
          try { window.showPatientDescription(patient); } catch (err) { console.warn(err); }
        } else if (typeof window.openPatientById === 'function') {
          try { window.openPatientById(patient.id); } catch (err) { console.warn(err); }
        }
      });
    });

    tbody.querySelectorAll('[data-action="edit-patient"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = readPatients().find(p => p.id === btn.dataset.id);
        if (p) openEditPatient(p);
      });
    });

    tbody.querySelectorAll('[data-action="del-patient"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ok = await window.showConfirm('Supprimer ce dossier ?', 'Ce dossier patient sera définitivement supprimé.');
        if (!ok) return;
        writePatients(readPatients().filter(p => p.id !== btn.dataset.id));
        renderPatientRows();
        renderOverview();
      });
    });
  }

  function openEditPatient(patient) {
    const deptOptions = DEPARTMENTS.map(d =>
      `<option value="${d.key}"${d.key === patient.department ? ' selected' : ''}>${d.label}</option>`
    ).join('');
    const statusOptions = STATUS_OPTIONS.map(s =>
      `<option value="${s.value}"${s.value === patient.status ? ' selected' : ''}>${s.label}</option>`
    ).join('');

    openDrawer('Modifier le dossier patient', `
      <form id="drawer-form" class="drawer-form" novalidate>
        <div class="field">
          <span class="field-label">Nom complet</span>
          <input type="text" name="fullName" class="input" value="${escAttr(patient.fullName || '')}" required />
        </div>
        <div class="field">
          <span class="field-label">Service</span>
          <select name="department" id="edit-dept-select" class="input select">${deptOptions}</select>
        </div>
        <div class="field">
          <span class="field-label">Médecin assigné</span>
          <input type="text" name="assignedDoctor" class="input" value="${escAttr(patient.assignedDoctor === '—' ? '' : (patient.assignedDoctor || ''))}" list="edit-doctor-list" autocomplete="off" placeholder="Dr …" />
          <datalist id="edit-doctor-list">${buildDoctorOptions(patient.department)}</datalist>
        </div>
        <div class="field">
          <span class="field-label">Statut</span>
          <select name="status" class="input select">${statusOptions}</select>
        </div>
        <div class="field">
          <span class="field-label">Date d'entrée</span>
          <input type="date" name="regDate" class="input" value="${escAttr(patient.regDate || '')}" />
        </div>
        <p class="form-message is-error" id="drawer-error" hidden></p>
        <div class="drawer-actions">
          <button type="button" class="btn btn-ghost" id="btn-drawer-cancel">Annuler</button>
          <button type="submit" class="btn btn-primary">Enregistrer</button>
        </div>
      </form>`, () => {
      document.getElementById('btn-drawer-cancel').addEventListener('click', closeDrawer);

      const deptSel    = document.getElementById('edit-dept-select');
      const doctorList = document.getElementById('edit-doctor-list');
      deptSel.addEventListener('change', () => {
        doctorList.innerHTML = buildDoctorOptions(deptSel.value);
      });

      document.getElementById('drawer-form').addEventListener('submit', e => {
        e.preventDefault();
        const fd       = new FormData(e.target);
        const fullName = String(fd.get('fullName') || '').trim();
        const errEl    = document.getElementById('drawer-error');
        if (!fullName) { showDrawerError(errEl, 'Le nom complet est obligatoire.'); return; }

        const list = readPatients();
        const idx  = list.findIndex(p => p.id === patient.id);
        if (idx === -1) return;
        list[idx] = {
          ...list[idx],
          fullName,
          department:      String(fd.get('department') || ''),
          assignedDoctor:  String(fd.get('assignedDoctor') || '').trim() || '—',
          status:          String(fd.get('status') || 'En attente'),
          regDate:         String(fd.get('regDate') || list[idx].regDate || ''),
        };
        writePatients(list);
        closeDrawer();
        renderPatientRows();
        renderOverview();
      });
    });
  }

  // ── Excel — Link buttons (File System Access API) ───────────────────────────

  var btnLinkPatients = document.getElementById('btn-link-patients');
  var btnLinkAccounts = document.getElementById('btn-link-accounts');

  function initSyncBadge(badgeId, linked) {
    var el = document.getElementById(badgeId);
    if (!el) return;
    if (!window.HealthOneExcel || !window.HealthOneExcel.hasFileAccess) {
      el.textContent = 'Sync auto non disponible (Chrome/Edge requis)';
      el.className = 'sync-badge sync-badge--unavailable';
    } else if (linked) {
      el.textContent = '🔗 Synchronisation active';
      el.className = 'sync-badge sync-badge--linked';
    } else {
      el.textContent = '○ Non lié — cliquez sur "Lier le fichier"';
      el.className = 'sync-badge sync-badge--unlinked';
    }
  }

  if (btnLinkPatients) {
    if (!window.HealthOneExcel || !window.HealthOneExcel.hasFileAccess) {
      btnLinkPatients.disabled = true;
      btnLinkPatients.title = 'Requiert Chrome ou Edge';
    }
    btnLinkPatients.addEventListener('click', async function () {
      var ok = await window.HealthOneExcel.linkPatients();
      if (ok) {
        await window.HealthOneExcel.syncPatients(readPatients());
        initSyncBadge('sync-badge-patients', true);
      }
    });
  }

  if (btnLinkAccounts) {
    if (!window.HealthOneExcel || !window.HealthOneExcel.hasFileAccess) {
      btnLinkAccounts.disabled = true;
      btnLinkAccounts.title = 'Requiert Chrome ou Edge';
    }
    btnLinkAccounts.addEventListener('click', async function () {
      var ok = await window.HealthOneExcel.linkAccounts();
      if (ok) {
        await window.HealthOneExcel.syncAccounts(readUsers());
        initSyncBadge('sync-badge-accounts', true);
      }
    });
  }

  initSyncBadge('sync-badge-patients', false);
  initSyncBadge('sync-badge-accounts', false);

  // ── Excel import / export ────────────────────────────────────────────────────

  function fileStatus(id, msg, isError) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.className = 'file-card-status ' + (isError ? 'is-error' : 'is-success');
    el.hidden = false;
    clearTimeout(el._timer);
    el._timer = setTimeout(function () { el.hidden = true; }, 6000);
  }

  // ── Patients export ──────────────────────────────────────────────────────
  var btnExportPatients = document.getElementById('btn-export-patients');
  if (btnExportPatients) {
    btnExportPatients.addEventListener('click', function () {
      try {
        window.HealthOneExcel.exportPatients(readPatients());
        fileStatus('status-patients', 'patients.xlsx téléchargé — enregistrez-le dans data/.', false);
      } catch (err) {
        fileStatus('status-patients', 'Erreur export : ' + (err.message || err), true);
      }
    });
  }

  // ── Patients import ──────────────────────────────────────────────────────
  var inputImportPatients = document.getElementById('input-import-patients');
  if (inputImportPatients) {
    inputImportPatients.addEventListener('change', function () {
      var file = this.files[0];
      if (!file) return;
      this.value = '';
      window.HealthOneExcel.importPatients(file).then(function (imported) {
        if (imported.length === 0) {
          fileStatus('status-patients', 'Aucun patient valide trouvé dans le fichier.', true);
          return;
        }
        return window.showConfirm(
          'Importer les patients',
          imported.length + ' dossier(s) trouvé(s). Cette action remplace toutes les données patients actuelles. Continuer ?'
        ).then(function (ok) {
          if (!ok) return;
          writePatients(imported);
          renderPatientRows();
          renderOverview();
          fileStatus('status-patients', imported.length + ' patient(s) importé(s) avec succès.', false);
        });
      }).catch(function (err) {
        fileStatus('status-patients', 'Erreur import : ' + (err.message || err), true);
      });
    });
  }

  // ── Accounts export ──────────────────────────────────────────────────────
  var btnExportAccounts = document.getElementById('btn-export-accounts');
  if (btnExportAccounts) {
    btnExportAccounts.addEventListener('click', function () {
      try {
        window.HealthOneExcel.exportAccounts(readUsers());
        fileStatus('status-accounts', 'accounts.xlsx téléchargé. Modifiez les rôles/services puis ré-importez.', false);
      } catch (err) {
        fileStatus('status-accounts', 'Erreur export : ' + (err.message || err), true);
      }
    });
  }

  // ── Accounts import ──────────────────────────────────────────────────────
  var inputImportAccounts = document.getElementById('input-import-accounts');
  if (inputImportAccounts) {
    inputImportAccounts.addEventListener('change', function () {
      var file = this.files[0];
      if (!file) return;
      this.value = '';
      window.HealthOneExcel.importAccounts(file).then(function (imported) {
        if (imported.length === 0) {
          fileStatus('status-accounts', 'Aucun compte valide trouvé dans le fichier.', true);
          return;
        }

        var existing = readUsers();
        var updated  = 0;
        var created  = 0;
        var newList  = existing.slice(); // copy

        imported.forEach(function (row) {
          var idx = newList.findIndex(function (u) { return u.username === row.username; });
          if (idx >= 0) {
            // Merge: update name, role, departments — keep password, schedule, lastLogin
            newList[idx] = Object.assign({}, newList[idx], {
              fullName:    row.fullName    || newList[idx].fullName,
              role:        row.role        || newList[idx].role,
              departments: row.departments,
            });
            updated++;
          } else {
            // New account: create with temporary password
            newList.push({
              fullName:    row.fullName,
              username:    row.username,
              password:    'changeme123',
              role:        row.role,
              departments: row.departments,
              schedule:    [],
              lastLogin:   null,
            });
            created++;
          }
        });

        var summary = updated + ' compte(s) mis à jour, ' + created + ' créé(s).';
        if (created > 0) {
          summary += ' Mot de passe temporaire des nouveaux comptes : changeme123';
        }

        return window.showConfirm(
          'Importer les comptes',
          summary + '\n\nAppliquer ces modifications ?'
        ).then(function (ok) {
          if (!ok) return;
          writeUsers(newList);
          renderStaffRows();
          renderOverview();
          fileStatus('status-accounts', summary, false);
        });
      }).catch(function (err) {
        fileStatus('status-accounts', 'Erreur import : ' + (err.message || err), true);
      });
    });
  }

  // ── Initial render ───────────────────────────────────────────────────────────
  // initial rendering is performed after Firestore initialization (initFromFirestore)
})();
