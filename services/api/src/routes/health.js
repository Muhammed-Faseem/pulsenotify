const express = require('express');
const { pool } = require('../db');
const { getClient } = require('../redis');
const logger = require('../logger');

const router = express.Router();

// Health check — used by Kubernetes readiness and liveness probes
router.get('/health', async (req, res) => {
  const checks = { database: false, redis: false };

  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    checks.database = true;
  } catch (err) {
    logger.warn('Health check: database failed', { error: err.message });
  }

  try {
    await getClient().ping();
    checks.redis = true;
  } catch (err) {
    logger.warn('Health check: redis failed', { error: err.message });
  }

  const healthy = checks.database && checks.redis;
  const status = healthy ? 200 : 503;

  res.status(status).json({
    status: healthy ? 'healthy' : 'unhealthy',
    checks,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
