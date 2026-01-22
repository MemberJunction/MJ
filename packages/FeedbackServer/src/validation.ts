import { z } from 'zod';

/**
 * Zod schema for validating feedback submissions
 */
export const FeedbackSubmissionSchema = z.object({
  // Required fields
  title: z
    .string()
    .min(5, 'Title must be at least 5 characters')
    .max(256, 'Title must not exceed 256 characters'),
  description: z
    .string()
    .min(20, 'Description must be at least 20 characters')
    .max(10000, 'Description must not exceed 10000 characters'),
  category: z.union([
    z.literal('bug'),
    z.literal('feature'),
    z.literal('question'),
    z.literal('other'),
    z.string().max(50), // Allow custom categories
  ]),

  // Bug-specific fields
  stepsToReproduce: z
    .string()
    .min(10, 'Steps to reproduce must be at least 10 characters')
    .max(5000, 'Steps to reproduce must not exceed 5000 characters')
    .optional(),
  expectedBehavior: z
    .string()
    .max(5000, 'Expected behavior must not exceed 5000 characters')
    .optional(),
  actualBehavior: z
    .string()
    .max(5000, 'Actual behavior must not exceed 5000 characters')
    .optional(),
  severity: z.enum(['critical', 'major', 'minor', 'trivial']).optional(),

  // Feature-specific fields
  useCase: z
    .string()
    .max(5000, 'Use case must not exceed 5000 characters')
    .optional(),
  proposedSolution: z
    .string()
    .max(5000, 'Proposed solution must not exceed 5000 characters')
    .optional(),

  // Optional contact info
  email: z
    .string()
    .email('Please enter a valid email address')
    .optional()
    .or(z.literal('')),
  name: z
    .string()
    .max(100, 'Name must not exceed 100 characters')
    .optional(),

  // Environment info
  environment: z.enum(['production', 'staging', 'development', 'local']).optional(),
  affectedArea: z
    .string()
    .max(100, 'Affected area must not exceed 100 characters')
    .optional(),

  // Auto-captured fields
  url: z.string().url().optional().or(z.literal('')),
  userAgent: z.string().max(500).optional(),
  screenSize: z.string().max(20).optional(),
  appName: z.string().max(100).optional(),
  appVersion: z.string().max(50).optional(),
  userId: z.string().max(100).optional(),
  timestamp: z.string().optional(),

  // Custom metadata
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Type inferred from the Zod schema
 */
export type ValidatedFeedbackSubmission = z.infer<typeof FeedbackSubmissionSchema>;

/**
 * Validation result type
 */
export type ValidationResult =
  | { success: true; data: ValidatedFeedbackSubmission }
  | { success: false; errors: z.ZodIssue[] };

/**
 * Validate feedback submission data
 * @param data - Raw input data to validate
 * @returns Validation result with either validated data or errors
 */
export function validateSubmission(data: unknown): ValidationResult {
  const result = FeedbackSubmissionSchema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return { success: false, errors: result.error.issues };
}

/**
 * Sanitize a string for safe inclusion in markdown
 * Prevents markdown injection and XSS in GitHub issues
 */
export function sanitizeMarkdown(text: string | undefined): string {
  if (!text) return '';

  return text
    // Escape HTML entities
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Escape markdown special characters that could be used for injection
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    // Prevent image injection
    .replace(/!\[/g, '!\\[');
}
