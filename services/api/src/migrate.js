const { pool } = require('./db');
const logger = require('./logger');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

await client.query(`
  CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    api_key VARCHAR(64) UNIQUE NOT NULL
      DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
    plan VARCHAR(50) DEFAULT 'free',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id),
        user_id VARCHAR(255) NOT NULL,
        title VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        channel VARCHAR(50) DEFAULT 'in-app',
        metadata JSONB DEFAULT '{}',
        status VARCHAR(50) DEFAULT 'pending',
        read_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL,
        delivered_at TIMESTAMPTZ
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_tenant_user
        ON notifications(tenant_id, user_id, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_notifications_status
        ON notifications(status) WHERE status != 'read';
    `);

    await client.query('COMMIT');
    logger.info('Database migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { migrate };
