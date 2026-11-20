/**
 * Unit tests for SendGridProvider Track D features:
 * - Outbound: verbatim Headers, first-party tracking disable, mj_log_id customArgs, x-message-id capture
 * - Inbound Event Webhook: ECDSA signature + 10-min replay window, bounce_classification & Dropped mapping
 * - Domain Authentication: Create, Verify (with _dmarc TXT check), Delete
 * - Suppression Sync: RemoveSuppression
 */
import crypto from 'node:crypto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockSgSend, mockSetApiKey, mockResolveTxt, drainResponseBodyMock } = vi.hoisted(() => ({
  mockSgSend: vi.fn(),
  mockSetApiKey: vi.fn(),
  mockResolveTxt: vi.fn(),
  drainResponseBodyMock: vi.fn(),
}));

vi.mock('@sendgrid/mail', () => ({
  default: {
    setApiKey: mockSetApiKey,
    send: mockSgSend,
  },
}));

vi.mock('node:dns/promises', () => ({
  default: {
    resolveTxt: mockResolveTxt,
  },
  resolveTxt: mockResolveTxt,
}));

vi.mock('@memberjunction/communication-types', async () => ({
  ...(await vi.importActual<{ ParseEmailAddressList: (headerValue: string | null | undefined) => string[] }>(
    '../../../../base-types/src/AddressUtils'
  )),
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
  API_KEY: 'env-sendgrid-key',
  get __API_KEY() { return this.API_KEY; },
}));

vi.mock('@memberjunction/network-utils', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/network-utils');
  return {
    ...actual,
    DrainResponseBody: (...args: unknown[]) => drainResponseBodyMock(...args),
  };
});

import { SendGridProvider, VerifySendGridWebhookSignature } from '../SendGridProvider';
import type { ProcessedMessage } from '@memberjunction/communication-types';

function createMessage(overrides: Partial<ProcessedMessage> = {}): ProcessedMessage {
  return {
    From: 'sender@example.com',
    FromName: 'Test Sender',
    To: 'recipient@example.com',
    ProcessedSubject: 'Test Email',
    ProcessedBody: 'Plain text body',
    ProcessedHTMLBody: '<p>HTML body</p>',
    Headers: {},
    ContextData: {},
    ...overrides,
  } as unknown as ProcessedMessage;
}

describe('SendGridProvider — Outbound V2 enhancements', () => {
  let provider: SendGridProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new SendGridProvider();
  });

  it('passes message.Headers verbatim without X- prefixing List-Unsubscribe', async () => {
    mockSgSend.mockResolvedValue([{ statusCode: 202, body: '', headers: { 'x-message-id': 'sg-msg-1' } }]);

    await provider.SendSingleMessage(createMessage({
      Headers: {
        'List-Unsubscribe': '<https://api.example.com/comms/unsubscribe?token=abc>',
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }));

    expect(mockSgSend).toHaveBeenCalledWith(expect.objectContaining({
      headers: {
        'List-Unsubscribe': '<https://api.example.com/comms/unsubscribe?token=abc>',
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }));
  });

  it('disables openTracking and clickTracking when MJ first-party tracking is active', async () => {
    mockSgSend.mockResolvedValue([{ statusCode: 202, body: '', headers: {} }]);

    await provider.SendSingleMessage(createMessage({
      ContextData: {
        mjFirstPartyTracking: true,
        TrackingToken: 'tok-123',
      },
    }));

    expect(mockSgSend).toHaveBeenCalledWith(expect.objectContaining({
      trackingSettings: {
        subscriptionTracking: { enable: false },
        openTracking: { enable: false },
        clickTracking: { enable: false },
      },
    }));
  });

  it('injects customArgs with mj_log_id only (no PII CorrelationData)', async () => {
    mockSgSend.mockResolvedValue([{ statusCode: 202, body: '', headers: {} }]);

    await provider.SendSingleMessage(createMessage({
      ContextData: {
        mj_log_id: 'log-uuid-1234',
        CorrelationData: { ssn: '123-45-6789', fullName: 'Jane Doe' },
        email: 'pii@example.com',
      },
    }));

    const sentPayload = mockSgSend.mock.calls[0][0] as { customArgs?: Record<string, string> };
    expect(sentPayload.customArgs).toEqual({ mj_log_id: 'log-uuid-1234' });
  });

  it('captures x-message-id header into MessageResult.ProviderMessageID', async () => {
    mockSgSend.mockResolvedValue([{
      statusCode: 202,
      body: '',
      headers: { 'x-message-id': 'sg-msg-xyz-999' },
    }]);

    const result = await provider.SendSingleMessage(createMessage());

    expect(result.Success).toBe(true);
    expect(result.ProviderMessageID).toBe('sg-msg-xyz-999');
  });
});

