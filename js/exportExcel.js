(function(){
  // saveToExcel(filename, arrayOfObjects)
  async function saveToExcel(filename, data, sheetName = 'Sheet1') {
    try {
      if (!Array.isArray(data)) data = Array.isArray(data && data.value) ? data.value : (data || []);

      // Prefer File System Access API
      if (window.showSaveFilePicker) {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        const arr = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: 'Excel', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(new Blob([arr]));
        await writable.close();
        return { ok: true };
      }

      // If SheetJS is available, use writeFile which triggers a download
      if (window.XLSX && typeof window.XLSX.writeFile === 'function') {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        try {
          XLSX.writeFile(wb, filename);
          return { ok: true };
        } catch (e) {
          // fallthrough to CSV
          console.warn('XLSX.writeFile failed, falling back to CSV', e);
        }
      }

      // Fallback: export CSV (widely supported). Use .csv extension if original was .xlsx
      const csv = toCSV(data);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      const url = URL.createObjectURL(blob);
      a.href = url;
      // if filename ends with .xlsx replace with .csv
      const dlName = filename && filename.toLowerCase().endsWith('.xlsx') ? filename.slice(0, -5) + '.csv' : (filename || 'export.csv');
      a.download = dlName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return { ok: true };
    } catch (err) {
      console.error('saveToExcel error', err);
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  }

  function toCSV(data) {
    if (!Array.isArray(data) || data.length === 0) return '';
    const keys = Object.keys(data[0]);
    const rows = [keys.join(',')];
    for (const item of data) {
      const vals = keys.map((k) => {
        const v = item[k] == null ? '' : String(item[k]);
        // escape quotes
        if (v.indexOf(',') >= 0 || v.indexOf('"') >= 0 || v.indexOf('\n') >= 0) {
          return '"' + v.replace(/"/g, '""') + '"';
        }
        return v;
      });
      rows.push(vals.join(','));
    }
    return rows.join('\n');
  }

  window.saveToExcel = saveToExcel;
  
  // --- File System Access persistent handles using IndexedDB ---
  const DB_NAME = 'healthone_fs_handles';
  const STORE = 'handles';

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IDB open failed'));
    });
  }

  async function idbGet(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const r = store.get(key);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => reject(r.error);
    });
  }

  async function idbSet(key, value) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const r = store.put(value, key);
      r.onsuccess = () => resolve(true);
      r.onerror = () => reject(r.error);
    });
  }

  async function getHandle(type) {
    try {
      const h = await idbGet(type + ':handle');
      return h || null;
    } catch (e) {
      console.warn('getHandle idb error', e);
      return null;
    }
  }

  async function setHandleViaPicker(type, suggestedName) {
    if (!window.showSaveFilePicker) {
      throw new Error('File System Access API not supported');
    }
    const handle = await window.showSaveFilePicker({
      suggestedName,
      types: [{ description: 'Excel', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }],
    });
    // store the handle in IndexedDB (structured clone)
    // try to request persistent write permission immediately
    try {
      if (typeof handle.requestPermission === 'function') {
        await handle.requestPermission({ mode: 'readwrite' });
      }
    } catch (e) {
      console.warn('Requesting permission on handle picker failed', e);
    }
    await idbSet(type + ':handle', handle);
    return handle;
  }

  async function writeWorkbookToHandle(handle, wb) {
    const arr = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    // Ensure we have write permission where supported
    try {
      if (typeof handle.queryPermission === 'function') {
        const q = await handle.queryPermission({ mode: 'readwrite' });
        if (q !== 'granted') {
          const r = await handle.requestPermission({ mode: 'readwrite' });
          if (r !== 'granted') throw new Error('Write permission denied for file handle');
        }
      }
    } catch (permErr) {
      console.warn('Permission check/request failed', permErr);
      // continue and try createWritable; it may still work or throw
    }
    const writable = await handle.createWritable();
    await writable.write(new Blob([arr]));
    await writable.close();
  }

  // Expose helpers to set persistent handles and to auto-save
  window.setExportHandle = async function(type, suggestedName) {
    return setHandleViaPicker(type, suggestedName);
  };

  window.autoSaveToFile = async function(type, filename, data) {
    try {
      const handle = await getHandle(type);
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(Array.isArray(data) ? data : (data && data.value) ? data.value : []);
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      if (handle) {
        await writeWorkbookToHandle(handle, wb);
        return { ok: true };
      }
      // no persistent handle: do not ask user — fallback to localStorage storage
      // store under localStorage key 'export_preview:{type}' so user can download later
      try {
        localStorage.setItem('export_preview:' + type, JSON.stringify(Array.isArray(data) ? data : (data && data.value) ? data.value : []));
      } catch (e) {
        console.warn('autoSaveToFile failed to write preview to localStorage', e);
      }
      return { ok: false, error: 'no_handle' };
    } catch (err) {
      console.error('autoSaveToFile error', err);
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  };

  // Read workbook from a stored handle and return JSON array
  async function readWorkbookFromHandle(handle) {
    try {
      // Ensure read permission when available
      try {
        if (typeof handle.queryPermission === 'function') {
          const q = await handle.queryPermission({ mode: 'read' });
          if (q !== 'granted') {
            await handle.requestPermission({ mode: 'read' });
          }
        }
      } catch (permErr) {
        console.warn('Permission check/request for read failed', permErr);
      }
      const file = await handle.getFile();
      const arr = await file.arrayBuffer();
      const wb = XLSX.read(arr, { type: 'array' });
      const first = wb.SheetNames && wb.SheetNames[0];
      if (!first) return [];
      const ws = wb.Sheets[first];
      const json = XLSX.utils.sheet_to_json(ws, { defval: null });
      return Array.isArray(json) ? json : [];
    } catch (err) {
      console.error('readWorkbookFromHandle error', err);
      return null;
    }
  }

  window.loadFromFile = async function(type) {
    try {
      const handle = await getHandle(type);
      if (!handle) return { ok: false, error: 'no_handle', data: null };
      const data = await readWorkbookFromHandle(handle);
      if (data == null) return { ok: false, error: 'read_failed', data: null };
      return { ok: true, data };
    } catch (err) {
      console.error('loadFromFile error', err);
      return { ok: false, error: err && err.message ? err.message : String(err), data: null };
    }
  };
})();
