(function () {
  const SESSION_KEY = 'healthone_session';

  // Firebase helpers (Auth + Firestore)
  let firebaseAuthCache = null;
  async function getFirebaseAuthAndDb() {
    if (firebaseAuthCache) return firebaseAuthCache;
    const [appMod, authMod, firestoreLite] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-lite.js'),
    ]);
    const config = window.__HEALTHONE_FIREBASE_CONFIG__ || {};
    const app = appMod.getApps && appMod.getApps().length ? appMod.getApps()[0] : appMod.initializeApp(config);
    const auth = authMod.getAuth(app);
    const db = firestoreLite.getFirestore(app);
    firebaseAuthCache = {
      app, auth, db,
      createUserWithEmailAndPassword: authMod.createUserWithEmailAndPassword,
      signInWithEmailAndPassword: authMod.signInWithEmailAndPassword,
      signOut: authMod.signOut,
      signInWithPhoneNumber: authMod.signInWithPhoneNumber,
      RecaptchaVerifier: authMod.RecaptchaVerifier,
      doc: firestoreLite.doc,
      getDoc: firestoreLite.getDoc,
      setDoc: firestoreLite.setDoc,
    };
    return firebaseAuthCache;
  }

  async function ensureRecaptcha(f) {
    try {
      if (!f || !f.RecaptchaVerifier) return null;
      let container = document.getElementById('recaptcha-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'recaptcha-container';
        container.style.cssText = 'position:fixed;left:-9999px;top:-9999px;';
        document.body.appendChild(container);
      }
      const verifier = new f.RecaptchaVerifier(container, { size: 'invisible' }, f.auth);
      await verifier.render();
      return verifier;
    } catch (e) {
      console.warn('Recaptcha setup failed', e);
      return null;
    }
  }

  // ── Session (always localStorage — per-browser auth state) ──────────────────

  function getSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  async function setSession(user) {
    const session = {
      username: user.username,
      fullName: user.fullName || user.username,
      role: user.role,
      schedule: user.schedule || [],
      hospital: user.hospital || null,
      lastLogin: new Date().toISOString(),
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));

    // Update lastLogin in Firestore
    try {
      const res = await window.loadData('healthone_users');
      if (res.ok && Array.isArray(res.data)) {
        const list = res.data;
        const i = list.findIndex((u) => u.username === user.username);
        if (i >= 0) {
          list[i] = { ...list[i], lastLogin: session.lastLogin };
          await window.saveData('healthone_users', list);
        }
      }
    } catch (e) { console.warn('setSession: failed to update lastLogin', e); }
  }

  window.getHealthOneSession = getSession;

  window.requireAuthOrRedirect = function () {
    if (!getSession()) window.location.href = 'index.html';
  };

  window.logoutHealthOne = function () {
    console.log('Starting logout process...');
    
    try {
      // Clear local session immediately
      localStorage.removeItem(SESSION_KEY);
      console.log('Local session cleared');
      
      // Set a timeout for the logout process
      const logoutTimeout = setTimeout(() => {
        console.log('Logout timeout reached, forcing redirect');
        window.location.replace('index.html');
      }, 3000); // 3 second timeout
      
      // Clear Firebase auth in background
      (async () => {
        try {
          const f = await getFirebaseAuthAndDb();
          if (f && f.signOut && f.auth) {
            console.log('Signing out from Firebase...');
            await f.signOut(f.auth);
            console.log('Firebase signOut successful');
          } else {
            console.log('No Firebase auth to sign out from');
          }
        } catch (e) { 
          console.warn('Firebase signOut failed (continuing with local logout):', e); 
        } finally {
          clearTimeout(logoutTimeout);
          console.log('Redirecting to index.html');
          window.location.href = 'index.html';
        }
      })();
      
    } catch (e) {
      console.error('Logout failed, forcing redirect:', e);
      // Force redirect even if everything else fails
      window.location.replace('index.html');
    }
  };

  // Fallback logout function for when main one fails
  window.forceLogout = function () {
    try {
      localStorage.clear();
      sessionStorage.clear();
      window.location.replace('index.html');
    } catch (e) {
      console.error('Even force logout failed:', e);
      // Last resort - try to navigate using document.location
      document.location.href = 'index.html';
    }
  };

  // ── Create cloud user (called from admin.js) ────────────────────────────────
  // Creates Firebase Auth account (email+password) + writes Firestore profile.
  window.healthoneCreateCloudUser = async function (userProfile) {
    try {
      const f = await getFirebaseAuthAndDb();
      const email = userProfile.username + '@healthone.app';
      let uid;
      try {
        const cred = await f.createUserWithEmailAndPassword(f.auth, email, userProfile.password);
        uid = cred.user.uid;
      } catch (e) {
        return { ok: false, error: e.message || String(e) };
      }
      const newUser = { ...userProfile, uid, email };

      // Write individual user doc at users/{uid}
      await f.setDoc(f.doc(f.db, 'users', uid), newUser, { merge: true });

      // Append to the shared healthone_users array in Firestore
      try {
        const res = await window.loadData('healthone_users');
        const arr = (res.ok && Array.isArray(res.data)) ? res.data : [];
        arr.push(newUser);
        await window.saveData('healthone_users', arr);
      } catch (e) {
        console.warn('healthoneCreateCloudUser: failed to update healthone_users', e);
      }

      return { ok: true, uid, user: newUser };
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    }
  };

  // Update an existing cloud user (users/{uid}) and sync the shared healthone_users array
  window.healthoneUpdateCloudUser = async function (uid, updates) {
    try {
      const f = await getFirebaseAuthAndDb();
      // Write to users/{uid} with merge
      await f.setDoc(f.doc(f.db, 'users', uid), updates, { merge: true });

      // Also update the shared healthone_users array for compatibility
      try {
        const res = await window.loadData('healthone_users');
        const arr = (res && res.ok && Array.isArray(res.data)) ? res.data.slice() : [];
        const idx = arr.findIndex(u => (u && (u.uid === uid || u.username === updates.username || u.username === (updates.username || ''))));
        if (idx >= 0) {
          arr[idx] = { ...arr[idx], ...updates };
        } else {
          // if not found, push a minimal record
          arr.push({ uid, ...updates });
        }
        await window.saveData('healthone_users', arr);
      } catch (e) {
        console.warn('healthoneUpdateCloudUser: failed to update healthone_users array', e);
      }

      return { ok: true };
    } catch (e) {
      console.error('healthoneUpdateCloudUser failed', e);
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  };

  // ── Error helpers ───────────────────────────────────────────────────────────

  function showError(el, msg) {
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
  }

  function clearError(el) {
    if (!el) return;
    el.hidden = true;
    el.textContent = '';
  }

  // ── Login page (index.html) ─────────────────────────────────────────────────

  const loginForm = document.getElementById('form-login');

  if (loginForm) {
    if (getSession()) {
      window.location.href = 'dashboard.html';
    }

    // Admin quick-access toggle
    const btnAdmin = document.getElementById('btn-admin');
    const adminPanel = document.getElementById('admin-panel');
    const btnAdminLogin = document.getElementById('btn-admin-login');

    if (btnAdmin && adminPanel) {
      btnAdmin.addEventListener('click', () => {
        adminPanel.style.display = adminPanel.style.display === 'none' ? 'inline-flex' : 'none';
      });
    }
    if (btnAdminLogin) {
      btnAdminLogin.addEventListener('click', () => {
        const inp = loginForm.querySelector('input[name="identifier"]');
        if (inp) inp.focus();
      });
    }

    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      (async () => {
        const fd = new FormData(loginForm);
        const identifier = String(fd.get('identifier') || '').trim();
        const password = String(fd.get('password') || '');
        const err = document.getElementById('login-error');
        clearError(err);

        if (!identifier) {
          showError(err, 'Veuillez saisir votre num\u00e9ro de t\u00e9l\u00e9phone ou votre identifiant.');
          return;
        }

        const isPhone = /^\+\d{7,15}$/.test(identifier);

        try {
          const f = await getFirebaseAuthAndDb();

          if (!isPhone) {
            // Username → email+password auth ({username}@healthone.app)
            let cred;
            try {
              cred = await f.signInWithEmailAndPassword(f.auth, identifier + '@healthone.app', password);
            } catch (authErr) {
              showError(err, 'Identifiant ou mot de passe incorrect.');
              return;
            }
            const snap = await f.getDoc(f.doc(f.db, 'users', cred.user.uid));
            const exists = typeof snap.exists === 'function' ? snap.exists() : snap.exists;
            const user = exists ? snap.data() : null;
            if (!user) { showError(err, 'Profil introuvable.'); return; }
            await setSession(user);
            window.location.href = user.role === 'Admin' ? 'admin.html' : 'dashboard.html';
            return;
          }

          // Phone → Firebase SMS auth
          const verifier = await ensureRecaptcha(f);
          if (!verifier) { showError(err, 'Impossible d\u2019initialiser la v\u00e9rification.'); return; }
          let confirmation;
          try {
            confirmation = await f.signInWithPhoneNumber(f.auth, identifier, verifier);
          } catch (e) {
            showError(err, 'Impossible d\u2019envoyer le code SMS.');
            return;
          }
          const code = window.prompt('Entrez le code SMS re\u00e7u');
          if (!code) { showError(err, 'Code requis.'); return; }
          let cred;
          try { cred = await confirmation.confirm(code); }
          catch (e) { showError(err, 'Code invalide ou expir\u00e9.'); return; }

          const uid = cred.user.uid;
          const snap = await f.getDoc(f.doc(f.db, 'users', uid));
          const exists = typeof snap.exists === 'function' ? snap.exists() : snap.exists;
          const user = exists ? snap.data() : null;
          if (!user) { showError(err, 'Profil introuvable.'); return; }
          await setSession(user);
          window.location.href = user.role === 'Admin' ? 'admin.html' : 'dashboard.html';

        } catch (e) {
          console.error('Login error', e);
          showError(err, 'Erreur de connexion. V\u00e9rifiez votre configuration Firebase.');
        }
      })();
    });
  }

  // ── Other pages (dashboard.html, admin.html) ────────────────────────────────

  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    window.requireAuthOrRedirect();
    btnLogout.addEventListener('click', async (e) => {
      e.preventDefault();
      console.log('Logout button clicked');
      
      try {
        const ok = typeof window.showConfirm === 'function'
          ? await window.showConfirm('D\u00e9connexion', 'Voulez-vous vous d\u00e9connecter ?')
          : window.confirm('Voulez-vous vous d\u00e9connecter ?');
          
        console.log('Logout confirmation:', ok);
        
        if (ok) {
          console.log('Calling window.logoutHealthOne()');
          if (typeof window.logoutHealthOne === 'function') {
            window.logoutHealthOne();
          } else {
            console.error('logoutHealthOne function not found, forcing logout');
            localStorage.removeItem('healthone_session');
            window.location.href = 'index.html';
          }
        }
      } catch (error) {
        console.error('Logout error:', error);
        // Fallback logout
        localStorage.removeItem('healthone_session');
        window.location.href = 'index.html';
      }
    });
  }
})();
