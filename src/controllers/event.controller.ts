import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { eventService } from '../services/event.service.js';
import { AuthRequest } from '../middlewares/auth.middleware.js';

const createEventSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  location: z.string().min(2, 'Location is required'),
  eventDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid date format. Expected ISO-8601 string',
  }),
  totalTickets: z.number().int().positive('Total tickets must be greater than 0'),
  ticketPrice: z.number().min(0, 'Ticket price cannot be negative').default(0),
});

const updateEventSchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().min(10).optional(),
  location: z.string().min(2).optional(),
  eventDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid date format. Expected ISO-8601 string',
  }).optional(),
  ticketPrice: z.number().min(0).optional(),
});

export class EventController {
  async createEvent(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = createEventSchema.parse(req.body);
      const event = await eventService.createEvent(req.user!.userId, {
        ...validated,
        eventDate: new Date(validated.eventDate),
      });

      res.status(201).json({
        success: true,
        message: 'Event created successfully',
        data: event,
      });
    } catch (err) {
      next(err);
    }
  }

  async getEvents(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { search, location, startDate, endDate, page, limit } = req.query;

      const result = await eventService.getEvents({
        search: search ? String(search) : undefined,
        location: location ? String(location) : undefined,
        startDate: startDate ? new Date(String(startDate)) : undefined,
        endDate: endDate ? new Date(String(endDate)) : undefined,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 10,
      });

      res.status(200).json({
        success: true,
        data: result.events,
        pagination: {
          total: result.total,
          page: result.page,
          totalPages: result.totalPages,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async getEventById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const event = await eventService.getEventById(req.params.id);
      res.status(200).json({
        success: true,
        data: event,
      });
    } catch (err) {
      next(err);
    }
  }

  async updateEvent(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = updateEventSchema.parse(req.body);
      const event = await eventService.updateEvent(req.user!.userId, req.params.id, {
        ...validated,
        eventDate: validated.eventDate ? new Date(validated.eventDate) : undefined,
      });

      res.status(200).json({
        success: true,
        message: 'Event updated successfully. Background notification dispatched to attendees.',
        data: event,
      });
    } catch (err) {
      next(err);
    }
  }

  async deleteEvent(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      await eventService.deleteEvent(req.user!.userId, req.params.id);
      res.status(200).json({
        success: true,
        message: 'Event deleted successfully',
      });
    } catch (err) {
      next(err);
    }
  }

  async getEventBookings(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const bookings = await eventService.getEventBookings(req.user!.userId, req.params.id);
      res.status(200).json({
        success: true,
        data: bookings,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const eventController = new EventController();
