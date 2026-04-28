'use strict';
const router = require('express').Router();
const { requireAuth }       = require('../middleware/auth');
const { allow, scopeBlock } = require('../middleware/rbac');
const svc = require('../services/stock.service');

router.use(requireAuth, scopeBlock);

// GET /api/stock/summary
router.get('/summary', async (req, res, next) => {
  try { res.json(await svc.summary(req.blockFilter)); }
  catch (e) { next(e); }
});

// GET /api/stock/ledger
router.get('/ledger', allow('admin','bdo','store'), async (req, res, next) => {
  try { res.json(await svc.getLedger(req.blockFilter)); }
  catch (e) { next(e); }
});

// GET /api/stock/bdo-entries
router.get('/bdo-entries', allow('admin','bdo','store','engineer'), async (req, res, next) => {
  try { res.json(await svc.getBdoEntries(req.blockFilter)); }
  catch (e) { next(e); }
});

// POST /api/stock/central-receipt  – Central depot receipt
router.post('/central-receipt', allow('admin'), async (req, res, next) => {
  try { res.status(201).json(await svc.addCentralReceipt(req.body, req.user)); }
  catch (e) { next(e); }
});

// POST /api/stock/block-receipt  – Block depot receives stock
router.post('/block-receipt', allow('admin','bdo','store'), async (req, res, next) => {
  try { res.status(201).json(await svc.addBlockReceipt(req.body, req.user)); }
  catch (e) { next(e); }
});

module.exports = router;
