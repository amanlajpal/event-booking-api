import { eventRepository, EventFilter } from '../repositories/event.repository.js';
import { queueService } from '../queues/queue.service.js';
import { AppError } from '../middlewares/error.middleware.js';
import { Event } from '@prisma/client';

export class EventService {
  async createEvent(
    organizerId: string,
    data: {
      title: string;
      description: string;
      location: string;
      eventDate: Date;
      totalTickets: number;
      ticketPrice: number;
    }
  ): Promise<Event> {
    if (data.totalTickets <= 0) {
      throw new AppError('totalTickets must be greater than 0', 400);
    }
    if (data.ticketPrice < 0) {
      throw new AppError('ticketPrice cannot be negative', 400);
    }

    return eventRepository.create({
      organizerId,
      title: data.title,
      description: data.description,
      location: data.location,
      eventDate: new Date(data.eventDate),
      totalTickets: data.totalTickets,
      ticketPrice: data.ticketPrice,
    });
  }

  async getEvents(filter: EventFilter) {
    return eventRepository.findMany(filter);
  }

  async getEventById(id: string): Promise<Event> {
    const event = await eventRepository.findById(id);
    if (!event) {
      throw new AppError('Event not found', 404);
    }
    return event;
  }

  async updateEvent(
    organizerId: string,
    eventId: string,
    updateData: {
      title?: string;
      description?: string;
      location?: string;
      eventDate?: Date;
      ticketPrice?: number;
    }
  ): Promise<Event> {
    const existing = await eventRepository.findById(eventId);
    if (!existing) {
      throw new AppError('Event not found', 404);
    }

    if (existing.organizerId !== organizerId) {
      throw new AppError('Forbidden: You can only update events you created', 403);
    }

    // Build diff summary for notification
    const changeList: string[] = [];
    if (updateData.title && updateData.title !== existing.title) {
      changeList.push(`Title updated from "${existing.title}" to "${updateData.title}"`);
    }
    if (updateData.location && updateData.location !== existing.location) {
      changeList.push(`Venue moved from "${existing.location}" to "${updateData.location}"`);
    }
    if (updateData.eventDate && new Date(updateData.eventDate).getTime() !== new Date(existing.eventDate).getTime()) {
      changeList.push(`Date/time rescheduled to ${new Date(updateData.eventDate).toLocaleString()}`);
    }
    if (updateData.description && updateData.description !== existing.description) {
      changeList.push('Event description updated');
    }

    const updatedEvent = await eventRepository.update(eventId, {
      ...updateData,
      eventDate: updateData.eventDate ? new Date(updateData.eventDate) : undefined,
    });

    // Enqueue Background Task 2: Event Update Notification
    const changesDescription = changeList.length > 0 ? changeList.join('; ') : 'Event details updated by organizer.';
    await queueService.addEventUpdateJob({
      eventId: updatedEvent.id,
      eventTitle: updatedEvent.title,
      changes: changesDescription,
      eventDate: updatedEvent.eventDate,
      location: updatedEvent.location,
    });

    return updatedEvent;
  }

  async deleteEvent(organizerId: string, eventId: string): Promise<void> {
    const existing = await eventRepository.findById(eventId);
    if (!existing) {
      throw new AppError('Event not found', 404);
    }

    if (existing.organizerId !== organizerId) {
      throw new AppError('Forbidden: You can only delete events you created', 403);
    }

    await eventRepository.delete(eventId);
  }

  async getEventBookings(organizerId: string, eventId: string) {
    const existing = await eventRepository.findById(eventId);
    if (!existing) {
      throw new AppError('Event not found', 404);
    }

    if (existing.organizerId !== organizerId) {
      throw new AppError('Forbidden: You can only view bookings for your own events', 403);
    }

    return eventRepository.findBookingsByEventId(eventId);
  }
}

export const eventService = new EventService();
