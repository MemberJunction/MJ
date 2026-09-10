/**
 * Unit tests for the SendGrid provider.
 * Tests: email construction, parameter mapping, error handling, unsupported operations.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

vi.mock('@memberjunction/communication-types', async () => ({
  // Real address-list parser (pure module) — the provider imports it by name, and Vitest
  // rejects named imports missing from a mock factory even when the test never calls them.
  ...(await vi.importActual<{ ParseEmailAddressList: (headerValue: string | null | undefined) => string[] }>(
    '../../../../base-types/src/AddressUtils'
  )),
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

// The config.ts module reads from process.env, let's mock it
vi.mock('../config', () => ({
  __API_KEY: 'env-sendgrid-key',
}));

const drainResponseBodyMock = vi.fn();

vi.mock('@memberjunction/network-utils', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/network-utils');
  return {
    ...actual,
    DrainResponseBody: (...args: unknown[]) => drainResponseBodyMock(...args),
  };
});

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { SendGridProvider } from '../SendGridProvider';
import type { ProcessedMessage } from '@memberjunction/communication-types';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SendGridProvider', () => {
  let provider: SendGridProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    drainResponseBodyMock.mockReset();
    provider = new SendGridProvider();
  });

  describe('getSupportedOperations', () => {
    it('should support SendSingleMessage plus the Inbound Parse operations', () => {
      const ops = provider.getSupportedOperations();
      expect(ops).toEqual(['SendSingleMessage', 'CreateSubscription', 'DeleteSubscription', 'ParseNotification']);
    });
  });

  describe('SendSingleMessage', () => {
    const createMessage = (overrides: Partial<ProcessedMessage> = {}): ProcessedMessage => ({
      From: 'sender@example.com',
      FromName: 'Test Sender',
      To: 'recipient@example.com',
      CCRecipients: ['cc@example.com'],
      BCCRecipients: ['bcc@example.com'],
      ProcessedSubject: 'Test Email',
      ProcessedBody: 'Plain text body',
      ProcessedHTMLBody: '<p>HTML body</p>',
      SendAt: undefined,
      Headers: {},
      ContextData: {},
      ...overrides,
    } as unknown as ProcessedMessage);

    it('should send email successfully', async () => {
      mockSgSend.mockResolvedValue([{ statusCode: 202, body: 'Accepted' }]);

      const result = await provider.SendSingleMessage(createMessage());

      expect(result.Success).toBe(true);
      expect(result.Error).toBe('');
      expect(mockSetApiKey).toHaveBeenCalledWith('env-sendgrid-key');
      expect(mockSgSend).toHaveBeenCalledWith(expect.objectContaining({
        to: 'recipient@example.com',
        from: { email: 'sender@example.com', name: 'Test Sender' },
        cc: ['cc@example.com'],
        bcc: ['bcc@example.com'],
        subject: 'Test Email',
        text: 'Plain text body',
        html: '<p>HTML body</p>',
      }));
    });

    it('should disable subscription tracking', async () => {
      mockSgSend.mockResolvedValue([{ statusCode: 202, body: '' }]);

      await provider.SendSingleMessage(createMessage());

      expect(mockSgSend).toHaveBeenCalledWith(expect.objectContaining({
        trackingSettings: {
          subscriptionTracking: { enable: false },
        },
      }));
    });

    it('should convert SendAt to unix timestamp', async () => {
      const sendAt = new Date('2025-06-15T12:00:00Z');
      mockSgSend.mockResolvedValue([{ statusCode: 202, body: '' }]);

      await provider.SendSingleMessage(createMessage({ SendAt: sendAt } as unknown as Partial<ProcessedMessage>));

      expect(mockSgSend).toHaveBeenCalledWith(expect.objectContaining({
        sendAt: Math.floor(sendAt.getTime() / 1000),
      }));
    });

    it('should handle API errors gracefully', async () => {
      mockSgSend.mockRejectedValue(new Error('Bad Request'));

      const result = await provider.SendSingleMessage(createMessage());

      expect(result.Success).toBe(false);
      expect(result.Error).toContain('Bad Request');
    });

    it('should handle non-success status codes', async () => {
      mockSgSend.mockResolvedValue([{ statusCode: 400, body: 'Invalid', toString: () => 'Error 400' }]);

      const result = await provider.SendSingleMessage(createMessage());

      expect(result.Success).toBe(false);
    });

    it('should use per-request credentials when provided', async () => {
      mockSgSend.mockResolvedValue([{ statusCode: 202, body: '' }]);

      await provider.SendSingleMessage(createMessage(), {
        apiKey: 'SG.custom-key',
      });

      expect(mockSetApiKey).toHaveBeenCalledWith('SG.custom-key');
    });
  });

  describe('DeleteSubscription — response body draining (memory-leak regression)', () => {
    /**
     * A failed Inbound Parse delete already read `resp.text()` before this fix — the leak was
     * on the two SUCCESS branches (`resp.ok` or 404-already-gone), which returned immediately
     * without ever consuming the response body. Under Node's native `fetch` (undici), that
     * pins the connection out of the keep-alive pool until GC finalizes it.
     */
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('drains the response body on a successful delete', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK', text: async () => '' }) as unknown as typeof fetch;

      const result = await provider.DeleteSubscription({ SubscriptionID: 'parse.example.com' });

      expect(result.Success).toBe(true);
      expect(drainResponseBodyMock).toHaveBeenCalledTimes(1);
    });

    it('drains the response body when the mapping is already gone (404, idempotent success)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found', text: async () => '' }) as unknown as typeof fetch;

      const result = await provider.DeleteSubscription({ SubscriptionID: 'parse.example.com' });

      expect(result.Success).toBe(true);
      expect(drainResponseBodyMock).toHaveBeenCalledTimes(1);
    });

    it('does not double-drain on a genuine failure — the error branch reads the body itself', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Server Error', text: async () => 'boom' }) as unknown as typeof fetch;

      const result = await provider.DeleteSubscription({ SubscriptionID: 'parse.example.com' });

      expect(result.Success).toBe(false);
      expect(drainResponseBodyMock).not.toHaveBeenCalled();
    });
  });

  describe('unsupported operations', () => {
    it('GetMessages should throw', async () => {
      await expect(
        provider.GetMessages({} as Parameters<typeof provider.GetMessages>[0])
      ).rejects.toThrow('does not support fetching messages');
    });

    it('ForwardMessage should throw', () => {
      expect(
        () => provider.ForwardMessage({} as Parameters<typeof provider.ForwardMessage>[0])
      ).toThrow('does not support forwarding');
    });

    it('ReplyToMessage should throw', () => {
      expect(
        () => provider.ReplyToMessage({} as Parameters<typeof provider.ReplyToMessage>[0])
      ).toThrow('does not support replying');
    });

    it('CreateDraft should return failure', async () => {
      const result = await provider.CreateDraft({} as Parameters<typeof provider.CreateDraft>[0]);
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toContain('does not support');
    });
  });
});
