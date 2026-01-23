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
 * Response returned after feedback submission
 */
export interface FeedbackResponse {
  success: boolean;
  issueNumber?: number;
  issueUrl?: string;
  error?: string;
  details?: unknown;
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
