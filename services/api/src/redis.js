const redis = require('redis');
const logger = require('./logger');

let client;

async function connect() {
  client = redis.createClient({ url: process.env.REDIS_URL });

  client.on('error', (err) => {
    logger.error('Redis error', { error: err.message });
  });

  await client.connect();
  logger.info('Redis connected');
}

function getClient() {
  if (!client) throw new Error('Redis not connected');
  return client;
}

module.exports = { connect, getClient };
