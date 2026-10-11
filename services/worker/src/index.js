const { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } = require('@aws-sdk/client-sqs');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const redis = require('redis');
const { Pool } = require('pg');
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: 'worker' },
  transports: [new winston.transports.Console()]
});

const sqs = new SQSClient({ region: process.env.AWS_REGION });
const ses = new SESClient({ region: process.env.AWS_REGION });
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });

let redisClient;

async function connectRedis() {
  redisClient = redis.createClient({ url: process.env.REDIS_URL });
  redisClient.on('error', (err) => logger.error('Redis error', { error: err.message }));
  await redisClient.connect();
  logger.info('Redis connected');
}

async function processNotification(notification) {
  const { id, tenantId, userId, title, body, channel } = notification;

  // Publish to Redis so WebSocket server delivers it in real-time
  await redisClient.publish('notifications', JSON.stringify(notification));

  // For email channel: send via SES
  if (channel === 'email') {
    // Get user email from database
    const result = await pool.query(
      'SELECT email FROM user_preferences WHERE tenant_id = $1 AND user_id = $2',
      [tenantId, userId]
    );

    if (result.rows.length > 0 && result.rows[0].email) {
      await ses.send(new SendEmailCommand({
        Source: process.env.FROM_EMAIL,
        Destination: { ToAddresses: [result.rows[0].email] },
        Message: {
          Subject: { Data: title },
          Body: { Text: { Data: body } }
        }
      }));
      logger.info('Email sent', { notificationId: id, userId });
    }
  }

  // Update notification status to delivered
  await pool.query(
    `UPDATE notifications SET status = 'delivered', delivered_at = NOW() WHERE id = $1`,
    [id]
  );

  logger.info('Notification processed', { notificationId: id, userId, channel });
}

async function pollQueue() {
  while (true) {
    try {
      const response = await sqs.send(new ReceiveMessageCommand({
        QueueUrl: process.env.SQS_QUEUE_URL,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 20,    // long polling — waits up to 20s for messages
        VisibilityTimeout: 60   // 60s to process before message becomes visible again
      }));

      const messages = response.Messages || [];

      await Promise.all(messages.map(async (message) => {
        try {
          const notification = JSON.parse(message.Body);
          await processNotification(notification);

          // Delete from queue only after successful processing
          await sqs.send(new DeleteMessageCommand({
            QueueUrl: process.env.SQS_QUEUE_URL,
            ReceiptHandle: message.ReceiptHandle
          }));
        } catch (err) {
          logger.error('Failed to process message', {
            error: err.message,
            messageId: message.MessageId
          });
          // Don't delete — SQS will make it visible again after VisibilityTimeout
          // After MaxReceiveCount failures, SQS moves it to the dead-letter queue
        }
      }));
    } catch (err) {
      logger.error('Queue polling error', { error: err.message });
      await new Promise(r => setTimeout(r, 5000));  // wait 5s before retrying
    }
  }
}

async function start() {
  await connectRedis();
  logger.info('Worker started — polling SQS queue');
  await pollQueue();
}

start().catch((err) => {
  logger.error('Worker failed to start', { error: err.message });
  process.exit(1);
});
