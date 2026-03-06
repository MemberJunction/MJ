/**
 * Unit tests for the Twilio provider.
 * Tests: SMS construction, channel detection, credential resolution, error handling.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockMessagesCreate, mockMessagesList, mockMessageFetch } = vi.hoisted(() => ({
  mockMessagesCreate: vi.fn(),
  mockMessagesList: vi.fn(),
  mockMessageFetch: vi.fn(),
}));

// Mock dotenv
vi.mock('dotenv', () => ({
  default: { config: vi.fn() },
}));

// Mock config.ts directly to avoid dotenv import issues
vi.mock('../config', () => ({
  TWILIO_ACCOUNT_SID: 'test-account-sid',
  TWILIO_AUTH_TOKEN: 'test-auth-token',
  TWILIO_PHONE_NUMBER: '+15551234567',
  TWILIO_WHATSAPP_NUMBER: '+15559876543',  // Provider adds whatsapp: prefix
  TWILIO_FACEBOOK_PAGE_ID: 'fb-page-123',  // Provider adds messenger: prefix
}));

vi.mock('twilio', () => ({
  default: vi.fn().mockReturnValue({
    messages: {
      create: mockMessagesCreate,
      list: mockMessagesList,
    },
  }),
  Twilio: class {},
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

// env-var not needed since we're mocking config.ts directly

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { TwilioProvider } from '../TwilioProvider';
import type { ProcessedMessage } from '@memberjunction/communication-types';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TwilioProvider', () => {
  let provider: TwilioProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new TwilioProvider();
  });

  describe('getSupportedOperations', () => {
    it('should support messaging operations but not CreateDraft', () => {
      const ops = provider.getSupportedOperations();
      expect(ops).toContain('SendSingleMessage');
      expect(ops).toContain('GetMessages');
      expect(ops).toContain('ForwardMessage');
      expect(ops).toContain('ReplyToMessage');
      expect(ops).not.toContain('CreateDraft');
    });
  });

  describe('SendSingleMessage', () => {
    const createMessage = (overrides: Partial<ProcessedMessage> = {}): ProcessedMessage => ({
      From: '',
      To: '+15559998888',
      ProcessedBody: 'Hello via SMS',
      ProcessedHTMLBody: '',
      ProcessedSubject: '',
      ContextData: {},
      ...overrides,
    } as unknown as ProcessedMessage);

    it('should send SMS successfully', async () => {
      mockMessagesCreate.mockResolvedValue({ sid: 'SM123' });

      const result = await provider.SendSingleMessage(createMessage());

      expect(result.Success).toBe(true);
      expect(mockMessagesCreate).toHaveBeenCalledWith(expect.objectContaining({
        body: 'Hello via SMS',
        from: '+15551234567',
        to: '+15559998888',
      }));
    });

    it('should return failure when recipient not specified', async () => {
      const result = await provider.SendSingleMessage(
        createMessage({ To: '' } as unknown as Partial<ProcessedMessage>)
      );

      expect(result.Success).toBe(false);
      expect(result.Error).toContain('Recipient not specified');
    });

    it('should detect WhatsApp channel from recipient prefix', async () => {
      mockMessagesCreate.mockResolvedValue({ sid: 'WA123' });

      await provider.SendSingleMessage(
        createMessage({ To: 'whatsapp:+15559998888' } as unknown as Partial<ProcessedMessage>)
      );

      expect(mockMessagesCreate).toHaveBeenCalledWith(expect.objectContaining({
        from: 'whatsapp:+15559876543',
        to: 'whatsapp:+15559998888',
      }));
    });

    it('should detect Messenger channel from recipient prefix', async () => {
      mockMessagesCreate.mockResolvedValue({ sid: 'MSG123' });

      await provider.SendSingleMessage(
        createMessage({ To: 'messenger:user123' } as unknown as Partial<ProcessedMessage>)
      );

      expect(mockMessagesCreate).toHaveBeenCalledWith(expect.objectContaining({
        from: 'messenger:fb-page-123',
        to: 'messenger:user123',
      }));
    });

    it('should include media URLs when provided', async () => {
      mockMessagesCreate.mockResolvedValue({ sid: 'SM456' });

      await provider.SendSingleMessage(
        createMessage({
          ContextData: { mediaUrls: ['https://example.com/image.jpg'] },
        } as unknown as Partial<ProcessedMessage>)
      );

      expect(mockMessagesCreate).toHaveBeenCalledWith(expect.objectContaining({
        mediaUrl: ['https://example.com/image.jpg'],
      }));
    });

    it('should handle Twilio API errors gracefully', async () => {
      mockMessagesCreate.mockRejectedValue(new Error('Authentication Error'));

      const result = await provider.SendSingleMessage(createMessage());

      expect(result.Success).toBe(false);
      expect(result.Error).toContain('Authentication Error');
    });

    it('should send successfully with per-request credentials', async () => {
      mockMessagesCreate.mockResolvedValue({ sid: 'SM789' });

      const result = await provider.SendSingleMessage(createMessage(), {
        accountSid: 'custom-sid',
        authToken: 'custom-token',
        phoneNumber: '+15550001111',
      });

      expect(result.Success).toBe(true);
      // The mock twilio constructor is called with custom creds internally
      expect(mockMessagesCreate).toHaveBeenCalled();
    });
  });

  describe('CreateDraft', () => {
    it('should return unsupported error', async () => {
      const result = await provider.CreateDraft({} as Parameters<typeof provider.CreateDraft>[0]);
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toContain('does not support');
    });
  });

  describe('GetMessages', () => {
    it('should fetch messages', async () => {
      mockMessagesList.mockResolvedValue([
        { from: '+15551111111', to: '+15552222222', body: 'Hello', sid: 'SM001' },
      ]);

      const result = await provider.GetMessages({
        NumMessages: 10,
        Identifier: '+15552222222',
      } as Parameters<typeof provider.GetMessages>[0]);

      expect(result.Success).toBe(true);
      expect(result.Messages).toHaveLength(1);
      expect(result.Messages[0].Body).toBe('Hello');
      expect(result.Messages[0].ExternalSystemRecordID).toBe('SM001');
    });

    it('should handle fetch errors', async () => {
      mockMessagesList.mockRejectedValue(new Error('Rate limited'));

      const result = await provider.GetMessages({
        NumMessages: 10,
      } as Parameters<typeof provider.GetMessages>[0]);

      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toContain('Rate limited');
    });
  });
});
