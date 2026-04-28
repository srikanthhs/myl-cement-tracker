'use strict';
require('dotenv').config();

const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const morgan     = require('morgan');
const path       = require('path');
const rateLimit  = require('express-rate-limit');

const app = express();

// ── Security & Request Parsing ───────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:      ["'self'"],
      scriptSrc:       ["'self'", "'unsafe-inline'", 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net',
                        'fonts.googleapis.com', 'www.gstatic.com'],
      scriptSrcAttr:   ["'unsafe-inline'"],   // allows onclick="..." in HTML
      styleSrc:        ["'self'", "'unsafe-inline'", 'fonts.googleapis.com'],
      fontSrc:         ["'self'", 'fonts.gstatic.com'],
      imgSrc:          ["'self'", 'data:', 'blob:'],
      connectSrc:      ["'self'", '*.googleapis.com', '*.firebaseio.com',
                        'cdnjs.cloudflare.com', 'cdn.jsdelivr.net'],  // allow sourcemap fetches
    }
  }
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));

app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Rate Limiting ────────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests – try again in 15 minutes.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts – try again in 15 minutes.' },
});

app.use('/api/', apiLimiter);

// ── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth',          authLimiter, require('./routes/auth'));
app.use('/api/beneficiaries', require('./routes/beneficiaries'));
app.use('/api/allotments',    require('./routes/allotments'));
app.use('/api/issuance',      require('./routes/issuance'));
app.use('/api/stock',         require('./routes/stock'));
app.use('/api/reports',       require('./routes/reports'));
app.use('/api/users',         require('./routes/users'));
app.use('/api/alerts',        require('./routes/alerts'));
app.use('/api/upload',        require('./routes/upload'));
app.use('/api/tnrd',          require('./routes/tnrd'));

// ── Serve Frontend Static Files ──────────────────────────────────────────────
const FRONTEND = path.join(__dirname, '..', 'frontend');
app.use(express.static(FRONTEND));

// SPA fallback – always return index.html for non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(FRONTEND, 'index.html'));
});

// ── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  const status  = err.status || 500;
  const message = process.env.NODE_ENV === 'production' && status === 500
    ? 'Internal server error'
    : err.message;
  console.error(`[ERROR] ${status} – ${message}`, err.stack || '');
  res.status(status).json({ error: message });
});

// ── Start (skip listen when running as Vercel serverless function) ───────────
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`MYL Cement Tracker running on http://localhost:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

module.exports = app;
