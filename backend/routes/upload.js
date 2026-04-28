'use strict';
const router  = require('express').Router();
const multer  = require('multer');
const XLSX    = require('xlsx');
const { requireAuth }  = require('../middleware/auth');
const { allow }        = require('../middleware/rbac');
const benSvc           = require('../services/beneficiary.service');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                     'application/vnd.ms-excel', 'text/csv'];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(xlsx?|csv)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Only .xlsx, .xls, and .csv files are allowed.'));
    }
  },
});

// POST /api/upload/beneficiaries
router.post('/beneficiaries', requireAuth, allow('admin','bdo'), upload.single('file'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  const block = req.body.block || req.user.block;
  if (!block) return res.status(400).json({ error: 'Block is required.' });

  try {
    const wb    = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows  = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (!rows.length) return res.status(400).json({ error: 'File is empty or unreadable.' });

    const result = await benSvc.bulkImport(rows, block, req.user.name);
    res.json({ message: `Successfully imported ${result.imported} beneficiaries`, ...result });
  } catch (e) { next(e); }
});

// GET /api/upload/template – Download Excel template
router.get('/template', requireAuth, (_req, res) => {
  const headers = [
    'TNRD Work ID', 'Beneficiary Name', 'Village/Panchayat', 'Scheme',
    'Year', 'Sanctioned Bags', 'Issued Bags', 'Mobile', 'Aadhaar', 'House No', 'Address'
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ['W/12345', 'Sample Name', 'Panchayat', 'PMAY', '2024-25', '30', '0', '9000000000', '1234-5678-9012', 'H.No.1', 'Village, Block']]);
  XLSX.utils.book_append_sheet(wb, ws, 'Beneficiaries');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="beneficiary_template.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

module.exports = router;
