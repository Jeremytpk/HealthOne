HealthOne — Dossier de données
================================

Ce dossier contient les fichiers de données Excel de HealthOne.

Fichiers :
  patients.xlsx   — Dossiers de tous les patients enregistrés
  accounts.xlsx   — Comptes du personnel (rôles, services, identifiants)

Utilisation :
  1. Connectez-vous en tant qu'Admin et ouvrez "Fichiers de données".
  2. Cliquez sur "Exporter" pour télécharger les données actuelles
     et enregistrez les fichiers dans ce dossier.
  3. Modifiez le fichier Excel (ex. changer les rôles dans accounts.xlsx).
  4. Cliquez sur "Importer" et sélectionnez le fichier modifié
     pour mettre à jour l'application.

Colonnes — patients.xlsx :
  ID | Nom complet | Service | Médecin assigné | Statut | Date entrée | Heure entrée | Enregistré par

Colonnes — accounts.xlsx :
  Identifiant | Nom complet | Rôle | Services | Dernière connexion
  (colonne "Rôles valides" et "Services valides" incluses à titre indicatif)

Valeurs valides :
  Rôles    : Admin | Register | Nurse | Doctor | Dentist | Pediatre
  Services : General | Pediatre | Dental | Surgery | ER

Notes :
  - Les mots de passe ne sont jamais exportés pour des raisons de sécurité.
  - Un nouvel identifiant importé reçoit le mot de passe temporaire : changeme123
  - Pour générer les fichiers initiaux : exécuter  node data/init.js
