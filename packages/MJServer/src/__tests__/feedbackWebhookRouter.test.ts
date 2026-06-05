/**
 * Tests for the GitHub feedback webhook router.
 *
 * These exercise the REAL router end-to-end over an in-process express server
 * (real HMAC verification, real markdown sanitization, real delivery-dedup
 * cache). Only the I/O boundaries are mocked:
 *   - '../config.js'                          → webhook secret / system-user / marker
 *   - '@memberjunction/sqlserver-dataprovider' → UserCache (system user lookup)
 *   - '@memberjunction/core'                   → RunView (submission lookup) + logging
 *   - '../feedback/feedbackEmail.js'           → sendFeedbackEmail (capture, no real send)
 *
 * Covered behaviors:
 *   - 503 when no webhook secret configured (fail-closed)
 *   - 401 on a bad/missing signature
 *   - 200 pong on the GitHub `ping` event
 *   - 204 for unhandled events and when no submission row matches
 *   - 202 + email dispatch for a new comment, with the comment HTML sanitized
 *   - internal-comment and creation-time-label suppression (204, no email)
 *   - X-GitHub-Delivery idempotency (redelivery → 200, email sent only once)
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import express, { type Express } from 'express';
import { createHmac } from 'crypto';
import type { Server } from 'node:http';

const SECRET = 'test-webhook-secret';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────
const { mockConfigInfo, userState, mockRunView, mockSend } = vi.hoisted(() => ({
  mockConfigInfo: {} as {
    feedbackSettings?: { github?: { webhookSecret?: string }; emails?: { internalCommentMarker?: string; appName?: string } };
    scheduledJobs?: { systemUserEmail?: string };
  },
  userState: { users: [] as Array<{ Email: string }> },
  mockRunView: vi.fn(),
  mockSend: vi.fn(),
}));

vi.mock('../config.js', () => ({ configInfo: mockConfigInfo }));

vi.mock('@memberjunction/sqlserver-dataprovider', () => ({
  UserCache: {
    Instance: {
      get Users() {
        return userState.users;
      },
    },
  },
}));

vi.mock('@memberjunction/core', () => ({
  LogError: vi.fn(),
  LogStatus: vi.fn(),
  UserInfo: class {},
  RunView: class {
    async RunView(...args: unknown[]) {
      return mockRunView(...args);
    }
  },
}));

// Keep the real markdown→HTML escaping helpers but capture the send. We stub
// wrapInEmailShell to a thin wrapper so the (real, sanitized) comment HTML is
// directly assertable in the captured htmlBody.
vi.mock('../feedback/feedbackEmail.js', () => ({
  sendFeedbackEmail: mockSend,
  escapeHtml: (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'),
  getFeedbackAppName: () => 'TestApp',
  getFeedbackAccentColor: () => '#123456',
  wrapInEmailShell: (o: { bodyHtml: string }) => `<shell>${o.bodyHtml}</shell>`,
  buildIssueTitleCard: (o: { issueNumber: number; title: string }) => `<card>#${o.issueNumber} ${o.title}</card>`,
}));

import { createFeedbackWebhookRouter } from '../feedback/feedbackWebhookRouter.js';

// ─── In-process server ──────────────────────────────────────────────────────
let app: Express;
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  app = express();
  app.use('/webhooks/github/feedback', createFeedbackWebhookRouter());
  await new Promise<void>((res) => {
    server = app.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      baseUrl = `http://127.0.0.1:${port}/webhooks/github/feedback`;
      res();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((res) => server.close(() => res()));
});

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.GITHUB_FEEDBACK_WEBHOOK_SECRET;
  mockConfigInfo.feedbackSettings = {
    github: { webhookSecret: SECRET },
    emails: { internalCommentMarker: '[internal]', appName: 'TestApp' },
  };
  mockConfigInfo.scheduledJobs = { systemUserEmail: 'system@test.com' };
  userState.users = [{ Email: 'system@test.com' }];
  // Default: the issue maps to a known submission row.
  mockRunView.mockResolvedValue({
    Success: true,
    Results: [{ Email: 'submitter@test.com', Name: 'Sam', IssueNumber: 42, IssueTitle: 'My bug' }],
  });
  mockSend.mockResolvedValue(true);
});

// ─── Helpers ────────────────────────────────────────────────────────────────
function sign(body: string, secret = SECRET): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}

let deliveryCounter = 0;
function nextDeliveryId(): string {
  return `delivery-${++deliveryCounter}`;
}

async function post(
  event: string,
  payload: unknown,
  opts: { signature?: string; deliveryId?: string } = {}
): Promise<Response> {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'X-GitHub-Event': event,
    'X-Hub-Signature-256': opts.signature ?? sign(body),
  };
  if (opts.deliveryId) headers['X-GitHub-Delivery'] = opts.deliveryId;
  return fetch(baseUrl, { method: 'POST', headers, body });
}

const issuePayload = (overrides: Record<string, unknown> = {}) => ({
  action: 'closed',
  repository: { name: 'repo', owner: { login: 'owner' } },
  issue: { number: 42, title: 'My bug', html_url: 'https://gh/owner/repo/issues/42', state: 'closed' },
  sender: { login: 'maintainer' },
  ...overrides,
});

const commentPayload = (body: string, overrides: Record<string, unknown> = {}) => ({
  action: 'created',
  repository: { name: 'repo', owner: { login: 'owner' } },
  issue: { number: 42, title: 'My bug', html_url: 'https://gh/owner/repo/issues/42', state: 'open' },
  comment: { body, user: { login: 'octocat' }, html_url: 'https://gh/owner/repo/issues/42#c1' },
  sender: { login: 'octocat' },
  ...overrides,
});

// ─── Tests ──────────────────────────────────────────────────────────────────
describe('feedback webhook — auth', () => {
  it('returns 503 when no webhook secret is configured', async () => {
    mockConfigInfo.feedbackSettings!.github!.webhookSecret = undefined;
    const res = await post('issues', issuePayload());
    expect(res.status).toBe(503);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('returns 401 on an invalid signature', async () => {
    const res = await post('issues', issuePayload(), { signature: 'sha256=deadbeef' });
    expect(res.status).toBe(401);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('returns 200 pong for a ping event with a valid signature', async () => {
    const res = await post('ping', { zen: 'hi' });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ pong: true });
  });
});

describe('feedback webhook — routing & suppression', () => {
  it('returns 204 for an unhandled action', async () => {
    const res = await post('issues', issuePayload({ action: 'edited' }));
    expect(res.status).toBe(204);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('returns 204 when no submission row matches the issue', async () => {
    mockRunView.mockResolvedValue({ Success: true, Results: [] });
    const res = await post('issues', issuePayload());
    expect(res.status).toBe(204);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('suppresses internal-marked comments (204, no email)', async () => {
    const res = await post('issue_comment', commentPayload('[internal] triage note for the team'));
    expect(res.status).toBe(204);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('suppresses creation-time label events (204, no email)', async () => {
    const created = '2026-06-05T12:00:00Z';
    const updated = '2026-06-05T12:00:05Z'; // within the 30s creation window
    const res = await post(
      'issues',
      issuePayload({ action: 'labeled', label: { name: 'bug' }, issue: {
        number: 42, title: 'My bug', html_url: 'https://gh/owner/repo/issues/42', state: 'open',
        created_at: created, updated_at: updated,
      } })
    );
    expect(res.status).toBe(204);
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe('feedback webhook — email dispatch & sanitization', () => {
  it('dispatches a status-change email on issue close', async () => {
    const res = await post('issues', issuePayload());
    expect(res.status).toBe(202);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0].to).toBe('submitter@test.com');
  });

  it('sanitizes hostile HTML in a new comment before emailing', async () => {
    const hostile =
      'Hello <img src=x onerror=alert(1)> <script>alert(2)</script> **bold** [link](javascript:alert(3))';
    const res = await post('issue_comment', commentPayload(hostile));
    expect(res.status).toBe(202);
    expect(mockSend).toHaveBeenCalledTimes(1);

    const html: string = mockSend.mock.calls[0][0].htmlBody;
    // Dangerous vectors stripped...
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('javascript:');
    // ...safe formatting preserved.
    expect(html).toContain('bold');
  });
});

describe('feedback webhook — delivery idempotency', () => {
  it('processes a delivery once and skips its redelivery', async () => {
    const id = nextDeliveryId();
    const first = await post('issue_comment', commentPayload('first and only send'), { deliveryId: id });
    expect(first.status).toBe(202);

    const second = await post('issue_comment', commentPayload('first and only send'), { deliveryId: id });
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toEqual({ duplicate: true });

    // Email dispatched exactly once across the original + redelivery.
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});
