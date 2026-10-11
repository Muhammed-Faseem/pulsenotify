const { WebSocketServer } = require('ws');
const redis = require('redis');
const winston = require('winston');
const http = require('http');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: 'ws-server' },
  transports: [new winston.transports.Console()]
});

// Map: userId → Set of WebSocket connections
// One user can have multiple browser tabs open
const connections = new Map();

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      connections: connections.size,
      timestamp: new Date().toISOString()
    }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  // Client connects with: wss://pulsenotify.com/ws?userId=xxx&tenantId=yyy&apiKey=zzz
  const url = new URL(req.url, 'ws://localhost');
  const userId = url.searchParams.get('userId');
  const tenantId = url.searchParams.get('tenantId');

  if (!userId || !tenantId) {
    ws.close(4000, 'userId and tenantId required');
    return;
  }

  // Register the connection
  const key = `${tenantId}:${userId}`;
  if (!connections.has(key)) connections.set(key, new Set());
  connections.get(key).add(ws);

  logger.info('WebSocket connected', { userId, tenantId, totalConnections: connections.size });

  ws.on('message', (data) => {
    // Clients can send ping to keep connection alive
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
    } catch {}
  });

  ws.on('close', () => {
    const userConns = connections.get(key);
    if (userConns) {
      userConns.delete(ws);
      if (userConns.size === 0) connections.delete(key);
    }
    logger.info('WebSocket disconnected', { userId, tenantId });
  });

  ws.send(JSON.stringify({ type: 'connected', userId, timestamp: new Date().toISOString() }));
});

// Subscribe to Redis pub/sub for incoming notifications
async function startRedisSubscriber() {
  const subscriber = redis.createClient({ url: process.env.REDIS_URL });
  subscriber.on('error', (err) => logger.error('Redis subscriber error', { error: err.message }));
  await subscriber.connect();

  // Worker publishes to this channel when a notification is ready
  await subscriber.subscribe('notifications', (message) => {
    try {
      const notification = JSON.parse(message);
      const key = `${notification.tenantId}:${notification.userId}`;
      const userConns = connections.get(key);

      if (userConns && userConns.size > 0) {
        const payload = JSON.stringify({ type: 'notification', data: notification });
        userConns.forEach((ws) => {
          if (ws.readyState === 1) {  // OPEN
            ws.send(payload);
          }
        });
        logger.info('Notification delivered via WebSocket', {
          notificationId: notification.id,
          userId: notification.userId,
          connections: userConns.size
        });
      }
    } catch (err) {
      logger.error('Error delivering notification', { error: err.message });
    }
  });

  logger.info('Redis subscriber ready');
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, async () => {
  logger.info(`WebSocket server listening on port ${PORT}`);
  await startRedisSubscriber();
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received — closing WebSocket server');
  wss.close(() => process.exit(0));
});
