(function () {
  // All application data is stored in Firebase Firestore.
  // localStorage is only used for the session token (per-browser auth state).
  // getStorageMode / setStorageMode are kept as no-ops for any legacy references.
  window.storageMode = 'cloud';
  window.getStorageMode = function () { return 'cloud'; };
  window.setStorageMode = function () {};

  let firebaseCache = null;

  async function getFirebaseLite() {
    if (firebaseCache) return firebaseCache;
    const [{ initializeApp, getApps }, firestoreLite] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-lite.js'),
    ]);
    const config = window.__HEALTHONE_FIREBASE_CONFIG__;
    if (!config || !config.projectId) throw new Error('Firebase config not ready — check js/firebase-config.js');
    const app = getApps().length ? getApps()[0] : initializeApp(config);
    const db = firestoreLite.getFirestore(app);
    firebaseCache = {
      db,
      doc: firestoreLite.doc,
      setDoc: firestoreLite.setDoc,
      getDoc: firestoreLite.getDoc,
    };
    return firebaseCache;
  }

  /**
   * Persist data to Firestore under healthone/{key}.
   * @returns {Promise<{ ok: boolean, error?: string }>}
   */
  window.saveData = async function saveData(key, data) {
    try {
      const { db, doc, setDoc } = await getFirebaseLite();
      await setDoc(
        doc(db, 'healthone', key),
        { value: data, updatedAt: new Date().toISOString() },
        { merge: true }
      );
      return { ok: true };
    } catch (e) {
      console.error('[HealthOne] saveData failed', e);
      return { ok: false, error: e && e.message ? e.message : 'Echec de la sauvegarde' };
    }
  };

  /**
   * Load data from Firestore healthone/{key}.
   * @returns {Promise<{ ok: boolean, data: any, error?: string }>}
   */
  window.loadData = async function loadData(key) {
    try {
      const { db, doc, getDoc } = await getFirebaseLite();
      const snap = await getDoc(doc(db, 'healthone', key));
      const exists = typeof snap.exists === 'function' ? snap.exists() : snap.exists;
      if (!exists) return { ok: true, data: null };
      const v = snap.data();
      const data = v && Object.prototype.hasOwnProperty.call(v, 'value') ? v.value : v;
      return { ok: true, data };
    } catch (e) {
      console.error('[HealthOne] loadData failed', e);
      return { ok: false, error: e && e.message ? e.message : 'Echec du chargement', data: null };
    }
  };
})();
