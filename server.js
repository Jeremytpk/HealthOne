const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const XLSX = require('xlsx');
const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_CREATION_CODE = process.env.ADMIN_CODE || 'ADMIN2026';

app.use(express.json({ limit: '5mb' }));

// Simple CORS for development
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function fileForKey(key) {
  // sanitize key to filename
  const name = String(key).replace(/[^a-z0-9_\-\.]/gi, '_');
  return path.join(DATA_DIR, name + '.json');
}

app.post('/api/data/:key', async (req, res) => {
  try {
    const key = req.params.key;
    const payload = req.body && req.body.value !== undefined ? req.body.value : req.body;
    const file = fileForKey(key);
    await fs.promises.writeFile(file, JSON.stringify(payload, null, 2), 'utf8');
    // If key looks like users or patients, write an XLSX copy as well
    try {
      if (key === 'healthone_users') {
        const wb = XLSX.utils.book_new();
        const data = Array.isArray(payload) ? payload : (payload && payload.value) ? payload.value : [];
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, 'Accounts');
        XLSX.writeFile(wb, path.join(DATA_DIR, 'accounts.xlsx'));
      }
      if (key === 'healthone_patients') {
        const wb = XLSX.utils.book_new();
        const data = Array.isArray(payload) ? payload : (payload && payload.value) ? payload.value : [];
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, 'Patients');
        XLSX.writeFile(wb, path.join(DATA_DIR, 'patients.xlsx'));
      }
    } catch (e) {
      console.warn('Failed to write xlsx for key', key, e.message || e);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('save error', err);
    res.status(500).send(String(err && err.message ? err.message : err));
  }
});

// Auth endpoints
app.post('/api/auth/signup', async (req, res) => {
  try {
    const u = req.body;
    if (!u || !u.username || !u.password) return res.status(400).json({ ok: false, error: 'username and password required' });
    const usersFile = fileForKey('healthone_users');
    let users = [];
    if (fs.existsSync(usersFile)) {
      try { users = JSON.parse(await fs.promises.readFile(usersFile, 'utf8')); } catch (e) { users = []; }
    }
    if (users.some((x) => x.username === u.username)) return res.status(409).json({ ok: false, error: 'username_taken' });
    if (u.role === 'Admin') {
      if ((u.adminCode || '') !== ADMIN_CREATION_CODE) return res.status(403).json({ ok: false, error: 'invalid_admin_code' });
    }
    const hash = await bcrypt.hash(u.password, 10);
    const toSave = Object.assign({}, u, { password: hash, lastLogin: null });
    users.push(toSave);
    await fs.promises.writeFile(usersFile, JSON.stringify(users, null, 2), 'utf8');
    // write XLSX copy
    try {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(users);
      XLSX.utils.book_append_sheet(wb, ws, 'Accounts');
      XLSX.writeFile(wb, path.join(DATA_DIR, 'accounts.xlsx'));
    } catch (e) { console.warn('xlsx write failed for users', e); }
    const safe = Object.assign({}, toSave);
    delete safe.password;
    res.json({ ok: true, user: safe });
  } catch (err) {
    console.error('signup error', err);
    res.status(500).json({ ok: false, error: String(err && err.message ? err.message : err) });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ ok: false, error: 'username/password required' });
    const usersFile = fileForKey('healthone_users');
    let users = [];
    if (fs.existsSync(usersFile)) {
      try { users = JSON.parse(await fs.promises.readFile(usersFile, 'utf8')); } catch (e) { users = []; }
    }
    const user = users.find((u) => u.username === username);
    if (!user) return res.status(401).json({ ok: false, error: 'invalid_credentials' });
    const match = await bcrypt.compare(password, user.password || '');
    if (!match) return res.status(401).json({ ok: false, error: 'invalid_credentials' });
    const safe = Object.assign({}, user);
    delete safe.password;
    res.json({ ok: true, user: safe });
  } catch (err) {
    console.error('login error', err);
    res.status(500).json({ ok: false, error: String(err && err.message ? err.message : err) });
  }
});

app.get('/api/data/:key', async (req, res) => {
  try {
    const key = req.params.key;
    const file = fileForKey(key);
    if (!fs.existsSync(file)) return res.json({ ok: true, data: null });
    const raw = await fs.promises.readFile(file, 'utf8');
    try {
      const data = JSON.parse(raw);
      return res.json({ ok: true, data });
    } catch (e) {
      return res.json({ ok: true, data: raw });
    }
  } catch (err) {
    console.error('load error', err);
    res.status(500).send(String(err && err.message ? err.message : err));
  }
});

app.listen(PORT, () => {
  console.log(`HealthOne Node API listening on http://localhost:${PORT}`);
});
