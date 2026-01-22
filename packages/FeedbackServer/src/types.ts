import { Request } from 'express';

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
  url?: string;
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
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  /** Time window in milliseconds (default: 1 hour) */
  windowMs: number;
  /** Maximum requests per IP per window (default: 10) */
  maxRequests: number;
}

/**
 * Configuration for the feedback handler
 */
export interface FeedbackHandlerConfig {
  /** GitHub repository owner (org or username) */
  owner: string;
  /** GitHub repository name */
  repo: string;
  /** GitHub Personal Access Token with issues:write permission */
  token: string;

  /** Labels applied to all issues */
  defaultLabels?: string[];
  /** Map category values to GitHub labels */
  categoryLabels?: Record<string, string>;
  /** Map severity values to GitHub labels */
  severityLabels?: Record<string, string>;

  /** GitHub usernames to auto-assign */
  assignees?: string[];

  /** Rate limiting configuration */
  rateLimit?: RateLimitConfig;

  /**
   * Hook called before creating the issue.
   * Return null to reject the submission, or return modified data.
   */
  beforeCreate?: (
    data: FeedbackSubmission,
    req: Request
  ) => Promise<FeedbackSubmission | null>;

  /**
   * Hook called after issue is created successfully.
   */
  afterCreate?: (
    issue: GitHubIssue,
    data: FeedbackSubmission
  ) => Promise<void>;
}

/**
 * Simplified GitHub issue data returned after creation
 */
export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  html_url: string;
  state: string;
  labels: Array<{ name: string }>;
  assignees: Array<{ login: string }>;
  created_at: string;
}

/**
 * Category configuration for the form
 */
export interface CategoryConfig {
  value: string;
  label: string;
  githubLabel: string;
  description?: string;
}

/**
 * Severity level configuration
 */
export interface SeverityConfig {
  value: FeedbackSeverity;
  label: string;
  githubLabel: string;
  description?: string;
}
