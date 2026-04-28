'use strict';
const router = require('express').Router();
const { requireAuth }       = require('../middleware/auth');
const { allow, scopeBlock } = require('../middleware/rbac');
const svc = require('../services/report.service');

router.use(requireAuth, scopeBlock);

// GET /api/reports/district
router.get('/district', allow('admin'), async (_req, res, next) => {
  try { res.json(await svc.districtSummary()); }
  catch (e) { next(e); }
});

// GET /api/reports/block
router.get('/block', allow('admin','bdo','overseer','engineer'), async (req, res, next) => {
  const block = req.blockFilter || req.query.block;
  if (!block) return res.status(400).json({ error: 'Block is required.' });
  try { res.json(await svc.blockReport(block)); }
  catch (e) { next(e); }
});

// GET /api/reports/issuance-log
router.get('/issuance-log', allow('admin','bdo','overseer','store','engineer'), async (req, res, next) => {
  try {
    res.json(await svc.issuanceLog(req.blockFilter, req.query.from, req.query.to));
  } catch (e) { next(e); }
});

// GET /api/reports/pending
router.get('/pending', allow('admin','bdo','overseer','engineer'), async (req, res, next) => {
  try { res.json(await svc.pendingAllotments(req.blockFilter)); }
  catch (e) { next(e); }
});

module.exports = router;
