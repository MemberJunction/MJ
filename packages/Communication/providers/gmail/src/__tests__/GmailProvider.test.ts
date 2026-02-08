/**
 * Unit tests for the Gmail provider.
 * Tests: credential resolution, email content creation, supported operations.
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

vi.mock('@memberjunction/global', () => ({
  RegisterClass: () => (target: unknown) => target,
}));

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
    get: (key: string) => ({
      default: (def: string) => ({
        asString: () => envMap[key] ?? def,
      }),
    }),
  };
});

vi.mock('dotenv', () => ({
  config: vi.fn(),
}));

const { mockSend, mockMessagesList, mockMessagesGet } = vi.hoisted(() => ({
  mockSend: vi.fn(),
  mockMessagesList: vi.fn(),
  mockMessagesGet: vi.fn(),
}));

vi.mock('googleapis', () => {
  class FakeOAuth2 {
    setCredentials = vi.fn();
  }
  return {
    google: {
      auth: {
        OAuth2: FakeOAuth2,
      },
      gmail: vi.fn().mockReturnValue({
        users: {
          getProfile: vi.fn().mockResolvedValue({ data: { emailAddress: 'test@gmail.com' } }),
          messages: {
            send: mockSend,
            list: mockMessagesList,
            get: mockMessagesGet,
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
  };
});

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { GmailProvider } from '../GmailProvider';
import type { ProcessedMessage, MessageResult } from '@memberjunction/communication-types';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GmailProvider', () => {
  let provider: GmailProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new GmailProvider();
  });

  describe('getSupportedOperations', () => {
    it('should include all Gmail-supported operations', () => {
      const ops = provider.getSupportedOperations();
      expect(ops).toContain('SendSingleMessage');
      expect(ops).toContain('GetMessages');
      expect(ops).toContain('ForwardMessage');
      expect(ops).toContain('ReplyToMessage');
      expect(ops).toContain('CreateDraft');
      expect(ops).toContain('DeleteMessage');
      expect(ops).toContain('ListFolders');
      expect(ops).toContain('MarkAsRead');
      expect(ops).toContain('ArchiveMessage');
      expect(ops).toContain('SearchMessages');
      expect(ops).toContain('ListAttachments');
      expect(ops).toContain('DownloadAttachment');
    });
  });

  describe('SendSingleMessage', () => {
    it('should send an email successfully', async () => {
      mockSend.mockResolvedValue({ status: 200, statusText: 'OK' });

      const message = {
        From: 'sender@example.com',
        FromName: 'Sender',
        To: 'recipient@example.com',
        ProcessedSubject: 'Test Subject',
        ProcessedBody: 'Hello World',
        ProcessedHTMLBody: '',
        CCRecipients: [],
        BCCRecipients: [],
        ContextData: {},
      } as unknown as ProcessedMessage;

      const result = await provider.SendSingleMessage(message);
      expect(result.Success).toBe(true);
      expect(mockSend).toHaveBeenCalled();
    });

    it('should handle non-success status from Gmail API', async () => {
      mockSend.mockResolvedValue({ status: 500, statusText: 'Internal Server Error' });

      const message = {
        From: 'sender@example.com',
        To: 'recipient@example.com',
        ProcessedSubject: 'Test',
        ProcessedBody: 'Body',
        ProcessedHTMLBody: '',
        CCRecipients: [],
        BCCRecipients: [],
        ContextData: {},
      } as unknown as ProcessedMessage;

      const result = await provider.SendSingleMessage(message);
      expect(result.Success).toBe(false);
    });

    it('should handle send errors gracefully', async () => {
      mockSend.mockRejectedValue(new Error('API quota exceeded'));

      const message = {
        From: 'sender@example.com',
        To: 'recipient@example.com',
        ProcessedSubject: 'Test',
        ProcessedBody: 'Body',
        ProcessedHTMLBody: '',
        CCRecipients: [],
        BCCRecipients: [],
        ContextData: {},
      } as unknown as ProcessedMessage;

      const result = await provider.SendSingleMessage(message);
      expect(result.Success).toBe(false);
      expect(result.Error).toContain('API quota exceeded');
    });
  });

  describe('credential resolution', () => {
    it('should return failure when required credentials are missing', async () => {
      const message = {
        From: 'sender@example.com',
        To: 'recipient@example.com',
        ProcessedSubject: 'Test',
        ProcessedBody: 'Body',
        ProcessedHTMLBody: '',
        CCRecipients: [],
        BCCRecipients: [],
        ContextData: {},
      } as unknown as ProcessedMessage;

      // SendSingleMessage catches the error internally
      const result = await provider.SendSingleMessage(message, {
        disableEnvironmentFallback: true,
      });
      expect(result.Success).toBe(false);
      expect(result.Error).toContain('Missing required credential');
    });
  });

  describe('ReplyToMessage', () => {
    it('should return error when MessageID is missing', async () => {
      const result = await provider.ReplyToMessage({
        MessageID: '',
        Message: {} as ProcessedMessage,
      });
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toContain('Message ID not provided');
    });
  });

  describe('ForwardMessage', () => {
    it('should return error when MessageID is missing', async () => {
      const result = await provider.ForwardMessage({
        MessageID: '',
        ToRecipients: ['r@example.com'],
      });
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toContain('Message ID not provided');
    });
  });
});
