/**
 * Unit tests for the MSGraph provider.
 * Tests: credential resolution, supported operations, email sending, error handling.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@memberjunction/communication-types', () => ({
  BaseCommunicationProvider: class {
    getSupportedOperations() { return []; }
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
    AZURE_CLIENT_ID: 'env-client-id',
    AZURE_CLIENT_SECRET: 'env-client-secret',
    AZURE_TENANT_ID: 'env-tenant-id',
    AZURE_ACCOUNT_EMAIL: 'test@example.com',
    AZURE_ACCOUNT_ID: 'env-user-id',
    AZURE_AAD_ENDPOINT: 'https://login.microsoftonline.com',
    AZURE_GRAPH_ENDPOINT: 'https://graph.microsoft.com',
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

// Mock @azure/identity
// NOTE: the implementation MUST be a regular function, not an arrow - MS Graph's auth
// path constructs `new ClientSecretCredential(...)`, and arrow functions cannot be used
// as constructors ("... is not a constructor").
vi.mock('@azure/identity', () => ({
  ClientSecretCredential: vi.fn().mockImplementation(function () {
    return { getToken: vi.fn().mockResolvedValue({ token: 'test-token' }) };
  }),
  ConfidentialClientApplication: vi.fn(),
}));

// Mock @microsoft/microsoft-graph-client
const { mockGraphApi } = vi.hoisted(() => ({
  mockGraphApi: vi.fn().mockReturnValue({
    post: vi.fn().mockResolvedValue({}),
    get: vi.fn().mockResolvedValue({ value: [] }),
    patch: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('@microsoft/microsoft-graph-client', () => ({
  Client: {
    initWithMiddleware: vi.fn().mockReturnValue({
      api: mockGraphApi,
    }),
  },
}));

vi.mock('@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials', () => ({
  // Regular function (not arrow) so `new TokenCredentialAuthenticationProvider(...)` works.
  TokenCredentialAuthenticationProvider: vi.fn().mockImplementation(function () {
    return {};
  }),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { MSGraphProvider } from '../MSGraphProvider';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MSGraphProvider', () => {
  let provider: Record<string, Function>;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new MSGraphProvider() as unknown as Record<string, Function>;
  });

  describe('getSupportedOperations', () => {
    it('should include core messaging operations', () => {
      const ops = provider.getSupportedOperations() as string[];
      expect(ops).toContain('SendSingleMessage');
      expect(ops).toContain('GetMessages');
    });
  });

  describe('GetMessages recipient extraction', () => {
    type NormalizedMessage = {
      To: string;
      ToRecipients: string[];
      CCRecipients: string[];
      ReplyTo: string[];
    };

    /**
     * Drives one Graph message resource through the public GetMessages() path.
     * GetMessages chains .filter().top().get(), so the api mock must be chainable;
     * mockReturnValueOnce keeps the default (non-chainable) api mock intact for other tests.
     */
    const getMessageFor = async (graphMessage: Record<string, unknown>): Promise<NormalizedMessage> => {
      const chain = {
        filter: vi.fn().mockReturnThis(),
        top: vi.fn().mockReturnThis(),
        get: vi.fn().mockResolvedValue({ value: [graphMessage] }),
      };
      mockGraphApi.mockReturnValueOnce(chain);

      const result = (await provider.GetMessages({ NumMessages: 1 })) as {
        Success: boolean;
        Messages: NormalizedMessage[];
      };
      expect(result.Success).toBe(true);
      expect(result.Messages).toHaveLength(1);
      return result.Messages[0];
    };

    it('populates ToRecipients and CCRecipients from the Graph recipient collections', async () => {
      const message = await getMessageFor({
        id: 'msg-1',
        conversationId: 'conv-1',
        subject: 'Hello',
        from: { emailAddress: { address: 'assistant@example.com' } },
        replyTo: [{ emailAddress: { address: 'assistant@example.com' } }],
        toRecipients: [
          { emailAddress: { address: 'us@example.org' } },
          { emailAddress: { address: 'other@example.com' } },
        ],
        ccRecipients: [{ emailAddress: { address: 'leader@example.com' } }],
        body: { content: 'body' },
      });
      expect(message.ToRecipients).toEqual(['us@example.org', 'other@example.com']);
      expect(message.CCRecipients).toEqual(['leader@example.com']);
      // Legacy To keeps its historical replyTo[0] behavior — deliberately unchanged.
      expect(message.To).toBe('assistant@example.com');
    });

    it('returns empty arrays when recipient collections are absent and drops address-less entries', async () => {
      const message = await getMessageFor({
        id: 'msg-2',
        conversationId: 'conv-1',
        subject: 'Hello',
        from: { emailAddress: { address: 'assistant@example.com' } },
        toRecipients: [{ emailAddress: {} }],
        body: { content: 'body' },
      });
      expect(message.ToRecipients).toEqual([]);
      expect(message.CCRecipients).toEqual([]);
    });
  });

  describe('credential resolution', () => {
    it('should return failure when required credentials are missing with fallback disabled', async () => {
      const message = {
        From: 'sender@example.com',
        To: 'recipient@example.com',
        ProcessedSubject: 'Test',
        ProcessedBody: 'Body',
        ProcessedHTMLBody: '',
        CCRecipients: [],
        BCCRecipients: [],
        ContextData: {},
      };

      const result = await provider.SendSingleMessage(message, { disableEnvironmentFallback: true }) as Record<string, unknown>;
      expect(result.Success).toBe(false);
    });
  });

  describe('CreateDraft', () => {
    it('should be a function on the provider', () => {
      expect(typeof provider.CreateDraft).toBe('function');
    });
  });

  // -------------------------------------------------------------------------
  // Push-notification subscriptions
  // -------------------------------------------------------------------------

  // Builds a Graph client chain object and wires the hoisted api() mock to return it,
  // so tests can inspect the post/patch/delete payloads and stub responses.
  const wireChain = (overrides: Record<string, ReturnType<typeof vi.fn>> = {}) => {
    const chain = {
      post: vi.fn().mockResolvedValue({}),
      get: vi.fn().mockResolvedValue({ value: [] }),
      patch: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue(undefined),
      filter: vi.fn(),
      ...overrides,
    };
    // filter() is chainable (returns the same object) for findSystemFolder's search path.
    chain.filter.mockReturnValue(chain);
    mockGraphApi.mockReturnValue(chain);
    return chain;
  };

  describe('getSupportedOperations (subscriptions)', () => {
    it('includes the four subscription operations', () => {
      const ops = provider.getSupportedOperations() as string[];
      expect(ops).toContain('CreateSubscription');
      expect(ops).toContain('RenewSubscription');
      expect(ops).toContain('DeleteSubscription');
      expect(ops).toContain('ParseNotification');
    });

    it('capability invariant: capabilities defined IFF ops present', () => {
      const caps = provider.GetSubscriptionCapabilities();
      const ops = provider.getSupportedOperations() as string[];
      const subOps = ['CreateSubscription', 'RenewSubscription', 'DeleteSubscription', 'ParseNotification'];
      const allPresent = subOps.every((op) => ops.includes(op));
      expect(caps !== undefined).toBe(allPresent);
    });
  });

  describe('GetSubscriptionCapabilities', () => {
    it('matches the Graph mail spec', () => {
      const caps = provider.GetSubscriptionCapabilities();
      expect(caps).toEqual({
        MaxLifetimeMinutes: 4230,
        SupportedChangeTypes: ['created', 'updated', 'deleted'],
        RequiresEndpointValidation: true,
        SupportsSubscriptionManagement: true,
        DeliversPayloadInline: false,
      });
    });
  });

  describe('CreateSubscription', () => {
    const baseParams = () => ({
      ChangeTypes: ['created'],
      NotificationUrl: 'https://api.example.com/hook',
      ClientState: 'secret-123',
      Identifier: 'support@customer.org',
    });

    it('posts to AZURE_GRAPH_ENDPOINT root /v1.0/subscriptions with default inbox and no extra calls', async () => {
      const chain = wireChain({ post: vi.fn().mockResolvedValue({ id: 'sub-1', expirationDateTime: '2026-07-25T00:00:00Z' }) });
      const result = await provider.CreateSubscription(baseParams());

      expect(result.Success).toBe(true);
      expect(result.SubscriptionID).toBe('sub-1');
      expect(result.ExpiresAt).toEqual(new Date('2026-07-25T00:00:00Z'));

      // URL is the Graph root, not users-rooted, not bare relative.
      expect(mockGraphApi).toHaveBeenCalledWith('https://graph.microsoft.com/v1.0/subscriptions');
      // No folder-resolution call for well-known 'inbox'.
      expect(chain.get).not.toHaveBeenCalled();

      const body = chain.post.mock.calls[0][0];
      expect(body.changeType).toBe('created');
      expect(body.notificationUrl).toBe('https://api.example.com/hook');
      expect(body.clientState).toBe('secret-123');
      expect(body.resource).toBe("/users/support@customer.org/mailFolders('inbox')/messages");
      expect(typeof body.expirationDateTime).toBe('string');
    });

    it('falls back to creds.accountEmail when Identifier is empty', async () => {
      const chain = wireChain({ post: vi.fn().mockResolvedValue({ id: 'sub-fb' }) });
      await provider.CreateSubscription({ ...baseParams(), Identifier: '' });
      // Empty string must NOT produce /users//... - falls back to the env account email.
      expect(chain.post.mock.calls[0][0].resource).toBe("/users/test@example.com/mailFolders('inbox')/messages");
    });

    it('passes a well-known folder name (sent) through with no resolution call', async () => {
      const chain = wireChain({ post: vi.fn().mockResolvedValue({ id: 'sub-2' }) });
      await provider.CreateSubscription({ ...baseParams(), ContextData: { folderName: 'sent' } });
      expect(chain.get).not.toHaveBeenCalled();
      expect(chain.post.mock.calls[0][0].resource).toBe("/users/support@customer.org/mailFolders('sentitems')/messages");
    });

    it('uses ContextData.folderId verbatim as an escape hatch (no resolution call)', async () => {
      const chain = wireChain({ post: vi.fn().mockResolvedValue({ id: 'sub-3' }) });
      await provider.CreateSubscription({ ...baseParams(), ContextData: { folderId: 'AAMkCustomId' } });
      expect(chain.get).not.toHaveBeenCalled();
      expect(chain.post.mock.calls[0][0].resource).toBe("/users/support@customer.org/mailFolders('AAMkCustomId')/messages");
    });

    it('resolves a custom display-name folder to an ID via findSystemFolder', async () => {
      const chain = wireChain({
        get: vi.fn().mockResolvedValue({ id: 'AAMkResolved' }),
        post: vi.fn().mockResolvedValue({ id: 'sub-4' }),
      });
      await provider.CreateSubscription({ ...baseParams(), ContextData: { folderName: 'Support Cases' } });
      expect(chain.get).toHaveBeenCalled();
      expect(chain.post.mock.calls[0][0].resource).toBe("/users/support@customer.org/mailFolders('AAMkResolved')/messages");
    });

    it('fails when a custom folder cannot be resolved', async () => {
      wireChain({
        get: vi.fn().mockResolvedValue({ value: [] }), // no id, no search match
        post: vi.fn().mockResolvedValue({ id: 'should-not-happen' }),
      });
      const result = await provider.CreateSubscription({ ...baseParams(), ContextData: { folderName: 'Nonexistent' } });
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toContain('Could not resolve folder');
    });

    it('clamps expiration to 4230 minutes when requested too far out', async () => {
      const chain = wireChain({ post: vi.fn().mockResolvedValue({ id: 'sub-5' }) });
      const farFuture = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
      await provider.CreateSubscription({ ...baseParams(), RequestedExpiration: farFuture });
      const sent = new Date(chain.post.mock.calls[0][0].expirationDateTime).getTime();
      const maxAllowed = Date.now() + 4230 * 60 * 1000;
      expect(sent).toBeLessThanOrEqual(maxAllowed + 1000);
      expect(sent).toBeLessThan(farFuture.getTime());
    });

    it('fail-fast: rejects empty ClientState without touching Graph', async () => {
      const chain = wireChain();
      const result = await provider.CreateSubscription({ ...baseParams(), ClientState: '' });
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toContain('ClientState');
      expect(chain.post).not.toHaveBeenCalled();
    });

    it('fail-fast: rejects ClientState over 128 chars without touching Graph', async () => {
      const chain = wireChain();
      const result = await provider.CreateSubscription({ ...baseParams(), ClientState: 'x'.repeat(129) });
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toContain('128');
      expect(chain.post).not.toHaveBeenCalled();
    });

    it('fail-fast: rejects non-https NotificationUrl without touching Graph', async () => {
      const chain = wireChain();
      const result = await provider.CreateSubscription({ ...baseParams(), NotificationUrl: 'http://insecure.example.com/hook' });
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toContain('https');
      expect(chain.post).not.toHaveBeenCalled();
    });

    it('surfaces a Graph error in ErrorMessage', async () => {
      wireChain({ post: vi.fn().mockRejectedValue(new Error('Endpoint validation failed')) });
      const result = await provider.CreateSubscription(baseParams());
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toContain('Endpoint validation failed');
    });
  });

  describe('RenewSubscription', () => {
    it('PATCHes a clamped expiration and returns the new expiration', async () => {
      const chain = wireChain({ patch: vi.fn().mockResolvedValue({ id: 'sub-1', expirationDateTime: '2026-07-25T00:00:00Z' }) });
      const result = await provider.RenewSubscription({ SubscriptionID: 'sub-1' });
      expect(result.Success).toBe(true);
      expect(result.ExpiresAt).toEqual(new Date('2026-07-25T00:00:00Z'));
      expect(mockGraphApi).toHaveBeenCalledWith('https://graph.microsoft.com/v1.0/subscriptions/sub-1');
      expect(typeof chain.patch.mock.calls[0][0].expirationDateTime).toBe('string');
    });

    it('returns a debuggable failure on 404 (expired or wrong credentials)', async () => {
      wireChain({ patch: vi.fn().mockRejectedValue({ statusCode: 404 }) });
      const result = await provider.RenewSubscription({ SubscriptionID: 'gone' });
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toContain('expired or created under different credentials');
    });
  });

  describe('DeleteSubscription', () => {
    it('DELETEs and returns success', async () => {
      const chain = wireChain();
      const result = await provider.DeleteSubscription({ SubscriptionID: 'sub-1' });
      expect(result.Success).toBe(true);
      expect(chain.delete).toHaveBeenCalled();
      expect(mockGraphApi).toHaveBeenCalledWith('https://graph.microsoft.com/v1.0/subscriptions/sub-1');
    });

    it('treats a 404 as success (idempotent delete)', async () => {
      wireChain({ delete: vi.fn().mockRejectedValue({ statusCode: 404 }) });
      const result = await provider.DeleteSubscription({ SubscriptionID: 'already-gone' });
      expect(result.Success).toBe(true);
    });
  });

  describe('ParseNotification', () => {
    it('returns a handshake for a validationToken (no decoding)', async () => {
      const result = await provider.ParseNotification({
        Headers: {},
        QueryParams: { validationToken: 'abc%2B123' },
        RawBody: '',
      });
      expect(result.Success).toBe(true);
      expect(result.Handshake).toEqual({
        ResponseStatus: 200,
        ResponseBody: 'abc%2B123', // verbatim - not decoded
        ResponseContentType: 'text/plain',
      });
      expect(result.Notifications).toEqual([]);
      expect(result.SuggestedResponseStatus).toBe(200);
    });

    it('normalizes a well-formed message notification', async () => {
      const body = JSON.stringify({
        value: [{
          subscriptionId: 'sub-1',
          clientState: 'secret-123',
          changeType: 'created',
          resource: "Users/support@customer.org/Messages/AAMkMsgId",
          resourceData: { id: 'AAMkMsgId' },
        }],
      });
      const result = await provider.ParseNotification({ Headers: {}, QueryParams: {}, RawBody: body });
      expect(result.Success).toBe(true);
      expect(result.SuggestedResponseStatus).toBe(202);
      expect(result.SignatureValid).toBeUndefined();
      expect(result.Notifications).toHaveLength(1);
      const n = result.Notifications[0];
      expect(n.Kind).toBe('message');
      expect(n.SubscriptionID).toBe('sub-1');
      expect(n.ClientState).toBe('secret-123');
      expect(n.ChangeType).toBe('created');
      expect(n.MessageIDs).toEqual(['AAMkMsgId']);
      expect(n.Identifier).toBe('support@customer.org');
    });

    it('parses the Identifier from the mailFolders-shaped resource, case-insensitively', async () => {
      const body = JSON.stringify({
        value: [{
          subscriptionId: 'sub-2',
          resource: "users/abc-123-guid/mailFolders('inbox')/messages/AAMk",
          resourceData: { id: 'AAMk' },
        }],
      });
      const result = await provider.ParseNotification({ Headers: {}, QueryParams: {}, RawBody: body });
      expect(result.Notifications[0].Identifier).toBe('abc-123-guid');
    });

    it('maps lifecycle events to Kind=lifecycle', async () => {
      const body = JSON.stringify({
        value: [{ subscriptionId: 'sub-1', lifecycleEvent: 'reauthorizationRequired' }],
      });
      const result = await provider.ParseNotification({ Headers: {}, QueryParams: {}, RawBody: body });
      expect(result.Notifications[0].Kind).toBe('lifecycle');
      expect(result.Notifications[0].LifecycleEvent).toBe('reauthorizationRequired');
      expect(result.Notifications[0].MessageIDs).toEqual([]);
    });

    it('produces one NormalizedNotification per value[] item', async () => {
      const body = JSON.stringify({
        value: [
          { subscriptionId: 's1', changeType: 'created', resourceData: { id: 'm1' } },
          { subscriptionId: 's2', changeType: 'updated', resourceData: { id: 'm2' } },
        ],
      });
      const result = await provider.ParseNotification({ Headers: {}, QueryParams: {}, RawBody: body });
      expect(result.Notifications).toHaveLength(2);
      expect(result.Notifications.map((n: { MessageIDs: string[] }) => n.MessageIDs[0])).toEqual(['m1', 'm2']);
    });

    it('returns failure (400) on malformed JSON, never throwing', async () => {
      const result = await provider.ParseNotification({ Headers: {}, QueryParams: {}, RawBody: '{not json' });
      expect(result.Success).toBe(false);
      expect(result.SuggestedResponseStatus).toBe(400);
      expect(result.Notifications).toEqual([]);
    });

    it('returns failure (400) when value[] is missing', async () => {
      const result = await provider.ParseNotification({ Headers: {}, QueryParams: {}, RawBody: '{"foo":"bar"}' });
      expect(result.Success).toBe(false);
      expect(result.SuggestedResponseStatus).toBe(400);
    });

    it('never throws on hostile/garbage input (fuzz-ish)', async () => {
      const garbage = ['', '[]', 'null', 'true', '"a string"', '{"value":null}', '{"value":42}', ' ', '{"value":[null,42,"x"]}'];
      for (const raw of garbage) {
        const result = await provider.ParseNotification({ Headers: {}, QueryParams: {}, RawBody: raw });
        expect(typeof result.Success).toBe('boolean');
        expect(Array.isArray(result.Notifications)).toBe(true);
      }
    });
  });
});
