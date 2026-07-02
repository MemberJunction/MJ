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
    default: {
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

  describe('GetMessages body extraction', () => {
    // Gmail returns part data as base64url; encode helper mirrors that.
    const b64url = (s: string) => Buffer.from(s, 'utf-8').toString('base64url');

    /**
     * Drives a single message payload through the public GetMessages() path
     * and returns the extracted Body. The Gmail API flow is list() -> get().
     */
    const getBodyFor = async (payload: Record<string, unknown>): Promise<string> => {
      mockMessagesList.mockResolvedValue({ data: { messages: [{ id: 'msg-1' }] } });
      mockMessagesGet.mockResolvedValue({
        data: { id: 'msg-1', threadId: 'thread-1', payload },
      });

      const result = await provider.GetMessages({ NumMessages: 1 } as never);
      expect(result.Success).toBe(true);
      expect(result.Messages).toHaveLength(1);
      return result.Messages![0].Body;
    };

    it('extracts a single-part text/plain body (payload.body.data)', async () => {
      const body = await getBodyFor({
        mimeType: 'text/plain',
        headers: [{ name: 'From', value: 'a@example.com' }],
        body: { data: b64url('Hello plain world') },
      });
      expect(body).toBe('Hello plain world');
    });

    it('extracts body from multipart/alternative (prefers text/html)', async () => {
      const body = await getBodyFor({
        mimeType: 'multipart/alternative',
        headers: [],
        parts: [
          { mimeType: 'text/plain', body: { data: b64url('plain version') } },
          { mimeType: 'text/html', body: { data: b64url('<p>html version</p>') } },
        ],
      });
      expect(body).toBe('<p>html version</p>');
    });

    it('extracts the nested body from multipart/related with an inline image (the failing case)', async () => {
      const body = await getBodyFor({
        mimeType: 'multipart/related',
        headers: [],
        parts: [
          {
            mimeType: 'multipart/alternative',
            parts: [
              { mimeType: 'text/plain', body: { data: b64url('plain body') } },
              { mimeType: 'text/html', body: { data: b64url('<p>body with <img src="cid:logo"></p>') } },
            ],
          },
          {
            mimeType: 'image/png',
            filename: 'logo.png',
            body: { attachmentId: 'att-1', size: 1234 },
          },
        ],
      });
      expect(body).toBe('<p>body with <img src="cid:logo"></p>');
    });

    it('extracts body from multipart/mixed and ignores the attachment part', async () => {
      const body = await getBodyFor({
        mimeType: 'multipart/mixed',
        headers: [],
        parts: [
          {
            mimeType: 'multipart/alternative',
            parts: [
              { mimeType: 'text/plain', body: { data: b64url('plain body') } },
              { mimeType: 'text/html', body: { data: b64url('<p>real body</p>') } },
            ],
          },
          {
            mimeType: 'application/pdf',
            filename: 'doc.pdf',
            body: { attachmentId: 'att-2', size: 4096 },
          },
        ],
      });
      expect(body).toBe('<p>real body</p>');
    });

    it('extracts body from an HTML-only message (no text/plain part)', async () => {
      const body = await getBodyFor({
        mimeType: 'multipart/alternative',
        headers: [],
        parts: [
          { mimeType: 'text/html', body: { data: b64url('<h1>html only</h1>') } },
        ],
      });
      expect(body).toBe('<h1>html only</h1>');
    });

    it('decodes base64url payloads containing - and _ characters cleanly', async () => {
      // A string whose base64url encoding contains both '-' and '_'.
      const original = 'subjects??>>';
      const encoded = Buffer.from(original, 'utf-8').toString('base64url');
      expect(encoded).toMatch(/[-_]/); // guard: fixture actually exercises base64url alphabet
      const body = await getBodyFor({
        mimeType: 'text/plain',
        headers: [],
        body: { data: encoded },
      });
      expect(body).toBe(original);
    });

    it('returns empty string when no text part exists anywhere', async () => {
      const body = await getBodyFor({
        mimeType: 'multipart/mixed',
        headers: [],
        parts: [
          { mimeType: 'image/png', filename: 'a.png', body: { attachmentId: 'att-3', size: 10 } },
        ],
      });
      expect(body).toBe('');
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
