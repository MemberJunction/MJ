import { InjectionToken } from '@angular/core';

/**
 * Configuration for which optional fields are shown in the form
 */
export interface FeedbackFieldConfig {
  /** Show steps to reproduce field for bugs (default: true) */
  showStepsToReproduce?: boolean;
  /** Show expected behavior field for bugs (default: true) */
  showExpectedBehavior?: boolean;
  /** Show actual behavior field for bugs (default: true) */
  showActualBehavior?: boolean;
  /** Show severity dropdown for bugs (default: true) */
  showSeverity?: boolean;

  /** Show use case field for feature requests (default: true) */
  showUseCase?: boolean;
  /** Show proposed solution field for feature requests (default: true) */
  showProposedSolution?: boolean;

  /** Show email field (default: true) */
  showEmail?: boolean;
  /** Show name field (default: true) */
  showName?: boolean;
  /** Show environment dropdown (default: false) */
  showEnvironment?: boolean;
  /** Show affected area dropdown (default: false) */
  showAffectedArea?: boolean;

  /** Custom affected areas for this app */
  affectedAreas?: string[];
}

/**
 * Main configuration for the feedback module
 */
export interface FeedbackConfig {
  /** API endpoint for feedback submission (required) */
  apiEndpoint: string;

  /** Application name shown in feedback details (required) */
  appName: string;

  /** Application version shown in feedback details */
  appVersion?: string;

  /** Dialog title (default: 'Submit Feedback') */
  title?: string;

  /** Dialog subtitle */
  subtitle?: string;

  /** Submit button text (default: 'Submit') */
  submitButtonText?: string;

  /** Success message (default: 'Thank you! Your feedback has been submitted.') */
  successMessage?: string;

  /** Show link to created issue (default: true) */
  showIssueLink?: boolean;

  /** Field visibility configuration */
  fields?: FeedbackFieldConfig;
}

/**
 * Injection token for feedback configuration
 */
export const FEEDBACK_CONFIG = new InjectionToken<FeedbackConfig>('FEEDBACK_CONFIG');

/**
 * Default field configuration
 */
export const DEFAULT_FIELD_CONFIG: Required<FeedbackFieldConfig> = {
  showStepsToReproduce: true,
  showExpectedBehavior: true,
  showActualBehavior: true,
  showSeverity: true,
  showUseCase: true,
  showProposedSolution: true,
  showEmail: true,
  showName: true,
  showEnvironment: false,
  showAffectedArea: false,
  affectedAreas: []
};

/**
 * Merge user config with defaults
 */
export function mergeFieldConfig(config?: FeedbackFieldConfig): Required<FeedbackFieldConfig> {
  return {
    ...DEFAULT_FIELD_CONFIG,
    ...config
  };
}
