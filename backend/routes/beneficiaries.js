'use strict';
const router  = require('express').Router();
const { requireAuth }  = require('../middleware/auth');
const { allow, scopeBlock } = require('../middleware/rbac');
const svc = require('../services/beneficiary.service');

const canView = allow('admin','bdo','overseer','engineer','store');
const canEdit = allow('admin','bdo');

router.use(requireAuth, scopeBlock);

// GET /api/beneficiaries
router.get('/', canView, async (req, res, next) => {
  try {
    const data = await svc.list(req.blockFilter);
    res.json(data);
  } catch (e) { next(e); }
});

// GET /api/beneficiaries/:id
router.get('/:id', canView, async (req, res, next) => {
  try { res.json(await svc.getById(req.params.id)); }
  catch (e) { next(e); }
});

// POST /api/beneficiaries
router.post('/', canEdit, async (req, res, next) => {
  try {
    const doc = await svc.create(req.body, req.user.name);
    res.status(201).json(doc);
  } catch (e) { next(e); }
});

// PUT /api/beneficiaries/:id
router.put('/:id', canEdit, async (req, res, next) => {
  try { res.json(await svc.update(req.params.id, req.body, req.user.name)); }
  catch (e) { next(e); }
});

// DELETE /api/beneficiaries/:id
router.delete('/:id', allow('admin'), async (req, res, next) => {
  try { res.json(await svc.remove(req.params.id, req.user.name)); }
  catch (e) { next(e); }
});

module.exports = router;
