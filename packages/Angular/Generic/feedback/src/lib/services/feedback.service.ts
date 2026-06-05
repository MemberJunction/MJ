import { Injectable, Inject } from '@angular/core';
import { Observable, from, BehaviorSubject, throwError } from 'rxjs';
import { catchError, tap, map } from 'rxjs/operators';
import { GraphQLDataProvider, gql } from '@memberjunction/graphql-dataprovider';
import { IMetadataProvider, Metadata } from '@memberjunction/core';
import { FeedbackSubmission, FeedbackResponse, FeedbackEnvironment, FeedbackCategory, FeedbackSeverity } from '../feedback.types';
import { FeedbackConfig, FEEDBACK_CONFIG } from '../feedback.config';

/**
 * GraphQL mutation for classifying feedback via LLM
 */
const CLASSIFY_FEEDBACK_MUTATION = gql`
  mutation ClassifyFeedback($input: ClassifyFeedbackInput!) {
    ClassifyFeedback(input: $input) {
      Success
      Category
      Severity
      Error
    }
  }
`;

/**
 * GraphQL query for checking if feedback is enabled
 */
const FEEDBACK_ENABLED_QUERY = gql`
  query FeedbackEnabled {
    FeedbackEnabled
  }
`;

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
      EmailWillBeSent
      EmailSentTo
      FallbackContact
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

  private _provider: IMetadataProvider | null = null;
  /** Multi-provider note: set this from a parent component via `service.Provider = component.ProviderToUse;` */
  public get Provider(): IMetadataProvider {
    return this._provider ?? Metadata.Provider;
  }
  public set Provider(value: IMetadataProvider | null) {
    this._provider = value;
  }

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
   * Check if feedback is enabled for this organization.
   */
  public async IsEnabled(): Promise<boolean> {
    try {
      const provider = this.Provider as GraphQLDataProvider;
      const result = await provider.ExecuteGQL(FEEDBACK_ENABLED_QUERY, {}) as { FeedbackEnabled: boolean };
      return result?.FeedbackEnabled ?? true;
    } catch {
      return true; // Default to enabled if check fails
    }
  }

  /**
   * Classify feedback using an LLM to suggest category and severity.
   * Returns null if classification fails — callers should fall back to manual selection.
   */
  public async Classify(title: string, description: string): Promise<{ category: FeedbackCategory; severity: FeedbackSeverity } | null> {
    try {
      const provider = this.Provider as GraphQLDataProvider;
      const result = await provider.ExecuteGQL(CLASSIFY_FEEDBACK_MUTATION, {
        input: { Title: title, Description: description }
      }) as ClassifyFeedbackResult;

      if (result?.ClassifyFeedback?.Success && result.ClassifyFeedback.Category && result.ClassifyFeedback.Severity) {
        return {
          category: result.ClassifyFeedback.Category as FeedbackCategory,
          severity: result.ClassifyFeedback.Severity as FeedbackSeverity
        };
      }
      return null;
    } catch {
      return null;
    }
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
    const provider = this.Provider as GraphQLDataProvider;
    const result = await provider.ExecuteGQL(SUBMIT_FEEDBACK_MUTATION, variables);
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
      error: data.Error,
      emailWillBeSent: data.EmailWillBeSent,
      emailSentTo: data.EmailSentTo,
      fallbackContact: data.FallbackContact,
    };
  }

  /**
   * Enrich submission with auto-captured environment data and authenticated user info
   */
  private enrichSubmission(data: FeedbackSubmission): FeedbackSubmission {
    const md = this.Provider;
    const currentUser = md.CurrentUser;

    return {
      ...data,
      // Auto-populate from authenticated user (can be overridden by explicit values)
      userId: data.userId || currentUser?.ID,
      name: data.name || currentUser?.Name,
      email: data.email || currentUser?.Email,
      // Auto-capture environment data
      environment: data.environment || this.detectEnvironment(),
      userAgent: data.userAgent || navigator.userAgent,
      screenSize: data.screenSize || `${window.innerWidth}x${window.innerHeight}`,
      appName: data.appName || this.config.appName,
      appVersion: data.appVersion || this.config.appVersion,
      timestamp: data.timestamp || new Date().toISOString()
    };
  }

  /**
   * Detect environment from the current URL hostname
   */
  private detectEnvironment(): FeedbackEnvironment {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'local';
    }
    if (hostname.includes('staging') || hostname.includes('stage')) {
      return 'staging';
    }
    if (hostname.includes('dev')) {
      return 'development';
    }
    return 'production';
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
    EmailWillBeSent?: boolean;
    EmailSentTo?: string;
    FallbackContact?: string;
  };
}

/**
 * GraphQL result type for classification
 */
interface ClassifyFeedbackResult {
  ClassifyFeedback: {
    Success: boolean;
    Category?: string;
    Severity?: string;
    Error?: string;
  };
}
