import { Injectable } from '@angular/core';
import { Metadata, RunView } from '@memberjunction/core';
import { EventsEventEntity } from 'mj_generatedentities';

@Injectable({
  providedIn: 'root'
})
export class EventService {

  async getEvents(): Promise<EventsEventEntity[]> {
    const rv = new RunView();
    const result = await rv.RunView<EventsEventEntity>({
      EntityName: 'Events',
      OrderBy: 'StartDate DESC',
      ResultType: 'entity_object'
    });

    return result.Success ? (result.Results || []) : [];
  }

  async getEventById(id: string): Promise<EventsEventEntity | null> {
    const md = new Metadata();
    const event = await md.GetEntityObject('Events') as unknown as EventsEventEntity;
    const loaded = await event.Load(id);
    return loaded ? event : null;
  }

  async createEvent(): Promise<EventsEventEntity> {
    const md = new Metadata();
    return await md.GetEntityObject('Events') as unknown as EventsEventEntity;
  }

  async getEventStatistics(): Promise<{
    totalEvents: number;
    upcomingEvents: number;
    pastEvents: number;
  }> {
    const events = await this.getEvents();
    const now = new Date();

    return {
      totalEvents: events.length,
      upcomingEvents: events.filter(e => new Date(e.StartDate) > now).length,
      pastEvents: events.filter(e => new Date(e.EndDate) < now).length
    };
  }
}
