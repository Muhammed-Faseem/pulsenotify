const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db');
const { getClient } = require('../redis');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const logger = require('../logger');

const router = express.Router();
const sqs = new SQSClient({ region: process.env.AWS_REGION });

// Middleware: authenticate by API key (header: X-API-Key)
async function authenticate(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) {
    return res.status(401).json({ error: 'Missing X-API-Key header' });
  }

  // Check Redis cache first (avoid hitting DB on every request)
  const redisClient = getClient();
  const cached = await redisClient.get(`tenant:${apiKey}`);
  if (cached) {
    req.tenant = JSON.parse(cached);
    return next();
  }

  // Cache miss — check database
  const result = await pool.query(
    'SELECT id, name, plan FROM tenants WHERE api_key = $1 AND active = true',
    [apiKey]
  );

  if (result.rows.length === 0) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  req.tenant = result.rows[0];
  // Cache for 5 minutes
  await redisClient.setEx(`tenant:${apiKey}`, 300, JSON.stringify(req.tenant));
  next();
}

// POST /api/notifications — send a notification
router.post('/', authenticate, async (req, res) => {
  const { userId, title, body, channel = 'in-app', metadata = {} } = req.body;

  if (!userId || !title || !body) {
    return res.status(400).json({ error: 'userId, title, and body are required' });
  }

  const id = uuidv4();
  const notification = {
    id,
    tenantId: req.tenant.id,
    userId,
    title,
    body,
    channel,
    metadata,
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  // Store in database
  await pool.query(
    `INSERT INTO notifications (id, tenant_id, user_id, title, body, channel, metadata, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, req.tenant.id, userId, title, body, channel, JSON.stringify(metadata), 'pending', notification.createdAt]
  );

  // Queue for async processing
  await sqs.send(new SendMessageCommand({
    QueueUrl: process.env.SQS_QUEUE_URL,
    MessageBody: JSON.stringify(notification),
    MessageAttributes: {
      channel: { DataType: 'String', StringValue: channel }
    }
  }));

  logger.info('Notification queued', {
    notificationId: id,
    tenantId: req.tenant.id,
    userId,
    channel
  });

  res.status(202).json({ id, status: 'queued' });
});

// GET /api/notifications — list notifications for a user
router.get('/', authenticate, async (req, res) => {
  const { userId, limit = 50, offset = 0, status } = req.query;

  if (!userId) {
    return res.status(400).json({ error: 'userId query parameter required' });
  }

  let query = `
    SELECT id, user_id, title, body, channel, status, read_at, created_at
    FROM notifications
    WHERE tenant_id = $1 AND user_id = $2
  `;
  const params = [req.tenant.id, userId];

  if (status) {
    query += ` AND status = $${params.length + 1}`;
    params.push(status);
  }

  query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);

  const result = await pool.query(query, params);
  res.json({ notifications: result.rows, count: result.rows.length });
});

// PATCH /api/notifications/:id/read — mark as read
router.patch('/:id/read', authenticate, async (req, res) => {
  const { id } = req.params;

  const result = await pool.query(
    `UPDATE notifications SET status = 'read', read_at = NOW()
     WHERE id = $1 AND tenant_id = $2
     RETURNING id, status, read_at`,
    [id, req.tenant.id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Notification not found' });
  }

  res.json(result.rows[0]);
});

module.exports = router;
