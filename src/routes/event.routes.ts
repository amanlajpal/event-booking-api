import { Router } from 'express';
import { eventController } from '../controllers/event.controller.js';
import { bookingController } from '../controllers/booking.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { authorizeRoles } from '../middlewares/rbac.middleware.js';

const router = Router();

// Public Discovery
router.get('/', (req, res, next) => eventController.getEvents(req, res, next));
router.get('/:id', (req, res, next) => eventController.getEventById(req, res, next));

// Organizer Event Management
router.post(
  '/',
  authenticate,
  authorizeRoles('ORGANIZER'),
  (req, res, next) => eventController.createEvent(req, res, next)
);

router.put(
  '/:id',
  authenticate,
  authorizeRoles('ORGANIZER'),
  (req, res, next) => eventController.updateEvent(req, res, next)
);

router.delete(
  '/:id',
  authenticate,
  authorizeRoles('ORGANIZER'),
  (req, res, next) => eventController.deleteEvent(req, res, next)
);

router.get(
  '/:id/bookings',
  authenticate,
  authorizeRoles('ORGANIZER'),
  (req, res, next) => eventController.getEventBookings(req, res, next)
);

// Customer Ticket Booking (Target of high-concurrency stress testing)
router.post(
  '/:id/book',
  authenticate,
  authorizeRoles('CUSTOMER'),
  (req, res, next) => bookingController.bookTickets(req, res, next)
);

export default router;
