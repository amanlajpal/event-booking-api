import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { emailService } from '../utils/email.service.js';
import { prisma } from '../config/database.js';

export interface BookingConfirmationPayload {
  bookingId: string;
  customerId: string;
  customerEmail: string;
  customerName: string;
  eventTitle: string;
  eventDate: Date;
  location: string;
  ticketQuantity: number;
  totalPrice: number;
}

export interface EventUpdatePayload {
  eventId: string;
  eventTitle: string;
  changes: string;
  eventDate: Date;
  location: string;
}

class QueueService {
  private redisConnection: IORedis | null = null;
  private bookingQueue: Queue | null = null;
  private eventUpdateQueue: Queue | null = null;
  private isRedisAvailable = false;

  async init(): Promise<void> {
    try {
      this.redisConnection = new IORedis(env.REDIS_URL, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        retryStrategy: () => null, // Don't hang indefinitely if Redis is down
        connectTimeout: 2000,
      });

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Redis connection timeout'));
        }, 2000);

        this.redisConnection!.on('ready', () => {
          clearTimeout(timeout);
          this.isRedisAvailable = true;
          logger.info('🚀 Connected to Redis. BullMQ Queues initialized in Distributed Mode.');
          resolve();
        });

        this.redisConnection!.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      if (this.isRedisAvailable) {
        this.setupBullQueues();
      }
    } catch {
      logger.warn('⚠️ Redis not reachable. Seamlessly activating High-Performance In-Memory Async Job Queue.');
      this.isRedisAvailable = false;
    }
  }

  private setupBullQueues(): void {
    const defaultJobOptions = {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    };

    this.bookingQueue = new Queue('booking-confirmation', {
      connection: this.redisConnection!,
      defaultJobOptions,
    });

    this.eventUpdateQueue = new Queue('event-update-notification', {
      connection: this.redisConnection!,
      defaultJobOptions,
    });

    // BullMQ Workers with rate-limiting to respect Resend's 10 req/sec limit
    new Worker(
      'booking-confirmation',
      async (job: Job<BookingConfirmationPayload>) => {
        logger.info(`[BullMQ Worker] Processing booking confirmation job #${job.id}`);
        await this.processBookingConfirmation(job.data);
      },
      {
        connection: this.redisConnection!,
        concurrency: 2,
        limiter: {
          max: 5,
          duration: 1000,
        },
      }
    );

    new Worker(
      'event-update-notification',
      async (job: Job<EventUpdatePayload>) => {
        logger.info(`[BullMQ Worker] Processing event update notification job #${job.id}`);
        await this.processEventUpdateNotification(job.data);
      },
      {
        connection: this.redisConnection!,
        concurrency: 1,
        limiter: {
          max: 5,
          duration: 1000,
        },
      }
    );
  }

  // Memory queue worker chain to throttle email delivery and prevent provider 429s
  private memoryQueueChain: Promise<void> = Promise.resolve();

  private enqueueMemoryTask(fn: () => Promise<void>): void {
    this.memoryQueueChain = this.memoryQueueChain
      .catch(() => {})
      .then(async () => {
        try {
          await fn();
        } catch (err) {
          logger.error('Async task error:', err);
        }
        // Throttle 150ms between email deliveries to stay within provider rate limits
        await new Promise((r) => setTimeout(r, 150));
      });
  }

  // Enqueue Task 1: Booking Confirmation
  async addBookingConfirmationJob(payload: BookingConfirmationPayload): Promise<void> {
    logger.info(`📥 Enqueueing Booking Confirmation Task for Booking ID: ${payload.bookingId}`);
    if (this.isRedisAvailable && this.bookingQueue) {
      await this.bookingQueue.add('send-confirmation', payload, {
        jobId: `booking-${payload.bookingId}`,
      });
    } else {
      this.enqueueMemoryTask(async () => {
        await this.processBookingConfirmation(payload);
      });
    }
  }

  // Enqueue Task 2: Event Update Notification
  async addEventUpdateJob(payload: EventUpdatePayload): Promise<void> {
    logger.info(`📥 Enqueueing Event Update Notification Task for Event ID: ${payload.eventId}`);
    if (this.isRedisAvailable && this.eventUpdateQueue) {
      await this.eventUpdateQueue.add('send-event-update', payload, {
        jobId: `event-update-${payload.eventId}-${Date.now()}`,
      });
    } else {
      this.enqueueMemoryTask(async () => {
        await this.processEventUpdateNotification(payload);
      });
    }
  }

  // Worker Execution 1: Send real booking confirmation email
  private async processBookingConfirmation(data: BookingConfirmationPayload): Promise<void> {
    const html = emailService.generateBookingConfirmationHtml({
      id: data.bookingId,
      customerName: data.customerName,
      eventTitle: data.eventTitle,
      eventDate: data.eventDate,
      location: data.location,
      ticketQuantity: data.ticketQuantity,
      totalPrice: data.totalPrice,
    });

    await emailService.sendEmail({
      to: data.customerEmail,
      subject: `Booking Confirmed: ${data.eventTitle} (Ref #${data.bookingId.slice(0, 8)})`,
      html,
      type: 'BOOKING_CONFIRMATION',
    });
  }

  // Worker Execution 2: Fan-out notification to all attendees who booked tickets for this event
  private async processEventUpdateNotification(data: EventUpdatePayload): Promise<void> {
    // Query distinct customers who booked tickets for this event
    const bookings = await prisma.booking.findMany({
      where: {
        eventId: data.eventId,
        status: 'CONFIRMED',
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Deduplicate customer recipients
    const recipientsMap = new Map<string, { name: string; email: string }>();
    for (const b of bookings) {
      if (b.customer?.email) {
        recipientsMap.set(b.customer.email, {
          name: b.customer.name,
          email: b.customer.email,
        });
      }
    }

    const uniqueRecipients = Array.from(recipientsMap.values());
    logger.info(`📢 Found ${uniqueRecipients.length} customer(s) to notify for event "${data.eventTitle}"`);

    // Enterprise Batching: Chunk into batches of 25 to respect provider rate limits
    const BATCH_SIZE = 25;
    for (let i = 0; i < uniqueRecipients.length; i += BATCH_SIZE) {
      const batch = uniqueRecipients.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (recipient) => {
          const html = emailService.generateEventUpdateHtml({
            customerName: recipient.name,
            eventTitle: data.eventTitle,
            changes: data.changes,
            eventDate: data.eventDate,
            location: data.location,
          });

          await emailService.sendEmail({
            to: recipient.email,
            subject: `Important Update: ${data.eventTitle}`,
            html,
            type: 'EVENT_UPDATE',
          });
        })
      );
    }
  }

  async close(): Promise<void> {
    if (this.bookingQueue) await this.bookingQueue.close();
    if (this.eventUpdateQueue) await this.eventUpdateQueue.close();
    if (this.redisConnection) await this.redisConnection.quit();
  }
}

export const queueService = new QueueService();

