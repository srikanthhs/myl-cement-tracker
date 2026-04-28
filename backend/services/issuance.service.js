'use strict';
const { v4: uuid } = require('uuid');
const db = require('../db/firestore');
const allotSvc = require('./allotment.service');
const stockSvc = require('./stock.service');

async function list(block) {
  return db.issuances.getAll(block);
}

async function getById(id) {
  const i = await db.issuances.getById(id);
  if (!i) throw Object.assign(new Error('Issuance not found'), { status: 404 });
  return i;
}

async function issue(data, user) {
  const allot = await allotSvc.getById(data.allotmentId);
  if (allot.status !== 'Approved')
    throw Object.assign(new Error('Allotment must be Approved before issuing'), { status: 400 });

  const bags = parseInt(data.bags);
  if (!bags || bags <= 0) throw Object.assign(new Error('Bags must be > 0'), { status: 400 });

  // Check block stock balance
  const balance = await stockSvc.blockBalance(allot.block);
  if (balance < bags)
    throw Object.assign(new Error(`Insufficient block stock. Available: ${balance} bags`), { status: 400 });

  const now = new Date().toISOString();
  const id  = `ISS-${Date.now()}-${uuid().slice(0,6).toUpperCase()}`;

  const doc = {
    id,
    allotmentId:     allot.id,
    beneficiaryId:   allot.beneficiaryId,
    beneficiaryName: allot.beneficiaryName,
    village:         allot.village,
    block:           allot.block,
    scheme:          allot.scheme,
    year:            allot.year,
    workId:          allot.workId || '',
    challanNo:       allot.challanNo,
    bags,
    photos:          data.photos      || [],
    signature:       data.signature   || '',
    gps:             data.gps         || null,
    receivedBy:      data.receivedBy  || allot.beneficiaryName,
    remarks:         data.remarks     || '',
    issuedBy:        user.name,
    issuedByRole:    user.role,
    issuedAt:        now,
  };

  // Persist issuance
  await db.issuances.create(id, doc);

  // Debit block stock ledger
  await stockSvc.debitStock(allot.block, bags, allot.challanNo, user);

  // Update allotment status to Issued + timeline entry
  await db.allotments.update(allot.id, {
    status: 'Issued',
    issuedAt: now,
    timeline: [...(allot.timeline || []), {
      event: 'Cement Issued',
      by:    user.name,
      at:    now,
      note:  `${bags} bags issued · Challan: ${allot.challanNo}`,
    }],
  });

  return doc;
}

async function verifyCollection(issuanceId, data, user) {
  const iss = await getById(issuanceId);
  const now = new Date().toISOString();
  const id  = `INS-${Date.now()}-${uuid().slice(0,6).toUpperCase()}`;

  if (!data.gps) throw Object.assign(new Error('GPS coordinates are mandatory'), { status: 400 });
  if (!data.photos?.length) throw Object.assign(new Error('At least one photo is required'), { status: 400 });

  const doc = {
    id,
    issuanceId,
    beneficiaryId:   iss.beneficiaryId,
    beneficiaryName: iss.beneficiaryName,
    village:         iss.village,
    block:           iss.block,
    bagsVerified:    parseInt(data.bags) || iss.bags,
    verifiedBy:      user.name,
    condition:       data.condition  || 'Good – All bags intact',
    remarks:         data.remarks    || '',
    gps:             data.gps,
    photos:          data.photos,
    stage:           data.stage      || null,
    verified:        true,
    verifiedAt:      now,
  };

  await db.inspections.create(id, doc);
  return doc;
}

async function fieldInspection(data, user) {
  const now = new Date().toISOString();
  const id  = `FINS-${Date.now()}-${uuid().slice(0,6).toUpperCase()}`;

  if (!data.gps) throw Object.assign(new Error('GPS coordinates are mandatory'), { status: 400 });
  if (!data.photos?.length) throw Object.assign(new Error('At least one photo is required'), { status: 400 });

  const doc = {
    id,
    beneficiaryId:   data.beneficiaryId,
    beneficiaryName: data.beneficiaryName || '',
    village:         data.village         || '',
    block:           user.block           || '',
    stage:           data.stage,
    bagsUsed:        parseInt(data.bagsUsed) || 0,
    observations:    data.observations    || '',
    verifiedBy:      user.name,
    gps:             data.gps,
    photos:          data.photos,
    verified:        false,
    verifiedAt:      now,
  };

  await db.inspections.create(id, doc);
  return doc;
}

async function inspections(block) {
  return db.inspections.getAll(block);
}

module.exports = { list, getById, issue, verifyCollection, fieldInspection, inspections };
