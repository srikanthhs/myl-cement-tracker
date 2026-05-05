'use strict';
const router = require('express').Router();
const { requireAuth }       = require('../middleware/auth');
const { allow, scopeBlock } = require('../middleware/rbac');
const svc = require('../services/issuance.service');

router.use(requireAuth, scopeBlock);

// GET /api/issuance
router.get('/', allow('admin','bdo','store','overseer','engineer'), async (req, res, next) => {
  try { res.json(await svc.list(req.blockFilter)); }
  catch (e) { next(e); }
});

// POST /api/issuance  – Issue cement against an allotment
router.post('/', allow('admin','store'), async (req, res, next) => {
  try { res.status(201).json(await svc.issue(req.body, req.user)); }
  catch (e) { next(e); }
});

// POST /api/issuance/field-inspection  – New field inspection (must be before /:id)
router.post('/field-inspection', allow('admin','inspector'), async (req, res, next) => {
  try { res.status(201).json(await svc.fieldInspection(req.body, req.user)); }
  catch (e) { next(e); }
});

// GET /api/issuance/inspections/all  (must be before /:id)
router.get('/inspections/all', allow('admin','bdo','inspector','engineer','overseer'), async (req, res, next) => {
  try { res.json(await svc.inspections(req.blockFilter)); }
  catch (e) { next(e); }
});

// POST /api/issuance/:id/verify  – Verify collection (inspector)
router.post('/:id/verify', allow('admin','inspector'), async (req, res, next) => {
  try { res.status(201).json(await svc.verifyCollection(req.params.id, req.body, req.user)); }
  catch (e) { next(e); }
});

// GET /api/issuance/:id
router.get('/:id', allow('admin','bdo','store','overseer','engineer'), async (req, res, next) => {
  try { res.json(await svc.getById(req.params.id)); }
  catch (e) { next(e); }
});

module.exports = router;
