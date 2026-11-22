import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { bookingService } from '../services/booking.service.js';
import { AuthRequest } from '../middlewares/auth.middleware.js';

const bookTicketsSchema = z.object({
  quantity: z.number().int().positive('Quantity must be at least 1').default(1),
});

export class BookingController {
  async bookTickets(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = bookTicketsSchema.parse(req.body || {});
      const eventId = req.params.id;
      const customerId = req.user!.userId;
      const customerEmail = req.user!.email;
      const idempotencyKey = (req.headers['x-idempotency-key'] as string) || undefined;
      const modeOverride = (req.query.mode as 'naive' | 'optimized') || undefined;

      const booking = await bookingService.bookTickets({
        customerId,
        customerEmail,
        eventId,
        quantity: validated.quantity,
        idempotencyKey,
        modeOverride,
      });

      res.status(201).json({
        success: true,
        message: 'Tickets booked successfully. Confirmation email enqueued.',
        data: booking,
      });
    } catch (err) {
      next(err);
    }
  }

  async getMyBookings(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const bookings = await bookingService.getMyBookings(req.user!.userId);
      res.status(200).json({
        success: true,
        data: bookings,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const bookingController = new BookingController();
