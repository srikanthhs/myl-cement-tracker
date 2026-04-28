'use strict';
/**
 * TNRD download service – runs inside Express (Node.js).
 * Uses a PHPSESSID session cookie to download Excel reports from
 * tnrd.tn.gov.in and stores rows in Firestore.
 */

const https    = require('https');
const http     = require('http');
const url      = require('url');
const XLSX     = require('xlsx');
const { getDb } = require('../config/firebase');

const COLLECTION = 'tnrd_reports';
const BASE_URL   = 'https://tnrd.tn.gov.in';

// ── HTTP helper (no external deps) ───────────────────────────────────────────
function httpGet(targetUrl, cookieStr, redirects = 5) {
  return new Promise((resolve, reject) => {
    if (redirects < 0) return reject(new Error('Too many redirects'));

    const parsed  = new url.URL(targetUrl);
    const isHttps = parsed.protocol === 'https:';
    const lib     = isHttps ? https : http;

    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (isHttps ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/147.0.0.0 Safari/537.36',
        'Cookie':     cookieStr,
        'Referer':    BASE_URL + '/',
        'Accept':     'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    };

    const req = lib.request(options, res => {
      // Follow redirects
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : BASE_URL + res.headers.location;
        // Carry any new cookies from redirect
        const newCookies = res.headers['set-cookie']
          ?.map(c => c.split(';')[0]).join('; ') || '';
        const merged = newCookies
          ? cookieStr + '; ' + newCookies
          : cookieStr;
        return resolve(httpGet(next, merged, redirects - 1));
      }

      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        status:      res.statusCode,
        headers:     res.headers,
        body:        Buffer.concat(chunks),
      }));
    });

    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Request timed out')); });
    req.end();
  });
}

function httpPost(targetUrl, cookieStr, formData) {
  return new Promise((resolve, reject) => {
    const parsed  = new url.URL(targetUrl);
    const isHttps = parsed.protocol === 'https:';
    const lib     = isHttps ? https : http;

    // Build multipart/form-data body
    const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
    const parts    = Object.entries(formData).map(([k, v]) =>
      `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}`
    );
    const body = Buffer.from(parts.join('\r\n') + `\r\n--${boundary}--\r\n`);

    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (isHttps ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   'POST',
      headers: {
        'User-Agent':    'Mozilla/5.0 Chrome/147.0.0.0',
        'Cookie':        cookieStr,
        'Content-Type':  `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
        'Referer':       BASE_URL + '/',
      },
    };

    const req = lib.request(options, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        status:  res.statusCode,
        headers: res.headers,
        body:    Buffer.concat(chunks),
      }));
    });

    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Request timed out')); });
    req.write(body);
    req.end();
  });
}

// ── Check if response is the login page (session expired) ────────────────────
function isLoginPage(res) {
  const ct = res.headers['content-type'] || '';
  if (!ct.includes('html')) return false;
  const text = res.body.toString('utf8').toLowerCase();
  return text.includes('logincheck') || text.includes('captchaval') ||
         text.includes('please login') || text.includes('session expired');
}

// ── Download one report ───────────────────────────────────────────────────────
async function downloadReport(reportCfg, cookieStr) {
  const today    = _fmtDate(new Date(), reportCfg.date_format || '%d-%m-%Y');
  const sub      = v => (typeof v === 'string' ? v.replace('{today}', today) : v);

  const params   = Object.fromEntries(
    Object.entries(reportCfg.params || {}).map(([k, v]) => [k, sub(v)])
  );
  const formData = Object.fromEntries(
    Object.entries(reportCfg.form_data || {}).map(([k, v]) => [k, sub(v)])
  );

  const qs     = new url.URLSearchParams(params).toString();
  const fullUrl = reportCfg.url + (qs ? '?' + qs : '');
  const method  = (reportCfg.method || 'GET').toUpperCase();

  const res = method === 'POST'
    ? await httpPost(fullUrl, cookieStr, formData)
    : await httpGet(fullUrl, cookieStr);

  if (isLoginPage(res)) {
    throw new Error('SESSION_EXPIRED');
  }

  if (res.status !== 200) {
    throw new Error(`Server returned HTTP ${res.status} for ${reportCfg.name}`);
  }

  return res.body;
}

// ── Parse Excel buffer → array of row objects ─────────────────────────────────
function parseExcel(buffer) {
  const wb    = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows  = XLSX.utils.sheet_to_json(sheet, { defval: null });
  return rows.map(r =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [String(k).trim(), v]))
  );
}

// ── Save rows to Firestore ────────────────────────────────────────────────────
async function saveToFirestore(reportId, reportName, rows, fileSizeBytes, fetchedBy) {
  const db      = getDb();
  const docRef  = db.collection(COLLECTION).doc(reportId);
  const rowsRef = docRef.collection('rows');
  const now     = new Date();

  await docRef.set({
    id:            reportId,
    name:          reportName,
    status:        'success',
    downloadedAt:  now,
    uploadedAt:    now,
    rowCount:      rows.length,
    fileSizeBytes,
    uploadedBy:    fetchedBy || 'system',
    lastError:     null,
  }, { merge: true });

  // Delete old rows
  let batch = db.batch();
  let count = 0;
  const old = await rowsRef.listDocuments();
  for (const ref of old) {
    batch.delete(ref);
    if (++count % 400 === 0) { await batch.commit(); batch = db.batch(); count = 0; }
  }
  if (count > 0) await batch.commit();

  // Write new rows in batches of 400
  for (let i = 0; i < rows.length; i += 400) {
    const b = db.batch();
    rows.slice(i, i + 400).forEach((row, j) => b.set(rowsRef.doc(String(i + j)), row));
    await b.commit();
  }
}

// ── Public: fetch all enabled reports with a given session cookie ─────────────
async function fetchAllReports(sessionCookie, reportConfigs, fetchedBy) {
  const cookieStr = `PHPSESSID=${sessionCookie}`;
  const results   = [];

  for (const cfg of reportConfigs) {
    if (!cfg.enabled && cfg.enabled !== undefined) {
      results.push({ id: cfg.id, name: cfg.name, status: 'skipped' });
      continue;
    }

    try {
      const buffer = await downloadReport(cfg, cookieStr);
      const rows   = parseExcel(buffer);
      await saveToFirestore(cfg.id, cfg.name, rows, buffer.length, fetchedBy);
      results.push({ id: cfg.id, name: cfg.name, status: 'success', rowCount: rows.length });
    } catch (err) {
      if (err.message === 'SESSION_EXPIRED') {
        // Stop immediately — all subsequent requests will also fail
        results.push({ id: cfg.id, name: cfg.name, status: 'error', error: 'Session expired' });
        for (const r of reportConfigs.slice(reportConfigs.indexOf(cfg) + 1)) {
          results.push({ id: r.id, name: r.name, status: 'skipped', error: 'Stopped — session expired' });
        }
        break;
      }
      results.push({ id: cfg.id, name: cfg.name, status: 'error', error: err.message });
    }
  }

  return results;
}

// ── Date format helper (%d-%m-%Y style) ───────────────────────────────────────
function _fmtDate(d, fmt) {
  const pad = n => String(n).padStart(2, '0');
  return fmt
    .replace('%d', pad(d.getDate()))
    .replace('%m', pad(d.getMonth() + 1))
    .replace('%Y', d.getFullYear());
}

module.exports = { fetchAllReports };
