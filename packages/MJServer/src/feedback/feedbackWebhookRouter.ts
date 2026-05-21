import express, { Router, Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { LogError, LogStatus, RunView } from '@memberjunction/core';
import { MJUserFeedbackSubmissionEntity } from '@memberjunction/core-entities';
import { configInfo } from '../config.js';
import {
  sendFeedbackEmail,
  escapeHtml,
  getFeedbackAppName,
} from './feedbackEmail.js';

/**
 * Internal extension of express.Request that exposes the raw request body
 * captured by express.json()'s `verify` callback. We need the raw bytes to
 * compute the HMAC signature for verification — the parsed JSON cannot be
 * round-tripped to the original bytes safely.
 */
interface RequestWithRawBody extends Request {
  rawBody?: string;
}

/**
 * Minimal shape of the GitHub webhook payloads we consume. Only the fields
 * we actually use are typed — GitHub's full payloads are very large and
 * defining a complete interface would be busywork.
 */
interface GitHubWebhookPayload {
  action: string;
  repository: {
    name: string;
    owner: { login: string };
  };
  issue: {
    number: number;
    title: string;
    html_url: string;
    state: string;
  };
  /** Populated for issue_comment events. */
  comment?: {
    body: string;
    user: { login: string };
    html_url: string;
  };
  /** Populated for 'labeled' / 'unlabeled' actions on the issues event. */
  label?: { name: string };
  sender: { login: string };
}

interface BuiltEmail {
  subject: string;
  htmlBody: string;
  textBody: string;
}

/**
 * Create the express Router that handles incoming GitHub webhook events
 * for the user-feedback notification system.
 *
 * Mounted at POST /webhooks/github/feedback in MJServer. Each request is
 * authenticated by verifying its `X-Hub-Signature-256` header against the
 * configured shared secret (HMAC-SHA256). Without a secret configured, the
 * router rejects all requests with 503 — webhooks must be cryptographically
 * verified or not enabled at all.
 *
 * The router is intentionally registered before MJ's unified auth middleware
 * because GitHub does not (and cannot) send an MJ bearer token.
 */
export function createFeedbackWebhookRouter(): Router {
  const router = Router();
  router.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        (req as RequestWithRawBody).rawBody = buf.toString('utf-8');
      },
    })
  );
  router.post('/', handleWebhook);
  return router;
}

/**
 * Resolve the configured webhook shared secret. Env var takes priority over
 * the config file so secrets can be supplied per-environment without editing
 * mj.config.cjs.
 */
function getWebhookSecret(): string | null {
  return (
    process.env.GITHUB_FEEDBACK_WEBHOOK_SECRET
    ?? configInfo.feedbackSettings?.github?.webhookSecret
    ?? null
  );
}

/**
 * Verify a GitHub webhook signature. GitHub sends an HMAC-SHA256 of the raw
 * request body keyed with the shared secret, prefixed with "sha256=".
 *
 * Uses `crypto.timingSafeEqual` to avoid leaking timing information about
 * how many bytes of the signature match.
 */
function verifySignature(rawBody: string, signatureHeader: string | undefined, secret: string): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }
  const expectedHex = createHmac('sha256', secret).update(rawBody).digest('hex');
  const providedHex = signatureHeader.slice('sha256='.length);
  // Compare as UTF-8 bytes of the lowercase-hex strings rather than the decoded
  // signature bytes. Same security property (constant-time over the full
  // signature), and sidesteps a TypeScript strictness issue where Buffer is
  // not assignable to timingSafeEqual's Uint8Array parameter in newer @types/node.
  // Matches the pattern used by MJ's Slack webhook handler.
  const expectedBytes = new Uint8Array(Buffer.from(expectedHex));
  const providedBytes = new Uint8Array(Buffer.from(providedHex));
  if (expectedBytes.length !== providedBytes.length) {
    return false;
  }
  try {
    return timingSafeEqual(expectedBytes, providedBytes);
  } catch {
    return false;
  }
}

