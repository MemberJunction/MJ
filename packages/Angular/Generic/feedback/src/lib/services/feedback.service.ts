import { Injectable, Inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, BehaviorSubject } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { FeedbackSubmission, FeedbackResponse } from '../feedback.types';
import { FeedbackConfig, FEEDBACK_CONFIG } from '../feedback.config';

/**
 * Service for submitting feedback to the server
 */
@Injectable({
  providedIn: 'root'
})
export class FeedbackService {
  /** Observable for tracking submission state */
  private _isSubmitting$ = new BehaviorSubject<boolean>(false);
  public IsSubmitting$ = this._isSubmitting$.asObservable();

  constructor(
    @Inject(FEEDBACK_CONFIG) private config: FeedbackConfig,
    private http: HttpClient
  ) {}

  /**
   * Get the current configuration
   */
  public GetConfig(): FeedbackConfig {
    return this.config;
  }

  /**
   * Submit feedback to the server
   * @param data - The feedback submission data
   * @returns Observable with the server response
   */
  public Submit(data: FeedbackSubmission): Observable<FeedbackResponse> {
    this._isSubmitting$.next(true);

    // Enrich with auto-captured data
    const enrichedData = this.enrichSubmission(data);

    return this.http.post<FeedbackResponse>(this.config.apiEndpoint, enrichedData).pipe(
      tap(() => {
        this._isSubmitting$.next(false);
      }),
      catchError((error: HttpErrorResponse) => {
        this._isSubmitting$.next(false);
        return this.handleError(error);
      })
    );
  }

  /**
   * Enrich submission with auto-captured environment data
   */
  private enrichSubmission(data: FeedbackSubmission): FeedbackSubmission {
    return {
      ...data,
      url: data.url || window.location.href,
      userAgent: data.userAgent || navigator.userAgent,
      screenSize: data.screenSize || `${window.innerWidth}x${window.innerHeight}`,
      appName: data.appName || this.config.appName,
      appVersion: data.appVersion || this.config.appVersion,
      timestamp: data.timestamp || new Date().toISOString()
    };
  }

  /**
   * Handle HTTP errors
   */
  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'An error occurred while submitting feedback.';

    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorMessage = `Network error: ${error.error.message}`;
    } else if (error.status === 429) {
      // Rate limited
      errorMessage = 'Too many requests. Please try again later.';
    } else if (error.status === 400) {
      // Validation error
      errorMessage = error.error?.error || 'Invalid submission data.';
    } else if (error.status >= 500) {
      // Server error
      errorMessage = 'Server error. Please try again later.';
    }

    return throwError(() => new Error(errorMessage));
  }
}
