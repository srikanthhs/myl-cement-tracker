'use strict';
const router = require('express').Router();
const { findByCredentials, safeUser } = require('../data/users');
const { signToken, requireAuth }      = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password are required.' });

  const user = findByCredentials(username.trim(), password);
  if (!user)
    return res.status(401).json({ error: 'Invalid username or password.' });

  const safe  = safeUser(user);
  const token = signToken({ id: safe.id, username: safe.username, role: safe.role, block: safe.block, name: safe.name });
  return res.json({ token, user: safe });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const { findById } = require('../data/users');
  const user = findById(req.user.id);
  return res.json(safeUser(user));
});

// POST /api/auth/logout  (stateless JWT – client just discards the token)
router.post('/logout', requireAuth, (_req, res) => {
  res.json({ message: 'Logged out.' });
});

module.exports = router;
