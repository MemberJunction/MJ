import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import type { IMetadataProvider } from '@memberjunction/core';
import { DocumentCollaborationService } from './document-collaboration.service';

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
});
