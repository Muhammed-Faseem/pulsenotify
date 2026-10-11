const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const logger = require('./logger');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*' }));
app.use(express.json({ limit: '10kb' }));

// Rate limiting — 100 requests per minute per IP
app.use('/api', rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please slow down' }
}));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info('HTTP request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: Date.now() - start,
      ip: req.ip
    });
  });
  next();
});

// Routes
app.use('/', require('./routes/health'));
app.use('/api/notifications', require('./routes/notifications'));

// Error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
