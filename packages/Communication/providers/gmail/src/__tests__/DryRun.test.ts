/**
 * Unit tests for the Gmail provider's DryRun path: the full LOCAL pipeline runs
 * (credential resolution/validation, OAuth2 client construction, RFC-2822 payload
 * construction) but Google is NEVER contacted — neither users.messages.send NOR
 * the users.getProfile preflight round-trip — and the result is marked DryRun.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks (mirror GmailProvider.test.ts, with hoisted getProfile spy)
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

const { mockSend, mockGetProfile } = vi.hoisted(() => ({
  mockSend: vi.fn(),
  mockGetProfile: vi.fn().mockResolvedValue({ data: { emailAddress: 'test@gmail.com' } }),
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
            getProfile: mockGetProfile,
            messages: {
              send: mockSend,
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
import type { ProcessedMessage } from '@memberjunction/communication-types';

const createMessage = (overrides: Partial<ProcessedMessage> = {}): ProcessedMessage => ({
  From: 'sender@example.com',
  To: 'recipient@example.com',
  ProcessedSubject: 'Dry Run Email',
  ProcessedBody: 'Plain text body',
  ProcessedHTMLBody: '<p>HTML body</p>',
  ...overrides,
} as unknown as ProcessedMessage);

describe('GmailProvider DryRun', () => {
  let provider: GmailProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new GmailProvider();
  });

  it('should NOT contact Google at all when DryRun is true (no send, no getProfile)', async () => {
    const result = await provider.SendSingleMessage(createMessage({ DryRun: true }));

    expect(mockSend).not.toHaveBeenCalled();
    expect(mockGetProfile).not.toHaveBeenCalled();
    expect(result.Success).toBe(true);
    expect(result.DryRun).toBe(true);
    expect(result.Error).toBe('');
  });

  it('should still run the credential preflight on a dry run', async () => {
    const result = await provider.SendSingleMessage(
      createMessage({ DryRun: true }),
      { disableEnvironmentFallback: true },
    );

    // validateRequiredCredentials throws inside the provider's try → clean failure, no DryRun mark
    expect(result.Success).toBe(false);
    expect(result.DryRun).toBeUndefined();
    expect(result.Error).toContain('Missing required credential');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('control: a real send (no DryRun) resolves the profile, invokes the transport, and is not DryRun-marked', async () => {
    mockSend.mockResolvedValue({ status: 200, statusText: 'OK' });

    const result = await provider.SendSingleMessage(createMessage());

    expect(mockGetProfile).toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(result.Success).toBe(true);
    expect(result.DryRun).toBeUndefined();
  });
});
