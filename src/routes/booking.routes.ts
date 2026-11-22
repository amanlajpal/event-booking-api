import { Router } from 'express';
import { bookingController } from '../controllers/booking.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { authorizeRoles } from '../middlewares/rbac.middleware.js';

const router = Router();

router.get(
  '/my-bookings',
  authenticate,
  authorizeRoles('CUSTOMER'),
  (req, res, next) => bookingController.getMyBookings(req, res, next)
);

export default router;
