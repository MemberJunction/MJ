import { Resolver, Mutation, Arg, Ctx, Field, InputType, ObjectType } from 'type-graphql';
import { Octokit } from '@octokit/rest';
import { LogError, LogStatus } from '@memberjunction/core';
import { AppContext } from '../types.js';
import { configInfo } from '../config.js';
import { z } from 'zod';

// ============================================================================
// GraphQL Input/Output Types
// ============================================================================

/**
 * Input type for feedback submission
 */
@InputType()
export class SubmitFeedbackInput {
  @Field()
  Title: string;

  @Field()
  Description: string;

  @Field()
  Category: string;

  @Field({ nullable: true })
  StepsToReproduce?: string;

  @Field({ nullable: true })
  ExpectedBehavior?: string;

  @Field({ nullable: true })
  ActualBehavior?: string;

  @Field({ nullable: true })
  Severity?: string;

  @Field({ nullable: true })
  UseCase?: string;

  @Field({ nullable: true })
  ProposedSolution?: string;

  @Field({ nullable: true })
  Email?: string;

  @Field({ nullable: true })
  Name?: string;

  @Field({ nullable: true })
  Environment?: string;

  @Field({ nullable: true })
  AffectedArea?: string;

  @Field({ nullable: true })
  Url?: string;

  @Field({ nullable: true })
  UserAgent?: string;

  @Field({ nullable: true })
  ScreenSize?: string;

  @Field({ nullable: true })
  AppName?: string;

  @Field({ nullable: true })
  AppVersion?: string;

  @Field({ nullable: true })
  UserId?: string;

  @Field({ nullable: true })
  Timestamp?: string;

  @Field({ nullable: true })
  Metadata?: string; // JSON string for custom metadata
}

/**
 * Response type for feedback submission
 */
@ObjectType()
export class FeedbackResponseType {
  @Field()
  Success: boolean;

  @Field({ nullable: true })
  IssueNumber?: number;

  @Field({ nullable: true })
  IssueUrl?: string;

  @Field({ nullable: true })
  Error?: string;
}

// ============================================================================
// Internal Types
// ============================================================================

