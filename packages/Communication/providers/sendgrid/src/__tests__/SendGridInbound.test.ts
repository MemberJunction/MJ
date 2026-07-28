/**
 * Unit tests for the SendGrid provider's Inbound Parse (push-notification) support:
 * supported operations, subscription capabilities, CreateSubscription/DeleteSubscription
 * (REST via global fetch), and the pure ParseNotification multipart parser.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockSgSend, mockSetApiKey } = vi.hoisted(() => ({
  mockSgSend: vi.fn(),
  mockSetApiKey: vi.fn(),
}));

vi.mock('@sendgrid/mail', () => ({
  default: {
    setApiKey: mockSetApiKey,
    send: mockSgSend,
  },
}));

// Mirror the real BaseCommunicationProvider: SupportsPush derives from
// GetSubscriptionCapabilities() so a subclass opts in simply by overriding it.
vi.mock('@memberjunction/communication-types', async () => ({
  // Real address-list parser (pure, dependency-free) pulled straight from the base-types
  // source so ParseNotification tests exercise genuine parsing; importing the whole actual
  // package would drag in unmocked heavy dependencies.
  ...(await vi.importActual<{ ParseEmailAddressList: (headerValue: string | null | undefined) => string[] }>(
    '../../../../base-types/src/AddressUtils'
  )),
  BaseCommunicationProvider: class {
    getSupportedOperations() { return []; }
    GetSubscriptionCapabilities() { return undefined; }
    get SupportsPush() { return this.GetSubscriptionCapabilities() !== undefined; }
  },
  resolveCredentialValue: (requestVal: string | undefined, envVal: string | undefined, disableFallback: boolean) => {
    if (requestVal) return requestVal;
    if (!disableFallback && envVal) return envVal;
    return undefined;
  },
  validateRequiredCredentials: (creds: Record<string, unknown>, required: string[], provider: string) => {
    for (const key of required) {
      if (!creds[key]) throw new Error(`${provider}: Missing required credential: ${key}`);
    }
  },
}));

vi.mock('@memberjunction/global', () => ({
  RegisterClass: () => (target: unknown) => target,
}));

vi.mock('@memberjunction/core', () => ({
  LogError: vi.fn(),
  LogStatus: vi.fn(),
}));

vi.mock('dotenv', () => ({
  default: { config: vi.fn() },
}));

vi.mock('../config', () => ({
  __API_KEY: 'env-sendgrid-key',
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { SendGridProvider } from '../SendGridProvider';
import type {
  CreateSubscriptionParams,
  DeleteSubscriptionParams,
  WebhookNotificationInput,
} from '@memberjunction/communication-types';

const PARSE_URL = 'https://api.sendgrid.com/v3/user/webhooks/parse/settings';

// Build a fetch Response-like stub with just the surface the provider uses.
const fetchResponse = (opts: { ok: boolean; status: number; text?: string }) => ({
  ok: opts.ok,
  status: opts.status,
  text: vi.fn().mockResolvedValue(opts.text ?? ''),
});

// Assemble a realistic multipart/form-data body from name→value pairs.
const buildMultipart = (boundary: string, parts: Array<{ name: string; value: string; filename?: string }>): string => {
  let body = '';
  for (const p of parts) {
    const disp = p.filename
      ? `form-data; name="${p.name}"; filename="${p.filename}"`
      : `form-data; name="${p.name}"`;
    body += `--${boundary}\r\nContent-Disposition: ${disp}\r\n\r\n${p.value}\r\n`;
  }
  body += `--${boundary}--\r\n`;
  return body;
};

describe('SendGridProvider Inbound Parse', () => {
  let provider: SendGridProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new SendGridProvider();
  });

  // -------------------------------------------------------------------------
  // Capabilities / operations
  // -------------------------------------------------------------------------

  describe('getSupportedOperations', () => {
    it('includes the four supported operations', () => {
      const ops = provider.getSupportedOperations();
      expect(ops).toContain('SendSingleMessage');
      expect(ops).toContain('CreateSubscription');
      expect(ops).toContain('DeleteSubscription');
      expect(ops).toContain('ParseNotification');
      expect(ops).not.toContain('RenewSubscription');
    });
  });

  describe('SupportsPush', () => {
    it('is true (derived from GetSubscriptionCapabilities)', () => {
      expect(provider.SupportsPush).toBe(true);
    });
  });

  describe('GetSubscriptionCapabilities', () => {
    it('reflects the Inbound Parse model (inline, managed, no expiry)', () => {
      const caps = provider.GetSubscriptionCapabilities()!;
      expect(caps.DeliversPayloadInline).toBe(true);
      expect(caps.SupportsSubscriptionManagement).toBe(true);
      expect(caps.MaxLifetimeMinutes).toBeUndefined();
      expect(caps.RequiresEndpointValidation).toBe(false);
      expect(caps.SupportedChangeTypes).toEqual(['created']);
    });
  });

  // -------------------------------------------------------------------------
  // CreateSubscription
  // -------------------------------------------------------------------------

  describe('CreateSubscription', () => {
    const baseParams = (): CreateSubscriptionParams => ({
      Identifier: 'parse.example.com',
      NotificationUrl: 'https://api.example.com/inbound',
      ChangeTypes: ['created'],
      ClientState: 'unused-for-sendgrid',
    });

    it('POSTs the hostname→URL mapping and returns hostname as SubscriptionID', async () => {
      const fetchMock = vi.fn().mockResolvedValue(fetchResponse({ ok: true, status: 201, text: '{"result":"ok"}' }));
      vi.stubGlobal('fetch', fetchMock);

      const result = await provider.CreateSubscription(baseParams());

      expect(result.Success).toBe(true);
      expect(result.SubscriptionID).toBe('parse.example.com');
      expect(result.ExpiresAt).toBeUndefined();
      expect(result.Result).toEqual({ result: 'ok' });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(PARSE_URL);
      expect(init.method).toBe('POST');
      expect(init.headers.Authorization).toBe('Bearer env-sendgrid-key');
      expect(JSON.parse(init.body)).toEqual({
        hostname: 'parse.example.com',
        url: 'https://api.example.com/inbound',
        spam_check: false,
        send_raw: false,
      });

      vi.unstubAllGlobals();
    });

    it('uses per-request credentials when provided', async () => {
      const fetchMock = vi.fn().mockResolvedValue(fetchResponse({ ok: true, status: 201, text: '{}' }));
      vi.stubGlobal('fetch', fetchMock);

      await provider.CreateSubscription(baseParams(), { apiKey: 'SG.custom-key' });
      expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer SG.custom-key');

      vi.unstubAllGlobals();
    });

    it('returns Success:false with status + body on a non-2xx response', async () => {
      const fetchMock = vi.fn().mockResolvedValue(fetchResponse({ ok: false, status: 400, text: 'hostname already exists' }));
      vi.stubGlobal('fetch', fetchMock);

      const result = await provider.CreateSubscription(baseParams());
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toContain('400');
      expect(result.ErrorMessage).toContain('hostname already exists');

      vi.unstubAllGlobals();
    });

    it('fail-fast: rejects a missing hostname without touching fetch', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const result = await provider.CreateSubscription({ ...baseParams(), Identifier: '' });
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toContain('Identifier');
      expect(fetchMock).not.toHaveBeenCalled();

      vi.unstubAllGlobals();
    });

    it('fail-fast: rejects a non-https NotificationUrl without touching fetch', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const result = await provider.CreateSubscription({ ...baseParams(), NotificationUrl: 'http://insecure.example.com/inbound' });
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toContain('https');
      expect(fetchMock).not.toHaveBeenCalled();

      vi.unstubAllGlobals();
    });
  });

  // -------------------------------------------------------------------------
  // DeleteSubscription
  // -------------------------------------------------------------------------

  describe('DeleteSubscription', () => {
    const params = (): DeleteSubscriptionParams => ({ SubscriptionID: 'parse.example.com' });

    it('DELETEs the hostname-keyed mapping and returns success', async () => {
      const fetchMock = vi.fn().mockResolvedValue(fetchResponse({ ok: true, status: 204 }));
      vi.stubGlobal('fetch', fetchMock);

      const result = await provider.DeleteSubscription(params());
      expect(result.Success).toBe(true);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`${PARSE_URL}/parse.example.com`);
      expect(init.method).toBe('DELETE');
      expect(init.headers.Authorization).toBe('Bearer env-sendgrid-key');

      vi.unstubAllGlobals();
    });

    it('treats a 404 as success (idempotent delete)', async () => {
      const fetchMock = vi.fn().mockResolvedValue(fetchResponse({ ok: false, status: 404 }));
      vi.stubGlobal('fetch', fetchMock);

      const result = await provider.DeleteSubscription({ SubscriptionID: 'already-gone.example.com' });
      expect(result.Success).toBe(true);

      vi.unstubAllGlobals();
    });

    it('returns Success:false on a non-404 error', async () => {
      const fetchMock = vi.fn().mockResolvedValue(fetchResponse({ ok: false, status: 500, text: 'server error' }));
      vi.stubGlobal('fetch', fetchMock);

      const result = await provider.DeleteSubscription(params());
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toContain('500');

      vi.unstubAllGlobals();
    });
  });

  // -------------------------------------------------------------------------
  // ParseNotification (pure — no mocks needed)
  // -------------------------------------------------------------------------

  describe('ParseNotification', () => {
    const boundary = 'xYzBoundary123';

    const input = (body: string, contentType = `multipart/form-data; boundary=${boundary}`): WebhookNotificationInput => ({
      Headers: { 'content-type': contentType },
      QueryParams: {},
      RawBody: body,
    });

    it('normalizes a realistic inbound email with inline Message populated', async () => {
      const body = buildMultipart(boundary, [
        { name: 'from', value: 'Alice <alice@sender.com>' },
        { name: 'to', value: 'support@parse.example.com' },
        { name: 'subject', value: 'Help please' },
        { name: 'text', value: 'This is the plain body.' },
        { name: 'html', value: '<p>This is the plain body.</p>' },
        { name: 'envelope', value: '{"to":["support@parse.example.com"],"from":"alice@sender.com"}' },
        { name: 'headers', value: 'Received: from mx...' },
      ]);

      const result = await provider.ParseNotification(input(body));

      expect(result.Success).toBe(true);
      expect(result.SuggestedResponseStatus).toBe(200);
      expect(result.SignatureValid).toBeUndefined();
      expect(result.Notifications).toHaveLength(1);

      const n = result.Notifications[0];
      expect(n.Kind).toBe('message');
      expect(n.ChangeType).toBe('created');
      expect(n.MessageIDs).toEqual([]);
      expect(n.Identifier).toBe('support@parse.example.com'); // from parsed envelope
      expect(n.Message).toBeDefined();
      expect(n.Message!.From).toBe('Alice <alice@sender.com>');
      expect(n.Message!.To).toBe('support@parse.example.com');
      expect(n.Message!.Subject).toBe('Help please');
      expect(n.Message!.Body).toBe('This is the plain body.'); // prefers text over html
      expect(n.Message!.ToRecipients).toEqual(['support@parse.example.com']);
      expect(n.Message!.CCRecipients).toEqual([]); // no cc field posted
      expect((n.RawData as Record<string, unknown>)['subject']).toBe('Help please');
    });

    it('populates ToRecipients/CCRecipients as bare addresses from multi-recipient to/cc fields', async () => {
      const body = buildMultipart(boundary, [
        { name: 'from', value: 'Assistant <assistant@sender.com>' },
        { name: 'to', value: 'support@parse.example.com, "Doe, Jane" <jane@member.org>' },
        { name: 'cc', value: 'Leader <leader@member.org>, staff@sender.com' },
        { name: 'subject', value: 'Multi-party thread' },
        { name: 'text', value: 'body' },
      ]);

      const result = await provider.ParseNotification(input(body));
      expect(result.Success).toBe(true);

      const message = result.Notifications[0].Message!;
      expect(message.To).toBe('support@parse.example.com, "Doe, Jane" <jane@member.org>'); // raw, unchanged
      expect(message.ToRecipients).toEqual(['support@parse.example.com', 'jane@member.org']);
      expect(message.CCRecipients).toEqual(['leader@member.org', 'staff@sender.com']);
    });

    it('falls back to the raw "to" field when envelope is absent', async () => {
      const body = buildMultipart(boundary, [
        { name: 'from', value: 'bob@sender.com' },
        { name: 'to', value: 'inbox@parse.example.com' },
        { name: 'subject', value: 'No envelope' },
        { name: 'text', value: 'body' },
      ]);
      const result = await provider.ParseNotification(input(body));
      expect(result.Notifications[0].Identifier).toBe('inbox@parse.example.com');
    });

    it('falls back to html body when text is absent', async () => {
      const body = buildMultipart(boundary, [
        { name: 'from', value: 'c@sender.com' },
        { name: 'to', value: 'x@parse.example.com' },
        { name: 'html', value: '<b>only html</b>' },
      ]);
      const result = await provider.ParseNotification(input(body));
      expect(result.Notifications[0].Message!.Body).toBe('<b>only html</b>');
    });

    it('counts attachment parts without decoding bytes', async () => {
      const body = buildMultipart(boundary, [
        { name: 'from', value: 'd@sender.com' },
        { name: 'to', value: 'y@parse.example.com' },
        { name: 'text', value: 'see attached' },
        { name: 'attachment1', value: 'RAWBYTESHERE', filename: 'photo.png' },
      ]);
      const result = await provider.ParseNotification(input(body));
      expect(result.Success).toBe(true);
      const raw = result.Notifications[0].RawData as Record<string, unknown>;
      expect(raw['attachmentCount']).toBe(1);
      expect(raw['attachment1']).toBeUndefined(); // bytes NOT captured as a field
    });

    it('honors a quoted boundary in the content-type header', async () => {
      const body = buildMultipart(boundary, [
        { name: 'from', value: 'e@sender.com' },
        { name: 'to', value: 'z@parse.example.com' },
        { name: 'text', value: 'quoted boundary' },
      ]);
      const result = await provider.ParseNotification(input(body, `multipart/form-data; boundary="${boundary}"`));
      expect(result.Success).toBe(true);
      expect(result.Notifications[0].Message!.Body).toBe('quoted boundary');
    });

    // ------------------- hostile / malformed inputs -------------------

    it('returns 400 (no throw) on an empty body', async () => {
      const result = await provider.ParseNotification(input(''));
      expect(result.Success).toBe(false);
      expect(result.SuggestedResponseStatus).toBe(400);
      expect(result.Notifications).toEqual([]);
    });

    it('returns 400 (no throw) when the boundary is missing from content-type', async () => {
      const result = await provider.ParseNotification({
        Headers: { 'content-type': 'multipart/form-data' },
        QueryParams: {},
        RawBody: '--x\r\nContent-Disposition: form-data; name="from"\r\n\r\na@b.com\r\n--x--',
      });
      expect(result.Success).toBe(false);
      expect(result.SuggestedResponseStatus).toBe(400);
    });

    it('returns 400 (no throw) on a plain-JSON (non-multipart) body', async () => {
      const result = await provider.ParseNotification({
        Headers: { 'content-type': 'application/json' },
        QueryParams: {},
        RawBody: '{"from":"a@b.com","to":"c@d.com"}',
      });
      expect(result.Success).toBe(false);
      expect(result.SuggestedResponseStatus).toBe(400);
      expect(result.Notifications).toEqual([]);
    });

    it('never throws on assorted hostile input', async () => {
      const cases: WebhookNotificationInput[] = [
        { Headers: {}, QueryParams: {}, RawBody: '' },
        { Headers: { 'content-type': 'multipart/form-data; boundary=b' }, QueryParams: {}, RawBody: 'garbage-no-parts' },
        { Headers: { 'content-type': 'multipart/form-data; boundary=b' }, QueryParams: {}, RawBody: '--b--' },
        { Headers: { 'content-type': 'text/plain' }, QueryParams: {}, RawBody: 'hello' },
      ];
      for (const c of cases) {
        const result = await provider.ParseNotification(c);
        expect(typeof result.Success).toBe('boolean');
        expect(Array.isArray(result.Notifications)).toBe(true);
      }
    });
  });
});
