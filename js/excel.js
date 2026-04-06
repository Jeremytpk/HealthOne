/**
 * HealthOne — Excel sync engine (SheetJS + File System Access API)
 *
 * Exposes window.HealthOneExcel with:
 *   linkPatients()        — pick / create patients.xlsx on disk (one-time per session)
 *   linkAccounts()        — pick / create accounts.xlsx on disk (one-time per session)
 *   syncPatients(list)    — silently write list → linked patients.xlsx
 *   syncAccounts(list)    — silently write list → linked accounts.xlsx
 *   exportPatients(list)  — force-download patients.xlsx
 *   exportAccounts(list)  — force-download accounts.xlsx
 *   importPatients(file)  → Promise<patients[]>
 *   importAccounts(file)  → Promise<accounts[]>
 *   isPatientsLinked()    → bool
 *   isAccountsLinked()    → bool
 *   hasFileAccess         — bool (File System Access API supported)
 *
 * Requires XLSX loaded globally via CDN before this script.
 */
(function () {

  // ── SheetJS guard ────────────────────────────────────────────────────────────
  function requireXLSX() {
    if (typeof window.XLSX === 'undefined') throw new Error('XLSX non chargé.');
    return window.XLSX;
  }

  // ── Column definitions ───────────────────────────────────────────────────────
  var PATIENT_COLS  = [18, 26, 14, 22, 15, 13, 13, 18];
  var ACCOUNT_COLS  = [16, 24, 12, 26, 20, 38, 38];
  var VALID_ROLES   = ['Admin', 'Register', 'Nurse', 'Doctor', 'Dentist', 'Pediatre'];
  var VALID_DEPTS   = ['General', 'Pediatre', 'Dental', 'Surgery', 'ER'];
  var ROLES_HINT    = VALID_ROLES.join(' | ');
  var DEPTS_HINT    = VALID_DEPTS.join(' | ');

  // ── Shared helpers ───────────────────────────────────────────────────────────
  function buildWorkbook(rows, sheetName, colWidths) {
    var XLSX = requireXLSX();
    var ws   = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = colWidths.map(function (wch) { return { wch: wch }; });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    return wb;
  }

  /** Serialize workbook to Uint8Array buffer (no download). */
  function wbToBuffer(wb) {
    return requireXLSX().write(wb, { bookType: 'xlsx', type: 'array' });
  }

  /** Trigger browser download of a workbook. */
  function downloadWb(wb, filename) {
    requireXLSX().writeFile(wb, filename);
  }

  /** Parse first sheet of a File object → Promise<Array<Object>>. */
  function parseFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) {
        try {
          var wb   = requireXLSX().read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });
          var rows = requireXLSX().utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
          resolve(rows);
        } catch (err) { reject(err); }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  // ── Row builders ─────────────────────────────────────────────────────────────
  function buildPatientRows(patients) {
    var rows = patients.map(function (p) {
      return {
        'ID':              p.id                           || '',
        'Nom complet':     p.fullName                     || '',
        'Service':         p.department                   || '',
        'Médecin assigné': p.assignedDoctor === '—' ? '' : (p.assignedDoctor || ''),
        'Statut':          p.status                       || '',
        'Date entrée':     p.regDate                      || '',
        'Heure entrée':    p.regTime                      || '',
        'Enregistré par':  p.registeredBy                 || '',
      };
    });
    if (rows.length === 0) {
      rows.push({
        'ID': '', 'Nom complet': '', 'Service': DEPTS_HINT,
        'Médecin assigné': '', 'Statut': 'En attente | En triage | En traitement | Sorti(e)',
        'Date entrée': 'AAAA-MM-JJ', 'Heure entrée': 'HH:MM', 'Enregistré par': '',
      });
    }
    return rows;
  }

  function buildAccountRows(users) {
    return users.map(function (u, i) {
      var row = {
        'Identifiant':        u.username                  || '',
        'Nom complet':        u.fullName                  || '',
        'Rôle':               u.role                      || '',
        'Services':           (u.departments || []).join(', '),
        'Dernière connexion': u.lastLogin
          ? new Date(u.lastLogin).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
          : '',
        '← Rôles valides':    i === 0 ? ROLES_HINT : '',
        '← Services valides': i === 0 ? DEPTS_HINT : '',
      };
      return row;
    });
  }

  // ── Toast notification ───────────────────────────────────────────────────────
  function showToast(msg, isError) {
    var toast = document.getElementById('ho-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'ho-toast';
      toast.className = 'ho-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.className = 'ho-toast ' + (isError ? 'ho-toast--error' : 'ho-toast--ok') + ' ho-toast--show';
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toast.classList.remove('ho-toast--show'); }, 3500);
  }

  // ── File System Access API ───────────────────────────────────────────────────
  var HAS_FILE_ACCESS = (typeof window !== 'undefined') && ('showSaveFilePicker' in window);

  var _patientsHandle = null;
  var _accountsHandle = null;

  var XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  var XLSX_PICKER_TYPES = [{ description: 'Classeur Excel', accept: {} }];
  XLSX_PICKER_TYPES[0].accept[XLSX_MIME_TYPE] = ['.xlsx'];

  async function openSavePicker(suggestedName) {
    return window.showSaveFilePicker({ suggestedName: suggestedName, types: XLSX_PICKER_TYPES });
  }

  async function writeToHandle(handle, wb) {
    var buf      = wbToBuffer(wb);
    var writable = await handle.createWritable();
    await writable.write(new Blob([buf], { type: XLSX_MIME_TYPE }));
    await writable.close();
  }

  // ── Sync status UI helpers ───────────────────────────────────────────────────
  function updateSyncBadge(elId, linked, filename) {
    var el = document.getElementById(elId);
    if (!el) return;
    if (linked) {
      el.textContent = '🔗 Lié — ' + (filename || 'fichier sélectionné');
      el.className = 'sync-badge sync-badge--linked';
    } else {
      el.textContent = HAS_FILE_ACCESS ? '○ Non lié' : 'API non disponible sur ce navigateur';
      el.className = 'sync-badge sync-badge--unlinked';
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────────
  window.HealthOneExcel = {

    hasFileAccess: HAS_FILE_ACCESS,

    isPatientsLinked: function () { return !!_patientsHandle; },
    isAccountsLinked: function () { return !!_accountsHandle; },

    // ── Link a file on disk (called from admin UI) ───────────────────────────
    linkPatients: async function () {
      if (!HAS_FILE_ACCESS) { showToast('Sync automatique non disponible sur ce navigateur.', true); return false; }
      try {
        _patientsHandle = await openSavePicker('patients.xlsx');
        updateSyncBadge('sync-badge-patients', true, _patientsHandle.name);
        showToast('patients.xlsx lié — synchronisation automatique activée.', false);
        return true;
      } catch (e) {
        if (e && e.name !== 'AbortError') showToast('Liaison annulée : ' + e.message, true);
        return false;
      }
    },

    linkAccounts: async function () {
      if (!HAS_FILE_ACCESS) { showToast('Sync automatique non disponible sur ce navigateur.', true); return false; }
      try {
        _accountsHandle = await openSavePicker('accounts.xlsx');
        updateSyncBadge('sync-badge-accounts', true, _accountsHandle.name);
        showToast('accounts.xlsx lié — synchronisation automatique activée.', false);
        return true;
      } catch (e) {
        if (e && e.name !== 'AbortError') showToast('Liaison annulée : ' + e.message, true);
        return false;
      }
    },

    // ── Auto-sync (silent write to linked file, no download) ─────────────────
    syncPatients: async function (patients) {
      if (!_patientsHandle) return { skipped: true };
      try {
        var wb = buildWorkbook(buildPatientRows(patients), 'Patients', PATIENT_COLS);
        await writeToHandle(_patientsHandle, wb);
        showToast('✓ patients.xlsx mis à jour', false);
        return { ok: true };
      } catch (e) {
        showToast('Sync patients.xlsx : ' + (e.message || e), true);
        return { ok: false, error: e.message };
      }
    },

    syncAccounts: async function (users) {
      if (!_accountsHandle) return { skipped: true };
      try {
        var wb = buildWorkbook(buildAccountRows(users), 'Comptes', ACCOUNT_COLS);
        await writeToHandle(_accountsHandle, wb);
        showToast('✓ accounts.xlsx mis à jour', false);
        return { ok: true };
      } catch (e) {
        showToast('Sync accounts.xlsx : ' + (e.message || e), true);
        return { ok: false, error: e.message };
      }
    },

    // ── Manual force-download ────────────────────────────────────────────────
    exportPatients: function (patients) {
      var wb = buildWorkbook(buildPatientRows(patients), 'Patients', PATIENT_COLS);
      downloadWb(wb, 'patients.xlsx');
    },

    exportAccounts: function (users) {
      var rows = buildAccountRows(users.length ? users : [{
        username: '(exemple)', fullName: 'Prénom Nom', role: 'Nurse',
        departments: ['General'], lastLogin: null,
      }]);
      var wb = buildWorkbook(rows, 'Comptes', ACCOUNT_COLS);
      downloadWb(wb, 'accounts.xlsx');
    },

    // ── Import from uploaded File ────────────────────────────────────────────
    importPatients: function (file) {
      return parseFile(file).then(function (rows) {
        return rows.map(function (r) {
          var id = String(r['ID'] || '').trim();
          return {
            id:             id || crypto.randomUUID(),
            fullName:       String(r['Nom complet']     || '').trim(),
            department:     String(r['Service']         || '').trim(),
            assignedDoctor: String(r['Médecin assigné'] || '').trim() || '—',
            status:         String(r['Statut']          || 'En attente').trim(),
            regDate:        String(r['Date entrée']     || '').trim(),
            regTime:        String(r['Heure entrée']    || '').trim(),
            registeredBy:   String(r['Enregistré par']  || '').trim(),
          };
        }).filter(function (p) { return p.fullName && p.fullName !== '(vide)'; });
      });
    },

    importAccounts: function (file) {
      return parseFile(file).then(function (rows) {
        return rows.map(function (r) {
          var username = String(r['Identifiant'] || '').toLowerCase().trim().replace(/[^a-z0-9._-]/g, '');
          var role     = String(r['Rôle'] || '').trim();
          var depts    = String(r['Services'] || '').split(',')
            .map(function (s) { return s.trim(); })
            .filter(function (s) { return VALID_DEPTS.includes(s); });
          return { username: username, fullName: String(r['Nom complet'] || '').trim(), role: role, departments: depts };
        }).filter(function (u) {
          return u.username && u.username !== '(exemple)' && VALID_ROLES.includes(u.role);
        });
      });
    },

    showToast: showToast,
  };

  // ── Backward-compat aliases used by admin.js ─────────────────────────────────
  window.exportPatientsExcel  = function (p) { window.HealthOneExcel.exportPatients(p); };
  window.exportAccountsExcel  = function (u) { window.HealthOneExcel.exportAccounts(u); };
  window.importPatientsExcel  = function (f) { return window.HealthOneExcel.importPatients(f); };
  window.importAccountsExcel  = function (f) { return window.HealthOneExcel.importAccounts(f); };
  window.excelReady           = function ()  { try { requireXLSX(); return true; } catch { return false; } };

})();
