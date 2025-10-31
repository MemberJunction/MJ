import { Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { map, delay, catchError } from 'rxjs/operators';
import { SpeakerEntity, SubmissionEntity } from 'mj_generatedentities';

export interface SpeakerProfile {
  speaker: SpeakerEntity;
  submissions: SubmissionEntity[];
  expertiseAreas: string[];
  speakingHistory: SpeakingHistory[];
  availability: AvailabilityInfo;
}

export interface SpeakingHistory {
  eventId: string;
  eventName: string;
  submissionTitle: string;
  submissionType: string;
  date: Date;
  rating?: number;
  feedback?: string;
}

export interface AvailabilityInfo {
  available: boolean;
  preferredDates?: Date[];
  constraints?: string[];
  travelRequirements?: string[];
}

/**
 * Speaker Service for managing speaker profiles and related data
 */
@Injectable({
  providedIn: 'root'
})
export class SpeakerService {
  
  constructor() {}

  /**
   * Get all speakers
   */
  getSpeakers(): Observable<SpeakerEntity[]> {
    // TODO: Implement actual MJ data service call
    const mockSpeakers = [
      {
        ID: '1',
        FirstName: 'Jane',
        LastName: 'Smith',
        Email: 'jane.smith@example.com',
        Phone: '+1-555-0123',
        Company: 'Tech Corp',
        Title: 'Senior Software Engineer',
        Bio: '# Jane Smith\n\nExperienced software engineer with 10+ years in cloud architecture and microservices. Passionate about building scalable systems and mentoring junior developers.\n\n## Expertise\n- Cloud Architecture\n- Microservices\n- DevOps\n- System Design\n- Technical Leadership',
        LinkedIn: 'https://linkedin.com/in/janesmith',
        Twitter: '@janesmith',
        Website: 'https://janesmith.dev',
        Expertise: 'Cloud Architecture,Microservices,DevOps,System Design',
        __mj_CreatedAt: new Date('2024-01-10'),
        __mj_UpdatedAt: new Date('2024-01-10')
      },
      {
        ID: '2',
        FirstName: 'John',
        LastName: 'Doe',
        Email: 'john.doe@example.com',
        Phone: '+1-555-0124',
        Company: 'Data Inc',
        Title: 'Data Science Lead',
        Bio: '# John Doe\n\nData scientist specializing in machine learning and healthcare applications. Published researcher with expertise in deep learning and medical imaging.\n\n## Expertise\n- Machine Learning\n- Data Science\n- Healthcare AI\n- Research\n- Python',
        LinkedIn: 'https://linkedin.com/in/johndoe',
        Twitter: '@johndoe',
        Website: 'https://johndoe.ai',
        Expertise: 'Machine Learning,Data Science,Healthcare AI,Research',
        __mj_CreatedAt: new Date('2024-01-12'),
        __mj_UpdatedAt: new Date('2024-01-12')
      },
      {
        ID: '3',
        FirstName: 'Sarah',
        LastName: 'Johnson',
        Email: 'sarah.johnson@example.com',
        Phone: '+1-555-0125',
        Company: 'UX Studio',
        Title: 'UX Design Director',
        Bio: '# Sarah Johnson\n\nAward-winning UX designer with expertise in user research, interface design, and design systems. Advocate for inclusive design and accessibility.\n\n## Expertise\n- UX Design\n- User Research\n- Design Systems\n- Accessibility\n- Product Design',
        LinkedIn: 'https://linkedin.com/in/sarahjohnson',
        Twitter: '@sarahjohnson',
        Website: 'https://sarahjohnson.design',
        Expertise: 'UX Design,User Research,Design Systems,Accessibility',
        __mj_CreatedAt: new Date('2024-01-15'),
        __mj_UpdatedAt: new Date('2024-01-15')
      }
    ] as any[];

    return of(mockSpeakers).pipe(
      delay(500),
      catchError(error => {
        console.error('Error loading speakers:', error);
        return throwError(() => new Error('Failed to load speakers'));
      })
    );
  }

  /**
   * Get speaker by ID
   */
  getSpeakerById(id: string): Observable<SpeakerEntity | null> {
    return this.getSpeakers().pipe(
      map(speakers => speakers.find(speaker => speaker.ID === id) || null)
    );
  }

  /**
   * Get complete speaker profile
   */
  getSpeakerProfile(id: string): Observable<SpeakerProfile | null> {
    return this.getSpeakerById(id).pipe(
      map(speaker => {
        if (!speaker) return null;

        return {
          speaker,
          submissions: [], // TODO: Load actual submissions
          expertiseAreas: speaker.Expertise ? speaker.Expertise.split(',').map(e => e.trim()) : [],
          speakingHistory: [], // TODO: Load actual speaking history
          availability: {
            available: true,
            constraints: ['No travel on weekends', 'Requires 2 weeks notice']
          }
        };
      }),
      delay(300),
      catchError(error => {
        console.error('Error loading speaker profile:', error);
        return throwError(() => new Error('Failed to load speaker profile'));
      })
    );
  }

  /**
   * Get speakers for an event
   */
  getEventSpeakers(eventId: string): Observable<SpeakerEntity[]> {
    // TODO: Implement actual MJ data service call
    return this.getSpeakers().pipe(
      delay(300),
      catchError(error => {
        console.error('Error loading event speakers:', error);
        return throwError(() => new Error('Failed to load event speakers'));
      })
    );
  }

  /**
   * Get submissions for a speaker
   */
  getSpeakerSubmissions(speakerId: string): Observable<SubmissionEntity[]> {
    // TODO: Implement actual MJ data service call
    const mockSubmissions = [
      {
        ID: '1',
        EventID: '1',
        SubmissionTitle: 'Introduction to Microservices',
        SubmissionAbstract: '# Introduction to Microservices\n\nA comprehensive look at building scalable microservice architectures.',
        SubmissionType: 'Talk',
        TechLevel: 'Intermediate',
        TargetAudience: 'Developers',
        Status: 'Accepted',
        __mj_CreatedAt: new Date('2024-02-01'),
        __mj_UpdatedAt: new Date('2024-02-15')
      }
    ] as any[];

    return of(mockSubmissions).pipe(
      delay(300),
      catchError(error => {
        console.error('Error loading speaker submissions:', error);
        return throwError(() => new Error('Failed to load speaker submissions'));
      })
    );
  }

  /**
   * Search speakers by query
   */
  searchSpeakers(query: string): Observable<SpeakerEntity[]> {
    if (!query || query.trim() === '') {
      return this.getSpeakers();
    }

    const lowerQuery = query.toLowerCase();
    
    return this.getSpeakers().pipe(
      map(speakers => speakers.filter(speaker => {
        // Use type assertion to access properties
        const speakerAny = speaker as any;
        return speakerAny.FirstName?.toLowerCase().includes(lowerQuery) ||
               speakerAny.LastName?.toLowerCase().includes(lowerQuery) ||
               speakerAny.Company?.toLowerCase().includes(lowerQuery) ||
               speakerAny.Email?.toLowerCase().includes(lowerQuery);
      }))
    );
  }

  /**
   * Get speakers by expertise area
   */
  getSpeakersByExpertise(expertise: string): Observable<SpeakerEntity[]> {
    return this.getSpeakers().pipe(
      map(speakers => 
        speakers.filter(speaker => 
          speaker.Expertise?.toLowerCase().includes(expertise.toLowerCase())
        )
      ),
      delay(300),
      catchError(error => {
        console.error('Error loading speakers by expertise:', error);
        return throwError(() => new Error('Failed to load speakers by expertise'));
      })
    );
  }

  /**
   * Create a new speaker
   */
  createSpeaker(speaker: Partial<SpeakerEntity>): Observable<SpeakerEntity> {
    const newSpeaker = {
      ...speaker,
      ID: Date.now().toString(),
      __mj_CreatedAt: new Date(),
      __mj_UpdatedAt: new Date()
    } as any;

    return of(newSpeaker).pipe(
      delay(500),
      catchError(error => {
        console.error('Error creating speaker:', error);
        return throwError(() => new Error('Failed to create speaker'));
      })
    );
  }

  /**
   * Update a speaker
   */
  updateSpeaker(id: string, speaker: Partial<SpeakerEntity>): Observable<any> {
    return this.getSpeakerById(id).pipe(
      map(existingSpeaker => {
        if (!existingSpeaker) {
          throw new Error('Speaker not found');
        }
        return {
          ...existingSpeaker,
          ...speaker,
          __mj_UpdatedAt: new Date()
        };
      }),
      delay(300),
      catchError(error => {
        console.error('Error updating speaker:', error);
        return throwError(() => new Error('Failed to update speaker'));
      })
    );
  }

  /**
   * Delete a speaker
   */
  deleteSpeaker(id: string): Observable<boolean> {
    // TODO: Implement actual MJ data service call
    return of(true).pipe(
      delay(300),
      catchError(error => {
        console.error('Error deleting speaker:', error);
        return throwError(() => new Error('Failed to delete speaker'));
      })
    );
  }

  /**
   * Validate speaker email
   */
  validateEmail(email: string): Observable<boolean> {
    // TODO: Implement actual email validation against MJ
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isValid = emailRegex.test(email);
    
    return of(isValid).pipe(
      delay(100),
      catchError(error => {
        console.error('Error validating email:', error);
        return throwError(() => new Error('Failed to validate email'));
      })
    );
  }

  /**
   * Get speaker statistics
   */
  getSpeakerStatistics(): Observable<any> {
    const mockStats = {
      totalSpeakers: 156,
      newSpeakersThisMonth: 12,
      topExpertiseAreas: [
        { area: 'Software Development', count: 45 },
        { area: 'Data Science', count: 32 },
        { area: 'UX Design', count: 28 },
        { area: 'DevOps', count: 24 },
        { area: 'Machine Learning', count: 18 }
      ],
      geographicDistribution: [
        { region: 'North America', count: 89 },
        { region: 'Europe', count: 34 },
        { region: 'Asia', count: 23 },
        { region: 'Other', count: 10 }
      ]
    };

    return of(mockStats).pipe(
      delay(200),
      catchError(error => {
        console.error('Error loading speaker statistics:', error);
        return throwError(() => new Error('Failed to load speaker statistics'));
      })
    );
  }

  /**
   * Get speaker availability for an event
   */
  getSpeakerAvailability(speakerId: string, eventId: string): Observable<AvailabilityInfo> {
    const mockAvailability: AvailabilityInfo = {
      available: true,
      preferredDates: [
        new Date('2024-06-15'),
        new Date('2024-06-16'),
        new Date('2024-06-17')
      ],
      constraints: [
        'No travel on weekends',
        'Requires 2 weeks notice for travel arrangements',
        'Prefers morning sessions'
      ],
      travelRequirements: [
        'Flight reimbursement',
        'Hotel accommodation',
        'Ground transportation'
      ]
    };

    return of(mockAvailability).pipe(
      delay(300),
      catchError(error => {
        console.error('Error loading speaker availability:', error);
        return throwError(() => new Error('Failed to load speaker availability'));
      })
    );
  }
}
