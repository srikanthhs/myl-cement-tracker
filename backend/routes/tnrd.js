'use strict';
const router = require('express').Router();
const multer = require('multer');
const XLSX   = require('xlsx');
const { requireAuth }   = require('../middleware/auth');
const { allow }         = require('../middleware/rbac');
const { getDb }         = require('../config/firebase');
const tnrdSvc = require('../services/tnrd.service');

const COLLECTION = 'tnrd_reports';

// ── Multer (memory, Excel only) ──────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'application/vnd.ms-excel', 'text/csv'];
    if (ok.includes(file.mimetype) || /\.(xlsx?|csv)$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Only .xlsx / .xls / .csv files are allowed.'));
    }
  },
});

// ── Helpers ──────────────────────────────────────────────────────────────────
async function deleteSubCollection(colRef, batchSize = 400) {
  const docs = (await colRef.limit(batchSize).get()).docs;
  await Promise.all(docs.map(d => d.ref.delete()));
  if (docs.length >= batchSize) await deleteSubCollection(colRef, batchSize);
}

function parseExcel(buffer) {
  const wb    = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows  = XLSX.utils.sheet_to_json(sheet, { defval: null });
  // Normalise column names
  return rows.map(r =>
    Object.fromEntries(
      Object.entries(r).map(([k, v]) => [String(k).trim(), v])
    )
  );
}

async function saveRows(docRef, rows) {
  const rowsRef  = docRef.collection('rows');
  const batchSz  = 400;
  await deleteSubCollection(rowsRef);
  for (let i = 0; i < rows.length; i += batchSz) {
    const batch = getDb().batch();
    rows.slice(i, i + batchSz).forEach((row, j) => {
      batch.set(rowsRef.doc(String(i + j)), row);
    });
    await batch.commit();
  }
}

// ── GET /api/tnrd/config  ────────────────────────────────────────────────────
// Returns the list of expected reports from download_schedule.json so the
// frontend knows which upload slots to show (falls back to Firestore list).
router.get('/config', requireAuth, (_req, res) => {
  try {
    const cfg = require('../../scripts/download_schedule.json');
    res.json(cfg.reports.map(r => ({
      id:   r.id,
      name: r.name,
      scheduleAt: r.schedule_times || [],
    })));
  } catch {
    res.json([]);
  }
});

// ── GET /api/tnrd/reports  ───────────────────────────────────────────────────
router.get('/reports', requireAuth, async (req, res, next) => {
  try {
    const snap = await getDb().collection(COLLECTION).get();
    res.json(snap.docs.map(d => {
      const data = d.data();
      return {
        id:            d.id,
        name:          data.name || d.id,
        status:        data.status || 'unknown',
        uploadedAt:    data.uploadedAt    ? data.uploadedAt.toDate().toISOString()    : null,
        downloadedAt:  data.downloadedAt  ? data.downloadedAt.toDate().toISOString()  : null,
        rowCount:      data.rowCount      || 0,
        scheduleAt:    data.scheduleAt    || [],
        lastError:     data.lastError     || null,
        fileSizeBytes: data.fileSizeBytes || 0,
        uploadedBy:    data.uploadedBy    || null,
      };
    }));
  } catch (e) { next(e); }
});

// ── GET /api/tnrd/reports/:id  ───────────────────────────────────────────────
router.get('/reports/:id', requireAuth, async (req, res, next) => {
  try {
    const docRef = getDb().collection(COLLECTION).doc(req.params.id);
    const meta   = await docRef.get();
    if (!meta.exists) return res.status(404).json({ error: 'Report not found.' });

    const rowsSnap = await docRef.collection('rows').orderBy('__name__').get();
    const data     = meta.data();
    res.json({
      id:           meta.id,
      name:         data.name          || meta.id,
      status:       data.status        || 'unknown',
      uploadedAt:   data.uploadedAt    ? data.uploadedAt.toDate().toISOString()   : null,
      downloadedAt: data.downloadedAt  ? data.downloadedAt.toDate().toISOString() : null,
      rowCount:     data.rowCount      || 0,
      scheduleAt:   data.scheduleAt    || [],
      lastError:    data.lastError     || null,
      uploadedBy:   data.uploadedBy    || null,
      rows:         rowsSnap.docs.map(d => d.data()),
    });
  } catch (e) { next(e); }
});