interface FeedbackSubmission {
  title: string;
  description: string;
  category: string;
  stepsToReproduce?: string;
  expectedBehavior?: string;
  actualBehavior?: string;
  severity?: string;
  useCase?: string;
  proposedSolution?: string;
  email?: string;
  name?: string;
  environment?: string;
  affectedArea?: string;
  url?: string;
  userAgent?: string;
  screenSize?: string;
  appName?: string;
  appVersion?: string;
  userId?: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

interface FeedbackConfig {
  owner: string;
  repo: string;
  token: string;
  defaultLabels?: string[];
  categoryLabels?: Record<string, string>;
  severityLabels?: Record<string, string>;
  assignees?: string[];
}

// ============================================================================
// Validation Schema
// ============================================================================

const FeedbackSubmissionSchema = z.object({
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
    z.string().max(50),
  ]),
  stepsToReproduce: z.string().max(5000).optional(),
  expectedBehavior: z.string().max(5000).optional(),
  actualBehavior: z.string().max(5000).optional(),
  severity: z.enum(['critical', 'major', 'minor', 'trivial']).optional(),
  useCase: z.string().max(5000).optional(),
  proposedSolution: z.string().max(5000).optional(),
  email: z.string().email().optional().or(z.literal('')),
  name: z.string().max(100).optional(),
  environment: z.enum(['production', 'staging', 'development', 'local']).optional(),
  affectedArea: z.string().max(100).optional(),
  url: z.string().url().optional().or(z.literal('')),
  userAgent: z.string().max(500).optional(),
  screenSize: z.string().max(20).optional(),
  appName: z.string().max(100).optional(),
  appVersion: z.string().max(50).optional(),
  userId: z.string().max(100).optional(),
  timestamp: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ============================================================================
// Display Labels
// ============================================================================

const categoryLabels: Record<string, string> = {
  bug: 'Bug Report',
  feature: 'Feature Request',
  question: 'Question',
  other: 'Other',
};

const severityLabels: Record<string, string> = {
  critical: 'Critical',
  major: 'Major',
  minor: 'Minor',
  trivial: 'Trivial',
};

const environmentLabels: Record<string, string> = {
  production: 'Production',
  staging: 'Staging',
  development: 'Development',
  local: 'Local',
};

// ============================================================================
// Resolver
// ============================================================================

@Resolver()
export class FeedbackResolver {
  /**
   * Submit feedback and create a GitHub issue
   */
  @Mutation(() => FeedbackResponseType)
  async SubmitFeedback(
    @Arg('input') input: SubmitFeedbackInput,
    @Ctx() ctx: AppContext
  ): Promise<FeedbackResponseType> {
    try {
      // Get configuration
      const config = this.getConfig();
      if (!config) {
        return {
          Success: false,
          Error: 'Feedback system is not configured. GITHUB_PAT environment variable is required.',
        };
      }

      // Convert input to internal format
      const submission = this.convertInputToSubmission(input, ctx);

      // Validate submission
      const validationResult = FeedbackSubmissionSchema.safeParse(submission);
      if (!validationResult.success) {
        const errorMessages = validationResult.error.issues.map(
          (issue) => `${issue.path.join('.')}: ${issue.message}`
        );
        return {
          Success: false,
          Error: `Validation failed: ${errorMessages.join('; ')}`,
        };
      }

      // Create GitHub issue
      const issue = await this.createGitHubIssue(submission, config);

      LogStatus(`Feedback submitted: Issue #${issue.number} created`);

      return {
        Success: true,
        IssueNumber: issue.number,
        IssueUrl: issue.html_url,
      };
    } catch (error) {
      LogError('Error submitting feedback', undefined, error);
      const message = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        Success: false,
        Error: message,
      };
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Get feedback configuration from environment/config
   */
  private getConfig(): FeedbackConfig | null {
    const token = process.env.GITHUB_PAT;
    if (!token) {
      return null;
    }

    // Check for feedbackSettings in configInfo (if defined in mj.config.cjs)
    const feedbackSettings = (configInfo as Record<string, unknown>).feedbackSettings as Record<string, unknown> | undefined;
    const githubSettings = feedbackSettings?.github as Record<string, unknown> | undefined;

    return {
      owner: (githubSettings?.owner as string) || process.env.GITHUB_FEEDBACK_OWNER || 'MemberJunction',
      repo: (githubSettings?.repo as string) || process.env.GITHUB_FEEDBACK_REPO || 'MJ',
      token,
      defaultLabels: (githubSettings?.defaultLabels as string[]) || ['user-submitted'],
      categoryLabels: (githubSettings?.categoryLabels as Record<string, string>) || {
        bug: 'bug',
        feature: 'enhancement',
        question: 'question',
        other: 'triage',
      },
      severityLabels: (githubSettings?.severityLabels as Record<string, string>) || {
        critical: 'priority: critical',
        major: 'priority: high',
        minor: 'priority: medium',
        trivial: 'priority: low',
      },
      assignees: githubSettings?.assignees as string[] | undefined,
    };
  }

  /**
   * Convert GraphQL input to internal submission format
   */
  private convertInputToSubmission(input: SubmitFeedbackInput, ctx: AppContext): FeedbackSubmission {
    const submission: FeedbackSubmission = {
      title: input.Title,
      description: input.Description,
      category: input.Category,
      stepsToReproduce: input.StepsToReproduce,
      expectedBehavior: input.ExpectedBehavior,
      actualBehavior: input.ActualBehavior,
      severity: input.Severity,
      useCase: input.UseCase,
      proposedSolution: input.ProposedSolution,
      email: input.Email,
      name: input.Name,
      environment: input.Environment,
      affectedArea: input.AffectedArea,
      url: input.Url,
      userAgent: input.UserAgent,
      screenSize: input.ScreenSize,
      appName: input.AppName,
      appVersion: input.AppVersion,
      userId: input.UserId || ctx.userPayload?.userRecord?.ID,
      timestamp: input.Timestamp || new Date().toISOString(),
    };

    // Parse metadata if provided
    if (input.Metadata) {
      try {
        submission.metadata = JSON.parse(input.Metadata);
      } catch {
        // Ignore invalid JSON
      }
    }

    return submission;
  }

  /**
   * Create a GitHub issue from the feedback submission
   */
  private async createGitHubIssue(
    submission: FeedbackSubmission,
    config: FeedbackConfig
  ): Promise<{ number: number; html_url: string }> {
    const octokit = new Octokit({ auth: config.token });

    const labels = this.buildLabels(submission, config);
    const body = this.formatIssueBody(submission);

    const response = await octokit.issues.create({
      owner: config.owner,
      repo: config.repo,
      title: submission.title,
      body,
      labels,
      assignees: config.assignees,
    });

    return {
      number: response.data.number,
      html_url: response.data.html_url,
    };
  }

  /**
   * Build the labels array for the GitHub issue
   */
  private buildLabels(submission: FeedbackSubmission, config: FeedbackConfig): string[] {
    const labels: string[] = [];

    if (config.defaultLabels) {
      labels.push(...config.defaultLabels);
    }

    if (config.categoryLabels && submission.category in config.categoryLabels) {
      labels.push(config.categoryLabels[submission.category]);
    }

    if (submission.severity && config.severityLabels && submission.severity in config.severityLabels) {
      labels.push(config.severityLabels[submission.severity]);
    }

    return labels;
  }

  /**
   * Format the feedback submission as a GitHub issue body in markdown
   */
  private formatIssueBody(submission: FeedbackSubmission): string {
    const sections: string[] = [];

    // Description section
    sections.push('## Description');
    sections.push('');
    sections.push(this.sanitizeMarkdown(submission.description));
    sections.push('');

    // Bug-specific sections
    if (submission.category === 'bug') {
      if (submission.stepsToReproduce) {
        sections.push('## Steps to Reproduce');
        sections.push('');
        sections.push(this.sanitizeMarkdown(submission.stepsToReproduce));
        sections.push('');
      }

      if (submission.expectedBehavior) {
        sections.push('## Expected Behavior');
        sections.push('');
        sections.push(this.sanitizeMarkdown(submission.expectedBehavior));
        sections.push('');
      }

      if (submission.actualBehavior) {
        sections.push('## Actual Behavior');
        sections.push('');
        sections.push(this.sanitizeMarkdown(submission.actualBehavior));
        sections.push('');
      }
    }

    // Feature-specific sections
    if (submission.category === 'feature') {
      if (submission.useCase) {
        sections.push('## Use Case');
        sections.push('');
        sections.push(this.sanitizeMarkdown(submission.useCase));
        sections.push('');
      }

      if (submission.proposedSolution) {
        sections.push('## Proposed Solution');
        sections.push('');
        sections.push(this.sanitizeMarkdown(submission.proposedSolution));
        sections.push('');
      }
    }

    // Divider before metadata
    sections.push('---');
    sections.push('');

    // Submission details table
    sections.push('### Submission Details');
    sections.push('');
    sections.push('| Field | Value |');
    sections.push('|-------|-------|');

    if (submission.appName) {
      const appInfo = submission.appVersion
        ? `${this.sanitizeMarkdown(submission.appName)} v${this.sanitizeMarkdown(submission.appVersion)}`
        : this.sanitizeMarkdown(submission.appName);
      sections.push(`| **App** | ${appInfo} |`);
    }

    const categoryDisplay = categoryLabels[submission.category] || submission.category;
    sections.push(`| **Category** | ${this.sanitizeMarkdown(categoryDisplay)} |`);

    if (submission.severity) {
      const severityDisplay = severityLabels[submission.severity] || submission.severity;
      sections.push(`| **Severity** | ${this.sanitizeMarkdown(severityDisplay)} |`);
    }

    if (submission.environment) {
      const envDisplay = environmentLabels[submission.environment] || submission.environment;
      sections.push(`| **Environment** | ${this.sanitizeMarkdown(envDisplay)} |`);
    }

    if (submission.affectedArea) {
      sections.push(`| **Affected Area** | ${this.sanitizeMarkdown(submission.affectedArea)} |`);
    }

    if (submission.timestamp) {
      sections.push(`| **Submitted** | ${this.sanitizeMarkdown(submission.timestamp)} |`);
    }

    sections.push('');

    // Contact info section
    if (submission.name || submission.email) {
      sections.push('### Contact');
      sections.push('');
      const contactParts: string[] = [];
      if (submission.name) {
        contactParts.push(this.sanitizeMarkdown(submission.name));
      }
      if (submission.email) {
        contactParts.push(this.sanitizeMarkdown(submission.email));
      }
      sections.push(contactParts.join(' — '));
      sections.push('');
    }

    // Technical details section
    if (submission.url || submission.userAgent || submission.screenSize || submission.userId) {
      sections.push('### Technical Details');
      sections.push('');
      sections.push('| Field | Value |');
      sections.push('|-------|-------|');

      if (submission.url) {
        sections.push(`| **URL** | ${this.sanitizeMarkdown(submission.url)} |`);
      }

      if (submission.userAgent) {
        const browserInfo = this.parseUserAgent(submission.userAgent);
        sections.push(`| **Browser** | ${this.sanitizeMarkdown(browserInfo)} |`);
      }

      if (submission.screenSize) {
        sections.push(`| **Screen Size** | ${this.sanitizeMarkdown(submission.screenSize)} |`);
      }

      if (submission.userId) {
        sections.push(`| **User ID** | ${this.sanitizeMarkdown(submission.userId)} |`);
      }

      sections.push('');
    }

    // Custom metadata
    if (submission.metadata && Object.keys(submission.metadata).length > 0) {
      sections.push('<details>');
      sections.push('<summary>Additional Metadata</summary>');
      sections.push('');
      sections.push('```json');
      sections.push(JSON.stringify(submission.metadata, null, 2));
      sections.push('```');
      sections.push('</details>');
    }

    return sections.join('\n');
  }

  /**
   * Sanitize a string for safe inclusion in markdown
   */
  private sanitizeMarkdown(text: string | undefined): string {
    if (!text) return '';

    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/!\[/g, '!\\[');
  }

  /**
   * Parse user agent string into a human-readable format
   */
  private parseUserAgent(userAgent: string): string {
    let browser = 'Unknown Browser';
    let os = 'Unknown OS';

    if (userAgent.includes('Firefox/')) {
      const match = userAgent.match(/Firefox\/(\d+)/);
      browser = match ? `Firefox ${match[1]}` : 'Firefox';
    } else if (userAgent.includes('Edg/')) {
      const match = userAgent.match(/Edg\/(\d+)/);
      browser = match ? `Edge ${match[1]}` : 'Edge';
    } else if (userAgent.includes('Chrome/')) {
      const match = userAgent.match(/Chrome\/(\d+)/);
      browser = match ? `Chrome ${match[1]}` : 'Chrome';
    } else if (userAgent.includes('Safari/') && !userAgent.includes('Chrome')) {
      const match = userAgent.match(/Version\/(\d+)/);
      browser = match ? `Safari ${match[1]}` : 'Safari';
    }

    if (userAgent.includes('Windows NT 10')) {
      os = 'Windows 10/11';
    } else if (userAgent.includes('Windows NT')) {
      os = 'Windows';
    } else if (userAgent.includes('Mac OS X')) {
      const match = userAgent.match(/Mac OS X (\d+[._]\d+)/);
      os = match ? `macOS ${match[1].replace('_', '.')}` : 'macOS';
    } else if (userAgent.includes('Linux')) {
      os = 'Linux';
    } else if (userAgent.includes('Android')) {
      os = 'Android';
    } else if (userAgent.includes('iOS') || userAgent.includes('iPhone') || userAgent.includes('iPad')) {
      os = 'iOS';
    }

    return `${browser} on ${os}`;
  }
}
