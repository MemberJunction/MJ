/**
 * @memberjunction/feedback-server
 *
 * Server-side utilities for handling feedback submissions and creating GitHub issues.
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { createFeedbackHandler } from '@memberjunction/feedback-server';
 *
 * const app = express();
 *
 * app.use('/api/feedback', createFeedbackHandler({
 *   owner: 'MemberJunction',
 *   repo: 'MJ',
 *   token: process.env.GITHUB_PAT!,
 *   defaultLabels: ['user-submitted', 'explorer'],
 *   categoryLabels: {
 *     bug: 'bug',
 *     feature: 'enhancement',
 *     question: 'question',
 *     other: 'triage'
 *   },
 *   severityLabels: {
 *     critical: 'priority: critical',
 *     major: 'priority: high',
 *     minor: 'priority: medium',
 *     trivial: 'priority: low'
 *   },
 *   rateLimit: {
 *     windowMs: 60 * 60 * 1000,  // 1 hour
 *     maxRequests: 10
 *   }
 * }));
 *
 * app.listen(3000);
 * ```
 *
 * @packageDocumentation
 */

// Main handler
export { createFeedbackHandler } from './handler.js';

// Types
export type {
  FeedbackSubmission,
  FeedbackResponse,
  FeedbackHandlerConfig,
  RateLimitConfig,
  GitHubIssue,
  FeedbackCategory,
  FeedbackSeverity,
  FeedbackEnvironment,
  CategoryConfig,
  SeverityConfig,
} from './types.js';

// Validation utilities
export {
  validateSubmission,
  FeedbackSubmissionSchema,
  sanitizeMarkdown,
  type ValidatedFeedbackSubmission,
  type ValidationResult,
} from './validation.js';

// Issue formatting
export { formatIssueBody } from './issue-formatter.js';

// Rate limiting
export {
  createRateLimiter,
  clearRateLimitStore,
  getRateLimitCount,
} from './rate-limiter.js';

// GitHub utilities
export { createGitHubIssue, verifyGitHubToken } from './github.js';
