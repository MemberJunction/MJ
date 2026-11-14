import '@angular/compiler';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IMetadataProvider, RunViewParams, UserInfo } from '@memberjunction/core';
import { ArtifactPermissionEngine } from '@memberjunction/core-entities';
import { MJGlobal } from '@memberjunction/global';
import { BaseRealtimeChannelClient } from '@memberjunction/realtime-runtime';
import {
  ArtifactWorkspaceChannel,
  LoadRealtimeArtifactWorkspaceChannel,
} from '../lib/components/realtime/artifact-workspace/artifact-workspace-channel';
import { ArtifactWorkspaceEngine } from '../lib/components/realtime/artifact-workspace/artifact-workspace-engine';
import {
  ARTIFACT_WORKSPACE_CHANNEL_KEY,
  ARTIFACT_WORKSPACE_CLIENT_PLUGIN_CLASS,
  IsCollaborativeArtifactDescriptor,
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

      vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockImplementation(async () => ({
        ArtifactID: artId,
        UserID: 'u-1',
        IsOwner: canEditResponse,
        CanRead: true,
        CanEdit: canEditResponse,
        CanDelete: false,
        CanShare: false,
        HasDirectPermissions: true,
        GrantedBy: 'owner',
      }));

      const fakeUser = { ID: 'u-1', Name: 'Reader User' } as UserInfo;
      const fakeProvider: Partial<IMetadataProvider> = {
        CurrentUser: fakeUser,
      };
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
      (fakeProvider as { RunView?: unknown }).RunView = runViewMock;

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
  });
});
