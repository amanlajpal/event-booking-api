import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware.js';

export function authorizeRoles(...allowedRoles: Array<'ORGANIZER' | 'CUSTOMER'>) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized: User authentication required',
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: `Forbidden: Access denied. Required role(s): [${allowedRoles.join(', ')}]. Your role: '${req.user.role}'.`,
      });
      return;
    }

    next();
  };
}
