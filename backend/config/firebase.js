'use strict';
const admin = require('firebase-admin');
const path  = require('path');
const fs    = require('fs');

let _db = null;

function getDb() {
  if (_db) return _db;

  if (!admin.apps.length) {
    // ── Option A: inline JSON in env var ──────────────────────────────────────
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      admin.initializeApp({ credential: admin.credential.cert(sa) });
      console.log('[Firebase] Initialised from FIREBASE_SERVICE_ACCOUNT_JSON env var');

    // ── Option B: key file on disk (path from GOOGLE_APPLICATION_CREDENTIALS) ─
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const keyPath = path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS);
      if (!fs.existsSync(keyPath)) {
        throw new Error(`[Firebase] Service account key not found at: ${keyPath}\n` +
          'Download it from Firebase Console → Project Settings → Service Accounts → Generate new private key');
      }
      const sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
      admin.initializeApp({ credential: admin.credential.cert(sa) });
      console.log(`[Firebase] Initialised from key file: ${keyPath}`);

    // ── Option C: Firestore emulator (local dev without real Firebase) ─────────
    } else {
      const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080';
      process.env.FIRESTORE_EMULATOR_HOST = emulatorHost;
      admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || 'mydrdcement' });
      console.warn(`[Firebase] Using Firestore emulator at ${emulatorHost}`);
    }
  }

  _db = admin.firestore();
  _db.settings({ ignoreUndefinedProperties: true, preferRest: true });
  return _db;
}

module.exports = { getDb, admin };
