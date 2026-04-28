'use strict';
/**
 * Data Tier — Firestore abstraction layer.
 * All collections are accessed only through this module.
 * Services call these functions; routes never touch Firestore directly.
 */
const { getDb } = require('../config/firebase');

const COL = {
  BENEFICIARIES: 'beneficiaries',
  ALLOTMENTS:    'allotments',
  ISSUANCES:     'issuances',
  STOCK_LEDGER:  'stockLedger',
  BDO_STOCK:     'bdoStockEntries',
  INSPECTIONS:   'inspections',
  ALERTS:        'alerts',
  PERMISSIONS:   'config',   // single doc 'permissions'
  COUNTERS:      'counters', // challanCounter, etc.
};

// ── Generic helpers ──────────────────────────────────────────────────────────

async function getAll(collection, ...whereClauses) {
  const db  = getDb();
  let   ref = db.collection(collection);
  for (const [field, op, value] of whereClauses) {
    ref = ref.where(field, op, value);
  }
  const snap = await ref.get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function getById(collection, id) {
  const db   = getDb();
  const snap = await db.collection(collection).doc(id).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

async function create(collection, id, data) {
  const db  = getDb();
  const ref = db.collection(collection).doc(id);
  await ref.set({ ...data, _createdAt: new Date().toISOString() });
  return { id, ...data };
}

async function upsert(collection, id, data) {
  const db = getDb();
  await db.collection(collection).doc(id).set(data, { merge: true });
  return { id, ...data };
}

async function update(collection, id, data) {
  const db = getDb();
  await db.collection(collection).doc(id).update({
    ...data,
    _updatedAt: new Date().toISOString(),
  });
  return { id, ...data };
}

async function remove(collection, id) {
  const db = getDb();
  await db.collection(collection).doc(id).delete();
}

async function batchCreate(collection, docs) {
  const db    = getDb();
  const batch = db.batch();
  const now   = new Date().toISOString();
  const out   = [];
  for (const doc of docs) {
    const ref = db.collection(collection).doc(doc.id);
    batch.set(ref, { ...doc, _createdAt: now }, { merge: true });
    out.push(doc);
  }
  await batch.commit();
  return out;
}

// ── Challan counter (atomic) ─────────────────────────────────────────────────
async function nextChallanSeq() {
  const db  = getDb();
  const ref = db.collection(COL.COUNTERS).doc('challan');
  const val = await db.runTransaction(async t => {
    const snap = await t.get(ref);
    const next = (snap.exists ? snap.data().seq : 10000) + 1;
    t.set(ref, { seq: next });
    return next;
  });
  return val;
}

// ── Domain-specific getters (thin wrappers used by services) ─────────────────

const beneficiaries = {
  getAll:     (block) => block ? getAll(COL.BENEFICIARIES, ['block','==',block]) : getAll(COL.BENEFICIARIES),
  getById:    (id)   => getById(COL.BENEFICIARIES, id),
  create:     (id, d) => create(COL.BENEFICIARIES, id, d),
  update:     (id, d) => update(COL.BENEFICIARIES, id, d),
  batchCreate:(docs)  => batchCreate(COL.BENEFICIARIES, docs),
  remove:     (id)   => remove(COL.BENEFICIARIES, id),
};

const allotments = {
  getAll:  (block) => block ? getAll(COL.ALLOTMENTS, ['block','==',block]) : getAll(COL.ALLOTMENTS),
  getById: (id)   => getById(COL.ALLOTMENTS, id),
  create:  (id, d) => create(COL.ALLOTMENTS, id, d),
  update:  (id, d) => update(COL.ALLOTMENTS, id, d),
  remove:  (id)   => remove(COL.ALLOTMENTS, id),
};

const issuances = {
  getAll:  (block) => block ? getAll(COL.ISSUANCES, ['block','==',block]) : getAll(COL.ISSUANCES),
  getById: (id)   => getById(COL.ISSUANCES, id),
  create:  (id, d) => create(COL.ISSUANCES, id, d),
  update:  (id, d) => update(COL.ISSUANCES, id, d),
};

const stock = {
  getLedger:      (block) => block ? getAll(COL.STOCK_LEDGER, ['block','==',block]) : getAll(COL.STOCK_LEDGER),
  getBdoEntries:  (block) => block ? getAll(COL.BDO_STOCK, ['block','==',block]) : getAll(COL.BDO_STOCK),
  addLedgerEntry: (id, d) => create(COL.STOCK_LEDGER, id, d),
  addBdoEntry:    (id, d) => create(COL.BDO_STOCK, id, d),
  updateBdoEntry: (id, d) => update(COL.BDO_STOCK, id, d),
};

const inspections = {
  getAll:  (block) => block ? getAll(COL.INSPECTIONS, ['block','==',block]) : getAll(COL.INSPECTIONS),
  getById: (id)   => getById(COL.INSPECTIONS, id),
  create:  (id, d) => create(COL.INSPECTIONS, id, d),
};

const alerts = {
  getAll:  () => getAll(COL.ALERTS),
  create:  (id, d) => create(COL.ALERTS, id, d),
  update:  (id, d) => update(COL.ALERTS, id, d),
  remove:  (id) => remove(COL.ALERTS, id),
};

const permissions = {
  get:  () => getById(COL.PERMISSIONS, 'permissions'),
  save: (d) => upsert(COL.PERMISSIONS, 'permissions', d),
};

module.exports = {
  COL,
  beneficiaries,
  allotments,
  issuances,
  stock,
  inspections,
  alerts,
  permissions,
  nextChallanSeq,
  // expose raw helpers for ad-hoc queries in services
  getAll,
  getById,
  create,
  update,
  remove,
  batchCreate,
};
