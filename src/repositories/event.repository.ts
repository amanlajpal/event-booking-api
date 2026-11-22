import { prisma } from '../config/database.js';
import { Event } from '@prisma/client';

export interface EventFilter {
  search?: string;
  location?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

export class EventRepository {
  async findById(id: string): Promise<Event | null> {
    return prisma.event.findUnique({
      where: { id },
      include: {
        organizer: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }

  async findMany(filter: EventFilter = {}): Promise<{ events: Event[]; total: number; page: number; totalPages: number }> {
    const page = Math.max(1, filter.page || 1);
    const limit = Math.max(1, Math.min(100, filter.limit || 10));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (filter.search) {
      where.OR = [
        { title: { contains: filter.search } },
        { description: { contains: filter.search } },
      ];
    }

    if (filter.location) {
      where.location = { contains: filter.location };
    }

    if (filter.startDate || filter.endDate) {
      const dateFilter: Record<string, unknown> = {};
      if (filter.startDate) dateFilter.gte = filter.startDate;
      if (filter.endDate) dateFilter.lte = filter.endDate;
      where.eventDate = dateFilter;
    }

    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        skip,
        take: limit,
        orderBy: { eventDate: 'asc' },
        include: {
          organizer: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
      prisma.event.count({ where }),
    ]);

    return {
      events,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async create(data: {
    organizerId: string;
    title: string;
    description: string;
    location: string;
    eventDate: Date;
    totalTickets: number;
    ticketPrice: number;
  }): Promise<Event> {
    return prisma.event.create({
      data: {
        organizerId: data.organizerId,
        title: data.title,
        description: data.description,
        location: data.location,
        eventDate: data.eventDate,
        totalTickets: data.totalTickets,
        availableTickets: data.totalTickets,
        ticketPrice: data.ticketPrice,
      },
    });
  }

  async update(id: string, data: Partial<Omit<Event, 'id' | 'organizerId' | 'createdAt' | 'updatedAt'>>): Promise<Event> {
    return prisma.event.update({
      where: { id },
      data: {
        ...data,
        version: { increment: 1 },
      },
    });
  }

  async delete(id: string): Promise<Event> {
    return prisma.event.delete({
      where: { id },
    });
  }

  async findBookingsByEventId(eventId: string) {
    return prisma.booking.findMany({
      where: { eventId },
      include: {
        customer: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}

export const eventRepository = new EventRepository();
