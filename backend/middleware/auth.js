'use strict';
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'myl-cement-dev-secret-change-in-prod';
const EXPIRY  = process.env.JWT_EXPIRY  || '12h';

function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRY });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required.' });
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

module.exports = { signToken, verifyToken, requireAuth };
