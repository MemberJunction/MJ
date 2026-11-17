import '@angular/compiler';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IMetadataProvider, RunViewParams, UserInfo } from '@memberjunction/core';
import { ArtifactPermissionEngine, type ResolvedArtifactPermissions } from '@memberjunction/core-entities';
import { MJGlobal } from '@memberjunction/global';
import { BaseRealtimeChannelClient, type RealtimeChannelEvent } from '@memberjunction/realtime-runtime';
import {
  ArtifactWorkspaceChannel,
  LoadRealtimeArtifactWorkspaceChannel,
} from '../lib/components/realtime/artifact-workspace/artifact-workspace-channel';
import { ArtifactWorkspaceEngine } from '../lib/components/realtime/artifact-workspace/artifact-workspace-engine';
import { RealtimeArtifactWorkspaceSurfaceComponent } from '../lib/components/realtime/artifact-workspace/realtime-artifact-workspace-surface.component';
import {
  ARTIFACT_WORKSPACE_CHANNEL_KEY,
  ARTIFACT_WORKSPACE_CLIENT_PLUGIN_CLASS,
  IsCollaborativeArtifactDescriptor,
  type ArtifactNavigateToAnchorPayload,
} from '../lib/components/realtime/artifact-workspace/artifact-workspace-types';
import {
  InteractiveComponentChannel,
  LoadRealtimeInteractiveComponentChannel,
} from '../lib/components/realtime/interactive-component/interactive-component-channel';
import { type ChannelLog, MakeContext } from './helpers/interactive-component-fixtures';

LoadRealtimeArtifactWorkspaceChannel();
LoadRealtimeInteractiveComponentChannel();

