const app = require('./app');
const { connect: connectDb } = require('./db');
const { connect: connectRedis } = require('./redis');
const { migrate } = require('./migrate');
const logger = require('./logger');

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await connectDb();
    await connectRedis();
    await migrate();

    const server = app.listen(PORT, () => {
      logger.info(`API server started on port ${PORT}`);
    });

    // Graceful shutdown — handle SIGTERM from Kubernetes
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received — shutting down gracefully');
      server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
    });
  } catch (err) {
    logger.error('Failed to start', { error: err.message });
    process.exit(1);
  }
}

start();
