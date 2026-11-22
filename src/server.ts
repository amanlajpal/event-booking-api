import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDatabase, prisma } from './config/database.js';
import { queueService } from './queues/queue.service.js';
import { logger } from './utils/logger.js';

async function bootstrap() {
  await connectDatabase();
  await queueService.init();

  const app = createApp();

  const server = app.listen(env.PORT, () => {
    logger.info(`=======================================================`);
    logger.info(`🚀 Event Booking API running on http://localhost:${env.PORT}`);
    logger.info(`📡 API Base: http://localhost:${env.PORT}${env.API_PREFIX}`);
    logger.info(`⚡ Concurrency Mode: ${env.CONCURRENCY_MODE.toUpperCase()}`);
    logger.info(`📧 Email Provider: ${env.EMAIL_PROVIDER.toUpperCase()} (${env.EMAIL_FROM})`);
    logger.info(`=======================================================`);
  });

  // Graceful Shutdown
  const handleShutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    server.close(async () => {
      logger.info('HTTP server closed.');
      await queueService.close();
      await prisma.$disconnect();
      logger.info('Database and queues disconnected. Process exited.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.error('Failed to start server:', err);
  process.exit(1);
});