describe('SendGridProvider — Event Webhook ParseNotification', () => {
  let provider: SendGridProvider;
  let publicKeyPem: string;
  let privateKeyPem: string;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new SendGridProvider();
    const pair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    publicKeyPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    privateKeyPem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  });

  function signPayload(rawBody: string, timestampSec: number): { signature: string; timestamp: string } {
    const timestamp = String(timestampSec);
    const signer = crypto.createSign('SHA256');
    signer.update(timestamp);
    signer.update(rawBody);
    signer.end();
    return { signature: signer.sign(privateKeyPem, 'base64'), timestamp };
  }

  it('verifies valid ECDSA signature and normalizes all event types', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const events = [
      {
        email: 'Alice@Example.com',
        timestamp: nowSec,
        event: 'bounce',
        sg_event_id: 'evt-hard',
        sg_message_id: 'msg-1',
        mj_log_id: 'log-1',
        bounce_classification: 'Invalid Address',
        type: 'bounce',
        status: '550',
        reason: '550 5.1.1 User unknown',
      },
      {
        email: 'bob@example.com',
        timestamp: nowSec,
        event: 'bounce',
        sg_event_id: 'evt-soft',
        sg_message_id: 'msg-2',
        bounce_classification: 'Mailbox Unavailable',
        type: 'blocked',
        status: '421',
        reason: '421 Try again later',
      },
      {
        email: 'carol@example.com',
        timestamp: nowSec,
        event: 'dropped',
        sg_event_id: 'evt-drop',
        sg_message_id: 'msg-3',
        reason: 'Unsubscribed Address',
      },
      {
        email: 'dave@example.com',
        timestamp: nowSec,
        event: 'open',
        sg_event_id: 'evt-open',
        sg_message_id: 'msg-4',
        sg_machine_open: true,
        ip: '1.2.3.4',
        useragent: 'AppleMail',
      },
      {
        email: 'eve@example.com',
        timestamp: nowSec,
        event: 'click',
        sg_event_id: 'evt-click',
        sg_message_id: 'msg-5',
        url: 'https://example.com/promo',
      },
      {
        email: 'frank@example.com',
        timestamp: nowSec,
        event: 'spamreport',
        sg_event_id: 'evt-spam',
        sg_message_id: 'msg-6',
      },
      {
        email: 'grace@example.com',
        timestamp: nowSec,
        event: 'group_unsubscribe',
        sg_event_id: 'evt-unsub',
        sg_message_id: 'msg-7',
      },
    ];
    const rawBody = JSON.stringify(events);
    const { signature, timestamp } = signPayload(rawBody, nowSec);

    const res = await provider.ParseNotification(
      {
        Headers: {
          'content-type': 'application/json',
          'x-twilio-email-event-webhook-signature': signature,
          'x-twilio-email-event-webhook-timestamp': timestamp,
        },
        QueryParams: {},
        RawBody: rawBody,
      },
      { webhookVerificationKey: publicKeyPem }
    );

    expect(res.Success).toBe(true);
    expect(res.SignatureValid).toBe(true);
    expect(res.Notifications).toHaveLength(1);
    const notif = res.Notifications[0];
    expect(notif.Kind).toBe('activity');
    const act = notif.ActivityEvents!;
    expect(act).toHaveLength(7);

    expect(act[0]).toMatchObject({
      EventType: 'Hard Bounce',
      ProviderEventID: 'evt-hard',
      ProviderMessageID: 'msg-1',
      CommunicationLogID: 'log-1',
      NormalizedAddress: 'alice@example.com',
      BounceCode: '550',
    });
    expect(act[1]).toMatchObject({ EventType: 'Soft Bounce', ProviderEventID: 'evt-soft' });
    expect(act[2]).toMatchObject({ EventType: 'Dropped', DropReason: 'Unsubscribed Address', ProviderEventID: 'evt-drop' });
    expect(act[3]).toMatchObject({ EventType: 'Opened', IsMachineEvent: true, IPAddress: '1.2.3.4' });
    expect(act[4]).toMatchObject({ EventType: 'Clicked', TargetURL: 'https://example.com/promo' });
    expect(act[5]).toMatchObject({ EventType: 'Spam Complaint', ProviderEventID: 'evt-spam' });
    expect(act[6]).toMatchObject({ EventType: 'Unsubscribed', ProviderEventID: 'evt-unsub' });
  });

  it('rejects tampered ECDSA signature with 401 and SignatureValid=false', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const rawBody = JSON.stringify([{ email: 'a@b.com', timestamp: nowSec, event: 'delivered', sg_event_id: 'e1' }]);
    const { signature, timestamp } = signPayload(rawBody, nowSec);

    const res = await provider.ParseNotification(
      {
        Headers: {
          'content-type': 'application/json',
          'x-twilio-email-event-webhook-signature': signature,
          'x-twilio-email-event-webhook-timestamp': timestamp,
        },
        QueryParams: {},
        RawBody: rawBody + ' ',
      },
      { webhookVerificationKey: publicKeyPem }
    );

    expect(res.Success).toBe(false);
    expect(res.SignatureValid).toBe(false);
    expect(res.SuggestedResponseStatus).toBe(401);
  });

  it('rejects webhooks outside the 10-minute replay window', () => {
    const nowSec = 1_700_000_000;
    const staleTs = nowSec - 601;
    const rawBody = '[]';
    const { signature, timestamp } = signPayload(rawBody, staleTs);

    const check = VerifySendGridWebhookSignature(publicKeyPem, rawBody, signature, timestamp, nowSec);
    expect(check.Valid).toBe(false);
    expect(check.Reason).toContain('10-minute');
  });

  it('maps all Dropped reasons accurately', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const rawBody = JSON.stringify([
      { email: 'a@b.com', timestamp: nowSec, event: 'dropped', sg_event_id: 'd1', reason: 'Invalid' },
      { email: 'b@b.com', timestamp: nowSec, event: 'dropped', sg_event_id: 'd2', reason: 'Bounced Address' },
      { email: 'c@b.com', timestamp: nowSec, event: 'dropped', sg_event_id: 'd3', reason: 'Unsubscribed Address' },
      { email: 'd@b.com', timestamp: nowSec, event: 'dropped', sg_event_id: 'd4', reason: 'Spam Reporting Address' },
    ]);

    const { signature, timestamp } = signPayload(rawBody, nowSec);
    const res = await provider.ParseNotification(
      {
        Headers: {
          'content-type': 'application/json',
          'x-twilio-email-event-webhook-signature': signature,
          'x-twilio-email-event-webhook-timestamp': timestamp,
        },
        QueryParams: {},
        RawBody: rawBody,
      },
      { webhookVerificationKey: publicKeyPem },
    );

    expect(res.Success).toBe(true);
    expect(res.Notifications[0].ActivityEvents?.map((e) => e.DropReason)).toEqual([
      'Invalid',
      'Bounced Address',
      'Unsubscribed Address',
      'Spam Reporting Address',
    ]);
  });
});

