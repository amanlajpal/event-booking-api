import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { errorHandler } from './middlewares/error.middleware.js';
import authRoutes from './routes/auth.routes.js';
import eventRoutes from './routes/event.routes.js';
import bookingRoutes from './routes/booking.routes.js';
import { prisma } from './config/database.js';
import { reservationService } from './services/reservation.service.js';

export function createApp(): Application {
  const app = express();

  // Security Middlewares with CSP tailored for interactive dashboard
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          scriptSrcAttr: ["'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
        },
      },
    })
  );
  app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'] }));

  // Request Parsing
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // HTTP Request Logging
  if (env.NODE_ENV !== 'test') {
    app.use(morgan('dev'));
  }

  // Rate Limiting (Protects public routes against DoS while allowing high throughput on benchmark paths)
  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10000, // 10,000 requests per minute to support extreme load testing
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests. Please try again later.' },
    skip: (req) => req.path.includes('/benchmark') || req.path.includes('/health'),
  });
  app.use('/api/', limiter);

  // Root Landing & Interactive Visual Dashboard
  const serveDashboard = async (req: Request, res: Response) => {
    try {
      const events = await prisma.event.findMany({
        take: 10,
        orderBy: { eventDate: 'asc' },
        include: { organizer: { select: { name: true, email: true } } },
      });

      const eventsHtml = events
        .map(
          (e) => `
          <div style="background:#fff;border-radius:10px;padding:20px;margin-bottom:16px;box-shadow:0 2px 8px rgba(0,0,0,0.06);border:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
            <div style="flex:1;min-width:260px;">
              <h3 style="margin:0 0 6px 0;color:#1e293b;font-size:18px;">${e.title}</h3>
              <p style="margin:0 0 8px 0;color:#64748b;font-size:14px;">${e.description}</p>
              <div style="font-size:13px;color:#475569;display:flex;gap:16px;flex-wrap:wrap;">
                <span>📍 ${e.location}</span>
                <span>📅 ${new Date(e.eventDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                <span>💵 $${e.ticketPrice.toFixed(2)}</span>
              </div>
            </div>
            <div style="text-align:right;">
              <div style="margin-bottom:8px;">
                <span style="font-size:24px;font-weight:700;color:${e.availableTickets > 0 ? '#0f766e' : '#e11d48'};">${e.availableTickets}</span>
                <span style="font-size:14px;color:#64748b;"> / ${e.totalTickets} seats</span>
              </div>
              <button class="book-btn" data-event-id="${e.id}" style="background:#2563eb;color:#fff;border:none;padding:10px 18px;border-radius:6px;font-weight:600;cursor:pointer;transition:background 0.2s;" onmouseover="this.style.background='#1d4ed8'" onmouseout="this.style.background='#2563eb'">
                ⚡ Book 1 Ticket
              </button>
            </div>
          </div>
        `
        )
        .join('');

      res.status(200).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Event Booking System - Enterprise API Dashboard</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #1e293b; margin: 0; padding: 24px; }
            .container { max-width: 960px; margin: 0 auto; }
            .header { background: linear-gradient(135deg, #1e3a8a, #3b82f6); color: #fff; padding: 32px; border-radius: 12px; margin-bottom: 24px; box-shadow: 0 4px 14px rgba(37,99,235,0.2); }
            .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; background: #dcfce7; color: #166534; }
            .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin: 20px 0; }
            .stat-card { background: #fff; border-radius: 8px; padding: 16px; border: 1px solid #e2e8f0; }
            .stat-title { font-size: 12px; color: #64748b; font-weight: 600; text-transform: uppercase; }
            .stat-val { font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 4px; }
            pre { background: #0f172a; color: #f8fafc; padding: 16px; border-radius: 8px; overflow-x: auto; font-size: 13px; }
            #status-msg { margin-top: 12px; padding: 12px; border-radius: 6px; display: none; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <span class="badge" style="background:#e0e7ff;color:#3730a3;margin-bottom:8px;">Enterprise Grade</span>
              <h1 style="margin:8px 0 6px 0;font-size:28px;">Event Booking System API</h1>
              <p style="margin:0;opacity:0.9;font-size:15px;">High Concurrency Architecture &bull; RBAC &bull; BullMQ Real Email Notifications &bull; Zero Overselling</p>
            </div>

            <div class="stat-grid">
              <div class="stat-card">
                <div class="stat-title">System Status</div>
                <div class="stat-val" style="color:#16a34a;">● Operational (UP)</div>
              </div>
              <div class="stat-card">
                <div class="stat-title">Concurrency Engine</div>
                <div class="stat-val" style="color:#2563eb;">${env.CONCURRENCY_MODE.toUpperCase()}</div>
              </div>
              <div class="stat-card">
                <div class="stat-title">Email Provider</div>
                <div class="stat-val">${env.EMAIL_PROVIDER.toUpperCase()}</div>
              </div>
              <div class="stat-card">
                <div class="stat-title">Target Recipient</div>
                <div class="stat-val" style="font-size:14px;word-break:break-all;">lajpalaman1314@gmail.com</div>
              </div>
            </div>

            <div id="status-msg"></div>

            <h2 style="font-size:20px;margin:28px 0 16px 0;">Available Events (Live Inventory)</h2>
            <div>${eventsHtml}</div>

            <div style="background:#fff;border-radius:10px;padding:24px;border:1px solid #e2e8f0;margin-top:24px;">
              <h3 style="margin-top:0;">Quick API Endpoints</h3>
              <p style="font-size:14px;color:#64748b;">Ready for Postman testing, stress testing, and Loom video demonstration.</p>
              <ul>
                <li><code>GET /health</code> - <a href="/health" target="_blank">View System Health & Database Connection</a></li>
                <li><code>GET /api/v1/events</code> - <a href="/api/v1/events" target="_blank">Public Event Catalog JSON</a></li>
                <li><code>POST /api/v1/auth/login</code> - Login (Organizer: <code>organizer@events.com</code> / Customer: <code>lajpalaman1314@gmail.com</code>)</li>
                <li><code>POST /api/v1/events/:id/book</code> - Customer Booking (Triggers Background Email)</li>
                <li><code>PUT /api/v1/events/:id</code> - Organizer Event Update (Triggers Async Attendee Email Fanout)</li>
              </ul>
              <h4 style="margin-bottom:8px;">Run Concurrency Benchmark</h4>
              <pre>npm run test:stress</pre>
            </div>
          </div>

          <script>
            document.addEventListener('DOMContentLoaded', () => {
              document.querySelectorAll('.book-btn').forEach((btn) => {
                btn.addEventListener('click', (e) => {
                  e.preventDefault();
                  const eventId = btn.getAttribute('data-event-id');
                  if (eventId) bookTicket(eventId);
                });
              });
            });

            async function bookTicket(eventId) {
              const msg = document.getElementById('status-msg');
              msg.style.display = 'block';
              msg.style.background = '#e0f2fe';
              msg.style.color = '#0369a1';
              msg.innerHTML = '⏳ Authenticating & reserving ticket via API...';

              try {
                // 1. Login customer
                const loginRes = await fetch('/api/v1/auth/login', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email: 'lajpalaman1314@gmail.com', password: 'Password123!' })
                });
                const loginData = await loginRes.json();
                const token = loginData.data?.token;

                // 2. Book ticket
                const bookRes = await fetch('/api/v1/events/' + eventId + '/book', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                  },
                  body: JSON.stringify({ quantity: 1 })
                });
                const bookData = await bookRes.json();

                if (bookRes.status === 201) {
                  msg.style.background = '#dcfce7';
                  msg.style.color = '#15803d';
                  msg.innerHTML = '🎉 <strong>Ticket Booked Successfully!</strong> Booking ID: <code>' + bookData.data.id + '</code>. Real booking confirmation email enqueued and sent via Resend to <strong>lajpalaman1314@gmail.com</strong>!';
                  setTimeout(() => location.reload(), 2500);
                } else {
                  msg.style.background = '#fee2e2';
                  msg.style.color = '#b91c1c';
                  msg.innerHTML = '❌ Booking failed: ' + (bookData.error || 'Sold out');
                }
              } catch (err) {
                msg.style.background = '#fee2e2';
                msg.style.color = '#b91c1c';
                msg.innerHTML = '❌ Error: ' + err.message;
              }
            }
          </script>
        </body>
        </html>
      `);
    } catch (err: unknown) {
      res.status(500).send('Error loading dashboard: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  app.get('/', serveDashboard);
  app.get(env.API_PREFIX, serveDashboard);

  // Health Check Endpoint
  app.get('/health', async (req: Request, res: Response) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.status(200).json({
        status: 'UP',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: 'CONNECTED',
        environment: env.NODE_ENV,
        concurrencyMode: env.CONCURRENCY_MODE,
      });
    } catch (err: unknown) {
      res.status(503).json({
        status: 'DOWN',
        database: 'DISCONNECTED',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // Benchmark Helper: Reset or inspect test event for load testing & Loom demo
  app.post(`${env.API_PREFIX}/benchmark/reset-event`, async (req: Request, res: Response) => {
    const { eventId, totalTickets = 50 } = req.body;
    if (!eventId) {
      res.status(400).json({ error: 'eventId is required' });
      return;
    }
    await prisma.booking.deleteMany({ where: { eventId } });
    const updated = await prisma.event.update({
      where: { id: eventId },
      data: { totalTickets, availableTickets: totalTickets },
    });
    reservationService.setAvailable(eventId, totalTickets);
    res.status(200).json({
      message: 'Event inventory and bookings reset successfully for benchmark.',
      event: updated,
    });
  });

  // API Routes
  app.use(`${env.API_PREFIX}/auth`, authRoutes);
  app.use(`${env.API_PREFIX}/events`, eventRoutes);
  app.use(`${env.API_PREFIX}/bookings`, bookingRoutes);

  // Catch-all 404 Route
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: `Route not found: ${req.method} ${req.originalUrl}`,
    });
  });

  // Global Centralized Error Handler
  app.use(errorHandler);

  return app;
}
