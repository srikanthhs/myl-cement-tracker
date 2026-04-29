'use strict';
/**
 * TNRD download service – runs inside Express (Node.js).
 *
 * Firestore layout
 * ────────────────
 * tnrd_reports/{reportId}                   latest metadata (always overwritten)
 * tnrd_reports/{reportId}/rows/{n}          latest rows    (always overwritten)
 * tnrd_reports/{reportId}/history/{dateKey} snapshot metadata per fetch date
 * tnrd_reports/{reportId}/history/{dateKey}/rows/{n}  snapshot rows
 *
 * dateKey format: YYYY-MM-DD  (one snapshot per report per day; re-fetch
 * overwrites that day's snapshot so the latest of the day is kept)
 */

const https     = require('https');
const http      = require('http');
const urlModule = require('url');
const XLSX      = require('xlsx');
const { getDb } = require('../config/firebase');

const COLLECTION = 'tnrd_reports';
const BASE_URL   = 'https://tnrd.tn.gov.in';

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function httpGet(targetUrl, cookieStr, redirects = 5) {
  return new Promise((resolve, reject) => {
    if (redirects < 0) return reject(new Error('Too many redirects'));
    const parsed  = new urlModule.URL(targetUrl);
    const isHttps = parsed.protocol === 'https:';
    const lib     = isHttps ? https : http;
    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (isHttps ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/147.0.0.0',
        'Cookie':     cookieStr,
        'Referer':    BASE_URL + '/',
        'Accept':     'text/html,application/xhtml+xml,*/*;q=0.8',
      },
    };
    const req = lib.request(options, res => {
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
        const next = res.headers.location.startsWith('http')
          ? res.headers.location : BASE_URL + res.headers.location;
        const extra = (res.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
        return resolve(httpGet(next, extra ? cookieStr + '; ' + extra : cookieStr, redirects - 1));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Request timed out')); });
    req.end();
  });
}

function httpPost(targetUrl, cookieStr, formData) {
  return new Promise((resolve, reject) => {
    const parsed   = new urlModule.URL(targetUrl);
    const isHttps  = parsed.protocol === 'https:';
    const lib      = isHttps ? https : http;
    const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
    const parts    = Object.entries(formData).map(([k, v]) =>
      `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}`);
    const body = Buffer.from(parts.join('\r\n') + `\r\n--${boundary}--\r\n`);
    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (isHttps ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   'POST',
      headers: {
        'User-Agent':     'Mozilla/5.0 Chrome/147.0.0.0',
        'Cookie':         cookieStr,
        'Content-Type':   `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
        'Referer':        BASE_URL + '/',
      },
    };
    const req = lib.request(options, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Request timed out')); });
    req.write(body);
    req.end();
  });
}

function isLoginPage(res) {
  const ct = res.headers['content-type'] || '';
  if (!ct.includes('html')) return false;
  const text = res.body.toString('utf8').toLowerCase();
  return text.includes('logincheck') || text.includes('captchaval') ||
         text.includes('please login') || text.includes('session expired');
}

// ── Download one report ───────────────────────────────────────────────────────
async function downloadReport(reportCfg, cookieStr) {
  const today   = _fmtDate(new Date(), reportCfg.date_format || '%d-%m-%Y');
  const sub     = v => (typeof v === 'string' ? v.replace('{today}', today) : v);
  const params  = Object.fromEntries(Object.entries(reportCfg.params  || {}).map(([k,v]) => [k, sub(v)]));
  const form    = Object.fromEntries(Object.entries(reportCfg.form_data || {}).map(([k,v]) => [k, sub(v)]));
  const qs      = new urlModule.URLSearchParams(params).toString();
  const fullUrl = reportCfg.url + (qs ? '?' + qs : '');
  const method  = (reportCfg.method || 'GET').toUpperCase();
  const res     = method === 'POST' ? await httpPost(fullUrl, cookieStr, form) : await httpGet(fullUrl, cookieStr);
  if (isLoginPage(res))   throw new Error('SESSION_EXPIRED');
  if (res.status !== 200) throw new Error(`HTTP ${res.status} for "${reportCfg.name}"`);
  return res.body;
}

// ── Parse Excel ───────────────────────────────────────────────────────────────
function parseExcel(buffer) {
  const wb    = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows  = XLSX.utils.sheet_to_json(sheet, { defval: null });
  return rows.map(r => Object.fromEntries(Object.entries(r).map(([k,v]) => [String(k).trim(), v])));
}

// ── Batch-write rows into a Firestore sub-collection ─────────────────────────
async function _writeRows(rowsRef, rows) {
  // Delete existing docs first
  const existing = await rowsRef.listDocuments();
  const db       = getDb();
  let b = db.batch(); let c = 0;
  for (const ref of existing) {
    b.delete(ref);
    if (++c % 400 === 0) { await b.commit(); b = db.batch(); c = 0; }
  }
  if (c > 0) await b.commit();

  // Write new rows
  for (let i = 0; i < rows.length; i += 400) {
    const batch = db.batch();
    rows.slice(i, i + 400).forEach((row, j) => batch.set(rowsRef.doc(String(i + j)), row));
    await batch.commit();
  }
}

// ── Save to Firestore (latest + dated snapshot) ───────────────────────────────
async function saveToFirestore(reportId, reportName, rows, fileSizeBytes, fetchedBy) {
  const db      = getDb();
  const docRef  = db.collection(COLLECTION).doc(reportId);
  const now     = new Date();
  const dateKey = _isoDate(now);   // e.g. "2026-04-29"

  const meta = {
    id:            reportId,
    name:          reportName,
    status:        'success',
    downloadedAt:  now,
    uploadedAt:    now,
    rowCount:      rows.length,
    fileSizeBytes,
    uploadedBy:    fetchedBy || 'system',
    lastError:     null,
    latestDate:    dateKey,
  };

  // 1. Overwrite latest
  await docRef.set(meta, { merge: true });
  await _writeRows(docRef.collection('rows'), rows);

  // 2. Save dated snapshot (overwrites same-day snapshot if re-fetched)
  const snapRef = docRef.collection('history').doc(dateKey);
  await snapRef.set({ ...meta, snapshotDate: dateKey });
  await _writeRows(snapRef.collection('rows'), rows);
}

// ── Public: fetch all reports ─────────────────────────────────────────────────
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
        results.push({ id: cfg.id, name: cfg.name, status: 'error', error: 'Session expired' });
        reportConfigs.slice(reportConfigs.indexOf(cfg) + 1).forEach(r =>
          results.push({ id: r.id, name: r.name, status: 'skipped', error: 'Stopped — session expired' })
        );
        break;
      }
      results.push({ id: cfg.id, name: cfg.name, status: 'error', error: err.message });
    }
  }
  return results;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _fmtDate(d, fmt) {
  const pad = n => String(n).padStart(2, '0');
  return fmt.replace('%d', pad(d.getDate())).replace('%m', pad(d.getMonth()+1)).replace('%Y', d.getFullYear());
}

function _isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

module.exports = { fetchAllReports, saveToFirestore, parseExcel };
