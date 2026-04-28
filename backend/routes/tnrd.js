'use strict';
const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { getDb }       = require('../config/firebase');

const COLLECTION = 'tnrd_reports';

// ── GET /api/tnrd/reports  ───────────────────────────────────────────────────
// Returns metadata for all downloaded reports (no row data)
router.get('/reports', requireAuth, async (req, res, next) => {
  try {
    const snap = await getDb().collection(COLLECTION).get();
    const reports = snap.docs.map(d => {
      const data = d.data();
      return {
        id:           d.id,
        name:         data.name || d.id,
        status:       data.status || 'unknown',
        downloadedAt: data.downloadedAt ? data.downloadedAt.toDate().toISOString() : null,
        rowCount:     data.rowCount || 0,
        scheduleAt:   data.scheduleAt || [],
        lastError:    data.lastError || null,
        fileSizeBytes: data.fileSizeBytes || 0,
      };
    });
    res.json(reports);
  } catch (e) { next(e); }
});

// ── GET /api/tnrd/reports/:id  ───────────────────────────────────────────────
// Returns metadata + all rows for one report
router.get('/reports/:id', requireAuth, async (req, res, next) => {
  try {
    const docRef = getDb().collection(COLLECTION).doc(req.params.id);
    const meta   = await docRef.get();
    if (!meta.exists) return res.status(404).json({ error: 'Report not found.' });

    const rowsSnap = await docRef.collection('rows').orderBy('__name__').get();
    const rows     = rowsSnap.docs.map(d => d.data());

    const data = meta.data();
    res.json({
      id:           meta.id,
      name:         data.name || meta.id,
      status:       data.status || 'unknown',
      downloadedAt: data.downloadedAt ? data.downloadedAt.toDate().toISOString() : null,
      rowCount:     data.rowCount || rows.length,
      scheduleAt:   data.scheduleAt || [],
      lastError:    data.lastError || null,
      rows,
    });
  } catch (e) { next(e); }
});

// ── GET /api/tnrd/reports/:id/rows  ─────────────────────────────────────────
// Paginated rows: ?limit=100&offset=0
router.get('/reports/:id/rows', requireAuth, async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit  || '200', 10), 1000);
    const offset = parseInt(req.query.offset || '0', 10);

    const docRef   = getDb().collection(COLLECTION).doc(req.params.id);
    const meta     = await docRef.get();
    if (!meta.exists) return res.status(404).json({ error: 'Report not found.' });

    const rowsSnap = await docRef.collection('rows')
      .orderBy('__name__')
      .offset(offset)
      .limit(limit)
      .get();

    res.json({
      reportId: req.params.id,
      offset,
      limit,
      rows: rowsSnap.docs.map(d => d.data()),
    });
  } catch (e) { next(e); }
});

module.exports = router;
