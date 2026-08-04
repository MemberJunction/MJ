/**
 * Unit tests for the Expo Push provider's DryRun path: the full pipeline runs
 * (credential resolution, payload + headers construction) but fetch is NEVER
 * invoked, and the result is marked DryRun.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks (mirror ExpoPushProvider.test.ts)
// ---------------------------------------------------------------------------

const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

vi.stubGlobal('fetch', mockFetch);

vi.mock('dotenv', () => ({
  default: { config: vi.fn() },
}));

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

describe('ExpoPushProvider DryRun', () => {
  let provider: ExpoPushProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new ExpoPushProvider();
  });

  it('should NOT invoke fetch when DryRun is true', async () => {
    const result = await provider.SendSingleMessage(createMessage({ DryRun: true }));

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.Success).toBe(true);
    expect(result.DryRun).toBe(true);
    expect(result.Error).toBe('');
  });

  it('should still fail preflight on a dry run when the recipient push token is missing', async () => {
    const result = await provider.SendSingleMessage(createMessage({ DryRun: true, To: '' }));

    expect(result.Success).toBe(false);
    expect(result.DryRun).toBeUndefined();
    expect(result.Error).toBe('Recipient push token not specified');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('control: a real send (no DryRun) DOES invoke fetch and is not DryRun-marked', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ data: { status: 'ok', id: 'receipt-1' } }),
      text: async () => '',
    });

    const result = await provider.SendSingleMessage(createMessage());

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.Success).toBe(true);
    expect(result.DryRun).toBeUndefined();
  });
});
