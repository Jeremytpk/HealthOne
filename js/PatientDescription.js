// PatientDescription.js
// Render a patient details drawer with inline editing capability
(function () {
  let currentPatient = null;
  let isEditMode = false;

  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || c));
  }

  function row(label, value) {
    if (!value) return '';
    return `<div class="patient-desc-row"><span class="patient-desc-label">${label}</span><span class="patient-desc-value">${escapeHtml(value)}</span></div>`;
  }

  function editRow(label, fieldName, value, type = 'text') {
    const fieldValue = escapeHtml(value || '');
    if (type === 'select' && fieldName === 'department') {
      return `
        <div class="patient-desc-edit-row">
          <label class="patient-desc-label">${label}</label>
          <select name="${fieldName}" class="input patient-desc-input">
            <option value="">Sélectionner...</option>
            <option value="General" ${value === 'General' ? 'selected' : ''}>Général</option>
            <option value="Pediatre" ${value === 'Pediatre' ? 'selected' : ''}>Pédiatrie</option>
            <option value="Dental" ${value === 'Dental' ? 'selected' : ''}>Dentaire</option>
            <option value="Surgery" ${value === 'Surgery' ? 'selected' : ''}>Chirurgie</option>
            <option value="ER" ${value === 'ER' ? 'selected' : ''}>Urgences</option>
          </select>
        </div>`;
    } else if (type === 'select' && fieldName === 'status') {
      return `
        <div class="patient-desc-edit-row">
          <label class="patient-desc-label">${label}</label>
          <select name="${fieldName}" class="input patient-desc-input">
            <option value="Admitted" ${value === 'Admitted' ? 'selected' : ''}>Admis</option>
            <option value="InTreatment" ${value === 'InTreatment' ? 'selected' : ''}>En traitement</option>
            <option value="Discharged" ${value === 'Discharged' ? 'selected' : ''}>Sorti</option>
            <option value="Transferred" ${value === 'Transferred' ? 'selected' : ''}>Transféré</option>
          </select>
        </div>`;
    } else if (type === 'textarea') {
      return `
        <div class="patient-desc-edit-row">
          <label class="patient-desc-label">${label}</label>
          <textarea name="${fieldName}" class="input patient-desc-textarea" rows="3">${fieldValue}</textarea>
        </div>`;
    } else {
      return `
        <div class="patient-desc-edit-row">
          <label class="patient-desc-label">${label}</label>
          <input type="${type}" name="${fieldName}" value="${fieldValue}" class="input patient-desc-input" />
        </div>`;
    }
  }

  function renderPatientHtml(p) {
    if (!p) return '<div class="empty">Aucun patient sélectionné</div>';
    return `
      <div class="patient-desc">
        <h3 class="patient-desc-name">${escapeHtml(p.fullName || p.name || '—')}</h3>
        ${row('Identifiant', p.id)}
        ${row('Hôpital', p.hospital)}
        ${row('Service', p.department)}
        ${row('Médecin', p.assignedDoctor)}
        ${row('Statut', p.status)}
        ${row('Date entrée', p.regDate)}
        ${row('Heure entrée', p.regTime)}
        ${row('Enregistré par', p.registeredBy)}
        ${row('Motif', p.visitReason)}
        ${row('Téléphone', p.phone)}
        ${row('Email', p.email)}
        ${p.description ? `
          <div class="patient-desc-section">
            <span class="patient-desc-label">Description</span>
            <p class="patient-desc-text">${escapeHtml(p.description)}</p>
          </div>` : ''}
        ${Array.isArray(p.visits) && p.visits.length ? `
          <div class="patient-desc-section">
            <span class="patient-desc-label">Visites (${p.visits.length})</span>
            <ol class="patient-visits">
              ${p.visits.slice(-5).reverse().map(v => `<li>${escapeHtml((v.date || '') + ' ' + (v.time || '') + ' — ' + (v.department || '') + ' — ' + (v.status || ''))}</li>`).join('')}
            </ol>
          </div>` : ''}
      </div>`;
  }

  function renderEditHtml(p) {
    if (!p) return '<div class="empty">Aucun patient sélectionné</div>';
    return `
      <div class="patient-desc-edit">
        <form id="patient-edit-form">
          <div class="patient-desc-edit-header">
            <h3 class="patient-desc-name">Modifier: ${escapeHtml(p.fullName || p.name || '—')}</h3>
          </div>
          
          <div class="patient-desc-edit-grid">
            ${editRow('Nom complet', 'fullName', p.fullName)}
            ${editRow('Email', 'email', p.email, 'email')}
            ${editRow('Téléphone', 'phone', p.phone, 'tel')}
            ${editRow('Service', 'department', p.department, 'select')}
            ${editRow('Médecin', 'assignedDoctor', p.assignedDoctor)}
            ${editRow('Statut', 'status', p.status, 'select')}
            ${editRow('Motif de visite', 'visitReason', p.visitReason)}
            ${editRow('Description', 'description', p.description, 'textarea')}
          </div>
        </form>
      </div>`;
  }

  function createDrawer() {
    let overlay = document.getElementById('patient-desc-overlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'patient-desc-overlay';
    overlay.className = 'drawer-overlay';
    overlay.hidden = true;

    const drawer = document.createElement('div');
    drawer.id = 'patient-desc-drawer';
    drawer.className = 'drawer';
    drawer.hidden = true;
    drawer.innerHTML = `
      <div class="drawer-header">
        <h2 class="drawer-title" id="drawer-title">Fiche patient</h2>
        <button id="patient-desc-close" class="btn-icon" aria-label="Fermer">&#x2715;</button>
      </div>
      <div class="drawer-body">
        <div id="patient-desc-content"></div>
      </div>
      <div class="drawer-actions" id="drawer-actions">
        <button id="patient-desc-edit" class="btn btn-outline">Modifier</button>
        <button id="patient-desc-close2" class="btn btn-primary">Fermer</button>
      </div>`;

    document.body.appendChild(overlay);
    document.body.appendChild(drawer);
    return overlay;
  }

  function removeDrawer() {
    const overlay = document.getElementById('patient-desc-overlay');
    const drawer  = document.getElementById('patient-desc-drawer');
    if (overlay) overlay.hidden = true;
    if (drawer)  drawer.hidden  = true;
    isEditMode = false;
    currentPatient = null;
  }

  function toggleEditMode() {
    if (!currentPatient) return;
    
    isEditMode = !isEditMode;
    const content = document.getElementById('patient-desc-content');
    const drawerTitle = document.getElementById('drawer-title');
    const drawerActions = document.getElementById('drawer-actions');
    
    if (isEditMode) {
      content.innerHTML = renderEditHtml(currentPatient);
      drawerTitle.textContent = 'Modifier patient';
      drawerActions.innerHTML = `
        <button id="patient-desc-cancel" class="btn btn-ghost">Annuler</button>
        <button id="patient-desc-save" class="btn btn-primary">Enregistrer</button>
      `;
      
      // Wire up cancel button
      document.getElementById('patient-desc-cancel').onclick = () => {
        toggleEditMode(); // Switch back to read mode
      };
      
      // Wire up save button
      document.getElementById('patient-desc-save').onclick = savePatientChanges;
      
    } else {
      content.innerHTML = renderPatientHtml(currentPatient);
      drawerTitle.textContent = 'Fiche patient';
      drawerActions.innerHTML = `
        <button id="patient-desc-edit" class="btn btn-outline">Modifier</button>
        <button id="patient-desc-close2" class="btn btn-primary">Fermer</button>
      `;
      
      // Re-wire edit button
      document.getElementById('patient-desc-edit').onclick = toggleEditMode;
      // Re-wire close button
      document.getElementById('patient-desc-close2').onclick = removeDrawer;
    }
  }

  async function savePatientChanges() {
    try {
      const form = document.getElementById('patient-edit-form');
      if (!form) return;
      
      const formData = new FormData(form);
      const updatedPatient = { ...currentPatient };
      
      // Update patient data from form
      for (const [key, value] of formData.entries()) {
        updatedPatient[key] = value;
      }
      
      // Save to storage using the global saveData function
      if (typeof window.saveData === 'function') {
        const PATIENTS_KEY = 'healthone_patients';
        const res = await window.loadData(PATIENTS_KEY);
        let patients = [];
        
        if (res.ok && Array.isArray(res.data)) {
          patients = res.data;
        }
        
        // Find and update the patient
        const patientIndex = patients.findIndex(p => p.id === currentPatient.id);
        if (patientIndex >= 0) {
          patients[patientIndex] = updatedPatient;
          
          // Save back to storage
          const saveRes = await window.saveData(PATIENTS_KEY, patients);
          if (saveRes.ok) {
            currentPatient = updatedPatient;
            
            // Show success message
            if (typeof window.showInfo === 'function') {
              window.showInfo('Succès', 'Les modifications du patient ont été enregistrées.');
            }
            
            // Refresh the patient list UI if available
            if (typeof window.refreshPatientListUI === 'function') {
              await window.refreshPatientListUI();
            }
            
            // Switch back to read mode
            toggleEditMode();
          } else {
            throw new Error('Erreur lors de la sauvegarde');
          }
        } else {
          throw new Error('Patient non trouvé');
        }
      } else {
        throw new Error('Fonction de sauvegarde non disponible');
      }
      
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
      if (typeof window.showInfo === 'function') {
        window.showInfo('Erreur', 'Impossible de sauvegarder les modifications: ' + error.message);
      } else {
        alert('Erreur: ' + error.message);
      }
    }
  }

  async function showPatientDescription(patient) {
    try {
      currentPatient = patient;
      isEditMode = false;
      
      createDrawer();

      const content = document.getElementById('patient-desc-content');
      content.innerHTML = renderPatientHtml(patient);

      const overlay = document.getElementById('patient-desc-overlay');
      const drawer  = document.getElementById('patient-desc-drawer');
      overlay.hidden = false;
      drawer.hidden  = false;

      // wire close buttons
      const closeBtn  = document.getElementById('patient-desc-close');
      const closeBtn2 = document.getElementById('patient-desc-close2');
      closeBtn.onclick  = removeDrawer;
      closeBtn2.onclick = removeDrawer;

      // close by clicking the backdrop
      overlay.onclick = (e) => { if (e.target === overlay) removeDrawer(); };

      // edit button
      document.getElementById('patient-desc-edit').onclick = toggleEditMode;

      return true;
    } catch (e) {
      console.error('showPatientDescription failed', e);
      return false;
    }
  }

  window.showPatientDescription = showPatientDescription;
})();
