import { FeedbackSubmission } from './types.js';
import { sanitizeMarkdown } from './validation.js';

/**
 * Default category display names
 */
const categoryLabels: Record<string, string> = {
  bug: 'Bug Report',
  feature: 'Feature Request',
  question: 'Question',
  other: 'Other',
};

/**
 * Default severity display names
 */
const severityLabels: Record<string, string> = {
  critical: 'Critical',
  major: 'Major',
  minor: 'Minor',
  trivial: 'Trivial',
};

/**
 * Default environment display names
 */
const environmentLabels: Record<string, string> = {
  production: 'Production',
  staging: 'Staging',
  development: 'Development',
  local: 'Local',
};

/**
 * Format the feedback submission as a GitHub issue body in markdown
 * @param submission - The validated feedback submission
 * @returns Formatted markdown string for the issue body
 */
export function formatIssueBody(submission: FeedbackSubmission): string {
  const sections: string[] = [];

  // Description section (always included)
  sections.push('## Description');
  sections.push('');
  sections.push(sanitizeMarkdown(submission.description));
  sections.push('');

  // Bug-specific sections
  if (submission.category === 'bug') {
    if (submission.stepsToReproduce) {
      sections.push('## Steps to Reproduce');
      sections.push('');
      sections.push(sanitizeMarkdown(submission.stepsToReproduce));
      sections.push('');
    }

    if (submission.expectedBehavior) {
      sections.push('## Expected Behavior');
      sections.push('');
      sections.push(sanitizeMarkdown(submission.expectedBehavior));
      sections.push('');
    }

    if (submission.actualBehavior) {
      sections.push('## Actual Behavior');
      sections.push('');
      sections.push(sanitizeMarkdown(submission.actualBehavior));
      sections.push('');
    }
  }

  // Feature-specific sections
  if (submission.category === 'feature') {
    if (submission.useCase) {
      sections.push('## Use Case');
      sections.push('');
      sections.push(sanitizeMarkdown(submission.useCase));
      sections.push('');
    }

    if (submission.proposedSolution) {
      sections.push('## Proposed Solution');
      sections.push('');
      sections.push(sanitizeMarkdown(submission.proposedSolution));
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

  // App info
  if (submission.appName) {
    const appInfo = submission.appVersion
      ? `${sanitizeMarkdown(submission.appName)} v${sanitizeMarkdown(submission.appVersion)}`
      : sanitizeMarkdown(submission.appName);
    sections.push(`| **App** | ${appInfo} |`);
  }

  // Category
  const categoryDisplay = categoryLabels[submission.category] || submission.category;
  sections.push(`| **Category** | ${sanitizeMarkdown(categoryDisplay)} |`);

  // Severity (for bugs)
  if (submission.severity) {
    const severityDisplay = severityLabels[submission.severity] || submission.severity;
    sections.push(`| **Severity** | ${sanitizeMarkdown(severityDisplay)} |`);
  }

  // Environment
  if (submission.environment) {
    const envDisplay = environmentLabels[submission.environment] || submission.environment;
    sections.push(`| **Environment** | ${sanitizeMarkdown(envDisplay)} |`);
  }

  // Affected area
  if (submission.affectedArea) {
    sections.push(`| **Affected Area** | ${sanitizeMarkdown(submission.affectedArea)} |`);
  }

  // Timestamp
  if (submission.timestamp) {
    sections.push(`| **Submitted** | ${sanitizeMarkdown(submission.timestamp)} |`);
  }

  sections.push('');

  // Contact info section
  if (submission.name || submission.email) {
    sections.push('### Contact');
    sections.push('');
    const contactParts: string[] = [];
    if (submission.name) {
      contactParts.push(sanitizeMarkdown(submission.name));
    }
    if (submission.email) {
      contactParts.push(sanitizeMarkdown(submission.email));
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
      sections.push(`| **URL** | ${sanitizeMarkdown(submission.url)} |`);
    }

    if (submission.userAgent) {
      const browserInfo = parseUserAgent(submission.userAgent);
      sections.push(`| **Browser** | ${sanitizeMarkdown(browserInfo)} |`);
    }

    if (submission.screenSize) {
      sections.push(`| **Screen Size** | ${sanitizeMarkdown(submission.screenSize)} |`);
    }

    if (submission.userId) {
      sections.push(`| **User ID** | ${sanitizeMarkdown(submission.userId)} |`);
    }

    sections.push('');
  }

  // Custom metadata (if any significant data)
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
 * Parse user agent string into a human-readable format
 * @param userAgent - The raw user agent string
 * @returns Simplified browser and OS description
 */
function parseUserAgent(userAgent: string): string {
  // Simple parsing - extract key browser and OS info
  let browser = 'Unknown Browser';
  let os = 'Unknown OS';

  // Detect browser
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

  // Detect OS
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
