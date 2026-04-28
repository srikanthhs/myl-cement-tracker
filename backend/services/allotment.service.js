'use strict';
const { v4: uuid } = require('uuid');
const db = require('../db/firestore');
const benSvc = require('./beneficiary.service');

async function list(block) {
  return db.allotments.getAll(block);
}

async function getById(id) {
  const a = await db.allotments.getById(id);
  if (!a) throw Object.assign(new Error('Allotment not found'), { status: 404 });
  return a;
}

async function create(data, user) {
  const ben = await benSvc.getById(data.beneficiaryId);
  const now = new Date().toISOString();

  const id  = `ALT-${Date.now()}-${uuid().slice(0,6).toUpperCase()}`;
  const challanNo = await _genChallan(ben.block);

  const doc = {
    id,
    beneficiaryId:   ben.id,
    beneficiaryName: ben.name,
    village:         ben.village,
    block:           ben.block,
    scheme:          ben.scheme  || data.scheme  || '',
    year:            ben.year    || data.year     || '',
    workId:          ben.workId  || '',
    bags:            parseInt(data.bags) || 0,
    status:          'Pending',
    engineerVerified: false,
    challanNo,
    remarks:         data.remarks || '',
    createdBy:       user.name,
    createdByRole:   user.role,
    createdAt:       now,
    timeline: [{
      event: 'Allotment Created',
      by:    user.name,
      at:    now,
      note:  `${data.bags} bags requested`,
    }],
  };

  return db.allotments.create(id, doc);
}

async function engineerVerify(id, user, remarks) {
  const a = await getById(id);
  if (a.engineerVerified) throw Object.assign(new Error('Already verified by engineer'), { status: 400 });

  const now = new Date().toISOString();
  const patch = {
    engineerVerified:  true,
    engineerBy:        user.name,
    engineerAt:        now,
    engineerRemarks:   remarks || '',
    timeline:          [...(a.timeline || []), {
      event: 'Engineer Verified',
      by:    user.name,
      at:    now,
      note:  remarks || 'Site and work verified',
    }],
  };
  return db.allotments.update(id, patch);
}

async function approve(id, user, remarks) {
  const a = await getById(id);
  if (a.status === 'Approved') throw Object.assign(new Error('Already approved'), { status: 400 });
  if (a.status === 'Rejected') throw Object.assign(new Error('Cannot approve a rejected allotment'), { status: 400 });

  const now = new Date().toISOString();
  const patch = {
    status:      'Approved',
    approvedBy:  user.name,
    approvedAt:  now,
    approveRemarks: remarks || '',
    timeline: [...(a.timeline || []), {
      event: 'Approved',
      by:    user.name,
      at:    now,
      note:  remarks || 'Allotment approved',
    }],
  };
  return db.allotments.update(id, patch);
}

async function reject(id, user, reason) {
  const a = await getById(id);
  if (a.status === 'Rejected') throw Object.assign(new Error('Already rejected'), { status: 400 });

  const now = new Date().toISOString();
  const patch = {
    status:     'Rejected',
    rejectedBy: user.name,
    rejectedAt: now,
    rejectReason: reason || '',
    timeline: [...(a.timeline || []), {
      event: 'Rejected',
      by:    user.name,
      at:    now,
      note:  reason || 'Rejected by approver',
    }],
  };
  return db.allotments.update(id, patch);
}

async function update(id, data, user) {
  const a = await getById(id);
  if (a.status === 'Issued') throw Object.assign(new Error('Cannot edit an issued allotment'), { status: 400 });

  const now = new Date().toISOString();
  const patch = {
    bags:    data.bags    !== undefined ? parseInt(data.bags) : a.bags,
    remarks: data.remarks !== undefined ? data.remarks       : a.remarks,
    timeline: [...(a.timeline || []), {
      event: 'Edited',
      by:    user.name,
      at:    now,
      note:  `Updated by ${user.role}`,
    }],
  };
  return db.allotments.update(id, patch);
}

async function remove(id) {
  await getById(id);
  await db.allotments.remove(id);
  return { deleted: id };
}

// ── Private ───────────────────────────────────────────────────────────────────
async function _genChallan(block) {
  const seq    = await db.nextChallanSeq();
  const prefix = block.slice(0, 3).toUpperCase();
  const num    = String(seq).padStart(5, '0');
  const now    = new Date();
  const dd     = String(now.getDate()).padStart(2,'0');
  const mm     = String(now.getMonth()+1).padStart(2,'0');
  const yyyy   = now.getFullYear();
  const hh     = String(now.getHours()).padStart(2,'0');
  const min    = String(now.getMinutes()).padStart(2,'0');
  return `${prefix}-${num}-${dd}${mm}${yyyy}/${hh}:${min}`;
}

module.exports = { list, getById, create, engineerVerify, approve, reject, update, remove };
