import express, { Router, Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { Marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { LRUCache } from 'lru-cache';
import { LogError, LogStatus, RunView, UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import { configInfo } from '../config.js';
import {
  sendFeedbackEmail,
  escapeHtml,
  getFeedbackAppName,
  getFeedbackAccentColor,
  wrapInEmailShell,
  buildIssueTitleCard,
} from './feedbackEmail.js';

// Scoped marked instance configured to render GitHub-flavored markdown the
// way GitHub does in its issue comment UI: GFM tables/strikethrough + soft
// line breaks become <br>. Kept module-local (vs `marked.setOptions(...)`)
// so we don't mutate global state any other MJServer code might rely on.
const githubMarkdown = new Marked({ gfm: true, breaks: true });

/**
 * Allowlist-based sanitizer for the HTML produced from a GitHub comment's
 * markdown. Although GitHub sanitizes its own rendered output, the raw
 * comment *source* (which is what we render here) can contain arbitrary HTML
 * authored by any user able to comment on the repo's issues — e.g.
 * `<img src=x onerror=...>`, tracking pixels, or phishing markup. Since that
 * HTML is emailed to the original submitter under the app's branded shell, we
 * strip everything outside a conservative formatting allowlist before send.
 * Tags/attributes default-deny: only the listed ones survive.
 */
function sanitizeCommentHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      'p', 'br', 'b', 'i', 'strong', 'em', 'del', 'code', 'pre',
      'blockquote', 'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'span',
    ],
    allowedAttributes: {
      a: ['href', 'title'],
    },
    // Only safe link schemes; drops javascript:/data: URLs. Images are dropped
    // entirely (no <img> in allowedTags) to defeat tracking-pixel beacons.
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
  });
}

/**
 * In-memory dedup of GitHub webhook deliveries keyed by the X-GitHub-Delivery
 * GUID. GitHub reuses the same delivery GUID when it retries a failed delivery
 * or an operator manually redelivers, so caching the GUIDs we've already
 * processed lets us acknowledge redeliveries with 200 without re-sending the
 * email. Bounded + TTL'd so it can't grow unbounded; process-local, which is
 * acceptable for v1 (a process restart simply resets the dedup window).
 */
const processedDeliveries = new LRUCache<string, true>({
  max: 5000,
  ttl: 1000 * 60 * 60, // 1 hour — comfortably longer than GitHub's retry window
});

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
    /** ISO 8601 timestamps from GitHub. Used to detect creation-time label events. */
    created_at?: string;
    updated_at?: string;
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
 * Narrowed shape of a UserFeedbackSubmission row, containing only the columns
 * the webhook handler actually needs (recipient email + display fields for
 * the message body). Kept as a separate interface so RunView can pull just
 * these fields via `ResultType: 'simple'` + `Fields`, per the MJ read-only
 * lookup convention (see PermissionEngine.GetAuditTimeline for the canonical
 * pattern).
 */
