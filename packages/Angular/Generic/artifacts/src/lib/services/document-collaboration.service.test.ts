import { describe, it, expect, vi } from 'vitest';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import type { IMetadataProvider } from '@memberjunction/core';
import {
  COLLAB_SECRET_UNCONFIGURED_CODE,
  DocumentCollaborationService,
  ExtractAnchoredCommentMentions,
  MAX_RECONNECT_ATTEMPTS,
  MERGE_CONFLICT_WARNING_MESSAGE,
  type CollaborationMergeConflictEvent,
  type CollaborationNotificationSink,
} from './document-collaboration.service';

describe('DocumentCollaborationService — Round 2 Review (Blocker 1, Blocker 3, Blocker 7)', () => {
  const service = new DocumentCollaborationService();

  function mockGqlProvider(shape: {
    CurrentUser?: { ID: string };
    ConfigData?: { URL?: string };
    ExecuteGQL: (
      query: string,
      variables?: Record<string, string | number | boolean | null>,
    ) => Promise<Record<string, object> | null>;
  }): IMetadataProvider {
    const base = Object.create(null) as IMetadataProvider;
    return Object.assign(base, shape);
  }

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
    const proxyProvider = mockGqlProvider({
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
    });

    const proxyEndpoint = await service.ResolveCollaborationEndpoint('art-proxy-1', null, proxyProvider);
    expect(proxyEndpoint.Mode).toBe('connect');
    expect(proxyEndpoint.WsUrl).toBe(
      'wss://example.com/api-prefix/collaboration/yjs?artifactId=art-proxy-1&ticket=tkt_proxy_1',
    );

    const explicitWsUrlProvider = mockGqlProvider({
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
    });

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
    const failingTicketProvider = mockGqlProvider({
      ConfigData: { URL: 'https://example.com/graphql' },
      ExecuteGQL: async () => {
        throw new Error('Transient network error');
      },
    });

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
    const delegateProvider = mockGqlProvider({
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
    });

    const perms = await service.ResolvePermissionsFromServer('art-delegated-1', delegateProvider);
    expect(perms?.CanRead).toBe(true);
    expect(perms?.CanEdit).toBe(true);
    expect(perms?.Source).toBe('Delegate');

    // GraphQL error / scope rejection MUST fail closed rather than falling back to browser engine
    const failingGraphQLProvider = mockGqlProvider({
      CurrentUser: { ID: 'u-owner' },
      ExecuteGQL: async () => {
        throw new Error('API key scope rejected');
      },
    });
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

    const verifyingServerProvider = mockGqlProvider({
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
    });

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

  it('R7: flapping WebSocket that opens and closes before initial sync still caps at MAX_RECONNECT_ATTEMPTS, and structured ErrorCode sets LiveSyncUnavailable', async () => {
    vi.useFakeTimers();
    const prevWebSocket = Reflect.get(globalThis, 'WebSocket');

    class FlappingSocket {
      public static readonly CONNECTING = 0;
      public static readonly OPEN = 1;
      public static readonly CLOSING = 2;
      public static readonly CLOSED = 3;

      public static instances: FlappingSocket[] = [];
      public readonly url: string;
      public readyState = FlappingSocket.CONNECTING;
      public binaryType = 'blob';
      public onopen: (() => void) | null = null;
      public onmessage: ((evt: MessageEvent) => void) | null = null;
      public onclose: ((evt: CloseEvent) => void) | null = null;
      public onerror: (() => void) | null = null;

      constructor(url: string) {
        this.url = url;
        FlappingSocket.instances.push(this);
      }

      public send(_data: Uint8Array): void {
        // no-op
      }

      public close(): void {
        this.readyState = FlappingSocket.CLOSED;
      }
    }

    Reflect.set(globalThis, 'WebSocket', FlappingSocket);

    try {
      let ticketNum = 0;
      const flappingProvider = mockGqlProvider({
        ConfigData: { URL: 'https://example.com/graphql' },
        ExecuteGQL: async () => ({
          MintArtifactCollaborationTicket: {
            Success: true,
            Ticket: `flap-ticket-${++ticketNum}`,
            WsPath: '/collaboration/yjs',
            CanRead: true,
            CanEdit: true,
          },
        }),
      });

      const flapSession = service.CreateSession(
        'art-flap-1',
        '# Flapping Room',
        { id: 'u1', name: 'Alice' },
        true,
        true,
      );
      await flapSession.Connect(null, flappingProvider);

      for (let attempt = 0; attempt <= MAX_RECONNECT_ATTEMPTS; attempt++) {
        const sock = FlappingSocket.instances[attempt];
        expect(sock).toBeDefined();
        sock.readyState = FlappingSocket.OPEN;
        sock.onopen?.();
        // Server crashes before sending syncStep2!
        sock.readyState = FlappingSocket.CLOSED;
        sock.onclose?.({ code: 1011 } as CloseEvent);
        if (attempt < MAX_RECONNECT_ATTEMPTS) {
          expect(flapSession.HasPendingReconnect).toBe(true);
          await vi.advanceTimersByTimeAsync(31000);
        }
      }

      expect(flapSession.ReconnectAttempts).toBe(MAX_RECONNECT_ATTEMPTS);
      expect(flapSession.HasPendingReconnect).toBe(false);
      expect(flapSession.IsReconnectExhausted).toBe(true);
      expect(flapSession.Status).toBe('error');
      expect(flapSession.LiveSyncUnavailable).toBe(false);
      await vi.advanceTimersByTimeAsync(120_000);
      expect(FlappingSocket.instances).toHaveLength(1 + MAX_RECONNECT_ATTEMPTS);
      flapSession.Destroy();

      // Structured ErrorCode check on ResolveCollaborationEndpoint directly
      const codeEndpoint = await service.ResolveCollaborationEndpoint(
        'art-code-1',
        null,
        mockGqlProvider({
          ConfigData: { URL: 'https://example.com/graphql' },
          ExecuteGQL: async () => ({
            MintArtifactCollaborationTicket: {
              Success: false,
              CanRead: true,
              CanEdit: true,
              ErrorCode: COLLAB_SECRET_UNCONFIGURED_CODE,
              ErrorMessage: 'Live collaboration disabled',
            },
          }),
        }),
      );
      expect(codeEndpoint.LiveSyncUnavailable).toBe(true);

      const nonSecretTicketEndpoint = await service.ResolveCollaborationEndpoint(
        'art-non-secret-1',
        null,
        mockGqlProvider({
          ConfigData: { URL: 'https://example.com/graphql' },
          ExecuteGQL: async () => ({
            MintArtifactCollaborationTicket: {
              Success: false,
              CanRead: true,
              CanEdit: true,
              ErrorMessage: 'Auth ticket provider not configured',
            },
          }),
        }),
      );
      expect(nonSecretTicketEndpoint.LiveSyncUnavailable).toBe(false);
    } finally {
      Reflect.set(globalThis, 'WebSocket', prevWebSocket);
      vi.useRealTimers();
    }
  });

  it('R8-10: reconnect exhaustion sets recoverable error, online + visibilitychange(visible) reset counter and Retry(), COLLAB_SECRET_UNCONFIGURED does not auto-loop, and ngOnDestroy removes listeners', async () => {
    vi.useFakeTimers();
    const prevWebSocket = globalThis.WebSocket;
    const prevWindow = Reflect.get(globalThis, 'window');
    const prevDocument = Reflect.get(globalThis, 'document');

    const windowListeners = new Map<string, Set<() => void>>();
    const documentListeners = new Map<string, Set<() => void>>();

    const mockWindow = {
      location: { origin: 'https://example.com', hostname: 'example.com' },
      addEventListener: vi.fn((type: string, listener: () => void) => {
        const set = windowListeners.get(type) ?? new Set<() => void>();
        set.add(listener);
        windowListeners.set(type, set);
      }),
      removeEventListener: vi.fn((type: string, listener: () => void) => {
        windowListeners.get(type)?.delete(listener);
      }),
    };

    const mockDocument = {
      visibilityState: 'hidden',
      addEventListener: vi.fn((type: string, listener: () => void) => {
        const set = documentListeners.get(type) ?? new Set<() => void>();
        set.add(listener);
        documentListeners.set(type, set);
      }),
      removeEventListener: vi.fn((type: string, listener: () => void) => {
        documentListeners.get(type)?.delete(listener);
      }),
    };

    class RecoverySocket {
      public static readonly CONNECTING = 0;
      public static readonly OPEN = 1;
      public static readonly CLOSING = 2;
      public static readonly CLOSED = 3;
      public static instances: RecoverySocket[] = [];

      public readyState = RecoverySocket.CONNECTING;
      public binaryType = 'arraybuffer';
      public url: string;
      public onopen: (() => void) | null = null;
      public onmessage: ((event: MessageEvent) => void) | null = null;
      public onclose: ((event: CloseEvent) => void) | null = null;
      public onerror: (() => void) | null = null;

      constructor(url: string) {
        this.url = url;
        RecoverySocket.instances.push(this);
      }

      public send(_data: Uint8Array): void {
        // no-op
      }

      public close(): void {
        this.readyState = RecoverySocket.CLOSED;
      }
    }

    Reflect.set(globalThis, 'window', mockWindow);
    Reflect.set(globalThis, 'document', mockDocument);
    Reflect.set(globalThis, 'WebSocket', RecoverySocket);

    const recoveryService = new DocumentCollaborationService();
    const retrySpy = vi.spyOn(recoveryService, 'Retry');

    try {
      let ticketCounter = 0;
      const transientProvider = mockGqlProvider({
        ConfigData: { URL: 'https://example.com/graphql' },
        ExecuteGQL: async () => ({
          MintArtifactCollaborationTicket: {
            Success: true,
            Ticket: `rec-ticket-${++ticketCounter}`,
            WsPath: '/collaboration/yjs',
            CanRead: true,
            CanEdit: true,
          },
        }),
      });

      const session = recoveryService.CreateSession(
        'art-r8-recover',
        '# Outage Doc',
        { id: 'u1', name: 'Alice' },
        true,
        true,
      );
      await session.Connect(null, transientProvider);

      for (let attempt = 0; attempt <= MAX_RECONNECT_ATTEMPTS; attempt++) {
        const sock = RecoverySocket.instances[attempt];
        expect(sock).toBeDefined();
        sock.readyState = RecoverySocket.CLOSED;
        sock.onclose?.({ code: 1006 } as CloseEvent);
        if (attempt < MAX_RECONNECT_ATTEMPTS) {
          await vi.advanceTimersByTimeAsync(31_000);
        }
      }

      expect(session.Status).toBe('error');
      expect(session.Recoverable).toBe(true);
      expect(session.ReconnectAttempts).toBe(MAX_RECONNECT_ATTEMPTS);

      // 1. Regaining network connectivity ('online') resets attempts to 0 and invokes Retry(artifactId)
      const countBeforeOnline = RecoverySocket.instances.length;
      for (const listener of Array.from(windowListeners.get('online') ?? [])) {
        listener();
      }
      await Promise.resolve();
      await Promise.resolve();

      expect(retrySpy).toHaveBeenCalledWith('art-r8-recover');
      expect(session.ReconnectAttempts).toBe(0);
      expect(RecoverySocket.instances.length).toBe(countBeforeOnline + 1);
      const onlineSocket = RecoverySocket.instances[RecoverySocket.instances.length - 1];
      onlineSocket.readyState = RecoverySocket.OPEN;
      onlineSocket.onopen?.();
      expect(session.Status).toBe('connected');

      // 2. Exhaust reconnect cap again while backgrounded, then fire visibilitychange -> 'visible'
      const baseIndex = RecoverySocket.instances.length - 1;
      for (let attempt = 0; attempt <= MAX_RECONNECT_ATTEMPTS; attempt++) {
        const sock = RecoverySocket.instances[baseIndex + attempt];
        expect(sock).toBeDefined();
        sock.readyState = RecoverySocket.CLOSED;
        sock.onclose?.({ code: 1006 } as CloseEvent);
        if (attempt < MAX_RECONNECT_ATTEMPTS) {
          await vi.advanceTimersByTimeAsync(31_000);
        }
      }
      expect(session.Status).toBe('error');
      expect(session.ReconnectAttempts).toBe(MAX_RECONNECT_ATTEMPTS);

      retrySpy.mockClear();
      // While hidden, visibilitychange must NOT retry
      mockDocument.visibilityState = 'hidden';
      for (const listener of Array.from(documentListeners.get('visibilitychange') ?? [])) {
        listener();
      }
      await Promise.resolve();
      expect(retrySpy).not.toHaveBeenCalled();

      // Transitioning to 'visible' resets attempts to 0 and reconnects
      mockDocument.visibilityState = 'visible';
      for (const listener of Array.from(documentListeners.get('visibilitychange') ?? [])) {
        listener();
      }
      await Promise.resolve();
      await Promise.resolve();

      expect(retrySpy).toHaveBeenCalledWith('art-r8-recover');
      expect(session.ReconnectAttempts).toBe(0);
      const visibleSocket = RecoverySocket.instances[RecoverySocket.instances.length - 1];
      visibleSocket.readyState = RecoverySocket.OPEN;
      visibleSocket.onopen?.();
      expect(session.Status).toBe('connected');
      session.Destroy();

      // 3. COLLAB_SECRET_UNCONFIGURED must have Recoverable === false and MUST NOT auto-loop on visibilitychange/online
      let unconfiguredCalls = 0;
      const unconfiguredProvider = mockGqlProvider({
        ConfigData: { URL: 'https://example.com/graphql' },
        ExecuteGQL: async () => {
          unconfiguredCalls++;
          return {
            MintArtifactCollaborationTicket: {
              Success: false,
              CanRead: true,
              CanEdit: true,
              ErrorCode: COLLAB_SECRET_UNCONFIGURED_CODE,
              ErrorMessage: 'Signing secret missing',
            },
          };
        },
      });

      const unconfSession = recoveryService.CreateSession(
        'art-r8-unconfigured',
        '# Unconfigured Doc',
        { id: 'u1', name: 'Alice' },
        true,
        true,
      );
      await unconfSession.Connect(null, unconfiguredProvider);
      expect(unconfSession.LiveSyncUnavailable).toBe(true);
      expect(unconfSession.Recoverable).toBe(false);
      expect(unconfiguredCalls).toBe(1);

      retrySpy.mockClear();
      mockDocument.visibilityState = 'visible';
      for (const listener of Array.from(documentListeners.get('visibilitychange') ?? [])) {
        listener();
      }
      for (const listener of Array.from(windowListeners.get('online') ?? [])) {
        listener();
      }
      await Promise.resolve();
      expect(retrySpy).not.toHaveBeenCalled();
      expect(unconfiguredCalls).toBe(1);

      // Explicit user Retry(artifactId) click still re-attempts cleanly
      const manualRetried = await recoveryService.Retry('art-r8-unconfigured');
      expect(manualRetried).toBe(true);
      expect(unconfiguredCalls).toBe(2);
      unconfSession.Destroy();

      // 4. ngOnDestroy cleanly detaches window and document listeners
      recoveryService.ngOnDestroy();
      expect(mockWindow.removeEventListener).toHaveBeenCalledWith('online', expect.any(Function));
      expect(mockDocument.removeEventListener).toHaveBeenCalledWith(
        'visibilitychange',
        expect.any(Function),
      );
      expect(windowListeners.get('online')?.size ?? 0).toBe(0);
      expect(documentListeners.get('visibilitychange')?.size ?? 0).toBe(0);
    } finally {
      Reflect.set(globalThis, 'WebSocket', prevWebSocket);
      if (prevWindow === undefined) {
        Reflect.deleteProperty(globalThis, 'window');
      } else {
        Reflect.set(globalThis, 'window', prevWindow);
      }
      if (prevDocument === undefined) {
        Reflect.deleteProperty(globalThis, 'document');
      } else {
        Reflect.set(globalThis, 'document', prevDocument);
      }
      vi.useRealTimers();
    }
  });

  it('R8-2: handles binary MSG_CONTROL and JSON merge-conflict frames, emits MergeConflict$/MergeConflicts$, and surfaces warning toast once per event', async () => {
    const prevWebSocket = globalThis.WebSocket;

    class ConflictSocket {
      public static readonly OPEN = 1;
      public static latest: ConflictSocket | null = null;
      public readyState = ConflictSocket.OPEN;
      public binaryType = 'arraybuffer';
      public onopen: (() => void) | null = null;
      public onmessage: ((event: MessageEvent) => void) | null = null;
      public onclose: ((event: CloseEvent) => void) | null = null;
      public onerror: (() => void) | null = null;
      constructor(_url: string) {
        ConflictSocket.latest = this;
      }
      public send(_data: Uint8Array): void {}
      public close(): void {}
    }

    Reflect.set(globalThis, 'WebSocket', ConflictSocket);

    const createNotificationSpy = vi.fn();
    const mockNotifier: CollaborationNotificationSink = {
      CreateSimpleNotification: createNotificationSpy,
    };

    const conflictService = new DocumentCollaborationService();
    conflictService.SetNotificationSink(mockNotifier);
    const serviceEvents: CollaborationMergeConflictEvent[] = [];
    const sessionEvents: CollaborationMergeConflictEvent[] = [];

    const subService = conflictService.MergeConflicts$.subscribe((evt) => {
      serviceEvents.push(evt);
    });

    try {
      const session = conflictService.CreateSession(
        'art-conflict-1',
        '# Shared Spec',
        { id: 'u1', name: 'Alice' },
        true,
        true,
      );
      const subSession = session.MergeConflict$.subscribe((evt) => {
        sessionEvents.push(evt);
      });

      await session.Connect('wss://example.com/collaboration/yjs?ticket=test-1');
      ConflictSocket.latest?.onopen?.();

      // 1. Binary MSG_CONTROL (type = 2) frame with server's merge-conflict payload
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, 2);
      encoding.writeVarString(
        encoder,
        JSON.stringify({
          type: 'control',
          action: 'merge-conflict',
          artifactId: 'art-conflict-1',
          versionId: 'ver-9',
          versionNumber: 9,
          rejectedHunksCount: 3,
          source: 'agent-commit',
          timestamp: '2026-11-11T12:00:00.000Z',
        }),
      );
      session.ApplyBinaryFrame(encoding.toUint8Array(encoder));

      expect(sessionEvents).toHaveLength(1);
      expect(serviceEvents).toHaveLength(1);
      expect(sessionEvents[0]).toEqual({
        ArtifactID: 'art-conflict-1',
        VersionID: 'ver-9',
        VersionNumber: 9,
        RejectedHunksCount: 3,
        Source: 'agent-commit',
        RoomEpoch: undefined,
        Timestamp: '2026-11-11T12:00:00.000Z',
        ActorUserID: undefined,
        LocalUserID: 'u1',
      });
      expect(createNotificationSpy).toHaveBeenCalledTimes(1);
      expect(createNotificationSpy).toHaveBeenCalledWith(
        MERGE_CONFLICT_WARNING_MESSAGE,
        'warning',
        5000,
      );

      // Re-invoking NotifyMergeConflictToastOnce with the same event reference must NOT duplicate toast
      expect(conflictService.NotifyMergeConflictToastOnce(sessionEvents[0], mockNotifier)).toBe(
        false,
      );
      expect(createNotificationSpy).toHaveBeenCalledTimes(1);

      // 2. String JSON control frame via ws.onmessage with rejectedHunkCount (singular server variant)
      ConflictSocket.latest?.onmessage?.({
        data: JSON.stringify({
          type: 'merge-conflict',
          versionNumber: 10,
          rejectedHunkCount: 1,
        }),
      } as MessageEvent);

      expect(sessionEvents).toHaveLength(2);
      expect(serviceEvents).toHaveLength(2);
      expect(sessionEvents[1].ArtifactID).toBe('art-conflict-1');
      expect(sessionEvents[1].VersionNumber).toBe(10);
      expect(sessionEvents[1].RejectedHunksCount).toBe(1);
      expect(createNotificationSpy).toHaveBeenCalledTimes(2);

      subSession.unsubscribe();
      session.Destroy();
    } finally {
      subService.unsubscribe();
      conflictService.ngOnDestroy();
      Reflect.set(globalThis, 'WebSocket', prevWebSocket);
    }
  });

  it('R9-12: NotifyMergeConflictToastOnce suppresses toast for non-authors when actorUserId is another user, but shows it for matching actor or when absent', () => {
    const createNotificationSpy = vi.fn();
    const mockNotifier: CollaborationNotificationSink = {
      CreateSimpleNotification: createNotificationSpy,
    };

    const conflictService = new DocumentCollaborationService();
    conflictService.SetNotificationSink(mockNotifier);

    const currentUser = '11111111-1111-4111-8111-111111111111';
    const otherUser = '22222222-2222-4222-8222-222222222222';

    // 1. Another collaborator's edit conflict: suppressed for current user
    const otherConflict: CollaborationMergeConflictEvent = {
      ArtifactID: 'art-1',
      RejectedHunksCount: 1,
      Timestamp: new Date().toISOString(),
      ActorUserID: otherUser,
      LocalUserID: currentUser,
    };
    const resultOther = conflictService.NotifyMergeConflictToastOnce(otherConflict, mockNotifier);
    expect(resultOther).toBe(false);
    expect(createNotificationSpy).not.toHaveBeenCalled();

    // 2. Current user's own edit conflict: shown
    const ownConflict: CollaborationMergeConflictEvent = {
      ArtifactID: 'art-1',
      RejectedHunksCount: 1,
      Timestamp: new Date().toISOString(),
      ActorUserID: currentUser,
      LocalUserID: currentUser,
    };
    const resultOwn = conflictService.NotifyMergeConflictToastOnce(ownConflict, mockNotifier);
    expect(resultOwn).toBe(true);
    expect(createNotificationSpy).toHaveBeenCalledTimes(1);
    expect(createNotificationSpy).toHaveBeenCalledWith(MERGE_CONFLICT_WARNING_MESSAGE, 'warning', 5000);

    // 3. Absent actorUserId (broadcast / legacy / agent conflict without actorUserId): shown
    const absentConflict: CollaborationMergeConflictEvent = {
      ArtifactID: 'art-1',
      RejectedHunksCount: 1,
      Timestamp: new Date().toISOString(),
      LocalUserID: currentUser,
    };
    const resultAbsent = conflictService.NotifyMergeConflictToastOnce(absentConflict, mockNotifier);
    expect(resultAbsent).toBe(true);
    expect(createNotificationSpy).toHaveBeenCalledTimes(2);

    // 4. local-user fallback ID: shown even if actorUserId is set
    const localUserFallbackConflict: CollaborationMergeConflictEvent = {
      ArtifactID: 'art-1',
      RejectedHunksCount: 1,
      Timestamp: new Date().toISOString(),
      ActorUserID: otherUser,
      LocalUserID: 'local-user',
    };
    const resultLocal = conflictService.NotifyMergeConflictToastOnce(localUserFallbackConflict, mockNotifier);
    expect(resultLocal).toBe(true);
    expect(createNotificationSpy).toHaveBeenCalledTimes(3);

    conflictService.ngOnDestroy();
  });
});
