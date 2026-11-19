import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  ComputeEndpointHash,
  NormalizeEndpointAddress,
} from '../DefaultCommunicationPrincipal';
import {
  ComputeProtectedElementsHash,
  ComputeTrackingSignature,
  InjectOpenPixel,
  ProtectedComplianceSnapshot,
  RewriteLinksForTracking,
  V2SendService,
  VerifyTrackingSignature,
} from '../V2SendService';

describe('V2 Endpoint Normalization & Tracking Primitives', () => {
  it('normalizes email & phone addresses and computes deterministic SHA-256 ValueHash', () => {
    const email = NormalizeEndpointAddress('  Alice.Smith+Tag@Example.COM  ', 'Email');
    expect(email).not.toBeNull();
    expect(email!.NormalizedValue).toBe('alice.smith+tag@example.com');
    expect(email!.Domain).toBe('example.com');
    expect(email!.ValueHash).toBe(ComputeEndpointHash('alice.smith+tag@example.com'));
    expect(email!.ValueHash).toHaveLength(64);

    const phone = NormalizeEndpointAddress('+1 (512) 555-0199', 'SMS');
    expect(phone).not.toBeNull();
    expect(phone!.NormalizedValue).toBe('+15125550199');
    expect(phone!.Domain).toBeUndefined();
  });

  it('rewrites HTTP/HTTPS links with valid HMAC-SHA256 signature and excludes unsubscribe URLs', () => {
    const token = 'tok-123';
    const secret = 'super-secret-key';
    const unsubUrl = 'https://app.example.com/api/comms/unsubscribe/unsub-1';
    const html = `<p><a href="https://example.com/offer?id=42">Offer</a> <a href="${unsubUrl}">Unsub</a> <a href="mailto:help@example.com">Mail</a></p>`;

    const rewritten = RewriteLinksForTracking(
      html,
      token,
      secret,
      'https://app.example.com',
      [unsubUrl],
    );

    expect(rewritten).toContain('https://app.example.com/api/comms/click/tok-123?u=');
    expect(rewritten).toContain(`href="${unsubUrl}"`);
    expect(rewritten).toContain('href="mailto:help@example.com"');

    const match = rewritten.match(/u=([^&"]+)&sig=([a-f0-9]+)/);
    expect(match).not.toBeNull();
    const decodedUrl = decodeURIComponent(match![1]);
    expect(decodedUrl).toBe('https://example.com/offer?id=42');
    expect(VerifyTrackingSignature(token, decodedUrl, match![2], secret)).toBe(true);
    expect(VerifyTrackingSignature(token, decodedUrl, match![2], 'wrong-secret')).toBe(false);
    expect(ComputeTrackingSignature(token, decodedUrl, secret)).toBe(match![2]);
  });

  it('injects open pixel before </body> or appends when </body> is absent', () => {
    const withBody = InjectOpenPixel('<html><body><p>Hi</p></body></html>', 'tok-abc', 'https://app.example.com');
    expect(withBody).toBe(
      '<html><body><p>Hi</p><img src="https://app.example.com/api/comms/open/tok-abc.gif" width="1" height="1" alt="" style="display:none;" /></body></html>',
    );

    const noBody = InjectOpenPixel('<p>Hi</p>', 'tok-abc');
    expect(noBody).toContain('/api/comms/open/tok-abc.gif');
  });

  it('detects protected-element tampering via SHA-256 hash assertion', () => {
    const snapshot: ProtectedComplianceSnapshot = {
      From: 'news@example.com',
      To: 'user@example.com',
      ListUnsubscribe: '<https://app.example.com/api/comms/unsubscribe/u1>',
      ListUnsubscribePost: 'List-Unsubscribe=One-Click',
      FooterHTML: '<div>123 Main St | Unsubscribe</div>',
      LogID: 'log-1',
    };
    const originalHash = ComputeProtectedElementsHash(snapshot);

    // Mutate protected element
    snapshot.ListUnsubscribe = undefined;
    const tamperedHash = ComputeProtectedElementsHash(snapshot);
    expect(tamperedHash).not.toBe(originalHash);
  });
});

describe('V2SendService chunk fan-out', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fans out chunks to comms.dispatch when recipient count exceeds AsyncThreshold', async () => {
    const service = new V2SendService();
    const enqueued: Array<{ taskType: string; count: number }> = [];

    service.Configure({
      ChunkSize: 2,
      AsyncThreshold: 3,
      EnqueueWork: async (taskType, payload) => {
        const recipients = payload.Recipients as unknown[];
        enqueued.push({ taskType, count: recipients.length });
      },
    });

    // Stub internal sender/provider/run helpers to isolate fan-out orchestration
    const svcInternal = service as unknown as {
      resolveSender: () => Promise<{ ID: string; CommunicationProviderID: string; SendingDomain: string; CredentialID: null }>;
    };
    vi.spyOn(svcInternal, 'resolveSender').mockResolvedValue({
      ID: 'sender-1',
      CommunicationProviderID: 'prov-1',
      SendingDomain: 'example.com',
      CredentialID: null,
    });

    const { CommunicationEngineBase } = await import('@memberjunction/communication-types');
    vi.spyOn(CommunicationEngineBase.Instance, 'Providers', 'get').mockReturnValue([
      { ID: 'prov-1', Name: 'SendGrid', RequireVerifiedDomain: false, MessageTypes: [] } as never,
    ]);
    vi.spyOn(CommunicationEngineBase.Instance, 'StartRun').mockResolvedValue({ ID: 'run-v2-1' } as never);

    const result = await service.Send(
      {
        Envelope: { MessageClass: 'Marketing', ChannelID: 'chan-email' },
        Recipients: [
          { Endpoint: { Address: 'a@example.com' } },
          { Endpoint: { Address: 'b@example.com' } },
          { Endpoint: { Address: 'c@example.com' } },
          { Endpoint: { Address: 'd@example.com' } },
          { Endpoint: { Address: 'e@example.com' } },
        ],
      },
      {} as never,
      () => ({} as never),
    );

    expect(result.Success).toBe(true);
    expect(result.IsAsyncRun).toBe(true);
    expect(result.CommunicationRunID).toBe('run-v2-1');
    expect(enqueued).toEqual([
      { taskType: 'comms.dispatch', count: 2 },
      { taskType: 'comms.dispatch', count: 2 },
      { taskType: 'comms.dispatch', count: 1 },
    ]);
  });
});
