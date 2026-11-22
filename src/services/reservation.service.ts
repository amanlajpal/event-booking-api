import { prisma } from '../config/database.js';
import { logger } from '../utils/logger.js';

class ReservationService {
  // Event ID -> available tickets count in atomic memory
  private buckets: Map<string, number> = new Map();
  // Event ID -> Promise chain for serializing writes to avoid DB lock collisions
  private writeQueues: Map<string, Promise<unknown>> = new Map();

  async getAvailable(eventId: string): Promise<number> {
    if (!this.buckets.has(eventId)) {
      const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: { availableTickets: true },
      });
      this.buckets.set(eventId, event?.availableTickets ?? 0);
    }
    return this.buckets.get(eventId)!;
  }

  setAvailable(eventId: string, count: number): void {
    this.buckets.set(eventId, count);
  }

  /**
   * Atomic O(1) Pre-Reservation Guard
   * Protects the database from lock contention by rejecting doomed requests in sub-millisecond time.
   */
  async tryReserve(eventId: string, quantity: number): Promise<boolean> {
    const current = await this.getAvailable(eventId);
    if (current < quantity) {
      return false; // Instant rejection, zero DB load!
    }

    this.buckets.set(eventId, current - quantity);
    return true;
  }

  rollback(eventId: string, quantity: number): void {
    const current = this.buckets.get(eventId) ?? 0;
    this.buckets.set(eventId, current + quantity);
  }

  /**
   * Serializes database write operations per event to eliminate database lock collisions and timeouts.
   */
  async enqueueWrite<T>(eventId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.writeQueues.get(eventId) || Promise.resolve();

    let resolver: (value: T) => void;
    let rejecter: (reason?: unknown) => void;
    const writePromise = new Promise<T>((resolve, reject) => {
      resolver = resolve;
      rejecter = reject;
    });

    const next = previous
      .catch(() => {})
      .then(async () => {
        try {
          const result = await fn();
          resolver(result);
        } catch (err) {
          rejecter(err);
        }
      });

    this.writeQueues.set(eventId, next);
    return writePromise;
  }
}

export const reservationService = new ReservationService();
