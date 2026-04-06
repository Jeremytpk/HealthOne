/**
 * HealthOne — Générateur de fichiers Excel initiaux
 * Exécuter : node data/init.js
 * Installe la dépendance si nécessaire : npm install xlsx
 */

const XLSX = require('xlsx');
const path = require('path');

// ── Données patients de démonstration ───────────────────────────────────────
const patients = [
  {
    'ID': 'demo-001',
    'Nom complet': 'Marie Dupont',
    'Service': 'General',
    'Médecin assigné': 'Dr. Martin',
    'Statut': 'En attente',
    'Date entrée': '2026-04-05',
    'Heure entrée': '08:30',
    'Enregistré par': 'admin',
  },
  {
    'ID': 'demo-002',
    'Nom complet': 'Jean Lefebvre',
    'Service': 'ER',
    'Médecin assigné': 'Dr. Gauthier',
    'Statut': 'En traitement',
    'Date entrée': '2026-04-05',
    'Heure entrée': '09:15',
    'Enregistré par': 'admin',
  },
];

// ── Données comptes de démonstration ────────────────────────────────────────
const accounts = [
  {
    'Identifiant': 'admin',
    'Nom complet': 'Administrateur',
    'Rôle': 'Admin',
    'Services': '',
    'Dernière connexion': '',
    'Rôles valides →': 'Admin | Register | Nurse | Doctor | Dentist | Pediatre',
    'Services valides →': 'General | Pediatre | Dental | Surgery | ER',
  },
  {
    'Identifiant': 'infirmier1',
    'Nom complet': 'Sophie Bernard',
    'Rôle': 'Nurse',
    'Services': 'General, ER',
    'Dernière connexion': '',
    'Rôles valides →': '',
    'Services valides →': '',
  },
  {
    'Identifiant': 'dr.martin',
    'Nom complet': 'Paul Martin',
    'Rôle': 'Doctor',
    'Services': 'General, Surgery',
    'Dernière connexion': '',
    'Rôles valides →': '',
    'Services valides →': '',
  },
];

function createWorkbook(rows, sheetName, colWidths) {
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = colWidths.map(wch => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return wb;
}

// Write patients.xlsx
const patientWb = createWorkbook(patients, 'Patients', [16, 24, 14, 20, 14, 12, 12, 16]);
XLSX.writeFile(patientWb, path.join(__dirname, 'patients.xlsx'));
console.log('[OK] data/patients.xlsx créé');

// Write accounts.xlsx
const accountWb = createWorkbook(accounts, 'Comptes', [16, 22, 12, 24, 20, 32, 32]);
XLSX.writeFile(accountWb, path.join(__dirname, 'accounts.xlsx'));
console.log('[OK] data/accounts.xlsx créé');

console.log('\nFichiers générés dans le dossier data/');
console.log('Pour importer dans l\'application : Admin → Fichiers de données → Importer');
