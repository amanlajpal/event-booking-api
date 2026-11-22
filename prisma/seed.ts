import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Checking database seed state...');

  const userCount = await prisma.user.count();
  if (userCount > 0) {
    console.log(`ℹ️ Database already contains ${userCount} users. Skipping seed.`);
    return;
  }

  console.log('🌱 Seeding database with initial enterprise demo data...');

  const hashedPassword = await bcrypt.hash('Password123!', 10);

  // 1. Create Organizer
  const organizer = await prisma.user.create({
    data: {
      name: 'Sarah Connor (Organizer)',
      email: 'organizer@events.com',
      password: hashedPassword,
      role: 'ORGANIZER',
    },
  });

  // 2. Create Customers
  const customer1 = await prisma.user.create({
    data: {
      name: 'Aman Lajpal',
      email: 'lajpalaman1314@gmail.com', // Direct inbox delivery on Resend free tier!
      password: hashedPassword,
      role: 'CUSTOMER',
    },
  });

  const customer2 = await prisma.user.create({
    data: {
      name: 'Bob Architect',
      email: 'customer@gmail.com',
      password: hashedPassword,
      role: 'CUSTOMER',
    },
  });

  // 3. Create Sample Events
  const stressEvent = await prisma.event.create({
    data: {
      organizerId: organizer.id,
      title: 'Global Tech Innovation Summit 2026',
      description: 'The premier conference on distributed architectures, high-concurrency systems, and AI engineering.',
      location: 'Metropolitan Convention Center, Hall A',
      eventDate: new Date('2026-12-15T09:00:00Z'),
      totalTickets: 50,
      availableTickets: 50,
      ticketPrice: 99.0,
    },
  });

  const masterclassEvent = await prisma.event.create({
    data: {
      organizerId: organizer.id,
      title: 'Cloud-Native Distributed Systems Masterclass',
      description: 'Hands-on deep dive into microservices, BullMQ, Redis caching, and zero-downtime scaling.',
      location: 'Virtual Event (Live Stream)',
      eventDate: new Date('2026-12-20T14:00:00Z'),
      totalTickets: 100,
      availableTickets: 98,
      ticketPrice: 49.0,
    },
  });

  // 4. Create Initial Bookings for Masterclass (to test event update notifications)
  await prisma.booking.create({
    data: {
      eventId: masterclassEvent.id,
      customerId: customer1.id,
      ticketQuantity: 1,
      totalPrice: 49.0,
      status: 'CONFIRMED',
    },
  });

  await prisma.booking.create({
    data: {
      eventId: masterclassEvent.id,
      customerId: customer2.id,
      ticketQuantity: 1,
      totalPrice: 49.0,
      status: 'CONFIRMED',
    },
  });

  console.log('✅ Seed completed successfully:');
  console.log(`- Organizer: organizer@events.com / Password123!`);
  console.log(`- Customer: customer@gmail.com / Password123!`);
  console.log(`- Benchmark Event ID: ${stressEvent.id} (50 tickets)`);
  console.log(`- Masterclass Event ID: ${masterclassEvent.id} (98 tickets remaining, 2 attendees)`);
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
