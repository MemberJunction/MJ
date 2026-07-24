/**
 * Unit tests for the Gmail provider's push-notification subscription support.
 * Tests: supported operations, SupportsPush, capabilities, CreateSubscription,
 * DeleteSubscription (idempotent), and the pure ParseNotification parser.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks (mirror GmailProvider.test.ts)
// ---------------------------------------------------------------------------

vi.mock('@memberjunction/communication-types', () => ({
  BaseCommunicationProvider: class {
    getSupportedOperations() { return []; }
    // SupportsPush derives from GetSubscriptionCapabilities() in the real base class;
    // replicate that here so the test exercises the same derivation.
    get SupportsPush() { return this.GetSubscriptionCapabilities() !== undefined; }
    GetSubscriptionCapabilities() { return undefined; }
  },
  resolveCredentialValue: (requestVal: string | undefined, envVal: string | undefined, disableFallback: boolean) => {
    if (requestVal) return requestVal;
    if (!disableFallback && envVal) return envVal;
    return undefined;
  },
  validateRequiredCredentials: (creds: Record<string, unknown>, required: string[], provider: string) => {
    for (const key of required) {
      if (!creds[key]) {
        throw new Error(`${provider}: Missing required credential: ${key}`);
      }
    }
  },
}));

vi.mock('@memberjunction/global', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/global')>();
  return {
    ...actual,
    RegisterClass: () => (target: unknown) => target,
  };
});

vi.mock('@memberjunction/core', () => ({
  LogError: vi.fn(),
  LogStatus: vi.fn(),
}));

vi.mock('env-var', () => {
  const envMap: Record<string, string> = {
    GMAIL_CLIENT_ID: 'env-client-id',
    GMAIL_CLIENT_SECRET: 'env-client-secret',
    GMAIL_REDIRECT_URI: 'http://localhost:3000/callback',
    GMAIL_REFRESH_TOKEN: 'env-refresh-token',
    GMAIL_SERVICE_ACCOUNT_EMAIL: 'service@example.com',
  };
  return {
    default: {
      get: (key: string) => ({
        default: (def: string) => ({
          asString: () => envMap[key] ?? def,
        }),
      }),
    },
  };
});

vi.mock('dotenv', () => ({
  default: { config: vi.fn() },
}));

const { mockWatch, mockStop } = vi.hoisted(() => ({
  mockWatch: vi.fn(),
  mockStop: vi.fn(),
}));

vi.mock('googleapis', () => {
  class FakeOAuth2 {
    setCredentials = vi.fn();
  }
  return {
    default: {
      google: {
        auth: {
          OAuth2: FakeOAuth2,
        },
        gmail: vi.fn().mockReturnValue({
          users: {
            getProfile: vi.fn().mockResolvedValue({ data: { emailAddress: 'test@gmail.com' } }),
            watch: mockWatch,
            stop: mockStop,
            messages: {
              send: vi.fn(),
              list: vi.fn(),
              get: vi.fn(),
              modify: vi.fn().mockResolvedValue({}),
              trash: vi.fn().mockResolvedValue({}),
              delete: vi.fn().mockResolvedValue({}),
            },
            labels: {
              list: vi.fn().mockResolvedValue({ data: { labels: [] } }),
            },
            drafts: {
              create: vi.fn().mockResolvedValue({ status: 200, data: { id: 'draft-1' } }),
            },
          },
        }),
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { GmailProvider } from '../GmailProvider';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a valid Gmail Pub/Sub push envelope with the given inner payload. */
const buildEnvelope = (inner: unknown): string => {
  const data = Buffer.from(JSON.stringify(inner), 'utf-8').toString('base64');
  return JSON.stringify({
    message: { data, messageId: 'msg-abc', publishTime: '2026-07-24T00:00:00Z' },
    subscription: 'projects/proj/subscriptions/sub',
  });
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GmailProvider push-notification subscriptions', () => {
  let provider: GmailProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new GmailProvider();
  });

  describe('getSupportedOperations (subscriptions)', () => {
    it('includes the four subscription operations', () => {
      const ops = provider.getSupportedOperations();
      expect(ops).toContain('CreateSubscription');
      expect(ops).toContain('RenewSubscription');
      expect(ops).toContain('DeleteSubscription');
      expect(ops).toContain('ParseNotification');
    });

    it('capability invariant: capabilities defined IFF the four ops are present', () => {
      const caps = provider.GetSubscriptionCapabilities();
      const ops = provider.getSupportedOperations();
      const subOps = ['CreateSubscription', 'RenewSubscription', 'DeleteSubscription', 'ParseNotification'];
      const allPresent = subOps.every((op) => ops.includes(op as never));
      expect(caps !== undefined).toBe(allPresent);
    });
  });

  describe('SupportsPush', () => {
    it('is true because the provider returns capabilities', () => {
      expect(provider.SupportsPush).toBe(true);
    });
  });

  describe('GetSubscriptionCapabilities', () => {
    it('matches the Gmail watch spec', () => {
      const caps = provider.GetSubscriptionCapabilities();
      expect(caps).toEqual({
        MaxLifetimeMinutes: 10080,
        SupportedChangeTypes: ['created'],
        RequiresEndpointValidation: false,
        SupportsSubscriptionManagement: true,
        DeliversPayloadInline: false,
      });
    });
  });

  describe('CreateSubscription', () => {
    const topicName = 'projects/my-proj/topics/gmail-push';

    it('calls users.watch with the topic + default INBOX label and returns userId + expiration', async () => {
      const expiration = String(Date.now() + 7 * 24 * 60 * 60 * 1000);
      mockWatch.mockResolvedValue({ data: { historyId: '12345', expiration } });

      const result = await provider.CreateSubscription({
        Identifier: 'watched@example.com',
        ChangeTypes: ['created'],
        NotificationUrl: '', // Gmail does not require a URL (Pub/Sub delivery)
        ClientState: '',
        ContextData: { topicName },
      });

      expect(result.Success).toBe(true);
      // Gmail has no service-side subscription ID; the mailbox userId identifies the watch.
      expect(result.SubscriptionID).toBe('watched@example.com');
      expect(result.ExpiresAt).toEqual(new Date(Number(expiration)));

      expect(mockWatch).toHaveBeenCalledTimes(1);
      const call = mockWatch.mock.calls[0][0];
      expect(call.userId).toBe('watched@example.com');
      expect(call.requestBody.topicName).toBe(topicName);
      expect(call.requestBody.labelIds).toEqual(['INBOX']);
    });

    it('defaults userId to "me" when no Identifier is provided', async () => {
      mockWatch.mockResolvedValue({ data: { historyId: '1', expiration: '1000' } });
      const result = await provider.CreateSubscription({
        ChangeTypes: ['created'],
        NotificationUrl: '',
        ClientState: '',
        ContextData: { topicName },
      });
      expect(result.Success).toBe(true);
      expect(result.SubscriptionID).toBe('me');
      expect(mockWatch.mock.calls[0][0].userId).toBe('me');
    });

    it('passes custom labelIds and labelFilterBehavior through', async () => {
      mockWatch.mockResolvedValue({ data: { historyId: '1', expiration: '1000' } });
      await provider.CreateSubscription({
        ChangeTypes: ['created'],
        NotificationUrl: '',
        ClientState: '',
        ContextData: { topicName, labelIds: ['INBOX', 'IMPORTANT'], labelFilterBehavior: 'include' },
      });
      const body = mockWatch.mock.calls[0][0].requestBody;
      expect(body.labelIds).toEqual(['INBOX', 'IMPORTANT']);
      expect(body.labelFilterBehavior).toBe('include');
    });

    it('fail-fast: rejects a missing Pub/Sub topic without touching Gmail', async () => {
      const result = await provider.CreateSubscription({
        Identifier: 'watched@example.com',
        ChangeTypes: ['created'],
        NotificationUrl: '',
        ClientState: '',
        ContextData: {},
      });
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toContain('topicName');
      expect(mockWatch).not.toHaveBeenCalled();
    });

    it('surfaces a Gmail error in ErrorMessage', async () => {
      mockWatch.mockRejectedValue(new Error('Insufficient permission on topic'));
      const result = await provider.CreateSubscription({
        ChangeTypes: ['created'],
        NotificationUrl: '',
        ClientState: '',
        ContextData: { topicName },
      });
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toContain('Insufficient permission on topic');
    });
  });

  describe('RenewSubscription', () => {
    it('re-issues users.watch for the SubscriptionID mailbox', async () => {
      mockWatch.mockResolvedValue({ data: { historyId: '99', expiration: '2000' } });
      const result = await provider.RenewSubscription({
        SubscriptionID: 'watched@example.com',
        ContextData: { topicName: 'projects/p/topics/t' },
      });
      expect(result.Success).toBe(true);
      expect(result.SubscriptionID).toBe('watched@example.com');
      expect(mockWatch.mock.calls[0][0].userId).toBe('watched@example.com');
    });

    it('fail-fast: rejects a missing topic', async () => {
      const result = await provider.RenewSubscription({ SubscriptionID: 'me', ContextData: {} });
      expect(result.Success).toBe(false);
      expect(mockWatch).not.toHaveBeenCalled();
    });
  });

  describe('DeleteSubscription', () => {
    it('calls users.stop and returns success', async () => {
      mockStop.mockResolvedValue({});
      const result = await provider.DeleteSubscription({ SubscriptionID: 'watched@example.com' });
      expect(result.Success).toBe(true);
      expect(mockStop).toHaveBeenCalledWith({ userId: 'watched@example.com' });
    });

    it('treats a 404 as success (idempotent delete)', async () => {
      mockStop.mockRejectedValue({ code: 404 });
      const result = await provider.DeleteSubscription({ SubscriptionID: 'already-gone' });
      expect(result.Success).toBe(true);
    });

    it('treats a response.status 404 as success', async () => {
      mockStop.mockRejectedValue({ response: { status: 404 } });
      const result = await provider.DeleteSubscription({ SubscriptionID: 'already-gone' });
      expect(result.Success).toBe(true);
    });

    it('surfaces a non-404 error as failure', async () => {
      mockStop.mockRejectedValue(new Error('boom'));
      const result = await provider.DeleteSubscription({ SubscriptionID: 'x' });
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toContain('boom');
    });
  });

  describe('ParseNotification', () => {
    it('normalizes a well-formed Pub/Sub envelope (HINT-mode, empty MessageIDs)', async () => {
      const inner = { emailAddress: 'watched@example.com', historyId: 987654 };
      const result = await provider.ParseNotification({
        Headers: {},
        QueryParams: {},
        RawBody: buildEnvelope(inner),
      });

      expect(result.Success).toBe(true);
      expect(result.SuggestedResponseStatus).toBe(204);
      expect(result.SignatureValid).toBeUndefined();
      expect(result.Notifications).toHaveLength(1);
      const n = result.Notifications[0];
      expect(n.Kind).toBe('message');
      expect(n.Identifier).toBe('watched@example.com');
      expect(n.ChangeType).toBe('created');
      expect(n.MessageIDs).toEqual([]);
      expect(n.Message).toBeUndefined(); // HINT-mode: never inline
      expect(n.RawData).toEqual(inner);
    });

    it('accepts a string historyId', async () => {
      const result = await provider.ParseNotification({
        Headers: {},
        QueryParams: {},
        RawBody: buildEnvelope({ emailAddress: 'a@b.com', historyId: '42' }),
      });
      expect(result.Success).toBe(true);
      expect(result.Notifications[0].Identifier).toBe('a@b.com');
    });

    it('returns failure (400) on an empty body, never throwing', async () => {
      const result = await provider.ParseNotification({ Headers: {}, QueryParams: {}, RawBody: '' });
      expect(result.Success).toBe(false);
      expect(result.SuggestedResponseStatus).toBe(400);
      expect(result.Notifications).toEqual([]);
    });

    it('returns failure (400) on non-JSON body', async () => {
      const result = await provider.ParseNotification({ Headers: {}, QueryParams: {}, RawBody: '{not json' });
      expect(result.Success).toBe(false);
      expect(result.SuggestedResponseStatus).toBe(400);
    });

    it('returns failure (400) when message.data is missing', async () => {
      const result = await provider.ParseNotification({
        Headers: {},
        QueryParams: {},
        RawBody: JSON.stringify({ message: {}, subscription: 's' }),
      });
      expect(result.Success).toBe(false);
      expect(result.SuggestedResponseStatus).toBe(400);
      expect(result.ErrorMessage).toContain('message.data');
    });

    it('returns failure (400) when message.data is not valid base64-encoded JSON', async () => {
      // '@@@@' decodes to bytes that are not valid JSON -> inner JSON.parse throws.
      const result = await provider.ParseNotification({
        Headers: {},
        QueryParams: {},
        RawBody: JSON.stringify({ message: { data: '@@@@@@@@' }, subscription: 's' }),
      });
      expect(result.Success).toBe(false);
      expect(result.SuggestedResponseStatus).toBe(400);
    });

    it('returns failure (400) when decoded payload is missing emailAddress', async () => {
      const result = await provider.ParseNotification({
        Headers: {},
        QueryParams: {},
        RawBody: buildEnvelope({ historyId: 5 }),
      });
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toContain('emailAddress');
    });

    it('returns failure (400) when decoded payload is missing historyId', async () => {
      const result = await provider.ParseNotification({
        Headers: {},
        QueryParams: {},
        RawBody: buildEnvelope({ emailAddress: 'a@b.com' }),
      });
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toContain('historyId');
    });

    it('never throws on hostile/garbage input (fuzz-ish)', async () => {
      const garbage = ['', '[]', 'null', 'true', '"a string"', '{"message":null}', '{"message":42}', ' ', '{"message":{"data":123}}'];
      for (const raw of garbage) {
        const result = await provider.ParseNotification({ Headers: {}, QueryParams: {}, RawBody: raw });
        expect(typeof result.Success).toBe('boolean');
        expect(Array.isArray(result.Notifications)).toBe(true);
        expect(result.SuggestedResponseStatus).toBe(400);
      }
    });
  });
});
