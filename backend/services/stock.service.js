'use strict';
const { v4: uuid } = require('uuid');
const db = require('../db/firestore');

async function getLedger(block) {
  return db.stock.getLedger(block);
}

async function getBdoEntries(block) {
  return db.stock.getBdoEntries(block);
}

async function centralBalance() {
  const entries = await db.stock.getLedger(null);
  const recv = entries.filter(e => e.type === 'RECEIPT').reduce((s, e) => s + (e.bags || 0), 0);
  const iss  = entries.filter(e => e.type === 'ISSUE').reduce((s, e) => s + (e.bags || 0), 0);
  return Math.max(0, recv - iss);
}

async function blockBalance(block) {
  const entries = await db.stock.getBdoEntries(block);
  const issuances = await db.issuances.getAll(block);
  const received = entries.reduce((s, e) => s + (e.bags || 0), 0);
  const issued   = issuances.reduce((s, i) => s + (i.bags || 0), 0);
  return Math.max(0, received - issued);
}

async function addCentralReceipt(data, user) {
  const id  = `SL-${Date.now()}-${uuid().slice(0,6).toUpperCase()}`;
  const doc = {
    id,
    type:      'RECEIPT',
    bags:      parseInt(data.bags),
    block:     data.block  || null,
    lorryNo:   data.lorryNo   || '',
    invoiceNo: data.invoiceNo || '',
    supplier:  data.supplier  || '',
    remarks:   data.remarks   || '',
    by:        user.name,
    date:      data.date   || new Date().toISOString().slice(0,10),
    createdAt: new Date().toISOString(),
  };
  return db.stock.addLedgerEntry(id, doc);
}

async function addBlockReceipt(data, user) {
  const id  = `BDO-${Date.now()}-${uuid().slice(0,6).toUpperCase()}`;
  const doc = {
    id,
    block:     data.block  || user.block,
    bags:      parseInt(data.bags),
    lorryNo:   data.lorryNo   || '',
    invoiceNo: data.invoiceNo || '',
    remarks:   data.remarks   || '',
    by:        user.name,
    date:      data.date   || new Date().toISOString().slice(0,10),
    createdAt: new Date().toISOString(),
  };
  return db.stock.addBdoEntry(id, doc);
}

async function debitStock(block, bags, challanNo, user) {
  const id  = `SL-DEB-${Date.now()}-${uuid().slice(0,6).toUpperCase()}`;
  const doc = {
    id,
    type:      'ISSUE',
    block,
    bags,
    challanNo,
    by:        user.name,
    date:      new Date().toISOString().slice(0,10),
    createdAt: new Date().toISOString(),
  };
  return db.stock.addLedgerEntry(id, doc);
}

async function summary(block) {
  const [ledger, bdoEntries, issuances] = await Promise.all([
    db.stock.getLedger(null),
    db.stock.getBdoEntries(block),
    db.issuances.getAll(block),
  ]);

  const centralRecv = ledger.filter(e => e.type === 'RECEIPT').reduce((s, e) => s + (e.bags || 0), 0);
  const centralIss  = ledger.filter(e => e.type === 'ISSUE').reduce((s, e) => s + (e.bags || 0), 0);
  const centralBal  = Math.max(0, centralRecv - centralIss);

  const blockRecv  = bdoEntries.reduce((s, e) => s + (e.bags || 0), 0);
  const blockIssd  = issuances.reduce((s, i) => s + (i.bags || 0), 0);
  const blockBal   = Math.max(0, blockRecv - blockIssd);

  return { centralRecv, centralIss, centralBal, blockRecv, blockIssd, blockBal };
}

module.exports = {
  getLedger, getBdoEntries,
  centralBalance, blockBalance,
  addCentralReceipt, addBlockReceipt, debitStock,
  summary,
};
