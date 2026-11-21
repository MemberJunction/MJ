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
    const unsubUrl = 'https://app.example.com/comms/unsubscribe/unsub-1';
    const html = `<p><a href="https://example.com/offer?id=42">Offer</a> <a href="${unsubUrl}">Unsub</a> <a href="mailto:help@example.com">Mail</a></p>`;

    const rewritten = RewriteLinksForTracking(
      html,
      token,
      secret,
      'https://app.example.com',
      [unsubUrl],
    );

    expect(rewritten).toContain('https://app.example.com/comms/click/tok-123?u=');
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
      '<html><body><p>Hi</p><img src="https://app.example.com/comms/open/tok-abc.gif" width="1" height="1" alt="" style="display:none;" /></body></html>',
    );

    const noBody = InjectOpenPixel('<p>Hi</p>', 'tok-abc');
    expect(noBody).toContain('/comms/open/tok-abc.gif');

    const withApiPrefix = InjectOpenPixel('<p>Hi</p>', 'tok-abc', 'https://app.example.com/api/comms');
    expect(withApiPrefix).toContain('https://app.example.com/api/comms/open/tok-abc.gif');
  });

  it('detects protected-element tampering via SHA-256 hash assertion', () => {
    const snapshot: ProtectedComplianceSnapshot = {
      From: 'news@example.com',
      To: 'user@example.com',
      ListUnsubscribe: '<https://app.example.com/comms/unsubscribe/u1>',
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
      checkSenderPermission: () => Promise<{ Allowed: boolean; ErrorMessage?: string }>;
    };
    vi.spyOn(svcInternal, 'resolveSender').mockResolvedValue({
      ID: 'sender-1',
      CommunicationProviderID: 'prov-1',
      SendingDomain: 'example.com',
      CredentialID: null,
    });
    vi.spyOn(svcInternal, 'checkSenderPermission').mockResolvedValue({ Allowed: true });

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

  it('fails closed on preference lookup error, enforces sender permissions, and blocks Operational on User Unsubscribe in V1 gate', async () => {
    const { RunView } = await import('@memberjunction/core');
    const service = new V2SendService();
    const svcInternal = service as unknown as {
      loadPreference: (id: string, user: unknown) => Promise<unknown>;
      loadPrincipalPreferences: (refs: unknown[], prefId: string, senderId: string, user: unknown) => Promise<unknown>;
      checkSenderPermission: (sender: { ID: string; Name: string; ParentSenderID: string | null }, user: { ID: string; UserRoles: Array<{ RoleID: string }> }) => Promise<{ Allowed: boolean; ErrorMessage?: string }>;
      loadSenderAncestry: (sender: unknown, user: unknown) => Promise<unknown[]>;
    };

    vi.spyOn(RunView.prototype, 'RunView').mockResolvedValueOnce({
      Success: false,
      Results: [],
      ErrorMessage: 'DB timeout',
    } as never);
    await expect(svcInternal.loadPreference('pref-1', {})).rejects.toThrow('Failed loading communication preference');

    vi.spyOn(RunView.prototype, 'RunView').mockResolvedValueOnce({
      Success: false,
      Results: [],
      ErrorMessage: 'DB timeout',
    } as never);
    await expect(
      svcInternal.loadPrincipalPreferences([{ EntityID: 'ent-1', RecordID: 'rec-1' }], 'pref-1', 'sender-1', {}),
    ).rejects.toThrow('Failed loading communication principal preferences');

    // Sender permission enforcement: blocks user without Send/Manage, allows user with Send role
    const testSender = { ID: 'sender-1', Name: 'Marketing Sender', ParentSenderID: null };
    vi.spyOn(svcInternal, 'loadSenderAncestry').mockResolvedValue([testSender]);
    vi.spyOn(RunView.prototype, 'RunView').mockResolvedValueOnce({
      Success: true,
      Results: [{ CommunicationSenderID: 'sender-1', UserID: null, RoleID: 'role-comms', PermissionLevel: 'Send', AppliesToChildSenders: true }],
    } as never);
    const denied = await svcInternal.checkSenderPermission(testSender, { ID: 'user-1', UserRoles: [{ RoleID: 'role-other' }] });
    expect(denied.Allowed).toBe(false);

    vi.spyOn(RunView.prototype, 'RunView').mockResolvedValueOnce({
      Success: true,
      Results: [{ CommunicationSenderID: 'sender-1', UserID: null, RoleID: 'role-comms', PermissionLevel: 'Send', AppliesToChildSenders: true }],
    } as never);
    const allowed = await svcInternal.checkSenderPermission(testSender, { ID: 'user-1', UserRoles: [{ RoleID: 'role-comms' }] });
    expect(allowed.Allowed).toBe(true);

    // V1 compliance gate blocks Operational on User Unsubscribe
    vi.spyOn(RunView.prototype, 'RunView')
      .mockResolvedValueOnce({
        Success: true,
        Results: [{ ID: 'ep-1', Status: 'Active' }],
      } as never)
      .mockResolvedValueOnce({
        Success: true,
        Results: [{ ID: 'sup-1', Reason: 'User Unsubscribe', Status: 'Active', ExpiresAt: null }],
      } as never);
    const v1Res = await service.CheckV1ComplianceGate('chan-email', 'user@example.com', 'Operational', {} as never);
    expect(v1Res.Allowed).toBe(false);
    expect(v1Res.Reason).toBe('User Unsubscribe');
  });

  it('fails closed on missing/failed CommunicationRunID lookup and does not treat In-Progress without ProviderMessageID as Sent', async () => {
    const { RunView } = await import('@memberjunction/core');
    const { CommunicationEngineBase } = await import('@memberjunction/communication-types');
    const service = new V2SendService();
    const svcInternal = service as unknown as {
      resolveSender: () => Promise<{ ID: string; Name: string; CommunicationProviderID: string; SendingDomain: string; CredentialID: null }>;
      checkSenderPermission: () => Promise<{ Allowed: boolean }>;
      claimOrCreateV2Log: (
        params: unknown,
        sender: unknown,
        providerID: string,
        pmtID: string,
        runID: string,
        target: unknown,
        initialStatus: 'In-Progress' | 'Pending',
        user: unknown,
      ) => Promise<{ Log?: { ID: string }; AlreadySent?: boolean; FailureReason?: string }>;
    };

    vi.spyOn(svcInternal, 'resolveSender').mockResolvedValue({
      ID: 'sender-1',
      Name: 'Sender',
      CommunicationProviderID: 'prov-1',
      SendingDomain: 'example.com',
      CredentialID: null,
    });
    vi.spyOn(svcInternal, 'checkSenderPermission').mockResolvedValue({ Allowed: true });
    vi.spyOn(CommunicationEngineBase.Instance, 'Providers', 'get').mockReturnValue([
      { ID: 'prov-1', Name: 'SendGrid', RequireVerifiedDomain: false, MessageTypes: [] } as never,
    ]);
    const startRunSpy = vi.spyOn(CommunicationEngineBase.Instance, 'StartRun');

    // Failed run lookup must fail without calling StartRun()
    vi.spyOn(RunView.prototype, 'RunView').mockResolvedValueOnce({
      Success: false,
      Results: [],
      ErrorMessage: 'Connection lost',
    } as never);
    const runFailRes = await service.Send(
      {
        CommunicationRunID: 'run-missing',
        Envelope: { MessageClass: 'Marketing', ChannelID: 'chan-email' },
        Recipients: [{ Endpoint: { Address: 'a@example.com' } }],
      },
      {} as never,
      () => ({} as never),
    );
    expect(runFailRes.Success).toBe(false);
    expect(startRunSpy).not.toHaveBeenCalled();

    // In-Progress log without ProviderMessageID must NOT report AlreadySent
    vi.spyOn(RunView.prototype, 'RunView').mockResolvedValueOnce({
      Success: true,
      Results: [{ ID: 'log-inprog', Status: 'In-Progress', ProviderMessageID: null }],
    } as never);
    const inProgClaim = await svcInternal.claimOrCreateV2Log(
      { CommunicationRunID: 'run-1', Envelope: { MessageClass: 'Marketing', ChannelID: 'chan-email' } },
      { ID: 'sender-1' },
      'prov-1',
      'pmt-1',
      'run-1',
      { Endpoint: { CommunicationEndpointID: 'ep-1', NormalizedValue: 'a@example.com' }, Obligations: {}, AuditSnapshot: {} },
      'In-Progress',
      {},
    );
    expect(inProgClaim.AlreadySent).toBeUndefined();
    expect(inProgClaim.FailureReason).toBe('LogAlreadyInProgress');

    // Complete log or ProviderMessageID set DOES report AlreadySent
    vi.spyOn(RunView.prototype, 'RunView').mockResolvedValueOnce({
      Success: true,
      Results: [{ ID: 'log-done', Status: 'Complete', ProviderMessageID: 'sg-msg-1' }],
    } as never);
    const doneClaim = await svcInternal.claimOrCreateV2Log(
      { CommunicationRunID: 'run-1', Envelope: { MessageClass: 'Marketing', ChannelID: 'chan-email' } },
      { ID: 'sender-1' },
      'prov-1',
      'pmt-1',
      'run-1',
      { Endpoint: { CommunicationEndpointID: 'ep-1', NormalizedValue: 'a@example.com' }, Obligations: {}, AuditSnapshot: {} },
      'In-Progress',
      {},
    );
    expect(doneClaim.AlreadySent).toBe(true);
  });

  it('defers sends with future Envelope.ScheduledAt to Pending logs with __deferredPayload', async () => {
    const svc = new V2SendService();
    const svcInternal = svc as unknown as {
      EvaluateEligibility: ReturnType<typeof vi.fn>;
      claimOrCreateV2Log: ReturnType<typeof vi.fn>;
      executeInlineSend: (
        params: Record<string, unknown>,
        sender: Record<string, unknown>,
        providerEntity: Record<string, unknown>,
        run: Record<string, unknown>,
        contextUser: Record<string, unknown>,
        getProvider: (name: string) => { SendSingleMessage: ReturnType<typeof vi.fn> },
      ) => Promise<{ DeferredCount: number; QueuedCount: number; Outcomes?: Array<{ Status: string; DeferUntil?: Date }> }>;
    };

    const futureDate = new Date(Date.now() + 3_600_000);
    svcInternal.EvaluateEligibility = vi.fn().mockResolvedValue({
      Sendable: [
        {
          Decision: 'Allowed',
          Endpoint: { CommunicationEndpointID: 'ep-1', NormalizedValue: 'a@example.com' },
          Obligations: {},
          AuditSnapshot: {},
        },
      ],
      Blocked: [],
    });
    svcInternal.claimOrCreateV2Log = vi.fn().mockResolvedValue({ Log: { ID: 'log-pending-1' } });
    const sendSingleMock = vi.fn();

    const result = await svcInternal.executeInlineSend(
      {
        Envelope: { MessageClass: 'Operational', ChannelID: 'chan-email', ScheduledAt: futureDate },
        Payload: { Subject: 'Scheduled Hello', Body: 'Body text' },
        Recipients: [{ Endpoint: { Address: 'a@example.com' } }],
      },
      { ID: 'sender-1', CredentialID: null },
      { ID: 'prov-1', Name: 'SendGrid', MessageTypes: [{ ID: 'pmt-1', CommunicationBaseMessageTypeID: 'chan-email' }] },
      { ID: 'run-1', Save: vi.fn().mockResolvedValue(true) },
      {},
      () => ({ SendSingleMessage: sendSingleMock }),
    );

    expect(sendSingleMock).not.toHaveBeenCalled();
    expect(result.DeferredCount).toBe(1);
    expect(result.QueuedCount).toBe(0);
    expect(result.Outcomes?.[0].Status).toBe('Deferred');
    expect(svcInternal.claimOrCreateV2Log).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'prov-1',
      'pmt-1',
      'run-1',
      expect.objectContaining({ DeferUntil: futureDate }),
      'Pending',
      expect.anything(),
      expect.objectContaining({ Subject: 'Scheduled Hello', Body: 'Body text' }),
    );
  });
});
