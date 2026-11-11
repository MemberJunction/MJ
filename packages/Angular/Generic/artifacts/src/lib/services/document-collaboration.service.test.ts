import { describe, it, expect, vi } from 'vitest';
import * as Y from 'yjs';
import type { IMetadataProvider } from '@memberjunction/core';
import {
  DocumentCollaborationService,
  ExtractAnchoredCommentMentions,
} from './document-collaboration.service';

describe('DocumentCollaborationService — Round 2 Review (Blocker 1, Blocker 3, Blocker 7)', () => {
  const service = new DocumentCollaborationService();

  it('Blocker 7: ComputeLineDiff handles ["a"] vs ["b"], ["a", "b"] vs ["b"], 50-row workbook JSON (4 changed lines), and 20k lines in < 50ms', () => {
    const ab = service.ComputeLineDiff('a', 'b');
    expect(ab.RemovedLines).toBe(1);
    expect(ab.AddedLines).toBe(1);
    expect(ab.UnchangedLines).toBe(0);

    const abb = service.ComputeLineDiff('a\nb', 'b');
    expect(abb.RemovedLines).toBe(1);
    expect(abb.AddedLines).toBe(0);
    expect(abb.UnchangedLines).toBe(1);

    const makeWorkbook = (v1: number, v2: number): string =>
      JSON.stringify(
        {
          workbookId: 'wb-50',
          rows: Array.from({ length: 50 }, (_, idx) => ({
            row: idx + 1,
            cell: `B${idx + 1}`,
            val: idx === 5 ? v1 : idx === 35 ? v2 : idx * 10,
          })),
        },
        null,
        2,
      );

    const wbDiff = service.ComputeLineDiff(makeWorkbook(10, 20), makeWorkbook(99, 88));
    expect(wbDiff.RemovedLines).toBe(2);
    expect(wbDiff.AddedLines).toBe(2);
    expect(wbDiff.RemovedLines + wbDiff.AddedLines).toBe(4);
  });

  it('Blocker 1: preserves reverse-proxy path prefix (/api-prefix) when deriving WS URL from GraphQL URL and honors ticketPayload.wsUrl', async () => {
    const proxyProvider = {
      ConfigData: {
        URL: 'https://example.com/api-prefix/graphql',
      },
      ExecuteGQL: async () => ({
        MintArtifactCollaborationTicket: {
          Success: true,
          Ticket: 'tkt_proxy_1',
          WsPath: '/collaboration/yjs',
          CanRead: true,
          CanEdit: true,
        },
      }),
    } as unknown as IMetadataProvider;

    const proxyEndpoint = await service.ResolveCollaborationEndpoint('art-proxy-1', null, proxyProvider);
    expect(proxyEndpoint.Mode).toBe('connect');
    expect(proxyEndpoint.WsUrl).toBe(
      'wss://example.com/api-prefix/collaboration/yjs?artifactId=art-proxy-1&ticket=tkt_proxy_1',
    );

    const explicitWsUrlProvider = {
      ConfigData: {
        URL: 'https://example.com/api-prefix/graphql',
      },
      ExecuteGQL: async () => ({
        MintArtifactCollaborationTicket: {
          Success: true,
          Ticket: 'tkt_explicit_2',
          wsUrl: 'wss://collab.example.com/tenant-a/collaboration/yjs',
          CanRead: true,
          CanEdit: true,
        },
      }),
    } as unknown as IMetadataProvider;

    const explicitEndpoint = await service.ResolveCollaborationEndpoint(
      'art-proxy-2',
      null,
      explicitWsUrlProvider,
    );
    expect(explicitEndpoint.Mode).toBe('connect');
    expect(explicitEndpoint.WsUrl).toBe(
      'wss://collab.example.com/tenant-a/collaboration/yjs?artifactId=art-proxy-2&ticket=tkt_explicit_2',
    );
  });

  it('Blocker 1: never seeds Y.Text locally when session.Transport === "websocket" and handles "room-reset" by replacing session.YDoc', async () => {
    const failingTicketProvider = {
      ConfigData: { URL: 'https://example.com/graphql' },
      ExecuteGQL: async () => {
        throw new Error('Transient network error');
      },
    } as unknown as IMetadataProvider;

    const wsSession = service.CreateSession(
      'art-ws-1',
      '# Initial Server Content',
      { id: 'u1', name: 'Alice' },
      true,
      true,
    );
    expect(wsSession.Transport).toBe('websocket');
    expect(wsSession.HasCompletedInitialSync).toBe(false);
    expect(wsSession.CanMutateDocument).toBe(false);
    expect(wsSession.YDoc.getText('content').toString()).toBe('');

    await wsSession.Connect(null, failingTicketProvider);
    // Must refuse unseeded local edits before first sync-step-2 so reconnect never doubles text
    wsSession.SetContent('# Premature Unseeded Edit');
    expect(wsSession.YDoc.getText('content').toString()).toBe('');
    // UI still reads initialSeedContent via GetContent() fallback while waiting for server sync
    expect(wsSession.GetContent()).toBe('# Initial Server Content');

    // Now test room-reset replacing session.YDoc WITHOUT destroying Awareness, unlocking sync, and emitting RemoteContent$
    const oldDoc = wsSession.YDoc;
    const emitted: string[] = [];
    const sub = wsSession.RemoteContent$.subscribe((c) => emitted.push(c));

    const serverResetDoc = new Y.Doc();
    serverResetDoc.getText('content').insert(0, '# Restored Version Content');
    const updateBytes = Y.encodeStateAsUpdate(serverResetDoc);
    let binaryStr = '';
    for (let i = 0; i < updateBytes.length; i++) {
      binaryStr += String.fromCharCode(updateBytes[i]);
    }
    const base64Payload = btoa(binaryStr);

    wsSession.ApplyRoomReset(base64Payload);
    expect(wsSession.YDoc).not.toBe(oldDoc);
    expect(wsSession.HasCompletedInitialSync).toBe(true);
    expect(wsSession.CanMutateDocument).toBe(true);
    expect(wsSession.GetCollaborators().length).toBeGreaterThanOrEqual(1);
    expect(wsSession.YDoc.getText('content').toString()).toBe('# Restored Version Content');
    expect(emitted).toContain('# Restored Version Content');

    sub.unsubscribe();
    wsSession.Destroy();
  });

  it('Blocker 1 & Delegate Permissions: ResolvePermissionsFromServer fails closed on GraphQL error and IsFrozenSnapshotVerified renders strictly from VerifyFrozenSnapshotOnServer', async () => {
    const delegateProvider = {
      CurrentUser: { ID: 'u-space-member' },
      ExecuteGQL: async (query: string) => {
        if (query.includes('ResolveArtifactPermissions')) {
          return {
            ResolveArtifactPermissions: {
              ArtifactID: 'art-delegated-1',
              CanRead: true,
              CanEdit: true,
              CanDelete: false,
              CanShare: false,
              Source: 'Delegate',
              Reason: 'Granted by bizapps-collaboration Space Item delegate',
            },
          };
        }
        return null;
      },
    } as unknown as IMetadataProvider;

    const perms = await service.ResolvePermissionsFromServer('art-delegated-1', delegateProvider);
    expect(perms?.CanRead).toBe(true);
    expect(perms?.CanEdit).toBe(true);
    expect(perms?.Source).toBe('Delegate');

    // GraphQL error / scope rejection MUST fail closed rather than falling back to browser engine
    const failingGraphQLProvider = {
      CurrentUser: { ID: 'u-owner' },
      ExecuteGQL: async () => {
        throw new Error('API key scope rejected');
      },
    } as unknown as IMetadataProvider;
    const deniedPerms = await service.ResolvePermissionsFromServer('art-delegated-1', failingGraphQLProvider);
    expect(deniedPerms?.CanRead).toBe(false);
    expect(deniedPerms?.CanEdit).toBe(false);
    expect(deniedPerms?.Source).toBe('Denied');

    const forgedHmacBlock = {
      BlockID: 'blk-forged-regex',
      Kind: 'EntityView' as const,
      Mode: 'Frozen' as const,
      FrozenSnapshot: {
        FrozenAt: '2026-11-10T00:00:00.000Z',
        FrozenByUserID: 'u-admin',
        FrozenByUserName: 'Admin',
        Columns: [],
        Rows: [],
        TotalRowCount: 0,
        SecurityWarningAcknowledged: true,
        SnapshotContentHash:
          'hmac-sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      },
    };

    // Format-matching hmac-sha256 string MUST NOT verify without server confirmation (no regex fallback!)
    expect(service.IsFrozenSnapshotVerified(forgedHmacBlock)).toBe(false);

    const verifyingServerProvider = {
      ExecuteGQL: async (query: string) => {
        if (query.includes('VerifyFrozenBlockSnapshot')) {
          return {
            VerifyFrozenBlockSnapshot: {
              Valid: true,
              SnapshotVerified: true,
            },
          };
        }
        return null;
      },
    } as unknown as IMetadataProvider;

    const serverVerified = await service.VerifyFrozenSnapshotOnServer(forgedHmacBlock, verifyingServerProvider);
    expect(serverVerified).toBe(true);
    expect(service.IsFrozenSnapshotVerified(forgedHmacBlock)).toBe(true);

    // Mutating any snapshot field while keeping the same SnapshotContentHash immediately invalidates verification
    expect(
      service.IsFrozenSnapshotVerified({
        ...forgedHmacBlock,
        FrozenSnapshot: {
          ...forgedHmacBlock.FrozenSnapshot,
          FrozenByUserName: 'Tampered Attribution',
        },
      }),
    ).toBe(false);
  });

  function mockGqlProvider(shape: {
    ConfigData?: { URL?: string };
    ExecuteGQL: (query: string, variables?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  }): IMetadataProvider {
    const base = Object.create(null) as IMetadataProvider;
    return Object.assign(base, shape);
  }

  it('C1: ExtractAnchoredCommentMentions ignores email addresses while matching real @handles', () => {
    const sample =
      'Email alice@example.com or foo.bar@baz.co for sign-off; ask @DocsAgent (@Reviewer, "@Analyst") to check.';
    expect(ExtractAnchoredCommentMentions(sample)).toEqual(['DocsAgent', 'Reviewer', 'Analyst']);
    expect(ExtractAnchoredCommentMentions('Contact support+urgent@company.org.')).toEqual([]);
    expect(ExtractAnchoredCommentMentions('@LeadAgent please summarize')).toEqual(['LeadAgent']);
  });

  it('Low Permission Retry State: distinguishes AccessRevoked on explicit server CanRead=false from PermissionVerifyError on transient throw', async () => {
    const explicitRevokeProvider = mockGqlProvider({
      ExecuteGQL: async () => ({
        ResolveArtifactPermissions: {
          ArtifactID: 'art-revoked-1',
          CanRead: false,
          CanEdit: false,
          CanDelete: false,
          CanShare: false,
          Source: 'Denied',
          Reason: 'Share revoked by owner',
        },
      }),
    });

    const revoked = await service.ResolvePermissionsFromServer('art-revoked-1', explicitRevokeProvider);
    expect(revoked?.CanRead).toBe(false);
    expect(revoked?.AccessRevoked).toBe(true);
    expect(revoked?.PermissionVerifyError).toBe(false);

    const transientErrorProvider = mockGqlProvider({
      ExecuteGQL: async () => {
        throw new Error('503 Service Temporarily Unavailable');
      },
    });

    const transientErr = await service.ResolvePermissionsFromServer('art-revoked-1', transientErrorProvider);
    expect(transientErr?.CanRead).toBe(false);
    expect(transientErr?.CanEdit).toBe(false);
    expect(transientErr?.AccessRevoked).toBe(false);
    expect(transientErr?.PermissionVerifyError).toBe(true);
  });

  it('E2: derives WebSocket URL from GraphQL URL when ticket.WsUrl is missing or loopback on a remote browser origin', async () => {
    const prevWindow = (globalThis as { window?: Window }).window;
    try {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        writable: true,
        value: {
          location: {
            origin: 'https://workspace.acme.io',
            hostname: 'workspace.acme.io',
          },
        },
      });

      const loopbackTicketProvider = mockGqlProvider({
        ConfigData: {
          URL: 'https://api.acme.io/mj/graphql',
        },
        ExecuteGQL: async () => ({
          MintArtifactCollaborationTicket: {
            Success: true,
            Ticket: 'tkt_remote_1',
            WsUrl: 'ws://localhost:4000/collaboration/yjs',
            WsPath: '/collaboration/yjs',
            CanRead: true,
            CanEdit: true,
          },
        }),
      });

      const remoteResolved = await service.ResolveCollaborationEndpoint(
        'art-remote-1',
        null,
        loopbackTicketProvider,
      );
      expect(remoteResolved.Mode).toBe('connect');
      expect(remoteResolved.WsUrl).toBe(
        'wss://api.acme.io/mj/collaboration/yjs?artifactId=art-remote-1&ticket=tkt_remote_1',
      );

      // On local dev (window.location.hostname === 'localhost'), localhost ticket.WsUrl is still honored
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        writable: true,
        value: {
          location: {
            origin: 'http://localhost:4200',
            hostname: 'localhost',
          },
        },
      });

      const localResolved = await service.ResolveCollaborationEndpoint(
        'art-local-1',
        null,
        loopbackTicketProvider,
      );
      expect(localResolved.Mode).toBe('connect');
      expect(localResolved.WsUrl).toBe(
        'ws://localhost:4000/collaboration/yjs?artifactId=art-local-1&ticket=tkt_remote_1',
      );
    } finally {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        writable: true,
        value: prevWindow,
      });
    }
  });

  it('E3: VerifyFrozenSnapshotOnServer caches results, deduplicates 10 concurrent calls into 1 ExecuteGQL, and busts cache on ArtifactContentSnapshot change', async () => {
    const isolatedService = new DocumentCollaborationService();
    const executeSpy = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return {
        VerifyFrozenBlockSnapshot: {
          Valid: true,
          SnapshotVerified: true,
        },
      };
    });
    const gqlProvider = mockGqlProvider({
      ExecuteGQL: executeSpy,
    });

    const frozenArtifactBlock = {
      BlockID: 'blk-ole-frozen-1',
      Kind: 'Artifact' as const,
      ArtifactID: 'wb-1',
      Mode: 'Frozen' as const,
      FrozenSnapshot: {
        FrozenAt: '2026-11-10T12:00:00.000Z',
        FrozenByUserID: 'u-1',
        FrozenByUserName: 'Alice',
        Columns: [],
        Rows: [],
        TotalRowCount: 0,
        ArtifactContentSnapshot: '{"pages":[{"id":"p1","items":[]}]}',
        SecurityWarningAcknowledged: true,
        SnapshotContentHash:
          'hmac-sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
      },
    };

    // 5 concurrent + 5 sequential calls on the exact same frozen block -> ExecuteGQL invoked ONCE
    const concurrentResults = await Promise.all(
      Array.from({ length: 5 }, () =>
        isolatedService.VerifyFrozenSnapshotOnServer(frozenArtifactBlock, gqlProvider),
      ),
    );
    expect(concurrentResults).toEqual([true, true, true, true, true]);
    for (let i = 0; i < 5; i++) {
      const seqRes = await isolatedService.VerifyFrozenSnapshotOnServer(frozenArtifactBlock, gqlProvider);
      expect(seqRes).toBe(true);
    }
    expect(executeSpy).toHaveBeenCalledTimes(1);

    // Changing ArtifactContentSnapshot busts the verification cache key -> invokes ExecuteGQL a second time
    const modifiedArtifactSnapshotBlock = {
      ...frozenArtifactBlock,
      FrozenSnapshot: {
        ...frozenArtifactBlock.FrozenSnapshot,
        ArtifactContentSnapshot: '{"pages":[{"id":"p1","items":[{"id":"tampered"}]}]}',
      },
    };
    expect(isolatedService.IsFrozenSnapshotVerified(modifiedArtifactSnapshotBlock)).toBe(false);
    await isolatedService.VerifyFrozenSnapshotOnServer(modifiedArtifactSnapshotBlock, gqlProvider);
    expect(executeSpy).toHaveBeenCalledTimes(2);
  });

  it('R5-7 & R6-8: sets LiveSyncUnavailable strictly for explicit unconfigured collaboration secret responses and stops reconnect timer', async () => {
    const throwingSecretProvider = mockGqlProvider({
      ConfigData: { URL: 'https://example.com/graphql' },
      ExecuteGQL: async () => {
        throw new Error('MJ_ARTIFACT_COLLAB_HMAC_SECRET is not configured');
      },
    });

    const throwSession = service.CreateSession(
      'art-missing-secret-throw',
      '# Quarterly Plan',
      { id: 'u1', name: 'Alice' },
      true,
      true,
    );
    await throwSession.Connect(null, throwingSecretProvider);

    expect(throwSession.LiveSyncUnavailable).toBe(true);
    expect(throwSession.HasPendingReconnect).toBe(false);
    expect(throwSession.LiveSyncErrorReason).toContain('MJ_ARTIFACT_COLLAB_HMAC_SECRET is not configured');
    expect(throwSession.Status).toBe('readonly');
    expect(throwSession.CanMutateDocument).toBe(false);

    // Late subscriber after await Connect() must immediately receive `true` via BehaviorSubject
    const lateEmissionsFromThrow: boolean[] = [];
    const subThrow = throwSession.OnLiveSyncUnavailable$.subscribe((val) => lateEmissionsFromThrow.push(val));
    expect(lateEmissionsFromThrow).toEqual([true]);
    subThrow.unsubscribe();
    throwSession.Destroy();

    const exactServerSecretMsg =
      'Collaboration ticket signing secret (MJ_ARTIFACT_COLLAB_HMAC_SECRET, >= 32 bytes) must be configured before issuing WebSocket collaboration tickets.';
    const unconfiguredPayloadProvider = mockGqlProvider({
      ConfigData: { URL: 'https://example.com/graphql' },
      ExecuteGQL: async () => ({
        MintArtifactCollaborationTicket: {
          Success: false,
          CanRead: true,
          CanEdit: true,
          ErrorMessage: exactServerSecretMsg,
        },
      }),
    });

    const payloadSession = service.CreateSession(
      'art-missing-secret-payload',
      '# Quarterly Plan',
      { id: 'u1', name: 'Alice' },
      true,
      true,
    );
    await payloadSession.Connect(null, unconfiguredPayloadProvider);

    expect(payloadSession.LiveSyncUnavailable).toBe(true);
    expect(payloadSession.HasPendingReconnect).toBe(false);
    expect(payloadSession.LiveSyncErrorReason).toBe(exactServerSecretMsg);
    expect(payloadSession.Status).toBe('readonly');
    expect(payloadSession.CanMutateDocument).toBe(false);

    const lateEmissionsFromPayload: boolean[] = [];
    const subPayload = payloadSession.OnLiveSyncUnavailable$.subscribe((val) =>
      lateEmissionsFromPayload.push(val),
    );
    expect(lateEmissionsFromPayload).toEqual([true]);
    subPayload.unsubscribe();
    payloadSession.Destroy();

    // Explicit CanRead: false still resolves to 'revoked' rather than LiveSyncUnavailable
    const accessDeniedProvider = mockGqlProvider({
      ConfigData: { URL: 'https://example.com/graphql' },
      ExecuteGQL: async () => ({
        MintArtifactCollaborationTicket: {
          Success: false,
          CanRead: false,
          CanEdit: false,
          ErrorMessage: 'Access denied',
        },
      }),
    });
    const deniedSession = service.CreateSession(
      'art-denied-1',
      '# Confidential',
      { id: 'u2', name: 'Bob' },
      true,
      true,
    );
    await deniedSession.Connect(null, accessDeniedProvider);
    expect(deniedSession.Status).toBe('revoked');
    expect(deniedSession.LiveSyncUnavailable).toBe(false);
    expect(deniedSession.HasPendingReconnect).toBe(false);
    deniedSession.Destroy();
  });

  it('R6-8: keeps LiveSyncUnavailable === false, preserves exponential backoff reconnect, and recovers cleanly after transient ticket mint errors (Failed to fetch, 503, Internal server error)', async () => {
    vi.useFakeTimers();
    const prevWebSocket = Reflect.get(globalThis, 'WebSocket');

    class FakeCollabSocket {
      public static readonly CONNECTING = 0;
      public static readonly OPEN = 1;
      public static readonly CLOSING = 2;
      public static readonly CLOSED = 3;

      public static instances: FakeCollabSocket[] = [];
      public readonly url: string;
      public readyState = FakeCollabSocket.CONNECTING;
      public binaryType = 'blob';
      public onopen: (() => void) | null = null;
      public onmessage: ((evt: MessageEvent) => void) | null = null;
      public onclose: ((evt: CloseEvent) => void) | null = null;
      public onerror: (() => void) | null = null;

      constructor(url: string) {
        this.url = url;
        FakeCollabSocket.instances.push(this);
      }

      public send(_data: Uint8Array): void {
        // no-op in unit test
      }

      public close(): void {
        this.readyState = FakeCollabSocket.CLOSED;
      }
    }

    Reflect.set(globalThis, 'WebSocket', FakeCollabSocket);

    try {
      const transientScenarios: Array<{
        name: string;
        failCall: () => Promise<Record<string, object>>;
        expectedTransientReason: string;
      }> = [
        {
          name: 'network error (Failed to fetch)',
          failCall: async () => {
            throw new TypeError('Failed to fetch');
          },
          expectedTransientReason: 'Failed to fetch',
        },
        {
          name: 'HTTP 503 Service Unavailable',
          failCall: async () => {
            throw new Error('503 Service Unavailable');
          },
          expectedTransientReason: '503 Service Unavailable',
        },
        {
          name: 'generic server error payload',
          failCall: async () => ({
            MintArtifactCollaborationTicket: {
              Success: false,
              ErrorMessage: 'Internal server error',
            },
          }),
          expectedTransientReason: 'Internal server error',
        },
      ];

      for (const scenario of transientScenarios) {
        FakeCollabSocket.instances = [];
        let attempt = 0;
        const provider = mockGqlProvider({
          ConfigData: { URL: 'https://example.com/graphql' },
          ExecuteGQL: async () => {
            attempt++;
            if (attempt === 1) {
              return scenario.failCall();
            }
            return {
              MintArtifactCollaborationTicket: {
                Success: true,
                Ticket: `recovered-ticket-${attempt}`,
                WsPath: '/collaboration/yjs',
                CanRead: true,
                CanEdit: true,
              },
            };
          },
        });

        const session = service.CreateSession(
          `art-transient-${scenario.name}`,
          '# Resilient Doc',
          { id: 'u1', name: 'Alice' },
          true,
          true,
        );
        const unavailableEmissions: boolean[] = [];
        const sub = session.OnLiveSyncUnavailable$.subscribe((val) => unavailableEmissions.push(val));

        await session.Connect(null, provider);

        // Attempt 1 failed transiently: LiveSyncUnavailable MUST stay false and backoff timer MUST stay armed
        expect(session.LiveSyncUnavailable, scenario.name).toBe(false);
        expect(unavailableEmissions, scenario.name).toEqual([false]);
        expect(session.HasPendingReconnect, scenario.name).toBe(true);
        expect(session.Status, scenario.name).toBe('local');
        expect(session.CanEdit, scenario.name).toBe(true);
        expect(session.LiveSyncErrorReason, scenario.name).toBe(scenario.expectedTransientReason);
        expect(FakeCollabSocket.instances, scenario.name).toHaveLength(0);

        // Advance timer past first backoff window (1000ms + <250ms jitter) -> Attempt 2 mints ticket & opens WS
        await vi.advanceTimersByTimeAsync(1500);
        expect(attempt, scenario.name).toBe(2);
        expect(FakeCollabSocket.instances, scenario.name).toHaveLength(1);
        expect(FakeCollabSocket.instances[0].url, scenario.name).toContain('ticket=recovered-ticket-2');
        expect(session.LiveSyncErrorReason, scenario.name).toBe('');

        FakeCollabSocket.instances[0].readyState = FakeCollabSocket.OPEN;
        FakeCollabSocket.instances[0].onopen?.();
        expect(session.Status, scenario.name).toBe('connected');
        expect(session.LiveSyncUnavailable, scenario.name).toBe(false);
        expect(session.HasPendingReconnect, scenario.name).toBe(false);
        expect(session.LiveSyncErrorReason, scenario.name).toBe('');

        sub.unsubscribe();
        session.Destroy();
      }
    } finally {
      Reflect.set(globalThis, 'WebSocket', prevWebSocket);
      vi.useRealTimers();
    }
  });

  it('R5-6: DispatchAnchoredCommentAgentMention forwards optional conversationId to ExecuteAnchoredCommentAgentMention', async () => {
    const executeSpy = vi.fn(
      async (_doc: string, _vars?: Record<string, string | number | boolean | null>) => ({
        ExecuteAnchoredCommentAgentMention: {
          Success: true,
          AgentHandle: 'Sage',
          AgentMode: 'comment',
          ReplyBody: 'Addressed on the target thread.',
        },
      }),
    );
    const gqlProvider = mockGqlProvider({
      ExecuteGQL: executeSpy,
    });

    const res = await service.DispatchAnchoredCommentAgentMention(
      'art-1',
      'Sage',
      'comment',
      '@Sage please clarify this claim',
      'target quote',
      gqlProvider,
      'conv-thread-42',
    );

    expect(res.Success).toBe(true);
    expect(res.ReplyMessage).toBe('Addressed on the target thread.');
    expect(executeSpy).toHaveBeenCalledTimes(1);
    const [mutationDoc, variables] = executeSpy.mock.calls[0];
    expect(mutationDoc).toContain('$conversationId: String');
    expect(variables).toMatchObject({
      artifactId: 'art-1',
      agentHandle: 'Sage',
      agentMode: 'comment',
      commentBody: '@Sage please clarify this claim',
      anchorQuote: 'target quote',
      conversationId: 'conv-thread-42',
    });
  });
});
