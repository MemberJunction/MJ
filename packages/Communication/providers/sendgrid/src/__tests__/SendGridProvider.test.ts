/**
 * Unit tests for the SendGrid provider.
 * Tests: email construction, parameter mapping, error handling, unsupported operations.
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
    provider = new SendGridProvider();
  });

  describe('getSupportedOperations', () => {
    it('should only support SendSingleMessage', () => {
      const ops = provider.getSupportedOperations();
      expect(ops).toEqual(['SendSingleMessage']);
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
