'use strict';
/**
 * Firebase connectivity diagnostic script
 * Run: node scripts/check-firebase.js
 */
require('dotenv').config();
const path = require('path');
const fs   = require('fs');
const https = require('https');

console.log('\n══════════════════════════════════════════');
console.log('  MYL Cement Tracker — Firebase Diagnostics');
console.log('══════════════════════════════════════════\n');

// ── 1. Check .env ──────────────────────────────────────────────────────────
console.log('① Checking .env ...');
const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const projectId = process.env.FIREBASE_PROJECT_ID;
console.log(`   GOOGLE_APPLICATION_CREDENTIALS = ${credsPath || '(not set)'}`);
console.log(`   FIREBASE_PROJECT_ID            = ${projectId || '(not set)'}`);

if (!credsPath && !process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  console.log('\n❌ Neither GOOGLE_APPLICATION_CREDENTIALS nor FIREBASE_SERVICE_ACCOUNT_JSON is set in .env');
  process.exit(1);
}

// ── 2. Check key file ──────────────────────────────────────────────────────
let sa;
if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  console.log('\n② Loading service account from FIREBASE_SERVICE_ACCOUNT_JSON env var...');
  try { sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON); }
  catch(e) { console.log('❌ JSON parse error:', e.message); process.exit(1); }
} else {
  const absPath = path.resolve(credsPath);
  console.log(`\n② Checking key file: ${absPath}`);
  if (!fs.existsSync(absPath)) {
    console.log('❌ File NOT FOUND!');
    console.log('\n   FIX: Download a new service account key:');
    console.log('   1. Go to https://console.firebase.google.com');
    console.log(`   2. Open project: ${projectId || 'mydrdcement'}`);
    console.log('   3. Click ⚙ Project Settings → Service Accounts tab');
    console.log('   4. Click "Generate new private key"');
    console.log('   5. Rename downloaded file to: serviceAccountKey.json');
    console.log(`   6. Place it in: ${path.dirname(absPath)}`);
    process.exit(1);
  }
  try { sa = JSON.parse(fs.readFileSync(absPath, 'utf8')); }
  catch(e) { console.log('❌ JSON parse error — file may be corrupted:', e.message); process.exit(1); }
}

console.log('   ✅ File loaded');
console.log(`   type:          ${sa.type}`);
console.log(`   project_id:    ${sa.project_id}`);
console.log(`   client_email:  ${sa.client_email}`);
if (sa.private_key) {
  const lines = sa.private_key.split('\n').length;
  console.log(`   private_key:   present (${lines} lines)`);
} else {
  console.log('   ❌ private_key is MISSING from the JSON!');
  process.exit(1);
}

if (sa.type !== 'service_account') {
  console.log(`\n❌ Wrong key type: "${sa.type}". Expected "service_account"`);
  console.log('   Make sure you downloaded the Admin SDK private key, not the web app config.');
  process.exit(1);
}

// ── 3. Test OAuth token exchange ───────────────────────────────────────────
console.log('\n③ Testing OAuth2 token exchange with Google...');

const jwt = require('jsonwebtoken');
const now = Math.floor(Date.now() / 1000);
const payload = {
  iss: sa.client_email,
  sub: sa.client_email,
  aud: 'https://oauth2.googleapis.com/token',
  iat: now,
  exp: now + 3600,
  scope: 'https://www.googleapis.com/auth/cloud-platform',
};

let assertion;
try {
  assertion = jwt.sign(payload, sa.private_key, { algorithm: 'RS256' });
} catch(e) {
  console.log('❌ JWT signing failed:', e.message);
  console.log('   The private_key in your serviceAccountKey.json may be corrupted.');
  console.log('   Please regenerate the key from Firebase Console.');
  process.exit(1);
}

