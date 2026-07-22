/**
 * Unit tests for the SendGrid provider's DryRun path: the full pipeline runs
 * (credential resolution/validation, payload construction) but the SendGrid
 * transport client is NEVER invoked, and the result is marked DryRun.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks (mirror SendGridProvider.test.ts)
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

vi.mock('../config', () => ({
  __API_KEY: 'env-sendgrid-key',
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { SendGridProvider } from '../SendGridProvider';
import type { ProcessedMessage } from '@memberjunction/communication-types';

const createMessage = (overrides: Partial<ProcessedMessage> = {}): ProcessedMessage => ({
  From: 'sender@example.com',
  FromName: 'Test Sender',
  To: 'recipient@example.com',
  ProcessedSubject: 'Dry Run Email',
  ProcessedBody: 'Plain text body',
  ProcessedHTMLBody: '<p>HTML body</p>',
  ...overrides,
} as unknown as ProcessedMessage);

describe('SendGridProvider DryRun', () => {
  let provider: SendGridProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new SendGridProvider();
  });

  it('should NOT invoke the SendGrid transport when DryRun is true', async () => {
    const result = await provider.SendSingleMessage(createMessage({ DryRun: true }));

    expect(mockSgSend).not.toHaveBeenCalled();
    expect(result.Success).toBe(true);
    expect(result.DryRun).toBe(true);
    expect(result.Error).toBe('');
  });

  it('should still run the credential preflight on a dry run (payload construction is reached only after validation)', async () => {
    // No request apiKey + env fallback disabled → validation must throw BEFORE the dry-run return
    await expect(
      provider.SendSingleMessage(createMessage({ DryRun: true }), { disableEnvironmentFallback: true }),
    ).rejects.toThrow(/Missing required credential/);
    expect(mockSgSend).not.toHaveBeenCalled();
  });

  it('should still configure the client (payload pipeline ran) without sending', async () => {
    await provider.SendSingleMessage(createMessage({ DryRun: true }));
    // setApiKey is part of local payload/pipeline setup — proves the pipeline ran up to the boundary
    expect(mockSetApiKey).toHaveBeenCalledWith('env-sendgrid-key');
    expect(mockSgSend).not.toHaveBeenCalled();
  });

  it('control: a real send (no DryRun) DOES invoke the transport and is not DryRun-marked', async () => {
    mockSgSend.mockResolvedValue([{ statusCode: 202, body: 'Accepted' }]);

    const result = await provider.SendSingleMessage(createMessage());

    expect(mockSgSend).toHaveBeenCalledTimes(1);
    expect(result.Success).toBe(true);
    expect(result.DryRun).toBeUndefined();
  });
});
