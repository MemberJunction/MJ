import { Resolver, Mutation, Query, Arg, Ctx, Field, InputType, ObjectType } from 'type-graphql';
import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import { LogError, LogStatus, Metadata, UserInfo } from '@memberjunction/core';
import { MJUserFeedbackSubmissionEntity } from '@memberjunction/core-entities';
import {
  sendFeedbackEmail,
  escapeHtml,
  getFeedbackAppName,
  getFeedbackAccentColor,
  wrapInEmailShell,
  buildIssueTitleCard,
} from '../feedback/feedbackEmail.js';
import { AppContext } from '../types.js';
import { configInfo } from '../config.js';
import { z } from 'zod';
import { ChatParams, ChatMessage, ChatMessageRole, GetAIAPIKey, BaseLLM } from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import { MJGlobal } from '@memberjunction/global';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';

// Module-level cache — survives across resolver instances (type-graphql creates a new instance per request)
let cachedPrivateKey: string | null | undefined; // undefined = not yet read
let cachedOctokit: Octokit | null = null;
let cachedAuthType: string | null = null;

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
  CurrentPage?: string;

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

/**
 * Input type for feedback classification
 */
@InputType()
export class ClassifyFeedbackInput {
  @Field()
  Title: string;

  @Field()
  Description: string;
}

/**
 * Response type for feedback classification
 */
@ObjectType()
export class FeedbackClassificationResult {
  @Field()
  Success: boolean;

  @Field({ nullable: true })
  Category?: string;

  @Field({ nullable: true })
  Severity?: string;

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
  currentPage?: string;
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
  defaultLabels?: string[];
  categoryLabels?: Record<string, string>;
  severityLabels?: Record<string, string>;
  assignees?: string[];
  auth: { type: 'pat'; token: string } | { type: 'app'; appId: number; installationId: number; privateKey: string };
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
  currentPage: z.string().max(200).optional(),
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
  /**
   * Check if the feedback feature is enabled for this org.
   */
  @Query(() => Boolean)
  FeedbackEnabled(): boolean {
    return this.isFeedbackEnabled();
  }

  /**
   * Feedback is considered enabled only when both (a) the org kill switch
   * is not explicitly off and (b) GitHub credentials are configured. Without
   * (b) the feature cannot create issues, so we hide it rather than letting
   * users submit into a broken pipe.
   */
  private isFeedbackEnabled(): boolean {
    if (configInfo.feedbackSettings.enabled === false) {
      return false;
    }
    return this.resolveAuth() !== null;
  }

