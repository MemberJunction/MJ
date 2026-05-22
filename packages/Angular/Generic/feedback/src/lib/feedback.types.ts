/**
 * Feedback category types
 */
export type FeedbackCategory = 'bug' | 'feature' | 'question' | 'other';

/**
 * Severity levels for bug reports
 */
export type FeedbackSeverity = 'critical' | 'major' | 'minor' | 'trivial';

/**
 * Environment types
 */
export type FeedbackEnvironment = 'production' | 'staging' | 'development' | 'local';

/**
 * Data submitted from the feedback form
 */
export interface FeedbackSubmission {
  // Required fields
  title: string;
  description: string;
  category: FeedbackCategory | string;

  // Bug-specific fields
  stepsToReproduce?: string;
  expectedBehavior?: string;
  actualBehavior?: string;
  severity?: FeedbackSeverity;

  // Feature-specific fields
  useCase?: string;
  proposedSolution?: string;

  // Optional contact info
  email?: string;
  name?: string;

  // Environment info
  environment?: FeedbackEnvironment;
  affectedArea?: string;

  // Auto-captured fields
  /** Current page/view name (for apps with tab-based navigation where URL doesn't change) */
  currentPage?: string;
  userAgent?: string;
  screenSize?: string;
  appName?: string;
  appVersion?: string;
  userId?: string;
  timestamp?: string;

  // Custom metadata
  metadata?: Record<string, unknown>;
}

/**
 * Response returned after feedback submission. The `email*` and
 * `fallbackContact` fields let the success dialog adapt its messaging:
 *   - If `emailWillBeSent`, show "you'll get an email at {emailSentTo}".
 *   - Otherwise, optionally show `fallbackContact` as a follow-up channel.
 */
export interface FeedbackResponse {
  success: boolean;
  issueNumber?: number;
  issueUrl?: string;
  error?: string;
  details?: unknown;
  /**
   * True when the server has queued a confirmation email to the submitter.
   * Drives the "we'll email you" message in the success dialog.
   */
  emailWillBeSent?: boolean;
  /**
   * The email address the confirmation was queued to (echoed back from
   * the server so the dialog can display it).
   */
  emailSentTo?: string;
  /**
   * Optional support/contact handle surfaced in the success dialog when no
   * email notification will be sent. Comes from feedbackSettings.fallbackContact
   * on the server. Null/undefined when no fallback is configured.
   */
  fallbackContact?: string;
}

/**
 * Category configuration for the form dropdown
 */
export interface CategoryOption {
  value: string;
  label: string;
  description?: string;
}

/**
 * Severity option for the form dropdown
 */
export interface SeverityOption {
  value: FeedbackSeverity;
  label: string;
  description?: string;
}

/**
 * Environment option for the form dropdown
 */
export interface EnvironmentOption {
  value: FeedbackEnvironment;
  label: string;
}
