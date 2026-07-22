/**
 * Unit tests for the Expo push provider.
 * Tests: payload construction from a message, success (ok ticket), error ticket
 * handling, HTTP/transport errors, missing-token handling, and access-token header.
 * All network access is mocked — no real requests are made.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

// Install a mocked global fetch
vi.stubGlobal('fetch', mockFetch);

// Mock dotenv (avoid reading a real .env during import)
vi.mock('dotenv', () => ({
  default: { config: vi.fn() },
}));

// Mock config.ts directly to avoid dotenv/env-var import concerns
vi.mock('../config', () => ({
  EXPO_PUSH_API_URL: 'https://exp.host/--/api/v2/push/send',
  EXPO_ACCESS_TOKEN: '',
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

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { ExpoPushProvider } from '../ExpoPushProvider';
import type { ProcessedMessage } from '@memberjunction/communication-types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const createMessage = (overrides: Partial<ProcessedMessage> = {}): ProcessedMessage => ({
  From: '',
  To: 'ExponentPushToken[abc123]',
  Body: '',
  Subject: '',
  ProcessedBody: 'You have a new message',
  ProcessedHTMLBody: '',
  ProcessedSubject: 'New Message',
  ContextData: {},
  ...overrides,
} as unknown as ProcessedMessage);

const mockResponse = (body: unknown, init: { ok?: boolean; status?: number; statusText?: string } = {}) => ({
  ok: init.ok ?? true,
  status: init.status ?? 200,
  statusText: init.statusText ?? 'OK',
  json: vi.fn().mockResolvedValue(body),
  text: vi.fn().mockResolvedValue(typeof body === 'string' ? body : JSON.stringify(body)),
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExpoPushProvider', () => {
  let provider: ExpoPushProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new ExpoPushProvider();
  });

  describe('getSupportedOperations', () => {
    it('should support only SendSingleMessage', () => {
      const ops = provider.getSupportedOperations();
      expect(ops).toEqual(['SendSingleMessage']);
    });
  });

  describe('SendSingleMessage', () => {
    it('should build the Expo payload correctly from a message', async () => {
      mockFetch.mockResolvedValue(mockResponse({ data: { status: 'ok', id: 'receipt-1' } }));

      const result = await provider.SendSingleMessage(
        createMessage({ ContextData: { pushData: { screen: 'inbox' } } } as unknown as Partial<ProcessedMessage>)
      );

      expect(result.Success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, requestInit] = mockFetch.mock.calls[0];
      expect(url).toBe('https://exp.host/--/api/v2/push/send');
      expect(requestInit.method).toBe('POST');

      const payload = JSON.parse(requestInit.body);
      expect(payload).toEqual({
        to: 'ExponentPushToken[abc123]',
        title: 'New Message',
        body: 'You have a new message',
        data: { screen: 'inbox' },
      });
    });

    it('should NOT send an Authorization header when no access token is configured', async () => {
      mockFetch.mockResolvedValue(mockResponse({ data: { status: 'ok', id: 'receipt-2' } }));

      await provider.SendSingleMessage(createMessage());

      const requestInit = mockFetch.mock.calls[0][1];
      expect(requestInit.headers.Authorization).toBeUndefined();
    });

    it('should send a Bearer Authorization header when an access token is provided', async () => {
      mockFetch.mockResolvedValue(mockResponse({ data: { status: 'ok', id: 'receipt-3' } }));

      await provider.SendSingleMessage(createMessage(), { accessToken: 'expo-token-xyz' });

      const requestInit = mockFetch.mock.calls[0][1];
      expect(requestInit.headers.Authorization).toBe('Bearer expo-token-xyz');
    });

    it('should return success on an ok ticket', async () => {
      mockFetch.mockResolvedValue(mockResponse({ data: { status: 'ok', id: 'receipt-4' } }));

      const result = await provider.SendSingleMessage(createMessage());

      expect(result.Success).toBe(true);
      expect(result.Error).toBe('');
    });

    it('should normalize an array-form data ticket', async () => {
      mockFetch.mockResolvedValue(mockResponse({ data: [{ status: 'ok', id: 'receipt-5' }] }));

      const result = await provider.SendSingleMessage(createMessage());

      expect(result.Success).toBe(true);
    });

    it('should return failure on an error ticket', async () => {
      mockFetch.mockResolvedValue(mockResponse({
        data: { status: 'error', message: 'Device not registered', details: { error: 'DeviceNotRegistered' } },
      }));

      const result = await provider.SendSingleMessage(createMessage());

      expect(result.Success).toBe(false);
      expect(result.Error).toContain('Device not registered');
      expect(result.Error).toContain('DeviceNotRegistered');
    });

    it('should return failure on top-level request errors', async () => {
      mockFetch.mockResolvedValue(mockResponse({
        errors: [{ code: 'PUSH_TOO_MANY_EXPERIENCE_IDS', message: 'Invalid batch' }],
      }));

      const result = await provider.SendSingleMessage(createMessage());

      expect(result.Success).toBe(false);
      expect(result.Error).toContain('Invalid batch');
    });

    it('should return failure on a non-OK HTTP response', async () => {
      mockFetch.mockResolvedValue(mockResponse('Too Many Requests', { ok: false, status: 429, statusText: 'Too Many Requests' }));

      const result = await provider.SendSingleMessage(createMessage());

      expect(result.Success).toBe(false);
      expect(result.Error).toContain('429');
    });

    it('should return failure when the recipient push token is missing', async () => {
      const result = await provider.SendSingleMessage(
        createMessage({ To: '' } as unknown as Partial<ProcessedMessage>)
      );

      expect(result.Success).toBe(false);
      expect(result.Error).toContain('Recipient push token not specified');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle transport/fetch errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network down'));

      const result = await provider.SendSingleMessage(createMessage());

      expect(result.Success).toBe(false);
      expect(result.Error).toContain('Network down');
    });

    it('should fall back to Subject/Body when processed fields are empty', async () => {
      mockFetch.mockResolvedValue(mockResponse({ data: { status: 'ok', id: 'receipt-6' } }));

      await provider.SendSingleMessage(
        createMessage({
          ProcessedSubject: '',
          ProcessedBody: '',
          Subject: 'Fallback Title',
          Body: 'Fallback Body',
        } as unknown as Partial<ProcessedMessage>)
      );

      const payload = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(payload.title).toBe('Fallback Title');
      expect(payload.body).toBe('Fallback Body');
    });
  });

  describe('unsupported operations', () => {
    it('GetMessages should return unsupported', async () => {
      const result = await provider.GetMessages({ NumMessages: 5 } as Parameters<typeof provider.GetMessages>[0]);
      expect(result.Success).toBe(false);
      expect(result.Messages).toEqual([]);
      expect(result.ErrorMessage).toContain('does not support');
    });

    it('CreateDraft should return unsupported', async () => {
      const result = await provider.CreateDraft({} as Parameters<typeof provider.CreateDraft>[0]);
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toContain('does not support');
    });
  });
});