  @Mutation(() => FeedbackResponseType)
  async SubmitFeedback(
    @Arg('input') input: SubmitFeedbackInput,
    @Ctx() ctx: AppContext
  ): Promise<FeedbackResponseType> {
    try {
      if (!this.isFeedbackEnabled()) {
        return { Success: false, Error: 'Feedback is disabled for this organization.' };
      }

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

      // Persist a tracking row + send the confirmation email. Fire-and-forget:
      // the GitHub issue is already created, so a failure here must not roll back
      // the user-visible success. The helper has its own try/catch and logs errors.
      if (submission.email) {
        void this.recordSubmissionAndNotify(submission, issue, config, ctx);
      }

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

  /**
   * Classify feedback using an LLM to suggest category and severity.
   */
  @Mutation(() => FeedbackClassificationResult)
  async ClassifyFeedback(
    @Arg('input') input: ClassifyFeedbackInput,
    @Ctx() ctx: AppContext
  ): Promise<FeedbackClassificationResult> {
    try {
      if (!this.isFeedbackEnabled()) {
        return { Success: false, Error: 'Feedback is disabled for this organization.' };
      }

      // Get the current context user for AIEngine config
      const contextUser = ctx.userPayload?.userRecord;
      await AIEngine.Instance.Config(false, contextUser);

      // Get active LLM models with valid API keys (guard against null DriverClass)
      const allModels = AIEngine.Instance.Models.filter(m =>
        m.AIModelType?.trim().toLowerCase() === 'llm' && m.IsActive && m.DriverClass
      );
      const models = allModels.filter(m => {
        try {
          const key = GetAIAPIKey(m.DriverClass);
          return key && key.trim().length > 0;
        } catch {
          return false;
        }
      });

      if (models.length === 0) {
        return { Success: false, Error: 'No AI models configured' };
      }

      // Pick a fast, cheap model — prefer Groq, then OpenAI, then any available
      const model = models.find(m => m.DriverClass === 'GroqLLM')
        || models.find(m => m.DriverClass === 'OpenAILLM')
        || models[0];

      const apiKey = GetAIAPIKey(model.DriverClass);
      const llm = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(
        BaseLLM, model.DriverClass, apiKey
      );

      if (!llm) {
        return { Success: false, Error: 'Failed to create LLM instance' };
      }

      const chatParams = new ChatParams();
      chatParams.model = model.APIName;
      chatParams.messages = [
        {
          role: ChatMessageRole.system,
          content: `Classify this user feedback. Respond with ONLY a JSON object, no other text:
{"category": "bug"|"feature"|"question"|"other", "severity": "critical"|"major"|"minor"|"trivial"}

Step 1 — CATEGORY. Choose ONE. Read the intent, not just keywords:
- "question" = user is SEEKING HELP or INFORMATION. Clues: "how do I", "where is", "can I", "is it possible", "I can't find", "where did ___ go", "used to see ___ but now", "help me". Even if they sound frustrated, if they're looking for guidance it's a question. A user who can't FIND something is asking a question, not reporting a bug.
- "feature" = user WANTS something NEW: "it would be nice", "can you add", "I wish", "please add", "would love to see"
- "bug" = something is OBJECTIVELY BROKEN: "error message", "crash", "500 error", "white screen", "data lost", "button does nothing when clicked", "stops responding". The system is malfunctioning, not just confusing.
- "other" = doesn't fit the above

Step 2 — SEVERITY. Strictly follow these rules:
- If category is "question" → severity MUST be "trivial"
- If category is "feature" → severity MUST be "minor"
- If category is "other" → severity MUST be "minor"
- If category is "bug":
  - "critical" = data loss, security vulnerability, entire system unusable for ALL users
  - "major" = user EXPLICITLY says words like "blocking me", "preventing me from", "can't complete my work", "unable to do my job". Without these exact phrases, do NOT use major.
  - "trivial" = purely visual: typo, misspelling, alignment, spacing, colors, dark mode, theme, font, styling, cosmetic appearance
  - "minor" = everything else. This is the DEFAULT for bugs. If unsure between trivial and minor, pick trivial. If unsure between minor and major, pick minor.`
        },
        {
          role: ChatMessageRole.user,
          content: `Title: ${input.Title}\nDescription: ${input.Description}`
        }
      ];

      const result = await llm.ChatCompletion(chatParams);
      const content = result?.data?.choices?.[0]?.message?.content?.trim();

      if (!content) {
        return { Success: false, Error: 'Empty response from AI' };
      }

      // Parse JSON from response (handle potential markdown code fences)
      const jsonStr = content.replace(/```json?\s*/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(jsonStr);

      return {
        Success: true,
        Category: parsed.category,
        Severity: parsed.severity
      };
    } catch (error) {
      LogError('Error classifying feedback', undefined, error);
      return { Success: false, Error: 'Classification failed' };
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Get feedback configuration from environment/config.
   * Supports GitHub App auth (preferred) or PAT fallback.
   */
  private getConfig(): FeedbackConfig | null {
    const auth = this.resolveAuth();
    if (!auth) {
      return null;
    }

    const githubSettings = configInfo.feedbackSettings?.github;

    return {
      owner: githubSettings?.owner || process.env.GITHUB_FEEDBACK_OWNER || 'MemberJunction',
      repo: githubSettings?.repo || process.env.GITHUB_FEEDBACK_REPO || 'MJ',
      auth,
      defaultLabels: githubSettings?.defaultLabels || ['user-submitted'],
      categoryLabels: githubSettings?.categoryLabels || {
        bug: 'bug',
        feature: 'enhancement',
        question: 'question',
        other: 'triage',
      },
      severityLabels: githubSettings?.severityLabels || {
        critical: 'priority: critical',
        major: 'priority: high',
        minor: 'priority: medium',
        trivial: 'priority: low',
      },
      assignees: githubSettings?.assignees,
    };
  }

  /**
   * Resolve authentication — prefers GitHub App, falls back to PAT.
   */
  private resolveAuth(): FeedbackConfig['auth'] | null {
    // Try GitHub App first
    const appId = process.env.GITHUB_APP_ID;
    const installationId = process.env.GITHUB_APP_INSTALLATION_ID;
    const privateKey = this.readPrivateKey();

    if (appId && installationId && privateKey) {
      return {
        type: 'app',
        appId: Number(appId),
        installationId: Number(installationId),
        privateKey
      };
    }

    // Fall back to PAT
    const token = process.env.GITHUB_PAT;
    if (token) {
      return { type: 'pat', token };
    }

    return null;
  }

  /**
   * Read the GitHub App private key from file path or inline env var.
   * Cached at module level — the key file doesn't change at runtime.
   */
  private readPrivateKey(): string | null {
    if (cachedPrivateKey !== undefined) {
      return cachedPrivateKey;
    }

    // Option 1: File path
    const keyPath = process.env.GITHUB_APP_PRIVATE_KEY_PATH;
    if (keyPath) {
      try {
        const resolved = keyPath.startsWith('~/')
          ? resolve(homedir(), keyPath.slice(2))
          : resolve(keyPath);
        cachedPrivateKey = readFileSync(resolved, 'utf-8');
        return cachedPrivateKey;
      } catch (error) {
        LogError('Failed to read GitHub App private key file', undefined, error);
        cachedPrivateKey = null;
        return null;
      }
    }

    // Option 2: Inline key (with \n replaced)
    const inlineKey = process.env.GITHUB_APP_PRIVATE_KEY;
    if (inlineKey) {
      cachedPrivateKey = inlineKey.replace(/\\n/g, '\n');
      return cachedPrivateKey;
    }

    cachedPrivateKey = null;
    return null;
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
      currentPage: input.CurrentPage,
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
   * Get or create an authenticated Octokit instance.
   * Cached at module level — createAppAuth handles token refresh internally.
   */
  private getOctokit(config: FeedbackConfig): Octokit {
    if (cachedOctokit && cachedAuthType === config.auth.type) {
      return cachedOctokit;
    }

    if (config.auth.type === 'app') {
      cachedOctokit = new Octokit({
        authStrategy: createAppAuth,
        auth: {
          appId: config.auth.appId,
          privateKey: config.auth.privateKey,
          installationId: config.auth.installationId,
        },
      });
    } else {
      cachedOctokit = new Octokit({ auth: config.auth.token });
    }

    cachedAuthType = config.auth.type;
    return cachedOctokit;
  }

  /**
   * Create a GitHub issue from the feedback submission.
   * If a screenshot is present, uploads it to the repo and embeds it in the issue.
   */
  private async createGitHubIssue(
    submission: FeedbackSubmission,
    config: FeedbackConfig
  ): Promise<{ number: number; html_url: string }> {
    const octokit = this.getOctokit(config);

    // Extract screenshot before formatting (formatScreenshotSection removes it from metadata)
    const screenshotDataUrl = submission.metadata?.screenshot as string | undefined;

    const labels = this.buildLabels(submission, config);
    const body = this.formatIssueBody(submission);

    // Create the issue first
    const response = await octokit.issues.create({
      owner: config.owner,
      repo: config.repo,
      title: submission.title,
      body,
      labels,
      assignees: config.assignees,
    });

    const issueNumber = response.data.number;

    // Upload screenshot and update issue body if present
    if (screenshotDataUrl && typeof screenshotDataUrl === 'string') {
      try {
        const imageUrl = await this.uploadScreenshot(
          octokit, config.owner, config.repo, screenshotDataUrl, issueNumber
        );
        if (imageUrl) {
          const screenshotMarkdown = `\n## Screenshot\n\n![Screenshot](${imageUrl})\n`;
          await octokit.issues.update({
            owner: config.owner,
            repo: config.repo,
            issue_number: issueNumber,
            body: body + screenshotMarkdown,
          });
        }
      } catch (error) {
        // Screenshot upload is best-effort — don't fail the whole submission
        LogError('Failed to upload feedback screenshot', undefined, error);
      }
    }

    return {
      number: issueNumber,
      html_url: response.data.html_url,
    };
  }

  /**
   * Upload a base64 screenshot to the repo and return the raw content URL.
   */
  private async uploadScreenshot(
    octokit: Octokit,
    owner: string,
    repo: string,
    dataUrl: string,
    issueNumber: number
  ): Promise<string | null> {
    // Strip the data URL prefix (e.g., "data:image/jpeg;base64,")
    const base64Match = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!base64Match) return null;

    const extension = base64Match[1] === 'jpeg' ? 'jpg' : base64Match[1];
    const base64Content = base64Match[2];
    const filename = `${issueNumber}-${Date.now()}.${extension}`;
    const path = `.github/feedback-screenshots/${filename}`;

    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message: `feedback: add screenshot for issue #${issueNumber}`,
      content: base64Content,
    });

    return `https://raw.githubusercontent.com/${owner}/${repo}/next/${path}`;
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
   * Format the feedback submission as a GitHub issue body in markdown.
   * Orchestrates section-specific formatters and joins them.
   */
  private formatIssueBody(submission: FeedbackSubmission): string {
    const sections: string[] = [
      this.formatDescriptionSection(submission),
      this.formatScreenshotSection(submission),
      '---',
      '',
      this.formatDetailsTable(submission),
      this.formatContactSection(submission),
      this.formatTechnicalDetails(submission),
      this.formatMetadataSection(submission),
    ];

    return sections.filter(s => s.length > 0).join('\n');
  }

  /**
   * Format the description and category-specific sections (bug/feature)
   */
  private formatDescriptionSection(submission: FeedbackSubmission): string {
    const lines: string[] = [];

    lines.push('## Description', '', this.sanitizeMarkdown(submission.description), '');

    if (submission.category === 'bug') {
      if (submission.stepsToReproduce) {
        lines.push('## Steps to Reproduce', '', this.sanitizeMarkdown(submission.stepsToReproduce), '');
      }
      if (submission.expectedBehavior) {
        lines.push('## Expected Behavior', '', this.sanitizeMarkdown(submission.expectedBehavior), '');
      }
      if (submission.actualBehavior) {
        lines.push('## Actual Behavior', '', this.sanitizeMarkdown(submission.actualBehavior), '');
      }
    }

    if (submission.category === 'feature') {
      if (submission.useCase) {
        lines.push('## Use Case', '', this.sanitizeMarkdown(submission.useCase), '');
      }
      if (submission.proposedSolution) {
        lines.push('## Proposed Solution', '', this.sanitizeMarkdown(submission.proposedSolution), '');
      }
    }

    return lines.join('\n');
  }

  /**
   * Format the submission details markdown table
   */
  private formatDetailsTable(submission: FeedbackSubmission): string {
    const rows: string[] = [];
    rows.push('### Submission Details', '', '| Field | Value |', '|-------|-------|');

    if (submission.appName) {
      const appInfo = submission.appVersion
        ? `${this.sanitizeMarkdown(submission.appName)} v${this.sanitizeMarkdown(submission.appVersion)}`
        : this.sanitizeMarkdown(submission.appName);
      rows.push(`| **App** | ${appInfo} |`);
    }

    const categoryDisplay = categoryLabels[submission.category] || submission.category;
    rows.push(`| **Category** | ${this.sanitizeMarkdown(categoryDisplay)} |`);

    if (submission.severity) {
      const severityDisplay = severityLabels[submission.severity] || submission.severity;
      rows.push(`| **Severity** | ${this.sanitizeMarkdown(severityDisplay)} |`);
    }

    if (submission.environment) {
      const envDisplay = environmentLabels[submission.environment] || submission.environment;
      rows.push(`| **Environment** | ${this.sanitizeMarkdown(envDisplay)} |`);
    }

    if (submission.affectedArea) {
      rows.push(`| **Affected Area** | ${this.sanitizeMarkdown(submission.affectedArea)} |`);
    }

    if (submission.timestamp) {
      rows.push(`| **Submitted** | ${this.sanitizeMarkdown(submission.timestamp)} |`);
    }

    rows.push('');
    return rows.join('\n');
  }

  /**
   * Format the contact information section
   */
  private formatContactSection(submission: FeedbackSubmission): string {
    if (!submission.name && !submission.email) {
      return '';
    }

    const contactParts: string[] = [];
    if (submission.name) {
      contactParts.push(this.sanitizeMarkdown(submission.name));
    }
    if (submission.email) {
      contactParts.push(this.sanitizeMarkdown(submission.email));
    }

    return ['### Contact', '', contactParts.join(' — '), ''].join('\n');
  }

  /**
   * Format the technical details table (page, browser, screen, user)
   */
  private formatTechnicalDetails(submission: FeedbackSubmission): string {
    if (!submission.currentPage && !submission.userAgent && !submission.screenSize && !submission.userId) {
      return '';
    }

    const rows: string[] = [];
    rows.push('### Technical Details', '', '| Field | Value |', '|-------|-------|');

    if (submission.currentPage) {
      rows.push(`| **Page/View** | ${this.sanitizeMarkdown(submission.currentPage)} |`);
    }
    if (submission.userAgent) {
      const browserInfo = this.parseUserAgent(submission.userAgent);
      rows.push(`| **Browser** | ${this.sanitizeMarkdown(browserInfo)} |`);
    }
    if (submission.screenSize) {
      rows.push(`| **Screen Size** | ${this.sanitizeMarkdown(submission.screenSize)} |`);
    }
    if (submission.userId) {
      rows.push(`| **User ID** | ${this.sanitizeMarkdown(submission.userId)} |`);
    }

    rows.push('');
    return rows.join('\n');
  }

  /**
   * Format the screenshot section. Embeds the base64 data in a collapsed block
   * that AI agents can parse, even though GitHub won't render it visually.
   * If the file upload succeeds (in createGitHubIssue), the issue body gets
   * updated with a rendered image above this block.
   */
  private formatScreenshotSection(submission: FeedbackSubmission): string {
    const screenshot = submission.metadata?.screenshot;
    if (!screenshot || typeof screenshot !== 'string') {
      return '';
    }

    // Remove from metadata so it doesn't also appear in the JSON section
    delete submission.metadata!.screenshot;

    return [
      '<details>',
      '<summary>📷 Screenshot (for AI agents — not rendered by GitHub)</summary>',
      '',
      `![Screenshot](${screenshot})`,
      '',
      '</details>',
      '',
    ].join('\n');
  }

  /**
   * Format the collapsible metadata JSON section
   */
  private formatMetadataSection(submission: FeedbackSubmission): string {
    if (!submission.metadata || Object.keys(submission.metadata).length === 0) {
      return '';
    }

    return [
      '<details>',
      '<summary>Additional Metadata</summary>',
      '',
      '```json',
      JSON.stringify(submission.metadata, null, 2),
      '```',
      '</details>',
    ].join('\n');
  }

  // ============================================================================
  // Notification & tracking — persist the submission and email the submitter
  // ============================================================================

  /**
   * Persist a UserFeedbackSubmission tracking row and send the confirmation
   * email. Best-effort: any failure is logged but never thrown. The caller
   * intentionally runs this fire-and-forget after the GitHub issue is created.
   *
   * The row is what later lets the webhook handler map a GitHub issue event
   * (status change, new comment) back to the original submitter's email.
   */
  private async recordSubmissionAndNotify(
    submission: FeedbackSubmission,
    issue: { number: number; html_url: string },
    config: FeedbackConfig,
    ctx: AppContext
  ): Promise<void> {
    try {
      const contextUser = ctx.userPayload?.userRecord;
      const saved = await this.saveFeedbackSubmissionRow(submission, issue, config, contextUser);
      if (!saved) return; // saveFeedbackSubmissionRow already logged the failure

      await this.sendConfirmationEmail(submission, issue, contextUser);
    } catch (err) {
      LogError('Feedback follow-up (tracking row + email) failed', undefined, err);
    }
  }

  /**
   * Insert a UserFeedbackSubmission row that maps the GitHub issue back to
   * the submitter's email address. Returns true if the row saved, false
   * otherwise (after logging the underlying entity error).
   */
  private async saveFeedbackSubmissionRow(
    submission: FeedbackSubmission,
    issue: { number: number; html_url: string },
    config: FeedbackConfig,
    contextUser: UserInfo | undefined
  ): Promise<boolean> {
    const md = new Metadata();
    const row = await md.GetEntityObject<MJUserFeedbackSubmissionEntity>(
      'MJ: User Feedback Submissions',
      contextUser
    );
    row.UserID = submission.userId ?? null;
    row.Email = submission.email!;
    row.Name = submission.name ?? null;
    row.GitHubOwner = config.owner;
    row.GitHubRepo = config.repo;
    row.IssueNumber = issue.number;
    row.IssueTitle = submission.title;
    row.IssueURL = issue.html_url;
    row.Category = submission.category ?? null;
    row.Severity = submission.severity ?? null;

    if (!(await row.Save())) {
      LogError(
        `Failed to save UserFeedbackSubmission for issue #${issue.number}: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`
      );
      return false;
    }
    return true;
  }

  /**
   * Send the "we got your feedback" confirmation email to the submitter.
   * Delegates the actual send to the shared sendFeedbackEmail helper so the
   * webhook handler and this resolver share one code path for provider
   * lookup, error logging, and config resolution.
   */
  private async sendConfirmationEmail(
    submission: FeedbackSubmission,
    issue: { number: number; html_url: string },
    contextUser: UserInfo | undefined
  ): Promise<void> {
    const appName = getFeedbackAppName(submission.appName);
    await sendFeedbackEmail({
      to: submission.email!,
      subject: `[${appName}] Feedback received: #${issue.number} ${submission.title}`,
      textBody: this.buildConfirmationEmailText(submission, issue, appName),
      htmlBody: this.buildConfirmationEmailHtml(submission, issue, appName),
      contextUser,
    });
  }

  /**
   * Plain-text body for the confirmation email. Self-contained so private-repo
   * recipients (who cannot view the GitHub issue) have full context from the
   * email alone.
   */
  private buildConfirmationEmailText(
    submission: FeedbackSubmission,
    issue: { number: number; html_url: string },
    appName: string
  ): string {
    const greeting = submission.name ? `Hi ${submission.name},` : 'Hi,';
    return [
      greeting,
      '',
      `Thanks for your feedback on ${appName}. We've logged it as issue #${issue.number}:`,
      '',
      `    ${submission.title}`,
      '',
      `You'll get follow-up emails from this address whenever the issue's status changes or a maintainer comments. There's nothing more to do on your end — we just wanted you to know it's being tracked.`,
      '',
      `— The ${appName} team`,
    ].join('\n');
  }

  /**
   * HTML body for the confirmation email. Wraps the content in the shared
   * branded email shell so layout/colors stay consistent across confirmation,
   * status-change, and new-comment emails.
   */
  private buildConfirmationEmailHtml(
    submission: FeedbackSubmission,
    issue: { number: number; html_url: string },
    appName: string
  ): string {
    const safeName = submission.name ? escapeHtml(submission.name) : '';
    const safeAppName = escapeHtml(appName);
    const greeting = safeName ? `Hi ${safeName},` : 'Hi,';
    const accentColor = getFeedbackAccentColor();
    const titleCard = buildIssueTitleCard({
      issueNumber: issue.number,
      title: submission.title,
      accentColor,
    });

    const bodyHtml = `
<p style="margin: 0 0 16px 0;">${greeting}</p>
<p style="margin: 0 0 8px 0;">Thanks for your feedback on <strong>${safeAppName}</strong>. We've logged it as issue <strong>#${issue.number}</strong>:</p>
${titleCard}
<p style="margin: 24px 0 0 0;">You'll get follow-up emails from this address whenever the issue's status changes or a maintainer comments. There's nothing more to do on your end — we just wanted you to know it's being tracked.</p>`.trim();

    return wrapInEmailShell({ appName, accentColor, bodyHtml });
  }

  /**
   * Sanitize a string for safe inclusion in markdown
   */
  private sanitizeMarkdown(text: string | undefined): string {
    if (!text) return '';

    return text
      .replace(/\\/g, '\\\\')   // backslashes first (before other escapes add more)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/`/g, '\\`')     // inline code injection
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/!\[/g, '!\\[')
      .replace(/\(/g, '\\(')    // link URL injection
      .replace(/\)/g, '\\)')
      .replace(/\|/g, '\\|');
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
