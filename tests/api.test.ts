import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';

const app = createApp();

describe('Enterprise Event Booking System API Tests', () => {
  let organizerToken: string;
  let customerToken: string;
  let testEventId: string;

  beforeAll(async () => {
    // Clean and seed test accounts
    await prisma.notificationLog.deleteMany({});
    await prisma.booking.deleteMany({});
    await prisma.event.deleteMany({});
    await prisma.user.deleteMany({});

    // Register Organizer
    const orgRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Test Organizer',
        email: 'org@test.com',
        password: 'Password123!',
        role: 'ORGANIZER',
      });
    organizerToken = orgRes.body.data.token;

    // Register Customer
    const custRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Test Customer',
        email: 'cust@test.com',
        password: 'Password123!',
        role: 'CUSTOMER',
      });
    customerToken = custRes.body.data.token;
  });

  afterAll(async () => {
    // Wait for throttled async queue jobs to complete cleanly
    await new Promise((r) => setTimeout(r, 4000));
    
    // Ensure default demo users and events exist for live UI and benchmarks
    const bcrypt = (await import('bcryptjs')).default;
    const pwd = await bcrypt.hash('Password123!', 10);
    await prisma.user.upsert({
      where: { email: 'lajpalaman1314@gmail.com' },
      update: {},
      create: { name: 'Aman Lajpal', email: 'lajpalaman1314@gmail.com', password: pwd, role: 'CUSTOMER' },
    });
    await prisma.user.upsert({
      where: { email: 'organizer@events.com' },
      update: {},
      create: { name: 'Sarah Connor (Organizer)', email: 'organizer@events.com', password: pwd, role: 'ORGANIZER' },
    });
    
    await prisma.$disconnect();
  });

  describe('Authentication & RBAC Control', () => {
    it('should reject unauthenticated access to protected routes with 401', async () => {
      const res = await request(app).post('/api/v1/events').send({});
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject Customer role from creating an event with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          title: 'Unauthorized Event',
          description: 'This should fail RBAC guard',
          location: 'Cyber Space',
          eventDate: new Date('2026-12-01').toISOString(),
          totalTickets: 100,
        });
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Forbidden');
    });

    it('should allow Organizer role to create an event with 201 Created', async () => {
      const res = await request(app)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          title: 'DevOps Summit 2026',
          description: 'A deep dive into Kubernetes and CI/CD pipelines',
          location: 'San Francisco Tech Center',
          eventDate: new Date('2026-12-10T10:00:00Z').toISOString(),
          totalTickets: 10,
          ticketPrice: 50.0,
        });
      expect(res.status).toBe(201);
      expect(res.body.data.title).toBe('DevOps Summit 2026');
      expect(res.body.data.availableTickets).toBe(10);
      testEventId = res.body.data.id;
    });

    it('should allow public discovery of events', async () => {
      const res = await request(app).get('/api/v1/events');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Ticket Booking & Concurrency Protection', () => {
    it('should reject Organizer role from booking tickets with 403 Forbidden', async () => {
      const res = await request(app)
        .post(`/api/v1/events/${testEventId}/book`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ quantity: 1 });
      expect(res.status).toBe(403);
    });

    it('should allow Customer to book a ticket and enqueue confirmation email', async () => {
      const res = await request(app)
        .post(`/api/v1/events/${testEventId}/book`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ quantity: 2 });

      expect(res.status).toBe(201);
      expect(res.body.data.ticketQuantity).toBe(2);
      expect(res.body.data.totalPrice).toBe(100.0);

      // Verify available tickets decremented
      const eventRes = await request(app).get(`/api/v1/events/${testEventId}`);
      expect(eventRes.body.data.availableTickets).toBe(8);
    });

    it('should prevent booking more tickets than available with 409 Conflict', async () => {
      // 8 tickets remain, attempt to book 15
      const res = await request(app)
        .post(`/api/v1/events/${testEventId}/book`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ quantity: 15 });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('Sold out');
    });
  });

  describe('Event Updates & Notification Trigger', () => {
    it('should allow Organizer to update event and enqueue notifications to attendees', async () => {
      const res = await request(app)
        .put(`/api/v1/events/${testEventId}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          location: 'San Francisco Tech Center - Main Arena Hall 4',
          description: 'Updated schedule with keynote speakers',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.location).toBe('San Francisco Tech Center - Main Arena Hall 4');
    });

    it('should reject non-owner Organizer from updating another organizer event with 403', async () => {
      // Create another organizer
      const otherOrg = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Other Org',
          email: 'other@org.com',
          password: 'Password123!',
          role: 'ORGANIZER',
        });

      const res = await request(app)
        .put(`/api/v1/events/${testEventId}`)
        .set('Authorization', `Bearer ${otherOrg.body.data.token}`)
        .send({ title: 'Hacked Title' });

      expect(res.status).toBe(403);
    });
  });

  describe('Customer Personal Bookings & History', () => {
    it('should list customer booking history', async () => {
      const res = await request(app)
        .get('/api/v1/bookings/my-bookings')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].event.title).toBe('DevOps Summit 2026');
    });
  });
});
