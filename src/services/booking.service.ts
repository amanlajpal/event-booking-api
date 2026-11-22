import { bookingRepository } from '../repositories/booking.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import { queueService } from '../queues/queue.service.js';
import { env } from '../config/env.js';
import { AppError } from '../middlewares/error.middleware.js';
import { Booking } from '@prisma/client';

export class BookingService {
  async bookTickets(data: {
    customerId: string;
    customerEmail: string;
    eventId: string;
    quantity: number;
    idempotencyKey?: string;
    modeOverride?: 'naive' | 'optimized';
  }): Promise<Booking> {
    const { customerId, customerEmail, eventId, quantity, idempotencyKey, modeOverride } = data;

    if (!quantity || quantity <= 0) {
      throw new AppError('Ticket quantity must be at least 1', 400);
    }

    const mode = modeOverride || env.CONCURRENCY_MODE;

    let booking: Booking;

    if (mode === 'naive') {
      booking = await bookingRepository.bookTicketsNaive(eventId, customerId, quantity, idempotencyKey);
    } else {
      booking = await bookingRepository.bookTicketsOptimized(eventId, customerId, quantity, idempotencyKey);
    }

    // Fetch details for email notification
    const [customer, fullBooking] = await Promise.all([
      userRepository.findById(customerId),
      bookingRepository.findById(booking.id),
    ]);

    // Enqueue Background Task 1: Booking Confirmation Email
    if (fullBooking && (fullBooking as any).event) {
      const event = (fullBooking as any).event;
      await queueService.addBookingConfirmationJob({
        bookingId: booking.id,
        customerId,
        customerEmail: customer?.email || customerEmail,
        customerName: customer?.name || 'Valued Customer',
        eventTitle: event.title,
        eventDate: event.eventDate,
        location: event.location,
        ticketQuantity: booking.ticketQuantity,
        totalPrice: booking.totalPrice,
      });
    }

    return booking;
  }

  async getMyBookings(customerId: string): Promise<Booking[]> {
    return bookingRepository.findByCustomerId(customerId);
  }
}

export const bookingService = new BookingService();
