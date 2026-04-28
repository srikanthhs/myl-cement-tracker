'use strict';
/**
 * Role-Based Access Control middleware factory.
 * Usage: router.post('/approve', requireAuth, allow('admin','bdo'), handler)
 */

const DEFAULT_PERMISSIONS = {
  createAllotment:  ['admin','bdo','overseer'],
  approveAllotment: ['admin','bdo'],
  editAllotment:    ['admin','bdo','overseer'],
  engineerVerify:   ['admin','engineer'],
  issueCement:      ['admin','store'],
  addStock:         ['admin','store'],
  editStock:        ['admin','store','bdo'],
  viewReports:      ['admin','bdo','overseer'],
  manageUsers:      ['admin'],
  viewBeneficiary:  ['admin','bdo','overseer','engineer'],
  editBeneficiary:  ['admin','bdo'],
  fieldInspect:     ['admin','inspector'],
};

function allow(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthenticated.' });
    if (req.user.role === 'admin') return next(); // admin always passes
    if (roles.includes(req.user.role)) return next();
    return res.status(403).json({ error: `Role '${req.user.role}' is not authorised for this action.` });
  };
}

function allowAction(action) {
  const roles = DEFAULT_PERMISSIONS[action] || [];
  return allow(...roles);
}

function scopeBlock(req, _res, next) {
  // Non-admin users can only access their own block's data.
  // Attach blockFilter to req so route handlers can use it.
  if (req.user.role === 'admin') {
    req.blockFilter = null; // no restriction
  } else {
    req.blockFilter = req.user.block;
  }
  next();
}

module.exports = { allow, allowAction, scopeBlock, DEFAULT_PERMISSIONS };
