/**
 * Unit tests for the Twilio provider's DryRun path: the full pipeline runs
 * (credential resolution/validation, channel detection, from/to formatting,
 * body assembly) but the Twilio transport client is NEVER invoked, and the
 * result is marked DryRun.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks (mirror TwilioProvider.test.ts)
// ---------------------------------------------------------------------------

const { mockMessagesCreate, mockMessagesList } = vi.hoisted(() => ({
  mockMessagesCreate: vi.fn(),
  mockMessagesList: vi.fn(),
}));

vi.mock('dotenv', () => ({
  default: { config: vi.fn() },
}));

vi.mock('../config', () => ({
  TWILIO_ACCOUNT_SID: 'test-account-sid',
  TWILIO_AUTH_TOKEN: 'test-auth-token',
  TWILIO_PHONE_NUMBER: '+15551234567',
  TWILIO_WHATSAPP_NUMBER: '+15559876543',
  TWILIO_FACEBOOK_PAGE_ID: 'fb-page-123',
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

import { TwilioProvider } from '../TwilioProvider';
import type { ProcessedMessage } from '@memberjunction/communication-types';

const createMessage = (overrides: Partial<ProcessedMessage> = {}): ProcessedMessage => ({
  From: '',
  To: '+15550001111',
  ProcessedBody: 'Dry run SMS body',
  ProcessedHTMLBody: '',
  ProcessedSubject: '',
  ContextData: {},
  ...overrides,
} as unknown as ProcessedMessage);

describe('TwilioProvider DryRun', () => {
  let provider: TwilioProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new TwilioProvider();
  });

  it('should NOT invoke the Twilio transport when DryRun is true', async () => {
    const result = await provider.SendSingleMessage(createMessage({ DryRun: true }));

    expect(mockMessagesCreate).not.toHaveBeenCalled();
    expect(result.Success).toBe(true);
    expect(result.DryRun).toBe(true);
    expect(result.Error).toBe('');
  });

  it('should still fail preflight on a dry run when the recipient is missing', async () => {
    const result = await provider.SendSingleMessage(createMessage({ DryRun: true, To: '' }));

    expect(result.Success).toBe(false);
    expect(result.DryRun).toBeUndefined();
    expect(result.Error).toBe('Recipient not specified');
    expect(mockMessagesCreate).not.toHaveBeenCalled();
  });

  it('should still fail preflight on a dry run when the channel sender is not configured', async () => {
    // messenger channel with empty facebookPageId credential override → sender unresolvable
    const result = await provider.SendSingleMessage(
      createMessage({ DryRun: true, To: 'messenger:12345' }),
      { facebookPageId: '', disableEnvironmentFallback: false, accountSid: 'test-account-sid', authToken: 'test-auth-token', phoneNumber: '+15551234567', whatsappNumber: '+15559876543' },
    );

    // env fallback fills facebookPageId, so use disableEnvironmentFallback to actually blank it
    const result2 = await provider.SendSingleMessage(
      createMessage({ DryRun: true, To: 'messenger:12345' }),
      { accountSid: 'sid', authToken: 'tok', phoneNumber: '+15551234567', disableEnvironmentFallback: true },
    );

    // First call resolves the env page id so it dry-runs successfully; second has no page id → error
    expect(result.Success).toBe(true);
    expect(result.DryRun).toBe(true);
    expect(result2.Success).toBe(false);
    expect(result2.Error).toContain('MESSENGER sender not configured');
    expect(mockMessagesCreate).not.toHaveBeenCalled();
  });

  it('control: a real send (no DryRun) DOES invoke the transport and is not DryRun-marked', async () => {
    mockMessagesCreate.mockResolvedValue({ sid: 'SM123' });

    const result = await provider.SendSingleMessage(createMessage());

    expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
    expect(result.Success).toBe(true);
    expect(result.DryRun).toBeUndefined();
  });
});
