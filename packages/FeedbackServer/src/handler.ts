import { Router, Request, Response, NextFunction, json } from 'express';
import { FeedbackHandlerConfig, FeedbackSubmission, FeedbackResponse } from './types.js';
import { validateSubmission } from './validation.js';
import { createRateLimiter } from './rate-limiter.js';
import { createGitHubIssue } from './github.js';

/**
 * Create an Express router for handling feedback submissions
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
 *   defaultLabels: ['user-submitted'],
 *   categoryLabels: {
 *     bug: 'bug',
 *     feature: 'enhancement',
 *     question: 'question',
 *     other: 'triage'
 *   }
 * }));
 * ```
 *
 * @param config - Configuration for the feedback handler
 * @returns Express Router instance
 */
export function createFeedbackHandler(config: FeedbackHandlerConfig): Router {
  const router = Router();

  // CORS middleware - allow cross-origin requests from any origin
  // This is needed when the Angular dev server runs on a different port
  router.use((req: Request, res: Response, next: NextFunction) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Max-Age', '86400'); // 24 hours

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    next();
  });

  // Apply JSON body parser with size limit
  router.use(json({ limit: '1mb' }));

  // Apply rate limiting if configured
  if (config.rateLimit) {
    router.use(createRateLimiter(config.rateLimit));
  }

  // Health check endpoint
  router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Main submission endpoint
  router.post('/', handleFeedbackSubmission(config));

  // Error handler
  router.use(errorHandler);

  return router;
}

/**
 * Create the main feedback submission handler
 */
function handleFeedbackSubmission(config: FeedbackHandlerConfig) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Validate input
      const validation = validateSubmission(req.body);

      if (!validation.success) {
        const response: FeedbackResponse = {
          success: false,
          error: 'Validation failed',
          details: validation.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        };
        res.status(400).json(response);
        return;
      }

      let submission: FeedbackSubmission = validation.data;

      // Add server-side timestamp if not provided
      if (!submission.timestamp) {
        submission = {
          ...submission,
          timestamp: new Date().toISOString(),
        };
      }

      // Call beforeCreate hook if provided
      if (config.beforeCreate) {
        const result = await config.beforeCreate(submission, req);

        if (result === null) {
          const response: FeedbackResponse = {
            success: false,
            error: 'Submission was rejected',
          };
          res.status(400).json(response);
          return;
        }

        submission = result;
      }

      // Create GitHub issue
      const issue = await createGitHubIssue(submission, config);

      // Call afterCreate hook if provided
      if (config.afterCreate) {
        try {
          await config.afterCreate(issue, submission);
        } catch (hookError) {
          // Log but don't fail the request - issue was already created
          console.error('afterCreate hook error:', hookError);
        }
      }

      // Return success response
      const response: FeedbackResponse = {
        success: true,
        issueNumber: issue.number,
        issueUrl: issue.html_url,
      };

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Error handling middleware
 */
function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('Feedback handler error:', err);

  // Check for GitHub API errors
  if (err.message.includes('Bad credentials')) {
    res.status(500).json({
      success: false,
      error: 'Server configuration error. Please contact support.',
    });
    return;
  }

  if (err.message.includes('Not Found')) {
    res.status(500).json({
      success: false,
      error: 'Unable to create issue. Please contact support.',
    });
    return;
  }

  // Generic error response
  res.status(500).json({
    success: false,
    error: 'An unexpected error occurred. Please try again later.',
  });
}
