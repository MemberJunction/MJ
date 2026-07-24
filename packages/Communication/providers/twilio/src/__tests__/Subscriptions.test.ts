/**
 * Unit tests for the Twilio provider's push-notification subscription support
 * (inbound-parse mode): getSupportedOperations, SupportsPush, subscription capabilities,
 * CreateSubscription / DeleteSubscription, and ParseNotification.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockPnList, mockPnUpdate, mockIncomingPhoneNumbers, mockValidateRequest } = vi.hoisted(() => {
  const mockPnList = vi.fn();
  const mockPnUpdate = vi.fn();
  // incomingPhoneNumbers is callable (returns a context with update()) AND has a list() method,
  // mirroring the Twilio SDK's IncomingPhoneNumberListInstance shape.
  const mockIncomingPhoneNumbers = Object.assign(
    vi.fn(() => ({ update: mockPnUpdate })),
    { list: mockPnList }
  );
  const mockValidateRequest = vi.fn();
  return { mockPnList, mockPnUpdate, mockIncomingPhoneNumbers, mockValidateRequest };
});

// Mock dotenv
vi.mock('dotenv', () => ({
  default: { config: vi.fn() },
}));

// Mock config.ts directly to avoid dotenv import issues
vi.mock('../config', () => ({
  TWILIO_ACCOUNT_SID: 'test-account-sid',
  TWILIO_AUTH_TOKEN: 'test-auth-token',
  TWILIO_PHONE_NUMBER: '+15551234567',
  TWILIO_WHATSAPP_NUMBER: '+15559876543',
  TWILIO_FACEBOOK_PAGE_ID: 'fb-page-123',
}));

vi.mock('twilio', () => {
  const twilioFn = vi.fn().mockReturnValue({
    incomingPhoneNumbers: mockIncomingPhoneNumbers,
  });
  // twilio.validateRequest is a static on the default export namespace.
  return {
    default: Object.assign(twilioFn, { validateRequest: mockValidateRequest }),
    Twilio: class {},
  };
});

vi.mock('@memberjunction/communication-types', () => ({
  BaseCommunicationProvider: class {
    getSupportedOperations() { return []; }
    GetSubscriptionCapabilities() { return undefined; }
    // SupportsPush derives from GetSubscriptionCapabilities, as in the real base class.
    get SupportsPush() { return this.GetSubscriptionCapabilities() !== undefined; }
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
import type { CreateSubscriptionParams, WebhookNotificationInput } from '@memberjunction/communication-types';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TwilioProvider — push subscriptions', () => {
  let provider: TwilioProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new TwilioProvider();
  });

  describe('getSupportedOperations (subscriptions)', () => {
    it('includes CreateSubscription, DeleteSubscription and ParseNotification, but NOT RenewSubscription', () => {
      const ops = provider.getSupportedOperations();
      expect(ops).toContain('CreateSubscription');
      expect(ops).toContain('DeleteSubscription');
      expect(ops).toContain('ParseNotification');
      expect(ops).not.toContain('RenewSubscription');
    });
  });

  describe('SupportsPush', () => {
    it('is true (derived from GetSubscriptionCapabilities)', () => {
      expect(provider.SupportsPush).toBe(true);
    });
  });

  describe('GetSubscriptionCapabilities', () => {
    it('describes an inline-payload, non-expiring, managed provider', () => {
      const caps = provider.GetSubscriptionCapabilities();
      expect(caps).toEqual({
        MaxLifetimeMinutes: undefined,
        SupportedChangeTypes: ['created'],
        RequiresEndpointValidation: false,
        SupportsSubscriptionManagement: true,
        DeliversPayloadInline: true,
      });
    });
  });

  describe('CreateSubscription', () => {
    const baseParams = (): CreateSubscriptionParams => ({
      ChangeTypes: ['created'],
      NotificationUrl: 'https://api.example.com/twilio/sms',
      ClientState: '',
      Identifier: '+15551234567',
    });

    it('resolves an E.164 number to its SID then points smsUrl at the notification URL', async () => {
      mockPnList.mockResolvedValue([{ sid: 'PN123' }]);
      mockPnUpdate.mockResolvedValue({ sid: 'PN123', smsUrl: 'https://api.example.com/twilio/sms' });

      const result = await provider.CreateSubscription(baseParams());

      expect(result.Success).toBe(true);
      expect(result.SubscriptionID).toBe('PN123');
      expect(result.ExpiresAt).toBeUndefined(); // never expires

      // E.164 → SID resolution happened.
      expect(mockPnList).toHaveBeenCalledWith(expect.objectContaining({ phoneNumber: '+15551234567' }));
      // The context was addressed by the resolved SID, and the webhook was set.
      expect(mockIncomingPhoneNumbers).toHaveBeenCalledWith('PN123');
      expect(mockPnUpdate).toHaveBeenCalledWith({
        smsUrl: 'https://api.example.com/twilio/sms',
        smsMethod: 'POST',
      });
    });

    it('uses a phone-number SID (PN...) directly without a list lookup', async () => {
      mockPnUpdate.mockResolvedValue({ sid: 'PNabc' });

      const result = await provider.CreateSubscription({ ...baseParams(), Identifier: 'PNabc' });

      expect(result.Success).toBe(true);
      expect(result.SubscriptionID).toBe('PNabc');
      expect(mockPnList).not.toHaveBeenCalled();
      expect(mockIncomingPhoneNumbers).toHaveBeenCalledWith('PNabc');
    });

    it('fail-fast: rejects a non-https NotificationUrl without touching Twilio', async () => {
      const result = await provider.CreateSubscription({
        ...baseParams(),
        NotificationUrl: 'http://insecure.example.com/hook',
      });
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toContain('https');
      expect(mockPnList).not.toHaveBeenCalled();
      expect(mockPnUpdate).not.toHaveBeenCalled();
    });

    it('fail-fast: rejects a missing Identifier without touching Twilio', async () => {
      const result = await provider.CreateSubscription({ ...baseParams(), Identifier: '' });
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toContain('Identifier');
      expect(mockPnList).not.toHaveBeenCalled();
    });

    it('fails clearly when the account owns no matching phone number', async () => {
      mockPnList.mockResolvedValue([]);
      const result = await provider.CreateSubscription(baseParams());
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toContain('No phone number matching');
      expect(mockPnUpdate).not.toHaveBeenCalled();
    });

    it('surfaces a Twilio error in ErrorMessage', async () => {
      mockPnList.mockResolvedValue([{ sid: 'PN123' }]);
      mockPnUpdate.mockRejectedValue(new Error('phone number not owned by account'));
      const result = await provider.CreateSubscription(baseParams());
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toContain('phone number not owned by account');
    });
  });

  describe('DeleteSubscription', () => {
    it('clears the smsUrl and returns success', async () => {
      mockPnUpdate.mockResolvedValue({ sid: 'PN123', smsUrl: '' });
      const result = await provider.DeleteSubscription({ SubscriptionID: 'PN123' });
      expect(result.Success).toBe(true);
      expect(mockIncomingPhoneNumbers).toHaveBeenCalledWith('PN123');
      expect(mockPnUpdate).toHaveBeenCalledWith({ smsUrl: '' });
    });

    it('treats an HTTP 404 as success (idempotent delete)', async () => {
      mockPnUpdate.mockRejectedValue({ status: 404 });
      const result = await provider.DeleteSubscription({ SubscriptionID: 'already-gone' });
      expect(result.Success).toBe(true);
    });

    it('treats Twilio error code 20404 as success (idempotent delete)', async () => {
      mockPnUpdate.mockRejectedValue({ code: 20404 });
      const result = await provider.DeleteSubscription({ SubscriptionID: 'already-gone' });
      expect(result.Success).toBe(true);
    });

    it('surfaces non-not-found errors as failures', async () => {
      mockPnUpdate.mockRejectedValue(new Error('permission denied'));
      const result = await provider.DeleteSubscription({ SubscriptionID: 'PN123' });
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toContain('permission denied');
    });
  });

  describe('ParseNotification', () => {
    const validBody = () =>
      new URLSearchParams({
        MessageSid: 'SM123',
        From: '+15559998888',
        To: '+15551234567',
        Body: 'Hello inbound',
        AccountSid: 'test-account-sid',
      }).toString();

    const buildInput = (overrides: Partial<WebhookNotificationInput> = {}): WebhookNotificationInput => ({
      Headers: { 'x-twilio-signature': 'sig-abc' },
      QueryParams: {},
      RawBody: validBody(),
      RequestUrl: 'https://api.example.com/twilio/sms',
      ...overrides,
    });

    it('parses a valid urlencoded body into a normalized notification with inline Message', async () => {
      mockValidateRequest.mockReturnValue(true);

      const result = await provider.ParseNotification(buildInput());

      expect(result.Success).toBe(true);
      expect(result.SignatureValid).toBe(true);
      expect(result.SuggestedResponseStatus).toBe(200);
      expect(result.Notifications).toHaveLength(1);

      const n = result.Notifications[0];
      expect(n.Kind).toBe('message');
      expect(n.ChangeType).toBe('created');
      expect(n.MessageIDs).toEqual(['SM123']); // pointer still surfaced
      expect(n.Identifier).toBe('+15551234567');
      // INLINE payload populated.
      expect(n.Message).toEqual({ From: '+15559998888', To: '+15551234567', Body: 'Hello inbound' });

      // validateRequest was called with the account auth token, header, url, and parsed params.
      expect(mockValidateRequest).toHaveBeenCalledWith(
        'test-auth-token',
        'sig-abc',
        'https://api.example.com/twilio/sms',
        expect.objectContaining({ MessageSid: 'SM123', Body: 'Hello inbound' })
      );
    });

    it('still returns the parsed notification when the signature is invalid', async () => {
      mockValidateRequest.mockReturnValue(false);

      const result = await provider.ParseNotification(buildInput({ Headers: { 'x-twilio-signature': 'bad' } }));

      expect(result.Success).toBe(true);
      expect(result.SignatureValid).toBe(false);
      expect(result.Notifications).toHaveLength(1);
      expect(result.Notifications[0].Message?.Body).toBe('Hello inbound');
    });

    it('returns Success:false + 400 on an empty body, without throwing', async () => {
      const result = await provider.ParseNotification(buildInput({ RawBody: '' }));
      expect(result.Success).toBe(false);
      expect(result.SuggestedResponseStatus).toBe(400);
      expect(result.Notifications).toEqual([]);
      expect(mockValidateRequest).not.toHaveBeenCalled();
    });

    it('never throws on hostile/garbage input', async () => {
      mockValidateRequest.mockReturnValue(false);
      const garbage = ['', '   ', '&&&', '=', '%', 'not-a-query'];
      for (const raw of garbage) {
        const result = await provider.ParseNotification(buildInput({ RawBody: raw }));
        expect(typeof result.Success).toBe('boolean');
        expect(Array.isArray(result.Notifications)).toBe(true);
      }
    });
  });
});