// ── POST /api/tnrd/upload/:id  ───────────────────────────────────────────────
// Human assistant uploads an Excel file downloaded from tnrd.tn.gov.in.
// Allowed roles: admin, bdo (same as beneficiary bulk import).
router.post('/upload/:id', requireAuth, allow('admin', 'bdo'),
  upload.single('file'), async (req, res, next) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const reportId = req.params.id;

    try {
      const rows = parseExcel(req.file.buffer);
      if (!rows.length) return res.status(400).json({ error: 'File is empty or unreadable.' });

      const db     = getDb();
      const docRef = db.collection(COLLECTION).doc(reportId);

      // Derive a display name: prefer existing Firestore name, else use filename
      const existing = await docRef.get();
      const name = existing.exists
        ? (existing.data().name || reportId)
        : (req.body.name || req.file.originalname.replace(/\.[^.]+$/, ''));

      await tnrdSvc.saveToFirestore(
        reportId, name, rows, req.file.size,
        req.user.name || req.user.username
      );

      res.json({
        message:  `Uploaded ${rows.length} rows for "${name}"`,
        reportId,
        rowCount: rows.length,
      });
    } catch (e) { next(e); }
  }
);

// ── GET /api/tnrd/reports/:id/history  ──────────────────────────────────────
// List available snapshot dates for one report (newest first)
router.get('/reports/:id/history', requireAuth, async (req, res, next) => {
  try {
    const snap = await getDb().collection(COLLECTION).doc(req.params.id)
      .collection('history').orderBy('snapshotDate', 'desc').get();
    res.json(snap.docs.map(d => {
      const data = d.data();
      return {
        date:       d.id,
        rowCount:   data.rowCount   || 0,
        uploadedBy: data.uploadedBy || null,
        fetchedAt:  data.downloadedAt ? data.downloadedAt.toDate().toISOString() : null,
      };
    }));
  } catch (e) { next(e); }
});

// ── GET /api/tnrd/reports/:id/history/:date  ─────────────────────────────────
// Get full rows for a specific snapshot date (YYYY-MM-DD)
router.get('/reports/:id/history/:date', requireAuth, async (req, res, next) => {
  try {
    const snapRef = getDb().collection(COLLECTION).doc(req.params.id)
      .collection('history').doc(req.params.date);
    const meta = await snapRef.get();
    if (!meta.exists) return res.status(404).json({ error: 'Snapshot not found for this date.' });

    const rowsSnap = await snapRef.collection('rows').orderBy('__name__').get();
    const data     = meta.data();
    res.json({
      date:       req.params.date,
      reportId:   req.params.id,
      name:       data.name       || req.params.id,
      rowCount:   data.rowCount   || 0,
      uploadedBy: data.uploadedBy || null,
      fetchedAt:  data.downloadedAt ? data.downloadedAt.toDate().toISOString() : null,
      rows:       rowsSnap.docs.map(d => d.data()),
    });
  } catch (e) { next(e); }
});

// ── POST /api/tnrd/fetch-all  ────────────────────────────────────────────────
// One-click: backend downloads all reports using the provided session cookie.
// Body: { sessionCookie: "PHPSESSID value" }
router.post('/fetch-all', requireAuth, allow('admin', 'bdo'), async (req, res, next) => {
  const { sessionCookie } = req.body;
  if (!sessionCookie?.trim()) {
    return res.status(400).json({ error: 'sessionCookie is required.' });
  }

  try {
    let reportConfigs = [];
    try {
      reportConfigs = require('../../scripts/download_schedule.json').reports || [];
    } catch {
      return res.status(500).json({ error: 'download_schedule.json not found or invalid.' });
    }

    const results = await tnrdSvc.fetchAllReports(
      sessionCookie.trim(),
      reportConfigs,
      req.user.name || req.user.username,
    );

    const anyExpired = results.some(r => r.error === 'Session expired');
    const succeeded  = results.filter(r => r.status === 'success').length;

    res.json({
      message: anyExpired
        ? 'Session expired — please log in again and retry.'
        : `Downloaded ${succeeded} of ${reportConfigs.length} reports successfully.`,
      results,
      sessionExpired: anyExpired,
    });
  } catch (e) { next(e); }
});

module.exports = router;
