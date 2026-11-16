import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EntityInfo, IMetadataProvider, RunView, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import {
  ArtifactMetadataEngine,
  GetConnectedDriveLinkFromConfig,
  MergeConnectedDriveLinkIntoConfig,
  MJArtifactEntity,
  MJArtifactTypeEntity,
  MJArtifactVersionEntity,
  MJConversationDetailEntity,
  ResolveGuestShareLinkOperation,
} from '@memberjunction/core-entities';
import {
  RequestArtifactAiAssistant,
  RegisterArtifactAiAssistantHandler,
  type ArtifactAskAiRequest,
} from '@memberjunction/ng-artifacts';
import { StorageObjectMetadata } from '@memberjunction/graphql-dataprovider';
import { ChatAgentsOverlayComponent } from '../lib/components/overlay/chat-overlay.component';
import {
  LibraryCreationService,
  RemoteDriveConflictError,
} from '../lib/services/library-creation.service';
import { LibraryWorkspaceComponent } from '../lib/components/library/library-workspace.component';
import { DocumentImportExportService, SlideDeckExportService } from '@memberjunction/ng-artifacts';
import { CollectionPermissionService } from '../lib/services/collection-permission.service';

const TEST_USER = {
  ID: '11111111-1111-4111-8111-111111111111',
  Name: 'Amith Nagarajan',
  Email: 'amith@example.com',
} as UserInfo;

const DOC_ARTIFACT_TYPE = {
  ID: 'aaaa0001-0000-4000-8000-000000000001',
  Name: 'Markdown Document',
  ContentType: 'text/markdown',
  DriverClass: 'MarkdownArtifactViewerPlugin',
  IsEnabled: true,
} as MJArtifactTypeEntity;

interface MockRecord {
  ID: string;
  ArtifactID?: string;
  VersionNumber?: number;
  Name?: string;
  Description?: string | null;
  TypeID?: string;
  EnvironmentID?: string;
  UserID?: string;
  ContentMode?: MJArtifactVersionEntity['ContentMode'];
  Content?: string | null;
  FileID?: string | null;
  MimeType?: string | null;
  FileName?: string | null;
  ContentSizeBytes?: number | null;
  Configuration?: string | null;
  AuditLogTypeID?: string;
  Status?: string;
  Details?: string;
  RecordID?: string;
  LatestResult?: { Message: string } | null;
  Load: (id: string) => Promise<boolean>;
  Save: () => Promise<boolean>;
  Delete: () => Promise<boolean>;
}

function createCreationService(): LibraryCreationService {
  const service = Object.create(LibraryCreationService.prototype) as LibraryCreationService;
  Object.assign(service as object, {
    docImportExport: new DocumentImportExportService(),
    slideExport: new SlideDeckExportService(),
    collectionPermissions: Object.create(CollectionPermissionService.prototype),
    artifactFileService: null,
    blobStoreOverride: null,
  });
  return service;
}