interface SubmissionRow {
  Email: string;
  Name: string | null;
  IssueNumber: number;
  IssueTitle: string;
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
 * Resolve the system user used for all database operations performed by the
 * webhook handler. Webhook requests are unauthenticated from MJ's perspective
 * (GitHub doesn't send an MJ bearer token), so every server-side operation
 * inside the handler — RunView lookups, CommunicationEngine.Config calls,
 * Save operations — needs an explicit contextUser per MJ's server-side rules.
 *
 * We reuse the convention established by the scheduled-jobs subsystem: a
 * single configured "system user" email (`scheduledJobs.systemUserEmail`)
 * identifies the unattended-operations user. The user is looked up from
 * UserCache (the same cache NotificationEngine uses), so no DB roundtrip
 * happens per webhook event.
 *
 * Returns null if no system user is configured or the configured email
 * doesn't match a real row in the Users table. Callers must treat null as
 * "service not ready" and reject the request rather than silently degrading.
 */
function getSystemUser(): UserInfo | null {
  const systemEmail = configInfo.scheduledJobs?.systemUserEmail;
  if (!systemEmail || systemEmail === 'not.set@nowhere.com') {
    return null;
  }
  const lowerEmail = systemEmail.toLowerCase();
  const user = UserCache.Instance.Users.find(
    (u) => u.Email?.toLowerCase() === lowerEmail
  );
  return user ?? null;
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

    // Idempotency: GitHub reuses the X-GitHub-Delivery GUID across retries and
    // manual redeliveries. If we've already dispatched an email for this exact
    // delivery, acknowledge with 200 and do nothing — otherwise a retry (or an
    // operator redelivery) would re-send the same notification. We only record
    // a delivery as processed once it has been successfully dispatched (the 202
    // path below), so a failed attempt is still safely retried by GitHub.
    const deliveryId = req.header('X-GitHub-Delivery');
    if (deliveryId && processedDeliveries.has(deliveryId)) {
      LogStatus(`GitHub feedback webhook: ignoring duplicate delivery ${deliveryId}`);
      res.status(200).json({ duplicate: true });
      return;
    }

    // Filter to the event types and actions we actually email about.
    if (!isHandledEvent(event, payload.action)) {
      res.status(204).send();
      return;
    }

    // Suppress label events emitted as part of issue creation. The resolver
    // applies labels (category + severity + defaults) in the same API call
    // that creates the issue, and GitHub fires a separate `labeled` event
    // for each — without this guard a single submission would generate the
    // confirmation email plus one "label added" email per label.
    if (
      event === 'issues' &&
      (payload.action === 'labeled' || payload.action === 'unlabeled') &&
      isCreationTimeLabelEvent(payload)
    ) {
      LogStatus(
        `Suppressing creation-time ${payload.action} event for issue #${payload.issue.number}`
      );
      res.status(204).send();
      return;
    }

    // Suppress comments that maintainers have flagged as internal. The marker
    // (default "[internal]", configurable per deployment) lets maintainers
    // discuss implementation details, triage decisions, etc. on the feedback
    // issue without those comments landing in the submitter's inbox.
    if (
      event === 'issue_comment' &&
      payload.comment &&
      isInternalComment(payload.comment.body)
    ) {
      LogStatus(
        `Suppressing internal-marked comment on issue #${payload.issue.number}`
      );
      res.status(204).send();
      return;
    }

    // Resolve the system user used for all DB + email operations triggered by
    // this webhook. Without one, MJ's server-side rules reject any RunView /
    // CommunicationEngine call (and rightly so). Return 503 to signal "service
    // not configured" rather than 204 — operators need to see this in logs.
    const systemUser = getSystemUser();
    if (!systemUser) {
      LogError(
        `Feedback webhook handler cannot run: no system user available. ` +
        `Configure scheduledJobs.systemUserEmail in mj.config.cjs and ensure ` +
        `that email matches an existing row in the Users table.`
      );
      res.status(503).json({ error: 'System user not configured' });
      return;
    }

    // Look up the tracking row. If we don't have one, this isn't an issue
    // that originated from our feedback flow (could be a manually-filed
    // issue in the same repo) — respond 204 so GitHub doesn't retry.
    const row = await findSubmission(
      payload.repository.owner.login,
      payload.repository.name,
      payload.issue.number,
      systemUser
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
      contextUser: systemUser,
    });

    // Mark this delivery processed only now that we've actually dispatched the
    // email, so a retry of a previously-failed attempt still gets handled.
    if (deliveryId) {
      processedDeliveries.set(deliveryId, true);
    }

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
 * True when a maintainer has flagged a comment as internal-only by prefixing
 * it with the configured marker (default "[internal]"). The marker is
 * matched case-insensitively against the comment's leading non-whitespace
 * text, so `[Internal]`, ` [INTERNAL]`, and `[internal] thoughts here` all
 * suppress. An empty/unset marker disables the feature entirely.
 */
function isInternalComment(commentBody: string): boolean {
  const marker = configInfo.feedbackSettings?.emails?.internalCommentMarker;
  if (!marker) return false;
  return commentBody.trimStart().toLowerCase().startsWith(marker.toLowerCase());
}

/**
 * True when a `labeled`/`unlabeled` event was emitted as part of issue
 * creation rather than a real after-the-fact change. When the SubmitFeedback
 * resolver creates an issue with labels in the same API call, GitHub fires
 * a separate `labeled` event for each label with `updated_at` bumped to ~ms
 * after `created_at`. Without this guard, every label at creation time would
 * produce a duplicate notification on top of the confirmation email — so a
 * single submission could yield 3+ emails (confirmation + one per label).
 *
 * The 30-second window is generous enough to cover network jitter when the
 * resolver applies multiple labels in sequence and tight enough that real
 * post-creation label edits (minutes/hours later) clearly differ.
 */
function isCreationTimeLabelEvent(payload: GitHubWebhookPayload): boolean {
  if (!payload.issue.created_at || !payload.issue.updated_at) return false;
  const created = new Date(payload.issue.created_at).getTime();
  const updated = new Date(payload.issue.updated_at).getTime();
  if (isNaN(created) || isNaN(updated)) return false;
  return updated - created < 30_000;
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
  issueNumber: number,
  contextUser: UserInfo
): Promise<SubmissionRow | null> {
  // Escape single quotes for defensive filter construction. GitHub org/repo
  // names cannot contain quotes per platform rules, but we trust nothing
  // arriving over a public HTTP endpoint.
  const safeOwner = owner.replace(/'/g, "''");
  const safeRepo = repo.replace(/'/g, "''");

  // Read-only lookup: ResultType 'simple' + narrowed Fields avoids the
  // overhead of materializing a full BaseEntity instance we'd never mutate.
  // Matches the pattern used by PermissionEngine.GetAuditTimeline.
  const rv = new RunView();
  const result = await rv.RunView<SubmissionRow>({
    EntityName: 'MJ: User Feedback Submissions',
    ExtraFilter: `GitHubOwner='${safeOwner}' AND GitHubRepo='${safeRepo}' AND IssueNumber=${issueNumber}`,
    Fields: ['Email', 'Name', 'IssueNumber', 'IssueTitle'],
    MaxRows: 1,
    ResultType: 'simple',
  }, contextUser);
  if (!result.Success) {
    LogError(`Feedback webhook submission lookup failed: ${result.ErrorMessage}`);
    return null;
  }
  return result.Results[0] ?? null;
}

function buildEmailForEvent(
  event: string,
  payload: GitHubWebhookPayload,
  row: SubmissionRow
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
  row: SubmissionRow,
  appName: string
): BuiltEmail {
  const greeting = row.Name ? `Hi ${row.Name},` : 'Hi,';
  const safeGreeting = row.Name ? `Hi ${escapeHtml(row.Name)},` : 'Hi,';

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

  const accentColor = getFeedbackAccentColor();
  const titleCard = buildIssueTitleCard({
    issueNumber: row.IssueNumber,
    title: row.IssueTitle,
    accentColor,
  });
  const bodyHtml = `
<p style="margin: 0 0 16px 0;">${safeGreeting}</p>
<p style="margin: 0 0 8px 0;">${htmlSummary}</p>
${titleCard}`.trim();

  const htmlBody = wrapInEmailShell({ appName, accentColor, bodyHtml });

  return { subject, htmlBody, textBody };
}

/**
 * Build the new-comment email body. Inlines the full comment text so
 * private-repo recipients (who cannot view the GitHub thread) still get
 * the conversation in their inbox.
 */
function buildCommentEmail(
  comment: { body: string; user: { login: string } },
  row: SubmissionRow,
  appName: string
): BuiltEmail {
  const greeting = row.Name ? `Hi ${row.Name},` : 'Hi,';
  const safeGreeting = row.Name ? `Hi ${escapeHtml(row.Name)},` : 'Hi,';
  const safeCommenter = escapeHtml(comment.user.login);
  // Render the GitHub comment's markdown source the same way GitHub does:
  // GFM (tables, strikethrough, autolinks) + soft line breaks, then run the
  // result through an allowlist sanitizer before it goes into the email. The
  // comment source is attacker-controllable (any user who can comment on the
  // repo's issues), so we strip script/onerror/iframe/img and unsafe URL
  // schemes rather than trusting GitHub's input sanitization alone.
  // `as string` is the standard workaround for marked's overloaded return
  // type: parse() returns string in sync mode (our case) but TypeScript can't
  // narrow because marked exposes a string | Promise<string> union.
  const commentHtml = sanitizeCommentHtml(githubMarkdown.parse(comment.body) as string);

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

  const accentColor = getFeedbackAccentColor();
  const titleCard = buildIssueTitleCard({
    issueNumber: row.IssueNumber,
    title: row.IssueTitle,
    accentColor,
  });
  const bodyHtml = `
<p style="margin: 0 0 16px 0;">${safeGreeting}</p>
<p style="margin: 0 0 8px 0;"><strong>${safeCommenter}</strong> commented on your feedback (issue <strong>#${row.IssueNumber}</strong>):</p>
${titleCard}
<div style="margin: 24px 0 0 0; padding: 16px 20px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 14px; line-height: 1.6; color: #2d3748;">
  ${commentHtml}
</div>`.trim();

  const htmlBody = wrapInEmailShell({ appName, accentColor, bodyHtml });

  return { subject, htmlBody, textBody };
}

function indentEachLine(text: string, indent: string): string {
  return text.split('\n').map(line => indent + line).join('\n');
}
