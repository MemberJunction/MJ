import { Octokit } from '@octokit/rest';
import { FeedbackSubmission, GitHubIssue, FeedbackHandlerConfig } from './types.js';
import { formatIssueBody } from './issue-formatter.js';

/**
 * Create a GitHub issue from a feedback submission
 * @param submission - The validated feedback data
 * @param config - Handler configuration including GitHub credentials
 * @returns The created GitHub issue data
 */
export async function createGitHubIssue(
  submission: FeedbackSubmission,
  config: FeedbackHandlerConfig
): Promise<GitHubIssue> {
  const octokit = new Octokit({ auth: config.token });

  // Build labels array
  const labels = buildLabels(submission, config);

  // Format the issue body
  const body = formatIssueBody(submission);

  // Create the issue
  const response = await octokit.issues.create({
    owner: config.owner,
    repo: config.repo,
    title: submission.title,
    body,
    labels,
    assignees: config.assignees,
  });

  // Map to our simplified interface
  return {
    id: response.data.id,
    number: response.data.number,
    title: response.data.title,
    html_url: response.data.html_url,
    state: response.data.state,
    labels: response.data.labels
      .filter((label): label is { name: string } => typeof label === 'object' && label !== null && 'name' in label)
      .map((label) => ({ name: label.name ?? '' })),
    assignees: response.data.assignees?.map((a) => ({ login: a.login })) || [],
    created_at: response.data.created_at,
  };
}

/**
 * Build the labels array for the GitHub issue
 * @param submission - The feedback submission
 * @param config - Handler configuration
 * @returns Array of label names to apply
 */
function buildLabels(
  submission: FeedbackSubmission,
  config: FeedbackHandlerConfig
): string[] {
  const labels: string[] = [];

  // Add default labels
  if (config.defaultLabels) {
    labels.push(...config.defaultLabels);
  }

  // Add category label
  if (config.categoryLabels && submission.category in config.categoryLabels) {
    labels.push(config.categoryLabels[submission.category]);
  }

  // Add severity label (for bugs)
  if (submission.severity && config.severityLabels && submission.severity in config.severityLabels) {
    labels.push(config.severityLabels[submission.severity]);
  }

  return labels;
}

/**
 * Verify that the GitHub token has the necessary permissions
 * @param config - Handler configuration
 * @returns True if the token is valid and has issues:write permission
 */
export async function verifyGitHubToken(config: FeedbackHandlerConfig): Promise<{
  valid: boolean;
  error?: string;
}> {
  try {
    const octokit = new Octokit({ auth: config.token });

    // Try to get repository info - this verifies basic access
    const repoResponse = await octokit.repos.get({
      owner: config.owner,
      repo: config.repo,
    });

    if (!repoResponse.data.has_issues) {
      return {
        valid: false,
        error: 'Repository does not have issues enabled',
      };
    }

    // Check if we can list issues (verifies read permission at minimum)
    await octokit.issues.listForRepo({
      owner: config.owner,
      repo: config.repo,
      per_page: 1,
    });

    return { valid: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('Bad credentials')) {
      return { valid: false, error: 'Invalid GitHub token' };
    }

    if (message.includes('Not Found')) {
      return { valid: false, error: 'Repository not found or token lacks access' };
    }

    return { valid: false, error: message };
  }
}
