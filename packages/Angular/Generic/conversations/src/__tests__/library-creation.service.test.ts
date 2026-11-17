import '@angular/compiler';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EntityInfo, IMetadataProvider, RunView, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import {
  ArtifactMetadataEngine,
  ArtifactPermissionEngine,
  MergeConnectedDriveLinkIntoConfig,
  MJArtifactTypeEntity,
} from '@memberjunction/core-entities';
import { type GraphQLFileStorageClient, StorageObjectMetadata } from '@memberjunction/graphql-dataprovider';
import { DocumentImportExportService, SlideDeckExportService } from '@memberjunction/ng-artifacts';
import { GraphQLAttachmentBlobStore } from '../lib/services/graphql-attachment-blob-store';
import {
  LibraryCreationService,
  RemoteDriveConflictError,
} from '../lib/services/library-creation.service';
import { CollectionPermissionService } from '../lib/services/collection-permission.service';

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

const OWNER_USER = {
  ID: '11111111-1111-4111-8111-111111111111',
  Name: 'Owner User',
  Email: 'owner@example.com',
} as UserInfo;

const READER_USER = {
  ID: '22222222-2222-4222-8222-222222222222',
  Name: 'Reader User',
  Email: 'reader@example.com',
} as UserInfo;

const DOC_TYPE = {
  ID: 'aaaa0001-0000-4000-8000-000000000001',
  Name: 'Markdown Document',
  ContentType: 'text/markdown',
  DriverClass: 'MarkdownArtifactViewerPlugin',
  IsEnabled: true,
} as MJArtifactTypeEntity;

interface MockRow {
  ID: string;
  UserID?: string;
  ArtifactID?: string;
  VersionNumber?: number;
  Name?: string;
  Content?: string;
  Configuration?: string | null;
  Type?: string;
  TypeID?: string;
  LatestResult?: { Complete?: boolean; Message?: string } | null;
  OwnerID?: string;
  Load?: (id: string) => Promise<boolean>;
  Save?: () => Promise<boolean>;
  Delete?: () => Promise<boolean>;
}

function createConnectedDriveProvider(initial: {
  artifact: MockRow;
  version: MockRow;
}): Partial<IMetadataProvider> {
  return {
    CurrentUser: OWNER_USER,
    EntityByName: (name: string) =>
      ({
        SchemaName: '__mj',
        BaseView: name === 'MJ: Artifact Versions' ? 'vwArtifactVersions' : 'vwArtifacts',
      }) as EntityInfo,
    GetEntityObject: async <T>(entityName: string): Promise<T> => {
      const rec: MockRow = {
        ID: `${entityName}-new`,
        LatestResult: null,
        Load: async (id: string) => {
          if (entityName === 'MJ: Artifacts' && id === initial.artifact.ID) {
            Object.assign(rec, initial.artifact);
            return true;
          }
          if (entityName === 'MJ: Artifact Versions' && id === initial.version.ID) {
            Object.assign(rec, initial.version);
            return true;
          }
          return false;
        },
        Save: async () => true,
        Delete: async () => true,
      };
      return rec as T;
    },
  };
}

