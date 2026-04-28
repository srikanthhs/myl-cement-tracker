'use strict';
const router = require('express').Router();
const { requireAuth }       = require('../middleware/auth');
const { scopeBlock }        = require('../middleware/rbac');
const db   = require('../db/firestore');

router.use(requireAuth, scopeBlock);

// GET /api/alerts – system-generated alerts derived from live data
router.get('/', async (req, res, next) => {
  try {
    const [bens, allots, iss, bdoStock] = await Promise.all([
      db.beneficiaries.getAll(req.blockFilter),
      db.allotments.getAll(req.blockFilter),
      db.issuances.getAll(req.blockFilter),
      db.stock.getBdoEntries(req.blockFilter),
    ]);

    const alerts = [];

    // Low stock alert
    bdoStock.forEach(e => {
      const blockIssd = iss.filter(i => i.block === e.block).reduce((s, i) => s + (i.bags || 0), 0);
      const bal = (e.bags || 0) - blockIssd;
      if (bal < 100 && bal >= 0) {
        alerts.push({
          type: 'warning',
          title: `Low Stock – ${e.block}`,
          body: `Only ${bal} bags remaining`,
          block: e.block,
          ts: new Date().toISOString(),
        });
      }
    });

    // Pending allotments for > 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 864e5).toISOString();
    allots.filter(a => a.status === 'Pending' && a.createdAt < sevenDaysAgo).forEach(a => {
      alerts.push({
        type: 'info',
        title: `Allotment Pending – ${a.beneficiaryName}`,
        body: `${a.challanNo} has been pending for >7 days`,
        block: a.block,
        ts: a.createdAt,
      });
    });

    // Approved allotments not yet issued > 3 days
    const threeDaysAgo = new Date(Date.now() - 3 * 864e5).toISOString();
    allots.filter(a => a.status === 'Approved' && a.approvedAt < threeDaysAgo).forEach(a => {
      alerts.push({
        type: 'warning',
        title: `Issue Pending – ${a.beneficiaryName}`,
        body: `${a.challanNo} approved but not yet issued`,
        block: a.block,
        ts: a.approvedAt,
      });
    });

    res.json(alerts.sort((a, b) => (b.ts > a.ts ? 1 : -1)));
  } catch (e) { next(e); }
});

module.exports = router;
