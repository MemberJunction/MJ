import { Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { map, delay, catchError } from 'rxjs/operators';
import { SubmissionEntity, SpeakerEntity, SubmissionSpeakerEntity } from 'mj_generatedentities';

export interface SubmissionWorkflow {
  currentStage: string;
  stages: WorkflowStage[];
  completedStages: string[];
  nextAction?: string;
}

export interface WorkflowStage {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'skipped';
  completedDate?: Date;
  assignedTo?: string;
  metadata?: any;
}

export interface AIEvaluation {
  score: number;
  confidence: number;
  feedback: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  evaluatedAt: Date;
}

export interface HumanReview {
  reviewerId: string;
  reviewerName: string;
  rating: number;
  comments: string;
  recommendation: 'approve' | 'reject' | 'request-changes';
  reviewedAt: Date;
}

/**
 * Submission Service for managing abstract submissions and workflow
 */
@Injectable({
  providedIn: 'root'
})
export class SubmissionService {
  
  constructor() {}

  /**
   * Get all submissions
   */
  getSubmissions(): Observable<SubmissionEntity[]> {
    // TODO: Implement actual MJ data service call
    const mockSubmissions = [
      {
        ID: '1',
        EventID: '1',
        SubmissionTitle: 'Introduction to Microservices',
        SubmissionAbstract: '# Introduction to Microservices\n\nA comprehensive look at building scalable microservice architectures using modern cloud technologies.',
        SubmissionType: 'Talk',
        TechLevel: 'Intermediate',
        TargetAudience: 'Developers',
        Status: 'Accepted',
        __mj_CreatedAt: new Date('2024-02-01'),
        __mj_UpdatedAt: new Date('2024-02-15')
      },
      {
        ID: '2',
        EventID: '1',
        SubmissionTitle: 'AI in Healthcare',
        SubmissionAbstract: '# AI in Healthcare\n\nExploring the revolutionary applications of artificial intelligence in medical diagnosis and treatment planning.',
        SubmissionType: 'Workshop',
        TechLevel: 'Advanced',
        TargetAudience: 'Researchers',
        Status: 'Under Review',
        __mj_CreatedAt: new Date('2024-02-05'),
        __mj_UpdatedAt: new Date('2024-02-20')
      },
      {
        ID: '3',
        EventID: '1',
        SubmissionTitle: 'DevOps Best Practices',
        SubmissionAbstract: '# DevOps Best Practices\n\nModern approaches to continuous integration, deployment, and infrastructure as code.',
        SubmissionType: 'Tutorial',
        TechLevel: 'Intermediate',
        TargetAudience: 'Developers',
        Status: 'New',
        __mj_CreatedAt: new Date('2024-02-10'),
        __mj_UpdatedAt: new Date('2024-02-10')
      }
    ] as any[];

    return of(mockSubmissions).pipe(
      delay(500),
      catchError(error => {
        console.error('Error loading submissions:', error);
        return throwError(() => new Error('Failed to load submissions'));
      })
    );
  }

  /**
   * Get submission by ID
   */
  getSubmissionById(id: string): Observable<SubmissionEntity | null> {
    return this.getSubmissions().pipe(
      map(submissions => submissions.find(sub => sub.ID === id) || null)
    );
  }

  /**
   * Get submissions for an event
   */
  getSubmissionsByEvent(eventId: string): Observable<SubmissionEntity[]> {
    return this.getSubmissions().pipe(
      map(submissions => submissions.filter(sub => sub.EventID === eventId))
    );
  }

  /**
   * Get speakers for a submission
   */
  getSubmissionSpeakers(submissionId: string): Observable<SpeakerEntity[]> {
    // TODO: Implement actual MJ data service call
    const mockSpeakers: SpeakerEntity[] = [
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
        CreatedDate: new Date('2024-01-10'),
        LastUpdatedDate: new Date('2024-01-10')
      }
    ] as any[];

    return of(mockSpeakers).pipe(
      delay(300),
      catchError(error => {
        console.error('Error loading submission speakers:', error);
        return throwError(() => new Error('Failed to load submission speakers'));
      })
    );
  }

  /**
   * Get submission workflow
   */
  getSubmissionWorkflow(submissionId: string): Observable<SubmissionWorkflow> {
    // TODO: Implement actual workflow data from MJ
    const mockWorkflow: SubmissionWorkflow = {
      currentStage: 'human-review',
      stages: [
        {
          id: 'draft',
          name: 'Draft',
          description: 'Author is preparing the abstract',
          status: 'completed',
          completedDate: new Date('2024-02-01')
        },
        {
          id: 'submission',
          name: 'Submission',
          description: 'Abstract submitted to conference',
          status: 'completed',
          completedDate: new Date('2024-02-05')
        },
        {
          id: 'ai-evaluation',
          name: 'AI Evaluation',
          description: 'Automated scoring and feedback',
          status: 'completed',
          completedDate: new Date('2024-02-06'),
          metadata: {
            score: 8.5,
            confidence: 0.92
          }
        },
        {
          id: 'human-review',
          name: 'Human Review',
          description: 'Expert review by committee members',
          status: 'in-progress',
          assignedTo: 'Dr. John Smith'
        },
        {
          id: 'decision',
          name: 'Final Decision',
          description: 'Approve, reject, or waitlist decision',
          status: 'pending'
        },
        {
          id: 'speaker-confirmation',
          name: 'Speaker Confirmation',
          description: 'Speaker accepts or declines invitation',
          status: 'pending'
        }
      ],
      completedStages: ['draft', 'submission', 'ai-evaluation'],
      nextAction: 'Complete human review'
    };

    return of(mockWorkflow).pipe(
      delay(300),
      catchError(error => {
        console.error('Error loading workflow:', error);
        return throwError(() => new Error('Failed to load workflow'));
      })
    );
  }

  /**
   * Get AI evaluation for a submission
   */
  getAIEvaluation(submissionId: string): Observable<AIEvaluation> {
    const mockEvaluation: AIEvaluation = {
      score: 8.5,
      confidence: 0.92,
      feedback: 'Strong technical content with clear practical applications. Well-structured abstract with good coverage of modern microservice patterns.',
      strengths: [
        'Clear technical depth',
        'Practical focus',
        'Good structure',
        'Relevant to current industry trends'
      ],
      weaknesses: [
        'Could benefit from more specific case studies',
        'Limited discussion of challenges'
      ],
      recommendations: [
        'Add specific examples of microservice implementations',
        'Include discussion of common pitfalls and solutions',
        'Consider adding performance metrics'
      ],
      evaluatedAt: new Date('2024-02-06')
    };

    return of(mockEvaluation).pipe(
      delay(200),
      catchError(error => {
        console.error('Error loading AI evaluation:', error);
        return throwError(() => new Error('Failed to load AI evaluation'));
      })
    );
  }

  /**
   * Get human reviews for a submission
   */
  getHumanReviews(submissionId: string): Observable<HumanReview[]> {
    const mockReviews: HumanReview[] = [
      {
        reviewerId: '1',
        reviewerName: 'Dr. John Smith',
        rating: 8,
        comments: 'Well-written abstract with strong technical content. The author clearly has expertise in the subject matter.',
        recommendation: 'approve',
        reviewedAt: new Date('2024-02-15')
      },
      {
        reviewerId: '2',
        reviewerName: 'Prof. Jane Doe',
        rating: 7,
        comments: 'Good content but could benefit from more specific examples. The scope seems appropriate for the conference.',
        recommendation: 'approve',
        reviewedAt: new Date('2024-02-16')
      }
    ];

    return of(mockReviews).pipe(
      delay(300),
      catchError(error => {
        console.error('Error loading human reviews:', error);
        return throwError(() => new Error('Failed to load human reviews'));
      })
    );
  }

  /**
   * Create a new submission
   */
  createSubmission(submission: Partial<SubmissionEntity>): Observable<SubmissionEntity> {
    const newSubmission = {
      ...submission,
      ID: Date.now().toString(),
      Status: 'New',
      __mj_CreatedAt: new Date(),
      __mj_UpdatedAt: new Date()
    } as any;

    return of(newSubmission).pipe(
      delay(500),
      catchError(error => {
        console.error('Error creating submission:', error);
        return throwError(() => new Error('Failed to create submission'));
      })
    );
  }

  /**
   * Update a submission
   */
  updateSubmission(id: string, submission: Partial<SubmissionEntity>): Observable<any> {
    return this.getSubmissionById(id).pipe(
      map(existingSubmission => {
        if (!existingSubmission) {
          throw new Error('Submission not found');
        }
        return {
          ...existingSubmission,
          ...submission,
          __mj_UpdatedAt: new Date()
        };
      }),
      delay(300),
      catchError(error => {
        console.error('Error updating submission:', error);
        return throwError(() => new Error('Failed to update submission'));
      })
    );
  }

  /**
   * Submit a submission for review
   */
  submitForReview(id: string): Observable<SubmissionEntity> {
    return this.updateSubmission(id, { Status: 'Resubmitted' });
  }

  /**
   * Approve a submission
   */
  approveSubmission(id: string): Observable<SubmissionEntity> {
    return this.updateSubmission(id, { Status: 'Accepted' });
  }

  /**
   * Reject a submission
   */
  rejectSubmission(id: string): Observable<SubmissionEntity> {
    return this.updateSubmission(id, { Status: 'Rejected' });
  }

  /**
   * Get submission statistics
   */
  getSubmissionStatistics(eventId?: string): Observable<any> {
    const mockStats = {
      totalSubmissions: 45,
      byStatus: {
        'Draft': 5,
        'Submitted': 12,
        'Under Review': 8,
        'Approved': 15,
        'Rejected': 3,
        'Waitlisted': 2
      },
      byType: {
        'Talk': 25,
        'Workshop': 10,
        'Tutorial': 6,
        'Panel': 4
      },
      averageReviewTime: 3.5,
      approvalRate: 0.67
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