describe('LibraryCreationService — Connected Drive ACL pre-checks and >100 item ETag handling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('denies PushVersionToConnectedDrive and PullLatestFromConnectedDriveAsNewVersion BEFORE calling Connected Drive storage when user lacks CanEdit', async () => {
    const service = createCreationService();
    vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
      ArtifactID: 'art-ro-1',
      CanRead: true,
      CanEdit: false,
      CanDelete: false,
      CanShare: false,
      Source: 'ArtifactPermission',
      Reason: 'Read-only share',
    });

    const linkedConfig = MergeConnectedDriveLinkIntoConfig(null, {
      ProviderIntegrationID: 'drive-1',
      ProviderType: 'GoogleDrive',
      ExternalFileID: 'docs/plan.md',
      ETag: 'etag-1',
      LastSyncDirection: 'pull',
      LastSyncedAt: '2026-11-15T10:00:00Z',
    });

    const md = createConnectedDriveProvider({
      artifact: { ID: 'art-ro-1', UserID: OWNER_USER.ID, Name: 'Plan Doc', Type: 'Markdown Document' },
      version: {
        ID: 'ver-ro-1',
        ArtifactID: 'art-ro-1',
        VersionNumber: 1,
        Content: '# Plan',
        Configuration: linkedConfig,
      },
    });

    const listObjectsSpy = vi.fn();
    const uploadUrlSpy = vi.fn();
    const downloadUrlSpy = vi.fn();
    const fetchSpy = vi.fn();

    await expect(
      service.PushVersionToConnectedDrive({
        ArtifactID: 'art-ro-1',
        VersionID: 'ver-ro-1',
        CurrentUser: READER_USER,
        Provider: md as IMetadataProvider,
        StorageClientOverride: {
          ListObjects: listObjectsSpy,
          CreatePreAuthUploadUrl: uploadUrlSpy,
        },
        UploadBytesOverride: vi.fn(),
      }),
    ).rejects.toThrow(/Permission denied/i);

    await expect(
      service.PullLatestFromConnectedDriveAsNewVersion({
        ArtifactID: 'art-ro-1',
        VersionID: 'ver-ro-1',
        CurrentUser: READER_USER,
        Provider: md as IMetadataProvider,
        StorageClientOverride: {
          ListObjects: listObjectsSpy,
          CreatePreAuthDownloadUrl: downloadUrlSpy,
        },
        FetchBytesOverride: fetchSpy,
      }),
    ).rejects.toThrow(/Permission denied/i);

    expect(listObjectsSpy).not.toHaveBeenCalled();
    expect(uploadUrlSpy).not.toHaveBeenCalled();
    expect(downloadUrlSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('detects stale ETag via exact object prefix probe even when parent folder contains >100 items', async () => {
    const service = createCreationService();
    vi.spyOn(service, 'LoadEnabledArtifactTypes').mockResolvedValue([DOC_TYPE]);
    vi.spyOn(ArtifactMetadataEngine.Instance, 'ArtifactTypes', 'get').mockReturnValue([DOC_TYPE]);
    vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
      ArtifactID: 'art-105',
      CanRead: true,
      CanEdit: true,
      CanDelete: true,
      CanShare: true,
      Source: 'Owner',
      Reason: 'Artifact owner',
    });

    const linkedConfig = MergeConnectedDriveLinkIntoConfig(null, {
      ProviderIntegrationID: 'drive-1',
      ProviderType: 'GoogleDrive',
      ExternalFileID: 'shared-folder/target-doc.md',
      ETag: 'etag-v1',
      LastSyncDirection: 'pull',
      LastSyncedAt: '2026-11-15T10:00:00Z',
    });

    const artifactRow: MockRow = {
      ID: 'art-105',
      UserID: OWNER_USER.ID,
      Name: 'Target Doc',
      Type: 'Markdown Document',
      TypeID: DOC_TYPE.ID,
    };
    const versionRow: MockRow = {
      ID: 'ver-105',
      ArtifactID: 'art-105',
      VersionNumber: 1,
      Content: '# Local draft',
      Configuration: linkedConfig,
    };

    const md = createConnectedDriveProvider({
      artifact: artifactRow,
      version: versionRow,
    });

    const runViewMock = async (params: RunViewParams): Promise<RunViewResult<MockRow>> => {
      if (params.EntityName === 'MJ: Artifact Versions') {
        return {
          Success: true,
          Results: [versionRow],
          RowCount: 1,
          TotalRowCount: 1,
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
    };
    vi.spyOn(RunView.prototype, 'RunView').mockImplementation(
      runViewMock as typeof RunView.prototype.RunView,
    );

    const manyFiles: StorageObjectMetadata[] = Array.from({ length: 105 }, (_, i) => ({
      name: `other-${String(i).padStart(3, '0')}.md`,
      path: `shared-folder/other-${String(i).padStart(3, '0')}.md`,
      fullPath: `shared-folder/other-${String(i).padStart(3, '0')}.md`,
      size: 120,
      contentType: 'text/markdown',
      lastModified: new Date('2026-11-15T10:00:00Z'),
      isDirectory: false,
      etag: 'etag-other',
    }));

    const targetMetadata: StorageObjectMetadata = {
      name: 'target-doc.md',
      path: 'shared-folder/target-doc.md',
      fullPath: 'shared-folder/target-doc.md',
      size: 256,
      contentType: 'text/markdown',
      lastModified: new Date('2026-11-15T11:00:00Z'),
      isDirectory: false,
      etag: 'etag-remote-newer',
    };

    const listObjectsSpy = vi.fn(async (_accountId: string, prefix: string) => {
      // Folder listing only has first 100 unrelated objects; exact path probe returns target-doc.md
      if (prefix === 'shared-folder/target-doc.md') {
        return { objects: [targetMetadata], prefixes: [] };
      }
      return { objects: manyFiles.slice(0, 100), prefixes: [] };
    });
    const uploadUrlSpy = vi.fn();

    await expect(
      service.PushVersionToConnectedDrive({
        ArtifactID: 'art-105',
        VersionID: 'ver-105',
        CurrentUser: OWNER_USER,
        Provider: md as IMetadataProvider,
        StorageClientOverride: {
          ListObjects: listObjectsSpy,
          CreatePreAuthUploadUrl: uploadUrlSpy,
        },
        UploadBytesOverride: vi.fn(),
      }),
    ).rejects.toBeInstanceOf(RemoteDriveConflictError);

    expect(listObjectsSpy).toHaveBeenCalledWith('drive-1', 'shared-folder/target-doc.md', '/');
    expect(uploadUrlSpy).not.toHaveBeenCalled();
  });

  it('rejects upload via SearchFiles fallback when folder listing has >= 100 items and file collides beyond page 1', async () => {
    const service = createCreationService();
    vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
      ArtifactID: 'art-106',
      CanRead: true,
      CanEdit: true,
      CanDelete: true,
      CanShare: true,
      Source: 'Owner',
      Reason: 'Artifact owner',
    });

    const md = createConnectedDriveProvider({
      artifact: { ID: 'art-106', UserID: OWNER_USER.ID, Name: 'Report', Type: 'Markdown Document' },
      version: { ID: 'ver-106', ArtifactID: 'art-106', VersionNumber: 1, Content: '# Hi', Configuration: null },
    });

    const page1 = Array.from({ length: 100 }, (_, i) => ({
      name: `item-${i}.md`,
      path: `folder/item-${i}.md`,
      fullPath: `folder/item-${i}.md`,
      size: 10,
      contentType: 'text/markdown',
      lastModified: new Date(),
      isDirectory: false,
      etag: 'e1',
    }));

    const searchFilesSpy: GraphQLFileStorageClient['SearchFiles'] = vi.fn(async () => ({
      accountResults: [
        {
          accountId: 'drive-1',
          accountName: 'Drive 1',
          success: true,
          hasMore: false,
          results: [
            {
              name: 'Report.md',
              path: 'folder/Report.md',
              size: 10,
              contentType: 'text/markdown',
              lastModified: new Date('2026-11-15T10:00:00Z'),
            },
          ],
        },
      ],
      totalResultsReturned: 1,
      successfulAccounts: 1,
      failedAccounts: 0,
    }));

    const uploadUrlSpy = vi.fn();

    await expect(
      service.PublishArtifactVersionToConnectedDrive({
        ArtifactName: 'Report',
        VersionContent: '# Hi',
        VersionConfiguration: null,
        VersionContentMode: 'Text',
        Format: 'md',
        AccountID: 'drive-1',
        TargetFolderPrefix: 'folder',
        TargetFileName: 'Report.md',
        AllowOverwrite: false,
        CurrentUser: OWNER_USER,
        Provider: md as IMetadataProvider,
        StorageClientOverride: {
          ListObjects: vi.fn(async () => ({ objects: page1, prefixes: [] })),
          SearchFiles: searchFilesSpy,
          CreatePreAuthUploadUrl: uploadUrlSpy,
        },
      }),
    ).rejects.toThrow(/already exists/i);

    expect(searchFilesSpy).toHaveBeenCalledWith(['drive-1'], 'Report.md', { maxResultsPerAccount: 100 });
    expect(uploadUrlSpy).not.toHaveBeenCalled();
  });

  it('denies ImportLocalFileToLibrary BEFORE calling store.Upload when target collection lacks CanEdit permission', async () => {
    const service = createCreationService();
    const collectionPerms = Object.assign(Object.create(CollectionPermissionService.prototype), {
      CheckPermission: vi.fn(async () => ({
        canRead: true,
        canEdit: false,
        canShare: false,
        canDelete: false,
        source: 'share',
      })),
    }) as CollectionPermissionService;
    Object.assign(service as object, { collectionPermissions: collectionPerms });

    const uploadSpy = vi.fn(async () => ({ Success: true, FileID: 'file-should-not-exist' }));
    service.SetBlobStoreOverride(Object.assign(new GraphQLAttachmentBlobStore(), { Upload: uploadSpy }));

    const md: Partial<IMetadataProvider> = {
      CurrentUser: READER_USER,
      GetEntityObject: async <T>(entityName: string): Promise<T> => {
        const rec: MockRow = {
          ID: entityName === 'MJ: Collections' ? 'col-ro-1' : `${entityName}-new`,
          OwnerID: OWNER_USER.ID,
          LatestResult: null,
          Load: async (id: string) => entityName === 'MJ: Collections' && id === 'col-ro-1',
          Save: async () => true,
          Delete: async () => true,
        };
        return rec as T;
      },
    };

    const binaryFile = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'secret.pdf', {
      type: 'application/pdf',
    });

    await expect(
      service.ImportLocalFileToLibrary({
        File: binaryFile,
        ConvertToEditable: false,
        CollectionID: 'col-ro-1',
        CurrentUser: READER_USER,
        Provider: md as IMetadataProvider,
      }),
    ).rejects.toThrow(/Edit permission/i);

    expect(uploadSpy).not.toHaveBeenCalled();
  });
});
