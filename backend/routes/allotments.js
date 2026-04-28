'use strict';
const router = require('express').Router();
const { requireAuth }       = require('../middleware/auth');
const { allow, scopeBlock } = require('../middleware/rbac');
const svc = require('../services/allotment.service');

router.use(requireAuth, scopeBlock);

// GET /api/allotments
router.get('/', allow('admin','bdo','overseer','engineer','store'), async (req, res, next) => {
  try { res.json(await svc.list(req.blockFilter)); }
  catch (e) { next(e); }
});

// GET /api/allotments/:id
router.get('/:id', allow('admin','bdo','overseer','engineer','store'), async (req, res, next) => {
  try { res.json(await svc.getById(req.params.id)); }
  catch (e) { next(e); }
});

// POST /api/allotments
router.post('/', allow('admin','bdo','overseer'), async (req, res, next) => {
  try { res.status(201).json(await svc.create(req.body, req.user)); }
  catch (e) { next(e); }
});

// PATCH /api/allotments/:id/engineer-verify
router.patch('/:id/engineer-verify', allow('admin','engineer'), async (req, res, next) => {
  try { res.json(await svc.engineerVerify(req.params.id, req.user, req.body.remarks)); }
  catch (e) { next(e); }
});

// PATCH /api/allotments/:id/approve
router.patch('/:id/approve', allow('admin','bdo'), async (req, res, next) => {
  try { res.json(await svc.approve(req.params.id, req.user, req.body.remarks)); }
  catch (e) { next(e); }
});

// PATCH /api/allotments/:id/reject
router.patch('/:id/reject', allow('admin','bdo'), async (req, res, next) => {
  try { res.json(await svc.reject(req.params.id, req.user, req.body.reason)); }
  catch (e) { next(e); }
});

// PUT /api/allotments/:id
router.put('/:id', allow('admin','bdo','overseer'), async (req, res, next) => {
  try { res.json(await svc.update(req.params.id, req.body, req.user)); }
  catch (e) { next(e); }
});

// DELETE /api/allotments/:id
router.delete('/:id', allow('admin'), async (req, res, next) => {
  try { res.json(await svc.remove(req.params.id)); }
  catch (e) { next(e); }
});

module.exports = router;
