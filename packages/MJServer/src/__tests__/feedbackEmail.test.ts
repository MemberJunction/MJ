/**
 * Tests for the feedback email helper module.
 *
 * Focus:
 *  - `sendFeedbackEmail` MUST honor its documented "never throws" contract,
 *    even when CommunicationEngine.Config or SendSingleMessage throw. The
 *    webhook handler dispatches it fire-and-forget (`void sendFeedbackEmail`),
 *    so a leaked throw would become an unhandled promise rejection.
 *  - `escapeHtml` correctly neutralizes the HTML metacharacters.
 *
 * The CommunicationEngine singleton and the config module are mocked so these
 * tests are deterministic and never touch a real provider.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────
const { mockConfigInfo, mockSendSingleMessage, mockEngineConfig, engineState } = vi.hoisted(() => {
  return {
    // Mutable config object the helpers read live; tests reshape it per case.
    mockConfigInfo: {} as { feedbackSettings?: { emails?: Record<string, unknown> } },
    mockSendSingleMessage: vi.fn(),
    mockEngineConfig: vi.fn(),
    // Mutable holder so each test can shape the providers list the engine exposes.
    engineState: { Providers: [] as Array<{ Name: string; MessageTypes: Array<{ Name: string }> }> },
  };
});

vi.mock('@memberjunction/core', () => ({
  LogError: vi.fn(),
  LogStatus: vi.fn(),
  // Type-only at runtime in the source; provide a stub so the value import resolves.
  UserInfo: class {},
}));

vi.mock('@memberjunction/communication-types', () => ({}));

vi.mock('@memberjunction/communication-engine', () => ({
  CommunicationEngine: {
    Instance: {
      Config: mockEngineConfig,
      get Providers() {
        return engineState.Providers;
      },
      SendSingleMessage: mockSendSingleMessage,
    },
  },
}));

vi.mock('../config.js', () => ({
  configInfo: mockConfigInfo,
}));

// configInfo is read live inside the helpers; we mutate the shared mock object
// between tests via this reference.
const configInfo = mockConfigInfo;

import { sendFeedbackEmail, escapeHtml } from '../feedback/feedbackEmail.js';

beforeEach(() => {
  vi.clearAllMocks();
  // Reset to a fully-configured, send-enabled baseline; individual tests narrow.
  configInfo.feedbackSettings = {
    emails: {
      enabled: true,
      providerName: 'SendGrid',
      messageTypeName: 'Email',
      fromAddress: 'no-reply@test.com',
    },
  };
  engineState.Providers = [{ Name: 'SendGrid', MessageTypes: [{ Name: 'Email' }] }];
  mockEngineConfig.mockResolvedValue(undefined);
  mockSendSingleMessage.mockResolvedValue({ Success: true });
});

const baseOpts = () => ({
  to: 'person@test.com',
  subject: 'Subject',
  htmlBody: '<p>hi</p>',
  textBody: 'hi',
});

describe('sendFeedbackEmail', () => {
  it('returns false (no send) when the email subsystem is disabled', async () => {
    configInfo.feedbackSettings!.emails!.enabled = false;
    const result = await sendFeedbackEmail(baseOpts());
    expect(result).toBe(false);
    expect(mockEngineConfig).not.toHaveBeenCalled();
    expect(mockSendSingleMessage).not.toHaveBeenCalled();
  });

  it('sends and returns true on the happy path', async () => {
    const result = await sendFeedbackEmail(baseOpts());
    expect(result).toBe(true);
    expect(mockSendSingleMessage).toHaveBeenCalledTimes(1);
  });

  it('returns false (does NOT throw) when CommunicationEngine.Config throws', async () => {
    mockEngineConfig.mockRejectedValue(new Error('metadata load failed'));
    await expect(sendFeedbackEmail(baseOpts())).resolves.toBe(false);
  });

  it('returns false (does NOT throw) when SendSingleMessage throws', async () => {
    mockSendSingleMessage.mockRejectedValue(new Error('Failed to process message'));
    await expect(sendFeedbackEmail(baseOpts())).resolves.toBe(false);
  });

  it('returns false when the configured provider is not registered', async () => {
    engineState.Providers = [{ Name: 'SomeOtherProvider', MessageTypes: [{ Name: 'Email' }] }];
    const result = await sendFeedbackEmail(baseOpts());
    expect(result).toBe(false);
    expect(mockSendSingleMessage).not.toHaveBeenCalled();
  });

  it('returns false when the message type is not found on the provider', async () => {
    engineState.Providers = [{ Name: 'SendGrid', MessageTypes: [{ Name: 'SMS' }] }];
    const result = await sendFeedbackEmail(baseOpts());
    expect(result).toBe(false);
    expect(mockSendSingleMessage).not.toHaveBeenCalled();
  });

  it('returns false when the provider reports a non-success result', async () => {
    mockSendSingleMessage.mockResolvedValue({ Success: false, Error: 'rejected' });
    const result = await sendFeedbackEmail(baseOpts());
    expect(result).toBe(false);
  });
});

describe('escapeHtml', () => {
  it('escapes all five HTML metacharacters', () => {
    expect(escapeHtml(`<script>alert("x" & 'y')</script>`)).toBe(
      '&lt;script&gt;alert(&quot;x&quot; &amp; &#039;y&#039;)&lt;/script&gt;'
    );
  });

  it('leaves plain text untouched', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });
});