const body = `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${encodeURIComponent(assertion)}`;
const req  = https.request({
  hostname: 'oauth2.googleapis.com',
  path:     '/token',
  method:   'POST',
  headers:  { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
}, res => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => {
    const resp = JSON.parse(data);
    if (resp.access_token) {
      console.log('   ✅ Access token obtained!');
      // ── 4. Test Firestore REST API ─────────────────────────────────────────
      console.log('\n④ Testing Firestore REST API...');
      const firestoreReq = https.request({
        hostname: 'firestore.googleapis.com',
        path:     `/v1/projects/${sa.project_id}/databases/(default)/documents/beneficiaries?pageSize=1`,
        method:   'GET',
        headers:  { Authorization: `Bearer ${resp.access_token}` },
      }, fsRes => {
        let fsData = '';
        fsRes.on('data', d => fsData += d);
        fsRes.on('end', () => {
          if (fsRes.statusCode === 200) {
            const parsed = JSON.parse(fsData);
            const count  = (parsed.documents || []).length;
            console.log(`   ✅ Firestore connected! (found ${count} doc${count!==1?'s':''} in beneficiaries)`);
            console.log('\n══════════════════════════════════════════');
            console.log('  ✅ ALL CHECKS PASSED — Firebase is ready!');
            console.log('  Run: npm run dev');
            console.log('══════════════════════════════════════════\n');
          } else if (fsRes.statusCode === 404) {
            const errBody = JSON.parse(fsData);
            if (errBody.error?.message?.includes('does not exist')) {
              console.log('   ⚠  Firestore database not yet created!');
              console.log(`\n   FIX: Create Firestore database for project "${sa.project_id}":`);
              console.log('   1. Go to https://console.firebase.google.com');
              console.log(`   2. Open project: ${sa.project_id}`);
              console.log('   3. Left sidebar → Firestore Database → Create database');
              console.log('   4. Choose "Start in test mode" → Select a region → Enable');
              console.log('   5. Then run: node scripts/seed.js');
            } else {
              console.log('   ❌ 404 error:', errBody.error?.message);
            }
          } else if (fsRes.statusCode === 403) {
            console.log('   ❌ 403 PERMISSION DENIED');
            console.log(`\n   FIX: Add Firestore permission to service account:`);
            console.log(`   1. Go to https://console.cloud.google.com/iam-admin/iam?project=${sa.project_id}`);
            console.log(`   2. Find: ${sa.client_email}`);
            console.log('   3. Add role: "Cloud Datastore User" (or "Firebase Admin")');
          } else {
            console.log(`   ❌ Firestore HTTP ${fsRes.statusCode}:`, fsData.slice(0, 200));
          }
        });
      });
      firestoreReq.on('error', e => console.log('   ❌ Network error:', e.message));
      firestoreReq.end();
    } else if (resp.error === 'invalid_grant') {
      console.log('   ❌ INVALID JWT SIGNATURE — Service account key is revoked or invalid\n');
      console.log('   This means the private key in your serviceAccountKey.json does not match');
      console.log('   what Google has on file for this service account. The key may have been:');
      console.log('     • Deleted from Firebase Console');
      console.log('     • Regenerated (old key became invalid)');
      console.log('     • Downloaded from the wrong project\n');
      console.log('   FIX — Generate a NEW service account key:');
      console.log('   ─────────────────────────────────────────────────────────────');
      console.log('   1. Open: https://console.firebase.google.com');
      console.log(`   2. Select project: ${sa.project_id}`);
      console.log('   3. Click ⚙ (gear icon) → Project Settings');
      console.log('   4. Click the "Service accounts" tab');
      console.log('   5. Under "Firebase Admin SDK", click "Generate new private key"');
      console.log('   6. Click "Generate key" in the dialog');
      console.log('   7. A JSON file downloads — rename it to: serviceAccountKey.json');
      console.log(`   8. Replace the file at: ${path.resolve(credsPath)}`);
      console.log('   9. Run this script again to verify: node scripts/check-firebase.js');
      console.log('   ─────────────────────────────────────────────────────────────\n');
      process.exit(1);
    } else {
      console.log('   ❌ OAuth error:', JSON.stringify(resp).slice(0, 300));
      process.exit(1);
    }
  });
});
req.on('error', e => {
  console.log('❌ Network error — cannot reach oauth2.googleapis.com');
  console.log('   Check your internet connection:', e.message);
  process.exit(1);
});
req.write(body);
req.end();
