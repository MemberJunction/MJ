import { Injectable, Inject } from '@angular/core';
import { Observable, from, BehaviorSubject, throwError } from 'rxjs';
import { catchError, tap, map } from 'rxjs/operators';
import { GraphQLDataProvider, gql } from '@memberjunction/graphql-dataprovider';
import { Metadata } from '@memberjunction/core';
import { FeedbackSubmission, FeedbackResponse } from '../feedback.types';
import { FeedbackConfig, FEEDBACK_CONFIG } from '../feedback.config';

/**
 * GraphQL mutation for submitting feedback
 */
const SUBMIT_FEEDBACK_MUTATION = gql`
  mutation SubmitFeedback($input: SubmitFeedbackInput!) {
    SubmitFeedback(input: $input) {
      Success
      IssueNumber
      IssueUrl
      Error
    }
  }
`;

/**
 * Service for submitting feedback via GraphQL
 */
@Injectable({
  providedIn: 'root'
})
export class FeedbackService {
  /** Observable for tracking submission state */
  private _isSubmitting$ = new BehaviorSubject<boolean>(false);
  public IsSubmitting$ = this._isSubmitting$.asObservable();

  constructor(
    @Inject(FEEDBACK_CONFIG) private config: FeedbackConfig
  ) {}

  /**
   * Get the current configuration
   */
  public GetConfig(): FeedbackConfig {
    return this.config;
  }

  /**
   * Submit feedback via GraphQL mutation
   * @param data - The feedback submission data
   * @returns Observable with the server response
   */
  public Submit(data: FeedbackSubmission): Observable<FeedbackResponse> {
    this._isSubmitting$.next(true);

    // Enrich with auto-captured data
    const enrichedData = this.enrichSubmission(data);

    // Convert to GraphQL input format (PascalCase)
    const input = this.convertToGraphQLInput(enrichedData);

    // Execute GraphQL mutation
    const promise = this.executeGraphQLMutation(input);

    return from(promise).pipe(
      map((result: SubmitFeedbackResult) => this.processResult(result)),
      tap(() => {
        this._isSubmitting$.next(false);
      }),
      catchError((error: Error) => {
        this._isSubmitting$.next(false);
        return this.handleError(error);
      })
    );
  }

  /**
   * Execute the GraphQL mutation
   */
  private async executeGraphQLMutation(input: GraphQLFeedbackInput): Promise<SubmitFeedbackResult> {
    const variables = { input };
    const result = await GraphQLDataProvider.ExecuteGQL(SUBMIT_FEEDBACK_MUTATION, variables);
    return result as SubmitFeedbackResult;
  }

  /**
   * Process the GraphQL result into a FeedbackResponse
   */
  private processResult(result: SubmitFeedbackResult): FeedbackResponse {
    if (!result?.SubmitFeedback) {
      return {
        success: false,
        error: 'Invalid response from server'
      };
    }

    const data = result.SubmitFeedback;
    return {
      success: data.Success,
      issueNumber: data.IssueNumber,
      issueUrl: data.IssueUrl,
      error: data.Error
    };
  }

  /**
   * Enrich submission with auto-captured environment data and authenticated user info
   */
  private enrichSubmission(data: FeedbackSubmission): FeedbackSubmission {
    const md = new Metadata();
    const currentUser = md.CurrentUser;

    return {
      ...data,
      // Auto-populate from authenticated user (can be overridden by explicit values)
      userId: data.userId || currentUser?.ID,
      name: data.name || currentUser?.Name,
      email: data.email || currentUser?.Email,
      // Auto-capture environment data
      userAgent: data.userAgent || navigator.userAgent,
      screenSize: data.screenSize || `${window.innerWidth}x${window.innerHeight}`,
      appName: data.appName || this.config.appName,
      appVersion: data.appVersion || this.config.appVersion,
      timestamp: data.timestamp || new Date().toISOString()
    };
  }

  /**
   * Convert camelCase submission to PascalCase GraphQL input
   */
  private convertToGraphQLInput(data: FeedbackSubmission): GraphQLFeedbackInput {
    return {
      Title: data.title,
      Description: data.description,
      Category: data.category,
      StepsToReproduce: data.stepsToReproduce,
      ExpectedBehavior: data.expectedBehavior,
      ActualBehavior: data.actualBehavior,
      Severity: data.severity,
      UseCase: data.useCase,
      ProposedSolution: data.proposedSolution,
      Email: data.email,
      Name: data.name,
      Environment: data.environment,
      AffectedArea: data.affectedArea,
      CurrentPage: data.currentPage,
      UserAgent: data.userAgent,
      ScreenSize: data.screenSize,
      AppName: data.appName,
      AppVersion: data.appVersion,
      UserId: data.userId,
      Timestamp: data.timestamp,
      Metadata: data.metadata ? JSON.stringify(data.metadata) : undefined
    };
  }

  /**
   * Handle errors
   */
  private handleError(error: Error): Observable<never> {
    let errorMessage = 'An error occurred while submitting feedback.';

    if (error.message) {
      // Check for specific error types
      if (error.message.includes('rate limit') || error.message.includes('Too many')) {
        errorMessage = 'Too many requests. Please try again later.';
      } else if (error.message.includes('Validation')) {
        errorMessage = error.message;
      } else if (error.message.includes('not configured')) {
        errorMessage = 'Feedback system is not configured. Please contact support.';
      } else {
        errorMessage = error.message;
      }
    }

    return throwError(() => new Error(errorMessage));
  }
}

/**
 * GraphQL input type (PascalCase to match server schema)
 */
interface GraphQLFeedbackInput {
  Title: string;
  Description: string;
  Category: string;
  StepsToReproduce?: string;
  ExpectedBehavior?: string;
  ActualBehavior?: string;
  Severity?: string;
  UseCase?: string;
  ProposedSolution?: string;
  Email?: string;
  Name?: string;
  Environment?: string;
  AffectedArea?: string;
  CurrentPage?: string;
  UserAgent?: string;
  ScreenSize?: string;
  AppName?: string;
  AppVersion?: string;
  UserId?: string;
  Timestamp?: string;
  Metadata?: string;
}

/**
 * GraphQL result type
 */
interface SubmitFeedbackResult {
  SubmitFeedback: {
    Success: boolean;
    IssueNumber?: number;
    IssueUrl?: string;
    Error?: string;
  };
}