describe('ArtifactWorkspaceChannel & Partitioning with InteractiveComponentChannel', () => {
  it('registers RealtimeArtifactWorkspaceChannel via @RegisterClass and exposes expected descriptor', () => {
    const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeChannelClient>(
      BaseRealtimeChannelClient,
      ARTIFACT_WORKSPACE_CLIENT_PLUGIN_CLASS,
    );
    expect(instance).toBeInstanceOf(ArtifactWorkspaceChannel);

    const channel = instance as ArtifactWorkspaceChannel;
    const descriptor = channel.GetDescriptor();
    expect(descriptor.Key).toBe(ARTIFACT_WORKSPACE_CHANNEL_KEY);
    expect(descriptor.MultiInstance).toBe(true);
    expect(descriptor.DisplayPolicy).toBe('on-demand');
    expect(descriptor.DefaultAvailability).toBe('all-sessions');
    expect(descriptor.MaxExposure).toBe('pixels');
    expect(descriptor.Verbs.map((v) => v.Name)).toEqual(
      expect.arrayContaining(['focus', 'show_version', 'refresh', 'close']),
    );
  });

  it('partitions collaborative Docs/Sheets/Slides from Component artifacts across both channels', async () => {
    const workspace = new ArtifactWorkspaceChannel();
    const wsLog: ChannelLog = { Notes: [] };
    await workspace.Initialize(MakeContext(wsLog));

    const interactive = new InteractiveComponentChannel();
    const icLog: ChannelLog = { Notes: [] };
    await interactive.Initialize(MakeContext(icLog));

    const delegatedCollaborative = [
      {
        ArtifactID: '11111111-1111-4111-8111-111111111111',
        ArtifactVersionID: '22222222-2222-4222-8222-222222222222',
        Name: 'Revenue Live Sheet',
        ArtifactTypeName: 'Excel Spreadsheet',
        DriverClass: 'SpreadsheetArtifactViewerPlugin',
      },
    ];
    const delegatedComponent = [
      {
        ArtifactID: '33333333-3333-4333-8333-333333333333',
        ArtifactVersionID: '44444444-4444-4444-8444-444444444444',
        Name: 'Sales Widget',
        ArtifactTypeName: 'Component',
        DriverClass: 'ComponentArtifactViewerPlugin',
      },
    ];

    expect(
      IsCollaborativeArtifactDescriptor('Excel Spreadsheet', 'SpreadsheetArtifactViewerPlugin'),
    ).toBe(true);
    expect(IsCollaborativeArtifactDescriptor('Component', 'ComponentArtifactViewerPlugin')).toBe(
      false,
    );

    expect(workspace.AcceptsDelegationArtifacts(delegatedCollaborative, {})).toBe(true);
    expect(workspace.AcceptsDelegationArtifacts(delegatedComponent, {})).toBe(false);

    // Even when autoOpenDelegatedComponents is true, InteractiveComponent ignores collaborative Docs/Sheets/Slides
    expect(
      interactive.AcceptsDelegationArtifacts(delegatedCollaborative, {
        autoOpenDelegatedComponents: true,
      }),
    ).toBe(false);
    expect(
      interactive.AcceptsDelegationArtifacts(delegatedComponent, {
        autoOpenDelegatedComponents: true,
      }),
    ).toBe(true);

    // Explicit Component open on ArtifactWorkspace refuses cleanly
    const refusedComponentOpen = await workspace.Open({
      artifactId: delegatedComponent[0].ArtifactID,
      name: 'Sales Widget',
      artifactTypeName: 'Component',
      driverClass: 'ComponentArtifactViewerPlugin',
    });
    expect(refusedComponentOpen.Success).toBe(false);
    expect(refusedComponentOpen.ErrorCode).toBe('use_interactive_component');

    // Opening a sheet delegates cleanly and populates state & tabs
    const openedSheet = await workspace.Open({
      artifactId: delegatedCollaborative[0].ArtifactID,
      artifactVersionId: delegatedCollaborative[0].ArtifactVersionID,
      versionNumber: 1,
      name: 'Revenue Live Sheet',
      artifactTypeName: 'Excel Spreadsheet',
      driverClass: 'SpreadsheetArtifactViewerPlugin',
    });
    expect(openedSheet.Success).toBe(true);
    expect(workspace.Engine.Instances).toHaveLength(1);
    const activeId = workspace.Engine.Instances[0].InstanceID;
    expect(openedSheet.Result).toMatchObject({
      instanceId: activeId,
      opened: true,
      artifactId: delegatedCollaborative[0].ArtifactID,
    });
    expect(workspace.GetState()).toMatchObject({
      activeInstanceId: activeId,
    });

    const refreshed = await workspace.ApplyVerb('refresh', { versionNumber: 2 }, 'agent');
    expect(refreshed.Success).toBe(true);

    const closed = await workspace.ApplyVerb('close', {}, 'agent');
    expect(closed.Success).toBe(true);
    expect(workspace.Engine.Instances).toHaveLength(0);

    workspace.Dispose();
    interactive.Dispose();
  });

  it('ArtifactWorkspaceEngine enforces LRU cap, SwapVersion, and round-trips state', () => {
    const engine = new ArtifactWorkspaceEngine(2);
    const r1 = engine.AddOrFocus({
      ArtifactID: 'a1',
      ArtifactVersionID: 'v1',
      VersionNumber: 1,
      Name: 'Doc One',
      ArtifactTypeName: 'Markdown Document',
    });
    const r2 = engine.AddOrFocus({
      ArtifactID: 'a2',
      ArtifactVersionID: 'v2',
      VersionNumber: 1,
      Name: 'Sheet Two',
      ArtifactTypeName: 'Excel Spreadsheet',
    });
    expect(engine.Instances).toHaveLength(2);
    expect(engine.ActiveID).toBe(r2.InstanceID);

    engine.SetActive(r1.InstanceID);
    const r3 = engine.AddOrFocus({
      ArtifactID: 'a3',
      ArtifactVersionID: 'v3',
      VersionNumber: 1,
      Name: 'Deck Three',
      ArtifactTypeName: 'Presentation',
    });
    expect(engine.Instances).toHaveLength(2);
    expect(engine.FindByArtifact('a1')).toBeDefined();
    expect(engine.FindByArtifact('a2')).toBeUndefined();
    expect(engine.ActiveID).toBe(r3.InstanceID);

    engine.SwapVersion(r1.InstanceID, 'v1b', 2, 'Doc One Revised');
    expect(engine.FindByArtifact('a1')?.VersionNumber).toBe(2);

    engine.Dispose();
  });

  describe('Finding #3 & #5: CanEdit permissions, AcceptsDelegationArtifacts config, and SwapToNewerVersions', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('AcceptsDelegationArtifacts honors raw config autoOpenDelegatedArtifacts before OnInitialize', async () => {
      const workspace = new ArtifactWorkspaceChannel();
      const wsLog: ChannelLog = { Notes: [] };
      const Context = MakeContext(wsLog, { autoOpenDelegatedArtifacts: false });
      // Deliberately test BEFORE Initialize() — AcceptsDelegationArtifacts must read the passed config bag
      const delegated = [
        {
          ArtifactID: '11111111-1111-4111-8111-111111111111',
          ArtifactVersionID: '22222222-2222-4222-8222-222222222222',
          Name: 'Revenue Live Sheet',
          ArtifactTypeName: 'Excel Spreadsheet',
          DriverClass: 'SpreadsheetArtifactViewerPlugin',
        },
      ];
      expect(workspace.AcceptsDelegationArtifacts(delegated, { autoOpenDelegatedArtifacts: false })).toBe(false);
      expect(workspace.AcceptsDelegationArtifacts(delegated, { autoOpenDelegatedArtifacts: true })).toBe(true);

      await workspace.Initialize({
        ...Context,
        ChannelConfig: { autoOpenDelegatedArtifacts: false },
      });
      // Still accepts an artifact that is already open in the workspace even when autoOpen is false
      workspace.Engine.AddOrFocus({
        ArtifactID: delegated[0].ArtifactID,
        ArtifactVersionID: delegated[0].ArtifactVersionID,
        VersionNumber: 1,
        Name: 'Revenue Live Sheet',
        ArtifactTypeName: 'Excel Spreadsheet',
      });
      expect(workspace.AcceptsDelegationArtifacts(delegated, { autoOpenDelegatedArtifacts: false })).toBe(true);
      workspace.Dispose();
    });

    it('resolves CanEdit via ArtifactPermissionEngine and swaps to resolved new VersionNumber when SwapToNewerVersions is true', async () => {
      const artId = 'aaaaaaaa-1111-4111-8111-111111111111';
      const v1Id = 'bbbbbbbb-1111-4111-8111-111111111111';
      const v2Id = 'cccccccc-2222-4222-8222-222222222222';
      let canEditResponse = false;

      vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockImplementation(
        async (): Promise<ResolvedArtifactPermissions> => ({
          ArtifactID: artId,
          CanRead: true,
          CanEdit: canEditResponse,
          CanDelete: false,
          CanShare: false,
          Source: canEditResponse ? 'Owner' : 'ArtifactPermission',
          Reason: 'test fixture',
        }),
      );

      const fakeUser = { ID: 'u-1', Name: 'Reader User' } as UserInfo;
      const runViewMock = vi.fn(async (params: RunViewParams) => {
        if (params.EntityName === 'MJ: Artifact Versions') {
          const isV2 = String(params.ExtraFilter ?? '').includes(v2Id);
          return {
            Success: true,
            Results: [
              {
                ID: isV2 ? v2Id : v1Id,
                ArtifactID: artId,
                VersionNumber: isV2 ? 2 : 1,
                Name: isV2 ? 'Board Deck v2' : 'Board Deck',
              },
            ],
            TotalRowCount: 1,
          };
        }
        if (params.EntityName === 'MJ: Artifacts') {
          return {
            Success: true,
            Results: [{ ID: artId, Name: 'Board Deck', Type: 'Presentation' }],
            TotalRowCount: 1,
          };
        }
        return { Success: true, Results: [], TotalRowCount: 0 };
      });
      const fakeProvider: Partial<IMetadataProvider> & { RunView: typeof runViewMock } = {
        CurrentUser: fakeUser,
        RunView: runViewMock,
      };

      // 1. SwapToNewerVersions = false preserves v1 & read-only CanEdit=false
      const readOnlyChannel = new ArtifactWorkspaceChannel();
      const roLog: ChannelLog = { Notes: [] };
      const roCtx = MakeContext(roLog, { swapToNewerVersions: false });
      await readOnlyChannel.Initialize({
        ...roCtx,
        Provider: fakeProvider as IMetadataProvider,
      });
      await readOnlyChannel.Open({ artifactId: artId, artifactVersionId: v1Id });
      expect(readOnlyChannel.Engine.Instances[0]?.CanEdit).toBe(false);
      expect(readOnlyChannel.Engine.Instances[0]?.VersionNumber).toBe(1);

      await readOnlyChannel.OnDelegationArtifacts([
        {
          ArtifactID: artId,
          ArtifactVersionID: v2Id,
          Name: 'Board Deck v2',
          ArtifactTypeName: 'Presentation',
        },
      ]);
      expect(readOnlyChannel.Engine.Instances[0]?.VersionNumber).toBe(1);
      expect(roLog.Notes.some((n) => n.includes('newer_version_available'))).toBe(true);
      readOnlyChannel.Dispose();

      // 2. SwapToNewerVersions = true with CanEdit = true resolves v2 and emits RefreshTrigger$ for version 2
      canEditResponse = true;
      const rwChannel = new ArtifactWorkspaceChannel();
      const rwLog: ChannelLog = { Notes: [] };
      const rwCtx = MakeContext(rwLog, { swapToNewerVersions: true });
      await rwChannel.Initialize({
        ...rwCtx,
        Provider: fakeProvider as IMetadataProvider,
      });
      const refreshedEvents: Array<{ artifactId: string; versionNumber: number }> = [];
      rwChannel.Engine.RefreshTrigger$.subscribe((e) => refreshedEvents.push(e));

      await rwChannel.Open({ artifactId: artId, artifactVersionId: v1Id });
      expect(rwChannel.Engine.Instances[0]?.CanEdit).toBe(true);

      await rwChannel.OnDelegationArtifacts([
        {
          ArtifactID: artId,
          ArtifactVersionID: v2Id,
          Name: 'Board Deck v2',
          ArtifactTypeName: 'Presentation',
        },
      ]);
      expect(rwChannel.Engine.Instances[0]?.VersionNumber).toBe(2);
      expect(rwChannel.Engine.Instances[0]?.ArtifactVersionID).toBe(v2Id);
      expect(refreshedEvents).toContainEqual({ artifactId: artId, versionNumber: 2 });
      rwChannel.Dispose();
    });

    it('rejects missing or unreadable artifacts in Open and OnDelegationArtifacts even when params.name is provided (G-P0-1)', async () => {
      const missingArtId = 'aaaaaaaa-1111-4111-8111-111111111111';
      const missingVerId = 'bbbbbbbb-1111-4111-8111-111111111111';
      const deniedArtId = 'aaaaaaaa-2222-4222-8222-222222222222';
      const deniedVerId = 'bbbbbbbb-2222-4222-8222-222222222222';

      const permSpy = vi
        .spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions')
        .mockImplementation(
          async (_provider, artifactId): Promise<ResolvedArtifactPermissions> => ({
            ArtifactID: artifactId ?? '',
            CanRead: false,
            CanEdit: false,
            CanDelete: false,
            CanShare: false,
            Source: 'Denied',
            Reason: 'denied',
          }),
        );

      const fakeUser = { ID: 'u-1', Name: 'Restricted User' } as UserInfo;
      const runViewMock = vi.fn(async (params: RunViewParams) => {
        const filter = String(params.ExtraFilter ?? '');
        if (params.EntityName === 'MJ: Artifact Versions') {
          if (filter.includes(deniedVerId) || filter.includes(deniedArtId)) {
            return {
              Success: true,
              Results: [{ ID: deniedVerId, ArtifactID: deniedArtId, VersionNumber: 1, Name: 'Confidential v1' }],
              TotalRowCount: 1,
            };
          }
          return { Success: true, Results: [], TotalRowCount: 0 };
        }
        if (params.EntityName === 'MJ: Artifacts') {
          if (filter.includes(deniedArtId)) {
            return {
              Success: true,
              Results: [{ ID: deniedArtId, Name: 'Confidential Deck', Type: 'Presentation' }],
              TotalRowCount: 1,
            };
          }
          return { Success: true, Results: [], TotalRowCount: 0 };
        }
        return { Success: true, Results: [], TotalRowCount: 0 };
      });
      const fakeProvider: Partial<IMetadataProvider> & { RunView: typeof runViewMock } = {
        CurrentUser: fakeUser,
        RunView: runViewMock,
      };

      const channel = new ArtifactWorkspaceChannel();
      const log: ChannelLog = { Notes: [] };
      await channel.Initialize({
        ...MakeContext(log),
        Provider: fakeProvider as IMetadataProvider,
      });

      try {
        const missingRes = await channel.Open({
          artifactId: missingArtId,
          artifactVersionId: missingVerId,
          name: 'Spoofed Client Name',
        });
        expect(missingRes.Success).toBe(false);
        expect(missingRes.ErrorCode).toBe('not_found');
        expect(channel.Engine.Instances).toHaveLength(0);
        expect(permSpy).not.toHaveBeenCalledWith(expect.anything(), missingArtId, expect.anything());

        const deniedRes = await channel.Open({
          artifactId: deniedArtId,
          artifactVersionId: deniedVerId,
          name: 'Spoofed Client Name',
        });
        expect(deniedRes.Success).toBe(false);
        expect(deniedRes.ErrorCode).toBe('access_denied');
        expect(channel.Engine.Instances).toHaveLength(0);

        await channel.OnDelegationArtifacts([
          {
            ArtifactID: missingArtId,
            ArtifactVersionID: missingVerId,
            Name: 'Spoofed Missing Deck',
            ArtifactTypeName: 'Presentation',
          },
          {
            ArtifactID: deniedArtId,
            ArtifactVersionID: deniedVerId,
            Name: 'Spoofed Confidential Deck',
            ArtifactTypeName: 'Presentation',
          },
        ]);
        expect(channel.Engine.Instances).toHaveLength(0);
      } finally {
        channel.Dispose();
        permSpy.mockRestore();
      }
    });

    it('routes Whiteboard to ArtifactWorkspace and blocks non-component typed artifacts from InteractiveComponent (G-P1-1)', async () => {
      expect(IsCollaborativeArtifactDescriptor('Whiteboard')).toBe(true);

      const workspace = new ArtifactWorkspaceChannel();
      const interactive = new InteractiveComponentChannel();
      const wsLog: ChannelLog = { Notes: [] };
      const icLog: ChannelLog = { Notes: [] };
      await workspace.Initialize(MakeContext(wsLog));
      await interactive.Initialize(MakeContext(icLog));

      try {
        const whiteboardArtifact = [
          {
            ArtifactID: '55555555-5555-4555-8555-555555555555',
            ArtifactVersionID: '66666666-6666-4666-8666-666666666666',
            Name: 'Architecture Whiteboard',
            ArtifactTypeName: 'Whiteboard',
          },
        ];
        expect(workspace.AcceptsDelegationArtifacts(whiteboardArtifact, {})).toBe(true);
        expect(
          interactive.AcceptsDelegationArtifacts(whiteboardArtifact, {
            autoOpenDelegatedComponents: true,
          }),
        ).toBe(false);

        for (const nonComponentType of ['Code', 'HTML', 'JSON', 'SVG', 'SQL']) {
          const typedArtifact = [
            {
              ArtifactID: '77777777-7777-4777-8777-777777777777',
              ArtifactVersionID: '88888888-8888-4888-8888-888888888888',
              Name: `Sample ${nonComponentType}`,
              ArtifactTypeName: nonComponentType,
            },
          ];
          expect(
            interactive.AcceptsDelegationArtifacts(typedArtifact, {
              autoOpenDelegatedComponents: true,
            }),
          ).toBe(false);
          await interactive.OnDelegationArtifacts(typedArtifact);
          expect(interactive.GetState()).toEqual({ components: {} });
        }

        const legacyUntyped = [
          {
            ArtifactID: '99999999-9999-4999-8999-999999999999',
            ArtifactVersionID: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            Name: 'Legacy Widget',
          },
        ];
        expect(
          interactive.AcceptsDelegationArtifacts(legacyUntyped, {
            autoOpenDelegatedComponents: true,
          }),
        ).toBe(true);
      } finally {
        workspace.Dispose();
        interactive.Dispose();
      }
    });

    it('resolves VersionNumber in show_version, rejects cross-artifact versionId, and re-hydrates RestoreState permissions (G-P1-2)', async () => {
      const artA = '11111111-aaaa-4111-8111-111111111111';
      const v1A = '22222222-aaaa-4222-8222-222222222222';
      const v2A = '33333333-aaaa-4333-8333-333333333333';
      const artB = '44444444-bbbb-4444-8444-444444444444';
      const v1B = '55555555-bbbb-4555-8555-555555555555';
      const artDenied = '66666666-cccc-4666-8666-666666666666';
      const v1Denied = '77777777-cccc-4777-8777-777777777777';

      const permSpy = vi
        .spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions')
        .mockImplementation(
          async (_provider, artifactId): Promise<ResolvedArtifactPermissions> => ({
            ArtifactID: artifactId ?? '',
            CanRead: artifactId !== artDenied,
            CanEdit: artifactId === artA,
            CanDelete: false,
            CanShare: false,
            Source: artifactId === artA ? 'Owner' : 'Denied',
            Reason: 'test fixture',
          }),
        );

      const fakeUser = { ID: 'u-1', Name: 'Author User' } as UserInfo;
      const runViewMock = vi.fn(async (params: RunViewParams) => {
        const filter = String(params.ExtraFilter ?? '');
        if (params.EntityName === 'MJ: Artifact Versions') {
          if (filter.includes(v2A)) {
            return {
              Success: true,
              Results: [{ ID: v2A, ArtifactID: artA, VersionNumber: 2, Name: 'Spec v2' }],
              TotalRowCount: 1,
            };
          }
          if (filter.includes(v1B)) {
            return {
              Success: true,
              Results: [{ ID: v1B, ArtifactID: artB, VersionNumber: 1, Name: 'Other v1' }],
              TotalRowCount: 1,
            };
          }
          if (filter.includes(v1A) || filter.includes(artA)) {
            return {
              Success: true,
              Results: [{ ID: v1A, ArtifactID: artA, VersionNumber: 1, Name: 'Spec v1' }],
              TotalRowCount: 1,
            };
          }
          if (filter.includes(v1Denied) || filter.includes(artDenied)) {
            return {
              Success: true,
              Results: [{ ID: v1Denied, ArtifactID: artDenied, VersionNumber: 1, Name: 'Denied v1' }],
              TotalRowCount: 1,
            };
          }
          return { Success: true, Results: [], TotalRowCount: 0 };
        }
        if (params.EntityName === 'MJ: Artifacts') {
          if (filter.includes(artA)) {
            return {
              Success: true,
              Results: [{ ID: artA, Name: 'Spec', Type: 'Markdown Document' }],
              TotalRowCount: 1,
            };
          }
          if (filter.includes(artB)) {
            return {
              Success: true,
              Results: [{ ID: artB, Name: 'Other Doc', Type: 'Markdown Document' }],
              TotalRowCount: 1,
            };
          }
          if (filter.includes(artDenied)) {
            return {
              Success: true,
              Results: [{ ID: artDenied, Name: 'Denied Doc', Type: 'Markdown Document' }],
              TotalRowCount: 1,
            };
          }
          return { Success: true, Results: [], TotalRowCount: 0 };
        }
        return { Success: true, Results: [], TotalRowCount: 0 };
      });
      const fakeProvider: Partial<IMetadataProvider> & { RunView: typeof runViewMock } = {
        CurrentUser: fakeUser,
        RunView: runViewMock,
      };

      const channel = new ArtifactWorkspaceChannel();
      const descriptor = channel.GetDescriptor();
      expect(descriptor.Events).toContainEqual(
        expect.objectContaining({ Name: 'newer_version_available' }),
      );
      const closeVerb = descriptor.Verbs.find((v) => v.Name === 'close');
      expect(closeVerb?.ParametersSchema?.properties).toHaveProperty('artifactId');

      await channel.Initialize({
        ...MakeContext({ Notes: [] }),
        Provider: fakeProvider as IMetadataProvider,
      });

      const prior = new ArtifactWorkspaceChannel();
      const noProviderChannel = new ArtifactWorkspaceChannel();
      const freshChannel = new ArtifactWorkspaceChannel();
      try {
        await channel.Open({ artifactId: artA, artifactVersionId: v1A });
        expect(channel.Engine.Instances[0]?.VersionNumber).toBe(1);

        // Cross-artifact versionId must be rejected
        const wrongArtifact = await channel.ApplyVerb('show_version', { versionId: v1B }, 'agent');
        expect(wrongArtifact.Success).toBe(false);
        expect(wrongArtifact.ErrorCode).toBe('invalid_params');

        // Matching artifact versionId resolves VersionNumber from DB
        const switched = await channel.ApplyVerb('show_version', { versionId: v2A }, 'agent');
        expect(switched.Success).toBe(true);
        expect(channel.Engine.Instances[0]?.ArtifactVersionID).toBe(v2A);
        expect(channel.Engine.Instances[0]?.VersionNumber).toBe(2);

        // Build real serialized state via SerializeState() with a stale Name and denied active tab
        await prior.Initialize(MakeContext({ Notes: [] }));
        await prior.Open({ artifactId: artA, artifactVersionId: v1A, versionNumber: 1, name: 'Stale Name' });
        await prior.Open({ artifactId: artDenied, artifactVersionId: v1Denied, versionNumber: 1, name: 'Revoked Doc' });
        const serializedState = prior.SerializeState();
        expect(serializedState).not.toBeNull();

        // Missing provider/user must stay CanEdit=false even if untrusted JSON attempts CanEdit: true
        await noProviderChannel.Initialize(MakeContext({ Notes: [] }));
        const untrustedJson = JSON.stringify({
          activeArtifactId: artA,
          instances: [
            {
              ArtifactID: artA,
              ArtifactVersionID: v1A,
              VersionNumber: 1,
              Name: 'Stale Name',
              CanEdit: true,
            },
          ],
        });
        expect(noProviderChannel.RestoreState(untrustedJson)).toBe(true);
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(noProviderChannel.Engine.Instances).toHaveLength(1);
        expect(noProviderChannel.Engine.Instances[0]?.CanEdit).toBe(false);

        // Pre-populate freshChannel with an unrelated tab to prove RestoreState clears stale tabs cleanly
        await freshChannel.Initialize({
          ...MakeContext({ Notes: [] }),
          Provider: fakeProvider as IMetadataProvider,
        });
        await freshChannel.Open({ artifactId: artB, artifactVersionId: v1B, versionNumber: 1, name: 'Old Tab' });
        expect(freshChannel.Engine.Instances).toHaveLength(1);

        // RestoreState clears existing tabs, forces CanEdit=false synchronously, then rehydrates DB name + perms & evicts denied tabs
        const restored = freshChannel.RestoreState(serializedState!);
        expect(restored).toBe(true);
        expect(freshChannel.Engine.Instances).toHaveLength(2);
        expect(freshChannel.Engine.Instances.every((inst) => inst.CanEdit === false)).toBe(true);
        expect(freshChannel.Engine.FindByArtifact(artB)).toBeUndefined();

        await new Promise((resolve) => setTimeout(resolve, 25));

        expect(freshChannel.Engine.Instances).toHaveLength(1);
        expect(freshChannel.Engine.Instances[0]?.ArtifactID).toBe(artA);
        expect(freshChannel.Engine.Instances[0]?.CanEdit).toBe(true);
        expect(freshChannel.Engine.Instances[0]?.Name).toBe('Spec v1');
        expect(freshChannel.Engine.ActiveID).toBe(freshChannel.Engine.Instances[0]?.InstanceID);
      } finally {
        prior.Dispose();
        noProviderChannel.Dispose();
        freshChannel.Dispose();
        channel.Dispose();
        permSpy.mockRestore();
      }
    });

    it('resolves collaborative artifact by name when artifactId and artifactVersionId are omitted, while rejecting missing identifiers or unreadable names', async () => {
      const docId = '77777777-7777-4777-8777-777777777777';
      const compId = '88888888-8888-4888-8888-888888888888';
      const permSpy = vi
        .spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions')
        .mockImplementation(async (_provider, artifactId): Promise<ResolvedArtifactPermissions> => ({
          ArtifactID: artifactId ?? '',
          CanRead: artifactId === docId || artifactId === compId,
          CanEdit: artifactId === docId,
          CanShare: false,
          CanDelete: false,
          Source: artifactId === docId || artifactId === compId ? 'ArtifactPermission' : 'Denied',
          Reason: 'Test mock resolution',
        }));

      const fakeUser = { ID: 'u-name', Name: 'Name Lookup User' } as UserInfo;
      const fakeProvider: Partial<IMetadataProvider> & { RunView: ReturnType<typeof vi.fn> } = {
        CurrentUser: fakeUser,
        RunView: vi.fn(async (params: RunViewParams) => {
          const filter = String(params.ExtraFilter ?? '');
          if (params.EntityName === 'MJ: Artifacts') {
            if (filter.includes('Diffusion Architecture')) {
              return {
                Success: true,
                Results: [{ ID: docId, Name: 'Diffusion Architecture', Type: 'Markdown Document' }],
                TotalRowCount: 1,
              };
            }
            if (filter.includes('Widget Only')) {
              return {
                Success: true,
                Results: [{ ID: compId, Name: 'Widget Only', Type: 'Component' }],
                TotalRowCount: 1,
              };
            }
          }
          return { Success: true, Results: [], TotalRowCount: 0 };
        }),
      };

      const channel = new ArtifactWorkspaceChannel();
      await channel.Initialize({
        ...MakeContext({ Notes: [] }),
        Provider: fakeProvider as IMetadataProvider,
      });

      try {
        const missingAll = await channel.Open({});
        expect(missingAll.Success).toBe(false);
        expect(missingAll.ErrorCode).toBe('invalid_params');

        const missingByName = await channel.Open({ name: 'Nonexistent Doc' });
        expect(missingByName.Success).toBe(false);
        expect(missingByName.ErrorCode).toBe('not_found');

        const componentByName = await channel.Open({ name: 'Widget Only' });
        expect(componentByName.Success).toBe(false);
        expect(componentByName.ErrorCode).toBe('use_interactive_component');

        const openedByName = await channel.Open({ name: 'Diffusion Architecture' });
        expect(openedByName.Success).toBe(true);
        expect(channel.Engine.Instances).toHaveLength(1);
        expect(channel.Engine.Instances[0]?.ArtifactID).toBe(docId);
        expect(channel.Engine.Instances[0]?.Name).toBe('Diffusion Architecture');
        expect(channel.Engine.Instances[0]?.ArtifactTypeName).toBe('Markdown Document');
        expect(channel.Engine.Instances[0]?.CanEdit).toBe(true);
      } finally {
        channel.Dispose();
        permSpy.mockRestore();
      }
    });
  });

  describe('NW-6 client selection delta, navigate_to_anchor, set_view_mode, version_changed, and LIKE escaping', () => {
    it('emits selection_changed on EmitSelectionDelta and handles navigate_to_anchor + set_view_mode + version_changed', async () => {
      const log: ChannelLog & { Events?: Array<{ event: string; payload: RealtimeChannelEvent['Payload'] }> } = {
        Notes: [],
        Events: [],
      };
      const nw6ArtId = 'dddddddd-1111-4111-8111-111111111111';
      const nw6VerId1 = 'eeeeeeee-1111-4111-8111-111111111111';
      const nw6VerId2 = 'ffffffff-2222-4222-8222-222222222222';
      const permSpy = vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
        ArtifactID: nw6ArtId,
        CanRead: true,
        CanEdit: true,
        CanDelete: false,
        CanShare: false,
        Source: 'Owner',
        Reason: 'test fixture',
      });
      const fakeUser = { ID: 'u-nw6', Name: 'NW6 User' } as UserInfo;
      const runViewMock = vi.fn(async (params: RunViewParams) => {
        if (params.EntityName === 'MJ: Artifact Versions') {
          return {
            Success: true,
            Results: [
              {
                ID: nw6VerId1,
                ArtifactID: nw6ArtId,
                VersionNumber: 1,
                Name: 'Board Forecast',
              },
            ],
            TotalRowCount: 1,
          };
        }
        if (params.EntityName === 'MJ: Artifacts') {
          return {
            Success: true,
            Results: [{ ID: nw6ArtId, Name: 'Board Forecast', Type: 'Excel Spreadsheet' }],
            TotalRowCount: 1,
          };
        }
        return { Success: true, Results: [], TotalRowCount: 0 };
      });
      const fakeProvider: Partial<IMetadataProvider> & { RunView: typeof runViewMock } = {
        CurrentUser: fakeUser,
        RunView: runViewMock,
      };
      const baseCtx = MakeContext(log);
      const emittedEvents: Array<{ name: string; payload: RealtimeChannelEvent['Payload'] }> = [];
      const ctx = {
        ...baseCtx,
        Provider: fakeProvider as IMetadataProvider,
      };

      const channel = new ArtifactWorkspaceChannel();
      const sub = channel.Events$.subscribe((ev) => {
        emittedEvents.push({ name: ev.Name, payload: ev.Payload });
      });
      try {
        await channel.Initialize(ctx);

        const opened = await channel.Open({
          artifactId: nw6ArtId,
          artifactVersionId: nw6VerId1,
          versionNumber: 1,
          name: 'Board Forecast',
          artifactTypeName: 'Excel Spreadsheet',
        });
        expect(opened.Success).toBe(true);
        const instanceId = channel.Engine.Instances[0].InstanceID;

        // 1. NW-6 bound surface ReportSelectionAnchor -> OnUserSelectionChanged -> EmitSelectionDelta -> selection_changed
        const surface = Object.create(
          RealtimeArtifactWorkspaceSurfaceComponent.prototype,
        ) as RealtimeArtifactWorkspaceSurfaceComponent;
        Object.assign(surface as object, {
          cdr: { markForCheck: vi.fn() },
        });
        channel.BindSurface(surface);

        const navPayloads: ArtifactNavigateToAnchorPayload[] = [];
        const navSub = channel.Engine.NavigateAnchor$.subscribe((p) => navPayloads.push(p));

        surface.ReportSelectionAnchor(instanceId, {
          domain: 'spreadsheet',
          sheet: 'Q4',
          range: 'B2:D12',
        });
        expect(emittedEvents.some((e) => e.name === 'selection_changed')).toBe(true);
        expect(channel.Engine.Get(instanceId)?.Selection).toMatchObject({
          domain: 'spreadsheet',
          sheet: 'Q4',
          range: 'B2:D12',
        });

        // 2. navigate_to_anchor tool sets active instance, updates anchor, emits NavigateAnchor$ & navigated_to_anchor
        const navResult = await channel.ApplyVerb(
          'navigate_to_anchor',
          { sheet: 'Revenue', range: 'A1:C5', highlightMs: 1500 },
          'agent',
          instanceId,
        );
        expect(navResult.Success).toBe(true);
        expect(emittedEvents.some((e) => e.name === 'navigated_to_anchor')).toBe(true);
        expect(navPayloads).toEqual([
          expect.objectContaining({
            InstanceID: instanceId,
            ArtifactID: nw6ArtId,
            Sheet: 'Revenue',
            Range: 'A1:C5',
            HighlightMs: 1500,
          }),
        ]);
        navSub.unsubscribe();

        // 3. set_view_mode validates mode and emits view_mode_changed
        const badMode = await channel.ApplyVerb(
          'set_view_mode',
          { mode: 'bogus' },
          'agent',
          instanceId,
        );
        expect(badMode.Success).toBe(false);

        const goodMode = await channel.ApplyVerb(
          'set_view_mode',
          { mode: 'suggest' },
          'agent',
          instanceId,
        );
        expect(goodMode.Success).toBe(true);
        expect(channel.Engine.Get(instanceId)?.ViewMode).toBe('suggest');
        expect(emittedEvents.some((e) => e.name === 'view_mode_changed')).toBe(true);

        // 4. version_changed standardized event key when user saves from bound surface
        surface.OnViewerVersionSaved(instanceId, {
          ArtifactID: nw6ArtId,
          VersionID: nw6VerId2,
          VersionNumber: 2,
          UpdatedAt: new Date(),
        });
        expect(emittedEvents.some((e) => e.name === 'version_changed')).toBe(true);
      } finally {
        sub.unsubscribe();
        channel.Dispose();
        permSpy.mockRestore();
      }
    });

    it('escapes SQL LIKE wildcards (%, _, [) when looking up artifact by name', async () => {
      const capturedFilters: string[] = [];
      const fakeUser = { ID: 'u-like', Name: 'Tester' } as UserInfo;
      const fakeProvider: Partial<IMetadataProvider> & { RunView: ReturnType<typeof vi.fn> } = {
        CurrentUser: fakeUser,
        RunView: vi.fn(async (params: RunViewParams) => {
          if (params.EntityName === 'MJ: Artifacts') {
            capturedFilters.push(String(params.ExtraFilter ?? ''));
          }
          return { Success: true, Results: [], TotalRowCount: 0 };
        }),
      };

      const channel = new ArtifactWorkspaceChannel();
      await channel.Initialize({
        ...MakeContext({ Notes: [] }),
        Provider: fakeProvider as IMetadataProvider,
      });

      await channel.Open({ name: '100%_Q4[Plan]' });
      channel.Dispose();

      expect(capturedFilters).toHaveLength(2);
      expect(capturedFilters[1]).toContain('100\\%\\_Q4\\[Plan]');
      expect(capturedFilters[1]).toContain("Visibility <> 'System Only'");
    });
  });
});
