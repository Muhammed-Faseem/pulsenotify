const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'api',
    version: process.env.APP_VERSION || 'unknown'
  },
  transports: [new winston.transports.Console()]
});

module.exports = logger;