async function handleWebhook(req: RequestWithRawBody, res: Response): Promise<void> {
  try {
    const secret = getWebhookSecret();
    if (!secret) {
      LogError('GitHub feedback webhook received but no webhookSecret is configured — rejecting');
      res.status(503).json({ error: 'Webhook not configured' });
      return;
    }

    const signature = req.header('X-Hub-Signature-256');
    if (!verifySignature(req.rawBody ?? '', signature, secret)) {
      LogError('GitHub feedback webhook: signature verification failed');
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    const event = req.header('X-GitHub-Event');
    const payload = req.body as GitHubWebhookPayload | undefined;
    if (!event || !payload) {
      res.status(400).json({ error: 'Missing event header or body' });
      return;
    }

    // GitHub sends a `ping` event when the webhook is first configured —
    // respond 200 so the configuration check in GitHub's UI succeeds.
    if (event === 'ping') {
      res.status(200).json({ pong: true });
      return;
    }

    // Filter to the event types and actions we actually email about.
    if (!isHandledEvent(event, payload.action)) {
      res.status(204).send();
      return;
    }

    // Look up the tracking row. If we don't have one, this isn't an issue
    // that originated from our feedback flow (could be a manually-filed
    // issue in the same repo) — respond 204 so GitHub doesn't retry.
    const row = await findSubmission(
      payload.repository.owner.login,
      payload.repository.name,
      payload.issue.number
    );
    if (!row) {
      res.status(204).send();
      return;
    }

    const built = buildEmailForEvent(event, payload, row);
    if (!built) {
      res.status(204).send();
      return;
    }

    // Fire-and-forget the send so we acknowledge GitHub quickly. GitHub
    // retries on non-2xx, so a slow SMTP response would cause duplicate
    // deliveries. Errors inside sendFeedbackEmail are already logged.
    void sendFeedbackEmail({
      to: row.Email,
      subject: built.subject,
      htmlBody: built.htmlBody,
      textBody: built.textBody,
    });

    LogStatus(
      `GitHub feedback webhook: dispatched ${event}/${payload.action} email for issue #${payload.issue.number} to ${row.Email}`
    );
    res.status(202).send();
  } catch (err) {
    LogError('GitHub feedback webhook handler crashed', undefined, err);
    res.status(500).json({ error: 'Internal error' });
  }
}

/**
 * Determine whether we send an email for a given (event, action) pair.
 * - `issues` events: closed / reopened / labeled / unlabeled
 *   (We deliberately skip `opened`, since the SubmitFeedback resolver
 *   already sends a confirmation email at creation time.)
 * - `issue_comment` events: created only (edits and deletions would just
 *   be noise to the submitter).
 */
function isHandledEvent(event: string, action: string): boolean {
  if (event === 'issues') {
    return action === 'closed'
      || action === 'reopened'
      || action === 'labeled'
      || action === 'unlabeled';
  }
  if (event === 'issue_comment') {
    return action === 'created';
  }
  return false;
}

/**
 * Look up the submission row that corresponds to a given GitHub issue. Returns
 * null if no row matches — which simply means we didn't originate this issue
 * and have nothing to notify about. Errors in the underlying view query are
 * logged and treated as "no match" so the webhook can return 204.
 */
async function findSubmission(
  owner: string,
  repo: string,
  issueNumber: number
): Promise<MJUserFeedbackSubmissionEntity | null> {
  // Escape single quotes for defensive filter construction. GitHub org/repo
  // names cannot contain quotes per platform rules, but we trust nothing
  // arriving over a public HTTP endpoint.
  const safeOwner = owner.replace(/'/g, "''");
  const safeRepo = repo.replace(/'/g, "''");

  const rv = new RunView();
  const result = await rv.RunView<MJUserFeedbackSubmissionEntity>({
    EntityName: 'MJ: User Feedback Submissions',
    ExtraFilter: `GitHubOwner='${safeOwner}' AND GitHubRepo='${safeRepo}' AND IssueNumber=${issueNumber}`,
    MaxRows: 1,
    ResultType: 'entity_object',
  });
  if (!result.Success) {
    LogError(`Feedback webhook submission lookup failed: ${result.ErrorMessage}`);
    return null;
  }
  return result.Results[0] ?? null;
}

function buildEmailForEvent(
  event: string,
  payload: GitHubWebhookPayload,
  row: MJUserFeedbackSubmissionEntity
): BuiltEmail | null {
  const appName = getFeedbackAppName(null);

  if (event === 'issues') {
    return buildStatusChangeEmail(payload, row, appName);
  }
  if (event === 'issue_comment' && payload.comment) {
    return buildCommentEmail(payload.comment, row, appName);
  }
  return null;
}

/**
 * Build the status-change email body. Covers closed / reopened / labeled /
 * unlabeled. All untrusted strings (label names, issue title) are escaped
 * before interpolation into HTML.
 */
function buildStatusChangeEmail(
  payload: GitHubWebhookPayload,
  row: MJUserFeedbackSubmissionEntity,
  appName: string
): BuiltEmail {
  const greeting = row.Name ? `Hi ${row.Name},` : 'Hi,';
  const safeGreeting = row.Name ? `Hi ${escapeHtml(row.Name)},` : 'Hi,';
  const safeTitle = escapeHtml(row.IssueTitle);
  const safeAppName = escapeHtml(appName);

  let textSummary: string;
  let htmlSummary: string;

  switch (payload.action) {
    case 'closed':
      textSummary = `Your feedback (issue #${row.IssueNumber}) has been closed. Thanks for raising it!`;
      htmlSummary = textSummary;
      break;
    case 'reopened':
      textSummary = `Your feedback (issue #${row.IssueNumber}) was reopened — a maintainer is taking another look.`;
      htmlSummary = textSummary;
      break;
    case 'labeled':
    case 'unlabeled': {
      const labelName = payload.label?.name ?? '(unknown)';
      const verb = payload.action === 'labeled' ? 'added' : 'removed';
      textSummary = `A maintainer ${verb} the label "${labelName}" on your feedback (issue #${row.IssueNumber}).`;
      htmlSummary = `A maintainer ${verb} the label <strong>${escapeHtml(labelName)}</strong> on your feedback (issue #${row.IssueNumber}).`;
      break;
    }
    default:
      // Should never reach here because isHandledEvent filters first.
      textSummary = `Your feedback (issue #${row.IssueNumber}) was updated.`;
      htmlSummary = textSummary;
  }

  const subject = `[${appName}] Update on your feedback: #${row.IssueNumber} ${row.IssueTitle}`;

  const textBody = [
    greeting,
    '',
    textSummary,
    '',
    'Issue title:',
    `    ${row.IssueTitle}`,
    '',
    `— The ${appName} team`,
  ].join('\n');

  const htmlBody = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #2d3748; max-width: 600px;">
  <p>${safeGreeting}</p>
  <p>${htmlSummary}</p>
  <blockquote style="margin: 16px 0; padding: 12px 16px; border-left: 3px solid #4299e1; background: #f7fafc; color: #2d3748;">
    ${safeTitle}
  </blockquote>
  <p style="color: #718096; font-size: 14px;">— The ${safeAppName} team</p>
</div>
`.trim();

  return { subject, htmlBody, textBody };
}

/**
 * Build the new-comment email body. Inlines the full comment text so
 * private-repo recipients (who cannot view the GitHub thread) still get
 * the conversation in their inbox.
 */
function buildCommentEmail(
  comment: { body: string; user: { login: string }; html_url: string },
  row: MJUserFeedbackSubmissionEntity,
  appName: string
): BuiltEmail {
  const greeting = row.Name ? `Hi ${row.Name},` : 'Hi,';
  const safeGreeting = row.Name ? `Hi ${escapeHtml(row.Name)},` : 'Hi,';
  const safeCommenter = escapeHtml(comment.user.login);
  const safeTitle = escapeHtml(row.IssueTitle);
  const safeAppName = escapeHtml(appName);
  // Convert newlines in the comment body to <br> for HTML rendering while
  // escaping everything else. GitHub comments are markdown but rendering
  // markdown to HTML server-side would be a bigger lift; plain-text-with-
  // line-breaks is a reasonable v1.
  const safeCommentHtml = escapeHtml(comment.body).replace(/\n/g, '<br>\n');

  const subject = `[${appName}] ${comment.user.login} commented on your feedback: #${row.IssueNumber} ${row.IssueTitle}`;

  const textBody = [
    greeting,
    '',
    `${comment.user.login} commented on your feedback (issue #${row.IssueNumber}):`,
    '',
    'Issue title:',
    `    ${row.IssueTitle}`,
    '',
    'Comment:',
    indentEachLine(comment.body, '    '),
    '',
    `— The ${appName} team`,
  ].join('\n');

  const htmlBody = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #2d3748; max-width: 600px;">
  <p>${safeGreeting}</p>
  <p><strong>${safeCommenter}</strong> commented on your feedback (issue <strong>#${row.IssueNumber}</strong>):</p>
  <blockquote style="margin: 16px 0; padding: 12px 16px; border-left: 3px solid #4299e1; background: #f7fafc; color: #2d3748;">
    ${safeTitle}
  </blockquote>
  <div style="margin: 16px 0; padding: 12px 16px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 4px;">
    ${safeCommentHtml}
  </div>
  <p style="color: #718096; font-size: 14px;">— The ${safeAppName} team</p>
</div>
`.trim();

  return { subject, htmlBody, textBody };
}

function indentEachLine(text: string, indent: string): string {
  return text.split('\n').map(line => indent + line).join('\n');
}