describe('Next Horizons — Inline AI Overlay, Connected Drive Round-Trip Sync, and Guest Share Links', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('wires RegisterArtifactAiAssistantHandler to ChatAgentsOverlayComponent without any Copilot branding', () => {
    const overlayTs = readFileSync(
      resolve(__dirname, '../lib/components/overlay/chat-overlay.component.ts'),
      'utf8',
    );
    const overlayHtml = readFileSync(
      resolve(__dirname, '../lib/components/overlay/chat-overlay.component.html'),
      'utf8',
    );
    expect(overlayTs.toLowerCase()).not.toContain('copilot');
    expect(overlayHtml.toLowerCase()).not.toContain('copilot');

    const overlay = Object.create(ChatAgentsOverlayComponent.prototype) as ChatAgentsOverlayComponent;
    const visibilityEmit = vi.fn();
    Object.assign(overlay as object, {
      State: 'collapsed',
      IsHidden: false,
      UnreadCount: 3,
      AppContext: { Route: '/library', AdditionalContext: { Workspace: 'Library' } },
      ActiveArtifactAiRequest: null,
      ArtifactAiSuggestingMode: true,
      ArtifactAiLatestProposal: '',
      ArtifactAiProposalApplied: false,
      ArtifactAiComposerDraft: null,
      cdr: { detectChanges: vi.fn() },
      bridge: { NotifyOverlayActive: vi.fn() },
      VisibilityChanged: { emit: visibilityEmit },
      Expand: () => {
        overlay.State = 'expanded';
        overlay.UnreadCount = 0;
        visibilityEmit('expanded');
      },
    });

    const unregister = RegisterArtifactAiAssistantHandler((req) => overlay.HandleArtifactAiRequest(req));
    try {
      const appliedCalls: Array<{ text: string; suggest: boolean }> = [];
      const req: ArtifactAskAiRequest = {
        ArtifactID: 'art-doc-1',
        ArtifactTitle: 'Architecture Memo',
        ArtifactKind: 'doc',
        ContextLabel: 'Executive Summary',
        SelectedContent: 'Original paragraph copy.',
        InitialPrompt: 'Tighten this summary for executives.',
        SuggestingModeDefault: true,
        TargetSegmentID: 'seg-exec-1',
        ApplySuggestion: (proposedText, asSuggestion) => {
          appliedCalls.push({ text: proposedText, suggest: asSuggestion });
        },
      };

      expect(RequestArtifactAiAssistant(req)).toBe(false);
      overlay.HandleArtifactAiRequest(req);
      expect(overlay.State).toBe('expanded');
      expect(overlay.ActiveArtifactAiRequest?.ArtifactTitle).toBe('Architecture Memo');
      expect(overlay.ArtifactAiSuggestingMode).toBe(true);
      expect(overlay.ArtifactAiComposerDraft).toContain('Tighten this summary for executives.');
      expect(overlay.ArtifactAiComposerDraft).toContain('Original paragraph copy.');

      const effectiveCtx = overlay.EffectiveAppContext;
      const additional = effectiveCtx?.['AdditionalContext'] as Record<string, unknown>;
      expect(additional['Workspace']).toBe('Library');
      expect(additional['ArtifactEditor']).toMatchObject({
        ArtifactID: 'art-doc-1',
        ArtifactKind: 'doc',
        TargetSegmentID: 'seg-exec-1',
        SuggestingMode: true,
      });

      const assistantMsg = { Message: 'Concise executive rewrite.' } as MJConversationDetailEntity;
      overlay.OnAgentMessageReceived({ message: assistantMsg });
      expect(overlay.ArtifactAiLatestProposal).toBe('Concise executive rewrite.');

      expect(overlay.ApplyArtifactAiProposal()).toBe(true);
      expect(overlay.ArtifactAiProposalApplied).toBe(true);
      expect(appliedCalls).toEqual([
        { text: 'Concise executive rewrite.', suggest: true },
      ]);

      overlay.DismissArtifactAiContext();
      expect(overlay.ActiveArtifactAiRequest).toBeNull();
      expect(overlay.ArtifactAiLatestProposal).toBe('');
    } finally {
      unregister();
    }
  });

  it('persists ConnectedDriveLinkMetadata on import, rejects stale ETag push unless forced, and creates vN+1 on pull with zero MJ: Files rows', async () => {
    const service = createCreationService();
    vi.spyOn(service, 'LoadEnabledArtifactTypes').mockResolvedValue([DOC_ARTIFACT_TYPE]);
    vi.spyOn(ArtifactMetadataEngine.Instance, 'ArtifactTypes', 'get').mockReturnValue([
      DOC_ARTIFACT_TYPE,
    ]);

    const savedEntityNames: string[] = [];
    const artifactsById = new Map<string, MockRecord>();
    const versionsById = new Map<string, MockRecord>();
    let seq = 0;

    const mockProvider: Partial<IMetadataProvider> = {
      CurrentUser: TEST_USER,
      EntityByName: (name: string) =>
        ({
          SchemaName: '__mj',
          BaseView: name === 'MJ: Artifact Versions' ? 'vwArtifactVersions' : 'vwArtifacts',
        }) as EntityInfo,
      GetEntityObject: async <T>(entityName: string): Promise<T> => {
        const id = `${entityName}-${++seq}`;
        const rec: MockRecord = {
          ID: id,
          LatestResult: null,
          Load: async (targetId: string) => {
            const existing =
              entityName === 'MJ: Artifacts'
                ? artifactsById.get(targetId)
                : versionsById.get(targetId);
            if (!existing) return false;
            Object.assign(rec, existing);
            return true;
          },
          Save: async () => {
            savedEntityNames.push(entityName);
            const snapshot = { ...rec };
            if (entityName === 'MJ: Artifacts') {
              artifactsById.set(rec.ID, snapshot);
            } else if (entityName === 'MJ: Artifact Versions') {
              versionsById.set(rec.ID, snapshot);
            }
            return true;
          },
          Delete: async () => true,
        };
        return rec as T;
      },
    };

    vi.spyOn(RunView.prototype, 'RunView').mockImplementation(
      async <T>(params: RunViewParams): Promise<RunViewResult<T>> => {
        if (params.EntityName === 'MJ: Artifact Versions') {
          const rows = Array.from(versionsById.values()).sort(
            (a, b) => (b.VersionNumber ?? 0) - (a.VersionNumber ?? 0),
          );
          return {
            Success: true,
            Results: rows as T[],
            RowCount: rows.length,
            TotalRowCount: rows.length,
            ExecutionTime: 1,
            ErrorMessage: '',
          };
        }
        return {
          Success: true,
          Results: [],
          RowCount: 0,
          TotalRowCount: 0,
          ExecutionTime: 1,
          ErrorMessage: '',
        };
      },
    );

    let remoteEtag = 'etag-v1';
    let remoteBody = '# Remote Initial Note\n';
    const uploadedPayloads: Uint8Array[] = [];

    const storageClient = {
      CreatePreAuthDownloadUrl: vi.fn(async () => 'https://drive.example/download/notes.md'),
      CreatePreAuthUploadUrl: vi.fn(async () => ({
        success: true,
        uploadUrl: 'https://drive.example/upload/notes.md',
        providerKey: 'notes/notes.md',
      })),
      ListObjects: vi.fn(async () => ({
        objects: [
          {
            name: 'notes.md',
            path: 'notes/notes.md',
            fullPath: 'notes/notes.md',
            size: remoteBody.length,
            contentType: 'text/markdown',
            lastModified: new Date('2026-11-14T10:00:00Z'),
            isDirectory: false,
            etag: remoteEtag,
          } as StorageObjectMetadata,
        ],
        prefixes: [],
      })),
    };

    const created = await service.ConvertRemoteDriveObjectToNativeArtifact({
      AccountID: 'drive-acct-1',
      ObjectPath: 'notes/notes.md',
      FileName: 'notes.md',
      ProviderType: 'GoogleDrive',
      ETag: 'etag-v1',
      CurrentUser: TEST_USER,
      Provider: mockProvider as IMetadataProvider,
      StorageClientOverride: storageClient,
      FetchBytesOverride: async () => new TextEncoder().encode(remoteBody).buffer,
    });

    expect(savedEntityNames).not.toContain('MJ: Files');
    const initialLink = GetConnectedDriveLinkFromConfig(created.Version.Configuration);
    expect(initialLink).toMatchObject({
      ExternalFileID: 'notes/notes.md',
      ProviderType: 'GoogleDrive',
      ProviderIntegrationID: 'drive-acct-1',
      ETag: 'etag-v1',
      LastSyncDirection: 'pull',
    });

    // Simulate external remote edit changing ETag before push -> RemoteDriveConflictError
    remoteEtag = 'etag-remote-2';
    await expect(
      service.PushVersionToConnectedDrive({
        ArtifactID: created.Artifact.ID,
        VersionID: created.Version.ID,
        CurrentUser: TEST_USER,
        Provider: mockProvider as IMetadataProvider,
        StorageClientOverride: storageClient,
        UploadBytesOverride: async (_url, bytes) => {
          uploadedPayloads.push(bytes);
        },
      }),
    ).rejects.toBeInstanceOf(RemoteDriveConflictError);
    expect(uploadedPayloads).toHaveLength(0);

    // Pull latest remote update -> creates v2 without MJ: Files rows
    remoteBody = '# Remote Updated Note v2\nAdded paragraph.\n';
    const pulled = await service.PullLatestFromConnectedDriveAsNewVersion({
      ArtifactID: created.Artifact.ID,
      VersionID: created.Version.ID,
      CurrentUser: TEST_USER,
      Provider: mockProvider as IMetadataProvider,
      StorageClientOverride: storageClient,
      FetchBytesOverride: async () => new TextEncoder().encode(remoteBody).buffer,
    });

    expect(pulled.PreviousVersionNumber).toBe(1);
    expect(pulled.NewVersionNumber).toBe(2);
    expect(pulled.ETag).toBe('etag-remote-2');
    expect(savedEntityNames).not.toContain('MJ: Files');

    // Push now succeeds because v2 ETag matches remoteEtag
    const pushed = await service.PushVersionToConnectedDrive({
      ArtifactID: created.Artifact.ID,
      VersionID: pulled.NewVersionID,
      CurrentUser: TEST_USER,
      Provider: mockProvider as IMetadataProvider,
      StorageClientOverride: storageClient,
      UploadBytesOverride: async (_url, bytes) => {
        uploadedPayloads.push(bytes);
      },
    });
    expect(uploadedPayloads).toHaveLength(1);
    expect(pushed.VersionNumber).toBe(2);
    expect(pushed.ObjectPath).toBe('notes/notes.md');

    // Verify LibraryWorkspaceComponent wires Pull -> OpenVersionCompare
    const workspace = Object.create(LibraryWorkspaceComponent.prototype) as LibraryWorkspaceComponent;
    const openCompareSpy = vi.fn(async () => undefined);
    const refreshNextSpy = vi.fn();
    Object.assign(workspace as object, {
      CurrentUser: TEST_USER,
      IsDriveSyncing: false,
      IsFullCanvasOpen: true,
      FullCanvasViewerPanel: { OpenVersionCompare: openCompareSpy },
      RefreshViewerSubject: { next: refreshNextSpy } as Partial<Subject<{ artifactId: string; versionNumber: number }>>,
      StorageClientOverride: null,
      ReloadWorkspaceData: vi.fn(async () => undefined),
      creationService: {
        PullLatestFromConnectedDriveAsNewVersion: vi.fn(async () => ({
          ArtifactID: created.Artifact.ID,
          PreviousVersionNumber: 1,
          NewVersionID: 'ver-2',
          NewVersionNumber: 2,
          ObjectPath: 'notes/notes.md',
          UpdatedConfiguration: MergeConnectedDriveLinkIntoConfig(null, initialLink),
        })),
      },
      notifications: { CreateSimpleNotification: vi.fn() },
      cdr: { detectChanges: vi.fn() },
    });
    Object.defineProperty(workspace, 'ProviderToUse', {
      configurable: true,
      get: () => mockProvider as IMetadataProvider,
    });

    await workspace.OnConnectedDriveSyncRequested({
      artifactId: created.Artifact.ID,
      versionId: 'ver-1',
      direction: 'pull',
    });
    expect(openCompareSpy).toHaveBeenCalledWith(1, 2);
    expect(refreshNextSpy).toHaveBeenCalledWith({
      artifactId: created.Artifact.ID,
      versionNumber: 2,
    });
  });

  it('resolves guestToken in LibraryWorkspaceComponent into a read-only Frozen snapshot', async () => {
    vi.spyOn(ResolveGuestShareLinkOperation.prototype, 'Execute').mockResolvedValue({
      Success: true,
      Output: {
        Valid: true,
        ArtifactID: 'art-frozen-1',
        VersionID: 'ver-frozen-2',
        VersionNumber: 2,
        Title: 'Q4 Board Deck (Frozen)',
        ArtifactTypeName: 'Presentation',
        DriverClass: 'SlideDeckArtifactViewerPlugin',
        Content: JSON.stringify({ Title: 'Q4 Board Deck', Slides: [] }),
        Configuration: '{}',
        ExpiresAt: '2026-12-01T00:00:00.000Z',
        ReadOnly: true,
        ShareMode: 'Frozen',
      },
    });

    const workspace = Object.create(LibraryWorkspaceComponent.prototype) as LibraryWorkspaceComponent;
    const mockProvider: Partial<IMetadataProvider> = {
      CurrentUser: TEST_USER,
      GetEntityObject: async <T>() => ({}) as T,
    };
    Object.assign(workspace as object, {
      IsLoading: false,
      AllItems: [],
      FlatCollections: [],
      CollectionTree: [],
      ConnectedDrives: [],
      ExpandedCollectionIds: new Set<string>(),
      CategoryFilter: 'all',
      OwnershipFilter: 'all',
      isDestroyed: false,
      CurrentUser: TEST_USER,
      ActiveGuestToken: null,
      ActiveGuestShareSnapshot: null,
      GuestShareVersionEntity: null,
      GuestShareLoadError: null,
      IsGuestShareLoading: false,
      SelectedCollectionId: null,
      SelectedDriveId: null,
      DriveFolderPrefix: '',
      SearchQuery: '',
      ActiveArtifactId: null,
      ActiveVersionNumber: undefined,
      IsFullCanvasOpen: false,
      StateChange: { emit: vi.fn() },
      cdr: { detectChanges: vi.fn() },
    });
    Object.defineProperty(workspace, 'ProviderToUse', {
      configurable: true,
      get: () => mockProvider as IMetadataProvider,
    });

    workspace.ApplyExternalRouteState({ guestToken: 'guest-token-xyz' });
    await new Promise((r) => setTimeout(r, 15));

    expect(workspace.ActiveGuestToken).toBe('guest-token-xyz');
    expect(workspace.ActiveGuestShareSnapshot?.ReadOnly).toBe(true);
    expect(workspace.ActiveGuestShareSnapshot?.ShareMode).toBe('Frozen');
    expect(workspace.GuestShareVersionEntity?.ContentMode).toBe('Text');
    expect(workspace.GuestShareVersionEntity?.VersionNumber).toBe(2);
    expect(workspace.GuestShareLoadError).toBeNull();
  });
});
