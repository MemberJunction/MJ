/**
 * Unit tests for the MS Graph provider's DryRun path: the full pipeline runs
 * (credential resolution/validation, sender selection, complete sendMail payload
 * construction) but the Graph API is NEVER invoked, and the result is marked DryRun.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks (mirror MSGraphProvider.test.ts)
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

vi.mock('@azure/identity', () => ({
  // Constructor-safe (class) mock: auth.ts calls `new ClientSecretCredential(...)` on the
  // env-credential real-send path, and an arrow-implemented vi.fn() is not constructible.
  ClientSecretCredential: class {
    getToken = vi.fn().mockResolvedValue({ token: 'test-token' });
  },
  ConfidentialClientApplication: vi.fn(),
}));

const { mockGraphPost, mockGraphApi } = vi.hoisted(() => {
  const mockGraphPost = vi.fn().mockResolvedValue({});
  const mockGraphApi = vi.fn().mockReturnValue({
    post: mockGraphPost,
    get: vi.fn().mockResolvedValue({ value: [] }),
  });
  return { mockGraphPost, mockGraphApi };
});

vi.mock('@microsoft/microsoft-graph-client', () => ({
  Client: {
    initWithMiddleware: vi.fn().mockReturnValue({
      api: mockGraphApi,
    }),
  },
}));

// Both specifiers are used in this package: the provider imports '.../index.js', auth.ts too;
// the sibling test file mocks the bare path — mock both so either resolution is covered.
vi.mock('@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials', () => ({
  TokenCredentialAuthenticationProvider: class {},
}));
vi.mock('@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js', () => ({
  TokenCredentialAuthenticationProvider: class {},
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { MSGraphProvider } from '../MSGraphProvider';
import type { ProcessedMessage } from '@memberjunction/communication-types';

const createMessage = (overrides: Partial<ProcessedMessage> = {}): ProcessedMessage => ({
  From: 'sender@example.com',
  To: 'recipient@example.com',
  Subject: 'Dry Run Email',
  ProcessedSubject: 'Dry Run Email',
  ProcessedBody: 'Plain text body',
  ProcessedHTMLBody: '<p>HTML body</p>',
  ContextData: {},
  ...overrides,
} as unknown as ProcessedMessage);

describe('MSGraphProvider DryRun', () => {
  let provider: MSGraphProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new MSGraphProvider();
  });

  it('should NOT invoke the Graph transport when DryRun is true', async () => {
    const result = await provider.SendSingleMessage(createMessage({ DryRun: true }));

    expect(mockGraphPost).not.toHaveBeenCalled();
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
    expect(mockGraphPost).not.toHaveBeenCalled();
  });

  it('control: a real send (no DryRun) DOES post to Graph and is not DryRun-marked', async () => {
    const result = await provider.SendSingleMessage(createMessage());

    expect(mockGraphPost).toHaveBeenCalledTimes(1);
    expect(result.Success).toBe(true);
    expect(result.DryRun).toBeUndefined();
  });
});
