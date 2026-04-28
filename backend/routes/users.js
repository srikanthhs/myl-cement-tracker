'use strict';
const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { allow }       = require('../middleware/rbac');
const { USERS, safeUser } = require('../data/users');
const db = require('../db/firestore');

router.use(requireAuth);

// GET /api/users – list all users (admin only)
router.get('/', allow('admin'), (_req, res) => {
  res.json(USERS.map(safeUser));
});

// GET /api/users/permissions
router.get('/permissions', allow('admin'), async (_req, res, next) => {
  try {
    const perms = await db.permissions.get();
    res.json(perms || {});
  } catch (e) { next(e); }
});

// PUT /api/users/permissions
router.put('/permissions', allow('admin'), async (req, res, next) => {
  try {
    const saved = await db.permissions.save(req.body);
    res.json(saved);
  } catch (e) { next(e); }
});

module.exports = router;