describe('SendGridProvider — Domain Authentication & Suppression Sync', () => {
  let provider: SendGridProvider;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    originalFetch = globalThis.fetch;
    provider = new SendGridProvider();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('CreateDomainAuthentication registers domain and maps DNS records', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      text: async () => JSON.stringify({
        id: 12345,
        dns: {
          mail_cname: { host: 'em1.example.com', type: 'cname', data: 'u123.wl.sendgrid.net', valid: false },
          dkim1: { host: 's1._domainkey.example.com', type: 'cname', data: 's1.domainkey.u123.wl.sendgrid.net', valid: false },
          dkim2: { host: 's2._domainkey.example.com', type: 'cname', data: 's2.domainkey.u123.wl.sendgrid.net', valid: false },
        },
      }),
    }) as unknown as typeof fetch;

    const res = await provider.CreateDomainAuthentication({ Domain: 'example.com', Subdomain: 'em1' });

    expect(res.Success).toBe(true);
    expect(res.ProviderDomainID).toBe('12345');
    expect(res.DNSRecords).toHaveLength(3);
    expect(res.DNSRecords[0]).toMatchObject({ Type: 'CNAME', Purpose: 'ReturnPath', Host: 'em1.example.com' });
    expect(res.DNSRecords[1]).toMatchObject({ Type: 'CNAME', Purpose: 'DKIM' });
  });

  it('VerifyDomainAuthentication validates SendGrid records and _dmarc TXT record', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        valid: true,
        validation_results: {
          mail_cname: { valid: true, reason: null },
          dkim1: { valid: true, reason: null },
          dkim2: { valid: true, reason: null },
        },
      }),
    }) as unknown as typeof fetch;
    mockResolveTxt.mockResolvedValue([['v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com']]);

    const res = await provider.VerifyDomainAuthentication({ ProviderDomainID: '12345', Domain: 'example.com' });

    expect(res.Success).toBe(true);
    expect(res.Verified).toBe(true);
    expect(mockResolveTxt).toHaveBeenCalledWith('_dmarc.example.com');
    const dmarc = res.DNSRecords.find((r) => r.Purpose === 'DMARC');
    expect(dmarc).toMatchObject({ Type: 'TXT', Host: '_dmarc.example.com', Validated: true });
  });

  it('VerifyDomainAuthentication reports Verified=false when _dmarc TXT is missing', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        valid: true,
        validation_results: { dkim1: { valid: true } },
      }),
    }) as unknown as typeof fetch;
    mockResolveTxt.mockRejectedValue(new Error('queryTxt ENOTFOUND _dmarc.example.com'));

    const res = await provider.VerifyDomainAuthentication({ ProviderDomainID: '12345', Domain: 'example.com' });

    expect(res.Success).toBe(true);
    expect(res.Verified).toBe(false);
    const dmarc = res.DNSRecords.find((r) => r.Purpose === 'DMARC');
    expect(dmarc?.Validated).toBe(false);
    expect(dmarc?.LastError).toContain('ENOTFOUND');
  });

  it('DeleteDomainAuthentication treats 404 as idempotent success and drains body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => '' }) as unknown as typeof fetch;

    const res = await provider.DeleteDomainAuthentication({ ProviderDomainID: '12345' });

    expect(res.Success).toBe(true);
    expect(drainResponseBodyMock).toHaveBeenCalledTimes(1);
  });

  it('RemoveSuppression clears SendGrid suppression entries and drains bodies', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204, text: async () => '' }) as unknown as typeof fetch;

    const res = await provider.RemoveSuppression('User@Example.com', 'bounces');

    expect(res.Success).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.sendgrid.com/v3/suppression/bounces/user%40example.com',
      expect.objectContaining({ method: 'DELETE' })
    );
    expect(drainResponseBodyMock).toHaveBeenCalledTimes(1);
  });
});
