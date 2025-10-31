import { Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { map, delay, catchError } from 'rxjs/operators';
import { EventEntity, SubmissionEntity, SpeakerEntity } from 'mj_generatedentities';

/**
 * Event Service for managing conference events and related data
 */
@Injectable({
  providedIn: 'root'
})
export class EventService {
  
  constructor() {}

  /**
   * Get all events
   */
  getEvents(): Observable<EventEntity[]> {
    // TODO: Implement actual MJ data service call
    // Mock data for now
    const mockEvents = [
      {
        ID: '1',
        Name: 'Tech Summit 2024',
        Description: 'Annual technology conference featuring the latest in software development, AI, and cloud computing.',
        StartDate: new Date('2024-06-15'),
        EndDate: new Date('2024-06-17'),
        Status: 'Open for Submissions',
        __mj_CreatedAt: new Date('2024-01-01'),
        __mj_UpdatedAt: new Date('2024-01-15')
      },
      {
        ID: '2', 
        Name: 'Data Science Conference',
        Description: 'Exploring the frontiers of data science, machine learning, and analytics.',
        StartDate: new Date('2024-09-10'),
        EndDate: new Date('2024-09-12'),
        Status: 'Planning',
        __mj_CreatedAt: new Date('2024-01-05'),
        __mj_UpdatedAt: new Date('2024-01-20')
      }
    ] as any[];

    return of(mockEvents).pipe(
      delay(500), // Simulate network delay
      catchError(error => {
        console.error('Error loading events:', error);
        return throwError(() => new Error('Failed to load events'));
      })
    );
  }

  /**
   * Get event by ID
   */
  getEventById(id: string): Observable<EventEntity | null> {
    return this.getEvents().pipe(
      map(events => events.find(event => event.ID === id) || null)
    );
  }

  /**
   * Get submissions for an event
   */
  getEventSubmissions(eventId: string): Observable<SubmissionEntity[]> {
    // TODO: Implement actual MJ data service call
    const mockSubmissions = [
      {
        ID: '1',
        EventID: eventId,
        SubmissionTitle: 'Introduction to Microservices',
        SubmissionAbstract: '# Introduction to Microservices\n\nA comprehensive look at building scalable microservice architectures.',
        SubmissionType: 'Talk',
        TechLevel: 'Intermediate',
        TargetAudience: 'Developers',
        Status: 'Accepted',
        __mj_CreatedAt: new Date('2024-02-01'),
        __mj_UpdatedAt: new Date('2024-02-15')
      },
      {
        ID: '2',
        EventID: eventId,
        SubmissionTitle: 'AI in Healthcare',
        SubmissionAbstract: '# AI in Healthcare\n\nExploring the applications of artificial intelligence in medical diagnosis and treatment.',
        SubmissionType: 'Workshop',
        TechLevel: 'Advanced',
        TargetAudience: 'Researchers',
        Status: 'Under Review',
        __mj_CreatedAt: new Date('2024-02-05'),
        __mj_UpdatedAt: new Date('2024-02-20')
      }
    ] as any[];

    return of(mockSubmissions).pipe(
      delay(300),
      catchError(error => {
        console.error('Error loading submissions:', error);
        return throwError(() => new Error('Failed to load submissions'));
      })
    );
  }

  /**
   * Get speakers for an event
   */
  getEventSpeakers(eventId: string): Observable<SpeakerEntity[]> {
    // TODO: Implement actual MJ data service call
    const mockSpeakers = [
      {
        ID: '1',
        FirstName: 'Jane',
        LastName: 'Smith',
        Email: 'jane.smith@example.com',
        Company: 'Tech Corp',
        Title: 'Senior Software Engineer',
        Bio: 'Experienced software engineer with expertise in cloud architecture and microservices.',
        LinkedIn: 'https://linkedin.com/in/janesmith',
        Twitter: '@janesmith',
        __mj_CreatedAt: new Date('2024-01-10'),
        __mj_UpdatedAt: new Date('2024-01-10')
      },
      {
        ID: '2',
        FirstName: 'John',
        LastName: 'Doe',
        Email: 'john.doe@example.com',
        Company: 'Data Inc',
        Title: 'Data Science Lead',
        Bio: 'Data scientist specializing in machine learning and healthcare applications.',
        LinkedIn: 'https://linkedin.com/in/johndoe',
        Twitter: '@johndoe',
        __mj_CreatedAt: new Date('2024-01-12'),
        __mj_UpdatedAt: new Date('2024-01-12')
      }
    ] as any[];

    return of(mockSpeakers).pipe(
      delay(300),
      catchError(error => {
        console.error('Error loading speakers:', error);
        return throwError(() => new Error('Failed to load speakers'));
      })
    );
  }

  /**
   * Create a new event
   */
  createEvent(event: Partial<EventEntity>): Observable<EventEntity> {
    // TODO: Implement actual MJ data service call
    const newEvent = {
      ...event,
      ID: Date.now().toString(),
      __mj_CreatedAt: new Date(),
      __mj_UpdatedAt: new Date()
    } as any;

    return of(newEvent).pipe(
      delay(500),
      catchError(error => {
        console.error('Error creating event:', error);
        return throwError(() => new Error('Failed to create event'));
      })
    );
  }

  /**
   * Update an existing event
   */
  updateEvent(id: string, event: Partial<EventEntity>): Observable<any> {
    // TODO: Implement actual MJ data service call
    return this.getEventById(id).pipe(
      map(existingEvent => {
        if (!existingEvent) {
          throw new Error('Event not found');
        }
        return {
          ...existingEvent,
          ...event,
          __mj_UpdatedAt: new Date()
        };
      }),
      delay(300),
      catchError(error => {
        console.error('Error updating event:', error);
        return throwError(() => new Error('Failed to update event'));
      })
    );
  }

  /**
   * Delete an event
   */
  deleteEvent(id: string): Observable<boolean> {
    // TODO: Implement actual MJ data service call
    return of(true).pipe(
      delay(300),
      catchError(error => {
        console.error('Error deleting event:', error);
        return throwError(() => new Error('Failed to delete event'));
      })
    );
  }

  /**
   * Get event statistics
   */
  getEventStatistics(eventId: string): Observable<any> {
    // TODO: Implement actual statistics calculation
    const mockStats = {
      totalSubmissions: 45,
      approvedSubmissions: 23,
      pendingReviews: 12,
      rejectedSubmissions: 8,
      totalSpeakers: 32,
      averageReviewTime: 3.5
    };

    return of(mockStats).pipe(
      delay(200),
      catchError(error => {
        console.error('Error loading statistics:', error);
        return throwError(() => new Error('Failed to load statistics'));
      })
    );
  }
}
