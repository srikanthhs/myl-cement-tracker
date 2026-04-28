'use strict';
const db = require('../db/firestore');

async function districtSummary() {
  const [bens, allots, iss, bdoStock] = await Promise.all([
    db.beneficiaries.getAll(null),
    db.allotments.getAll(null),
    db.issuances.getAll(null),
    db.stock.getBdoEntries(null),
  ]);

  const BLOCKS = [...new Set(bens.map(b => b.block).filter(Boolean))].sort();

  const rows = BLOCKS.map(block => {
    const blockBens  = bens.filter(b => b.block === block);
    const blockIss   = iss.filter(i => i.block === block);
    const sanctioned = blockBens.reduce((s, b) => s + (b.sanctionedBags || 0), 0);
    const issued     = blockIss.reduce((s, i) => s + (i.bags || 0), 0);
    const received   = bdoStock.filter(e => e.block === block).reduce((s, e) => s + (e.bags || 0), 0);
    const balance    = Math.max(0, received - issued);
    const pct        = sanctioned ? Math.round(issued / sanctioned * 100) : 0;

    return { block, beneficiaries: blockBens.length, sanctioned, received, issued, balance, pct };
  });

  const totals = rows.reduce((t, r) => ({
    beneficiaries: t.beneficiaries + r.beneficiaries,
    sanctioned:    t.sanctioned    + r.sanctioned,
    received:      t.received      + r.received,
    issued:        t.issued        + r.issued,
    balance:       t.balance       + r.balance,
  }), { beneficiaries:0, sanctioned:0, received:0, issued:0, balance:0 });

  totals.pct = totals.sanctioned ? Math.round(totals.issued / totals.sanctioned * 100) : 0;
  return { rows, totals };
}

async function blockReport(block) {
  const [bens, allots, iss] = await Promise.all([
    db.beneficiaries.getAll(block),
    db.allotments.getAll(block),
    db.issuances.getAll(block),
  ]);

  const panchayats = [...new Set(bens.map(b => b.village).filter(Boolean))].sort();

  const rows = panchayats.map(p => {
    const pBens = bens.filter(b => (b.village || '').toUpperCase() === p.toUpperCase());
    const pIds  = new Set(pBens.map(b => b.id));
    const pIss  = iss.filter(i => pIds.has(i.beneficiaryId));
    const sanc  = pBens.reduce((s, b) => s + (b.sanctionedBags || 0), 0);
    const issd  = pIss.reduce((s, i) => s + (i.bags || 0), 0);
    const pct   = sanc ? Math.round(issd / sanc * 100) : 0;
    return { panchayat: p, beneficiaries: pBens.length, sanctioned: sanc, issued: issd, balance: Math.max(0, sanc - issd), pct };
  });

  return { block, rows };
}

async function issuanceLog(block, fromDate, toDate) {
  const all = await db.issuances.getAll(block);
  return all.filter(i => {
    const d = i.issuedAt?.slice(0, 10);
    if (fromDate && d < fromDate) return false;
    if (toDate   && d > toDate)   return false;
    return true;
  }).sort((a, b) => (b.issuedAt || '') > (a.issuedAt || '') ? 1 : -1);
}

async function pendingAllotments(block) {
  const allots = await db.allotments.getAll(block);
  return allots.filter(a => a.status === 'Pending' || a.status === 'Approved');
}

module.exports = { districtSummary, blockReport, issuanceLog, pendingAllotments };
