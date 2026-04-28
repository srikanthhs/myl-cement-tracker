'use strict';
const { v4: uuid } = require('uuid');
const db = require('../db/firestore');

const BLOCKS = ['Mayiladuthurai','Sirkali','Sembanarkoil','Kuthalam','Papanasam','Sirkazhi','Tarangambadi'];

async function list(block) {
  return db.beneficiaries.getAll(block);
}

async function getById(id) {
  const b = await db.beneficiaries.getById(id);
  if (!b) throw Object.assign(new Error('Beneficiary not found'), { status: 404 });
  return b;
}

async function create(data, createdBy) {
  const id = data.id || `BEN-${Date.now()}-${uuid().slice(0,6).toUpperCase()}`;
  const doc = {
    id,
    name:          data.name?.trim()      || '',
    village:       data.village?.trim()   || '',
    block:         data.block?.trim()     || '',
    scheme:        data.scheme?.trim()    || '',
    year:          data.year?.toString()  || '',
    sanctionedBags:parseInt(data.sanctionedBags) || 0,
    issuedBags:    parseInt(data.issuedBags)     || 0,
    mobile:        data.mobile?.trim()    || '',
    aadhaar:       data.aadhaar?.trim()   || '',
    workId:        data.workId?.trim()    || '',
    houseNo:       data.houseNo?.trim()   || '',
    address:       data.address?.trim()   || '',
    status:        data.status            || 'Active',
    createdBy,
    createdAt:     new Date().toISOString(),
  };
  return db.beneficiaries.create(id, doc);
}

async function update(id, data, updatedBy) {
  await getById(id);
  const patch = {};
  const fields = ['name','village','block','scheme','year','sanctionedBags','issuedBags','mobile','aadhaar','workId','houseNo','address','status'];
  for (const f of fields) {
    if (data[f] !== undefined) patch[f] = data[f];
  }
  patch.updatedBy = updatedBy;
  return db.beneficiaries.update(id, patch);
}

async function bulkImport(rows, block, uploadedBy) {
  const docs = rows.map(r => {
    const id = r.workId
      ? `BEN-${r.workId.toString().replace(/\s+/g,'').toUpperCase()}`
      : `BEN-${Date.now()}-${uuid().slice(0,4).toUpperCase()}`;
    return {
      id,
      name:          String(r['Beneficiary Name'] || r.name || '').trim(),
      village:       String(r['Village/Panchayat'] || r.village || '').trim(),
      block:         block,
      scheme:        String(r['Scheme'] || r.scheme || 'PMAY').trim(),
      year:          String(r['Year'] || r.year || '2024-25').trim(),
      sanctionedBags:parseInt(r['Sanctioned Bags'] || r.sanctionedBags || 0),
      issuedBags:    parseInt(r['Issued Bags'] || r.issuedBags || 0),
      mobile:        String(r['Mobile'] || r.mobile || '').trim(),
      aadhaar:       String(r['Aadhaar'] || r.aadhaar || '').trim(),
      workId:        String(r['TNRD Work ID'] || r.workId || '').trim(),
      houseNo:       String(r['House No'] || r.houseNo || '').trim(),
      address:       String(r['Address'] || r.address || '').trim(),
      status:        'Active',
      uploadedBy,
      createdAt:     new Date().toISOString(),
    };
  }).filter(r => r.name);

  await db.beneficiaries.batchCreate(docs);
  return { imported: docs.length };
}

async function remove(id, deletedBy) {
  await getById(id);
  await db.beneficiaries.remove(id);
  return { deleted: id, by: deletedBy };
}

module.exports = { list, getById, create, update, bulkImport, remove, BLOCKS };
