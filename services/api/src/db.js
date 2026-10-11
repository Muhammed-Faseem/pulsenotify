const { Pool } = require('pg');
const logger = require('./logger');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,                    // max connections in pool
  idleTimeoutMillis: 30000,   // close idle connections after 30s
  connectionTimeoutMillis: 5000
});

pool.on('error', (err) => {
  logger.error('Unexpected database pool error', { error: err.message });
});

// Test connectivity on startup
async function connect() {
  const client = await pool.connect();
  await client.query('SELECT 1');
  client.release();
  logger.info('Database connected');
}

module.exports = { pool, connect };
