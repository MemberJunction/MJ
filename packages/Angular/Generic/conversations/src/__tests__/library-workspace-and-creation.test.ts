import '@angular/compiler';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import {
  ArtifactMetadataEngine,
  MJArtifactEntity,
  MJArtifactTypeEntity,
  MJArtifactVersionEntity,
  MJCollectionArtifactEntity,
  MJCollectionEntity,
  SlideDeckSpec,
  WorkbookSpec,
} from '@memberjunction/core-entities';
import { LibraryCreationService, RemoteDriveFileExistsError } from '../lib/services/library-creation.service';
import type {
  AttachmentBlobUploadInput as UploadBlobInput,
  AttachmentBlobUploadResult as UploadBlobResult,
} from '@memberjunction/ai-core-plus';
import { GraphQLAttachmentBlobStore } from '../lib/services/graphql-attachment-blob-store';
import { LibraryWorkspaceComponent } from '../lib/components/library/library-workspace.component';
import { LibraryRemoteDrivePaneComponent } from '../lib/components/library/library-remote-drive-pane.component';
import { LibraryExportDriveDialogComponent } from '../lib/components/library/library-create-dialog.component';
import { TasksFullViewComponent } from '../lib/components/task/tasks-full-view.component';
import { LibraryCollectionNode, LibraryDriveSummary, LibraryItemSummary, LibraryWorkspaceState } from '../lib/components/library/library.models';
import { RunView, RunViewParams, RunViewResult } from '@memberjunction/core';
import { StorageObjectMetadata } from '@memberjunction/graphql-dataprovider';

interface RecordedEntitySave {
  entityName: string;
  record: MockPersistableRecord;
}

interface MockPersistableRecord {
  ID: string;
  Name: string;
  Description: string | null;
  TypeID: string;
  EnvironmentID: string;
  UserID: string;
  OwnerID: string | null;
  ArtifactID: string;
  VersionNumber: number;
  ContentMode: MJArtifactVersionEntity['ContentMode'];
  Content: string | null;
  FileID: string | null;
  MimeType: string | null;
  FileName: string | null;
  ContentSizeBytes: number | null;
  CollectionID: string;
  ArtifactVersionID: string;
  Deleted: boolean;
  LatestResult: { Message: string } | null;
  Save: () => Promise<boolean>;
  Delete: () => Promise<boolean>;
  Load: (id: string) => Promise<boolean>;
}

const TEST_USER = {
  ID: '11111111-1111-4111-8111-111111111111',
  Name: 'Amith Nagarajan',
  Email: 'amith@example.com',
} as UserInfo;

const ARTIFACT_TYPES: MJArtifactTypeEntity[] = [
  {
    ID: 'aaaa0001-0000-4000-8000-000000000001',
    Name: 'Markdown Document',
    ContentType: 'text/markdown',
    DriverClass: 'MarkdownArtifactViewerPlugin',
    IsEnabled: true,
  } as MJArtifactTypeEntity,
  {
    ID: 'aaaa0002-0000-4000-8000-000000000002',
    Name: 'Excel Spreadsheet',
    ContentType: 'application/vnd.mj.spreadsheet+json',
    DriverClass: 'SpreadsheetArtifactViewerPlugin',
    IsEnabled: true,
  } as MJArtifactTypeEntity,
  {
    ID: 'aaaa0003-0000-4000-8000-000000000003',
    Name: 'Presentation',
    ContentType: 'application/vnd.mj.slidedeck+json',
    DriverClass: 'SlideDeckArtifactViewerPlugin',
    IsEnabled: true,
  } as MJArtifactTypeEntity,
  {
    ID: 'aaaa0004-0000-4000-8000-000000000004',
    Name: 'SQL',
    ContentType: 'application/sql',
    DriverClass: 'CodeArtifactViewerPlugin',
    IsEnabled: true,
  } as MJArtifactTypeEntity,
  {
    ID: 'aaaa0005-0000-4000-8000-000000000005',
    Name: 'PDF Document',
    ContentType: 'application/pdf',
    DriverClass: 'PdfArtifactViewerPlugin',
    IsEnabled: true,
  } as MJArtifactTypeEntity,
];

function createMockProvider(options?: {
  failEntitySave?: string;
  collectionOwnerId?: string;
}): {
  provider: IMetadataProvider;
  saves: RecordedEntitySave[];
  requestedEntities: string[];
} {
  const saves: RecordedEntitySave[] = [];
  const requestedEntities: string[] = [];
  let seq = 1;

  const provider = {
    GetEntityObject: vi.fn(async (entityName: string) => {
      requestedEntities.push(entityName);
      const id = `bbbb000${seq++}-0000-4000-8000-000000000000`;
      const rec: MockPersistableRecord = {
        ID: id,
        Name: '',
        Description: null,
        TypeID: '',
        EnvironmentID: '',
        UserID: '',
        OwnerID: options?.collectionOwnerId ?? TEST_USER.ID,
        ArtifactID: '',
        VersionNumber: 1,
        ContentMode: 'Text',
        Content: null,
        FileID: null,
        MimeType: null,
        FileName: null,
        ContentSizeBytes: null,
        CollectionID: '',
        ArtifactVersionID: '',
        Deleted: false,
        LatestResult: null,
        Save: vi.fn(async () => {
          if (options?.failEntitySave === entityName) {
            rec.LatestResult = { Message: `Simulated ${entityName} save failure` };
            return false;
          }
          saves.push({ entityName, record: rec });
          return true;
        }),
        Delete: vi.fn(async () => {
          rec.Deleted = true;
          return true;
        }),
        Load: vi.fn(async (loadId: string) => {
          rec.ID = loadId;
          return true;
        }),
      };
      return rec;
    }),
  } as Partial<IMetadataProvider> as IMetadataProvider;

  return { provider, saves, requestedEntities };
}

function buildCreationService(overrides?: {
  canEditCollection?: boolean;
}): {
  service: LibraryCreationService;
  uploadSpy: ReturnType<typeof vi.fn<(input: UploadBlobInput) => Promise<UploadBlobResult>>>;
} {
  const service = Object.create(LibraryCreationService.prototype) as LibraryCreationService;

  const docImportExportStub = {
    ImportMarkdown: vi.fn(async (md: string) => md),
    ConvertDocxBytesToMarkdown: vi.fn(async () => '# Imported Word Heading\n\nBody paragraph.'),
    ConvertMarkdownToDocxBytes: vi.fn(async () => new Uint8Array([0x50, 0x4b, 0x03, 0x04])),
  };
  const slideExportStub = {
    ExportToPptxPackage: vi.fn(() => ({
      Bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
      FileName: 'Board_Deck.pptx',
    })),
  };
  const collectionPermStub = {
    Provider: null as IMetadataProvider | null,
    CheckPermission: vi.fn(async () =>
      overrides?.canEditCollection === false
        ? { canRead: true, canEdit: false, canShare: false, canDelete: false }
        : { canRead: true, canEdit: true, canShare: true, canDelete: false },
    ),
  };

  Object.assign(service as object, {
    docImportExport: docImportExportStub,
    slideExport: slideExportStub,
    collectionPermissions: collectionPermStub,
    blobStoreOverride: null,
  });

  const uploadSpy = vi.fn<
    (input: UploadBlobInput) => Promise<UploadBlobResult>
  >(async (input: UploadBlobInput) => ({
    Success: true,
    FileID: 'ffff0001-0000-4000-8000-000000000099',
    ContentHash: 'sha256-abc',
    SizeBytes: input.Base64Data.length,
  }));

  const mockStore: Pick<GraphQLAttachmentBlobStore, 'Upload'> = {
    Upload: uploadSpy,
  };
  service.SetBlobStoreOverride(mockStore as GraphQLAttachmentBlobStore);

  return { service, uploadSpy };
}

describe('LibraryCreationService', () => {
  beforeEach(() => {
    vi.spyOn(ArtifactMetadataEngine.Instance, 'Config').mockResolvedValue(undefined);
    vi.spyOn(ArtifactMetadataEngine.Instance, 'ArtifactTypes', 'get').mockReturnValue(ARTIFACT_TYPES);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates blank Document, Spreadsheet, Presentation, and SQL Query native text artifacts', async () => {
    const { service, uploadSpy } = buildCreationService();
    const { provider, saves } = createMockProvider();

    const docRes = await service.CreateBlankArtifact({
      Kind: 'document',
      Title: 'Q4 Strategy Memo',
      CurrentUser: TEST_USER,
      Provider: provider,
    });
    expect(docRes.ArtifactType.Name).toBe('Markdown Document');
    expect(docRes.Version.ContentMode).toBe('Text');
    expect(docRes.Version.Content).toContain('# Q4 Strategy Memo');
    expect(docRes.Version.FileID).toBeNull();

    const sheetRes = await service.CreateBlankArtifact({
      Kind: 'spreadsheet',
      Title: 'Revenue Forecast',
      CurrentUser: TEST_USER,
      Provider: provider,
    });
    expect(sheetRes.ArtifactType.Name).toBe('Excel Spreadsheet');
    const parsedWorkbook = JSON.parse(sheetRes.Version.Content ?? '{}') as WorkbookSpec;
    expect(parsedWorkbook.Title).toBe('Revenue Forecast');
    expect(parsedWorkbook.Worksheets[0]?.Name).toBe('Sheet 1');

    const slideRes = await service.CreateBlankArtifact({
      Kind: 'presentation',
      Title: 'Board Review Deck',
      CurrentUser: TEST_USER,
      Provider: provider,
    });
    expect(slideRes.ArtifactType.Name).toBe('Presentation');
    const parsedDeck = JSON.parse(slideRes.Version.Content ?? '{}') as SlideDeckSpec;
    expect(parsedDeck.Title).toBe('Board Review Deck');
    expect(Array.isArray(parsedDeck.Slides)).toBe(true);

    const sqlRes = await service.CreateBlankArtifact({
      Kind: 'query',
      Title: 'Top Accounts Query',
      CurrentUser: TEST_USER,
      Provider: provider,
    });
    expect(sqlRes.ArtifactType.Name).toBe('SQL');
    expect(sqlRes.Version.Content).toContain('SELECT TOP 25');

    expect(uploadSpy).not.toHaveBeenCalled();
    expect(saves.filter((s) => s.entityName === 'MJ: Artifacts')).toHaveLength(4);
    expect(saves.filter((s) => s.entityName === 'MJ: Artifact Versions')).toHaveLength(4);
  });

  it('links newly created items into a target Collection and rolls back cleanly if linking fails', async () => {
    const { service } = buildCreationService();
    const { provider: okProvider, saves } = createMockProvider();

    const linked = await service.CreateBlankArtifact({
      Kind: 'document',
      Title: 'Scoped Note',
      CollectionID: 'cccc0001-0000-4000-8000-000000000001',
      CurrentUser: TEST_USER,
      Provider: okProvider,
    });
    expect(linked.CollectionLink).not.toBeNull();
    expect(saves.some((s) => s.entityName === 'MJ: Collection Artifacts')).toBe(true);

    // Simulate MJ: Collection Artifacts link failure -> should delete Version and Artifact
    const { provider: failProvider, saves: failSaves } = createMockProvider({
      failEntitySave: 'MJ: Collection Artifacts',
    });
    await expect(
      service.CreateBlankArtifact({
        Kind: 'document',
        Title: 'Orphaned Attempt',
        CollectionID: 'cccc0001-0000-4000-8000-000000000001',
        CurrentUser: TEST_USER,
        Provider: failProvider,
      }),
    ).rejects.toThrow(/Simulated MJ: Collection Artifacts save failure/);

    const savedArtifact = failSaves.find((s) => s.entityName === 'MJ: Artifacts')?.record;
    const savedVersion = failSaves.find((s) => s.entityName === 'MJ: Artifact Versions')?.record;
    expect(savedVersion?.Deleted).toBe(true);
    expect(savedArtifact?.Deleted).toBe(true);
  });

  it('blocks adding an item to a shared Collection when the user lacks Edit permission', async () => {
    const { service } = buildCreationService({ canEditCollection: false });
    const { provider } = createMockProvider({
      collectionOwnerId: '99999999-9999-4999-8999-999999999999',
    });

    await expect(
      service.CreateBlankArtifact({
        Kind: 'document',
        Title: 'Unauthorized Collection Write',
        CollectionID: 'cccc0001-0000-4000-8000-000000000001',
        CurrentUser: TEST_USER,
        Provider: provider,
      }),
    ).rejects.toThrow(/Edit permission/);
  });

  it('converts local CSV into ContentMode=Text without MJ: Files, and uploads binary PDF with ContentMode=File', async () => {
    const { service, uploadSpy } = buildCreationService();
    const { provider } = createMockProvider();

    const csvBytes = new TextEncoder().encode('Region,ARR\nNorth America,1250000\nEMEA,840000\n');
    const csvFile = {
      name: 'arr-summary.csv',
      type: 'text/csv',
      size: csvBytes.byteLength,
      arrayBuffer: async () => csvBytes.buffer.slice(csvBytes.byteOffset, csvBytes.byteOffset + csvBytes.byteLength),
    } as File;

    const converted = await service.ImportLocalFileToLibrary({
      File: csvFile,
      ConvertToEditable: true,
      CurrentUser: TEST_USER,
      Provider: provider,
    });
    expect(converted.ArtifactType.Name).toBe('Excel Spreadsheet');
    expect(converted.Version.ContentMode).toBe('Text');
    expect(converted.Version.FileID).toBeNull();
    expect(uploadSpy).not.toHaveBeenCalled();

    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const pdfFile = {
      name: 'signed-contract.pdf',
      type: 'application/pdf',
      size: pdfBytes.byteLength,
      arrayBuffer: async () => pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength),
    } as File;

    const uploaded = await service.ImportLocalFileToLibrary({
      File: pdfFile,
      ConvertToEditable: false,
      CurrentUser: TEST_USER,
      Provider: provider,
    });
    expect(uploadSpy).toHaveBeenCalledTimes(1);
    expect(uploaded.Version.ContentMode).toBe('File');
    expect(uploaded.Version.FileID).toBe('ffff0001-0000-4000-8000-000000000099');
    expect(uploaded.Version.Content).toBeNull();
  });

  it('streams a remote Connected Drive file into a native Text artifact with ZERO MJ: Files records created', async () => {
    const { service, uploadSpy } = buildCreationService();
    const { provider, requestedEntities } = createMockProvider();

    const createDownloadUrlSpy = vi.fn(async () => 'https://drive.example.com/preauth/quarterly.docx');
    const docxBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

    const result = await service.ConvertRemoteDriveObjectToNativeArtifact({
      AccountID: 'dddd0001-0000-4000-8000-000000000001',
      ObjectPath: 'Executive/quarterly.docx',
      FileName: 'quarterly.docx',
      CurrentUser: TEST_USER,
      Provider: provider,
      StorageClientOverride: { CreatePreAuthDownloadUrl: createDownloadUrlSpy },
      FetchBytesOverride: async () => docxBytes.buffer,
    });

    expect(createDownloadUrlSpy).toHaveBeenCalledWith(
      'dddd0001-0000-4000-8000-000000000001',
      'Executive/quarterly.docx',
    );
    expect(result.Version.ContentMode).toBe('Text');
    expect(result.Version.FileID).toBeNull();
    expect(result.Version.Content).toContain('# Imported Word Heading');
    // Crucial invariant: zero MJ: Files entities or blob store uploads touched!
    expect(uploadSpy).not.toHaveBeenCalled();
    expect(requestedEntities).not.toContain('MJ: Files');
  });

  it('publishes a native artifact snapshot directly to an external Connected Drive with ZERO MJ: Files records', async () => {
    const { service, uploadSpy } = buildCreationService();
    const createUploadUrlSpy = vi.fn(async () => ({
      success: true,
      uploadUrl: 'https://drive.example.com/upload/target',
      providerKey: 'Exports/2026/Board_Deck.pptx',
    }));
    const putBytesSpy = vi.fn(async () => undefined);

    const deckJson = service.BuildStarterContent('presentation', 'Board Deck');
    const published = await service.PublishArtifactVersionToConnectedDrive({
      ArtifactName: 'Board Deck',
      VersionContent: deckJson,
      Format: 'pptx',
      AccountID: 'dddd0001-0000-4000-8000-000000000001',
      TargetFolderPrefix: 'Exports/2026',
      TargetFileName: 'Board_Deck',
      CurrentUser: TEST_USER,
      StorageClientOverride: { CreatePreAuthUploadUrl: createUploadUrlSpy },
      UploadBytesOverride: putBytesSpy,
    });

    expect(createUploadUrlSpy).toHaveBeenCalledWith(
      'dddd0001-0000-4000-8000-000000000001',
      'Exports/2026/Board_Deck.pptx',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    );
    expect(putBytesSpy).toHaveBeenCalledTimes(1);
    expect(published.ObjectPath).toBe('Exports/2026/Board_Deck.pptx');
    expect(published.ByteLength).toBeGreaterThan(0);
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it('downloads binary bytes for ContentMode=File artifacts and guards against overwriting existing remote files until confirmed', async () => {
    const { service } = buildCreationService();
    const binaryPdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
    const listObjectsSpy = vi.fn(async () => ({
      objects: [
        {
          name: 'Signed_MSA.pdf',
          path: 'Legal/Signed_MSA.pdf',
          fullPath: 'Legal/Signed_MSA.pdf',
          size: 8192,
          contentType: 'application/pdf',
          lastModified: new Date('2026-11-01T00:00:00Z'),
          isDirectory: false,
        },
      ],
      prefixes: [],
    }));
    const createUploadUrlSpy = vi.fn(async () => ({
      success: true,
      uploadUrl: 'https://drive.example.com/upload/msa',
      providerKey: 'Legal/Signed_MSA.pdf',
    }));
    const uploadedPayloads: Uint8Array[] = [];
    const putBytesSpy = vi.fn(async (_url: string, bytes: Uint8Array) => {
      uploadedPayloads.push(bytes);
    });

    // First attempt without AllowOverwrite must throw RemoteDriveFileExistsError BEFORE CreatePreAuthUploadUrl
    await expect(
      service.PublishArtifactVersionToConnectedDrive({
        ArtifactName: 'Signed MSA',
        VersionContent: '',
        VersionContentMode: 'File',
        ArtifactVersionID: 'ver-pdf-2',
        VersionFileID: 'file-pdf-2',
        VersionMimeType: 'application/pdf',
        VersionFileName: 'Signed_MSA.pdf',
        Format: 'original',
        AccountID: 'dddd0001-0000-4000-8000-000000000001',
        TargetFolderPrefix: 'Legal',
        TargetFileName: 'Signed_MSA',
        CurrentUser: TEST_USER,
        StorageClientOverride: {
          ListObjects: listObjectsSpy,
          CreatePreAuthUploadUrl: createUploadUrlSpy,
        },
        UploadBytesOverride: putBytesSpy,
        DownloadFileBytesOverride: async () => binaryPdf,
      }),
    ).rejects.toBeInstanceOf(RemoteDriveFileExistsError);
    expect(createUploadUrlSpy).not.toHaveBeenCalled();

    // Confirmed overwrite proceeds and uploads the exact binary PDF bytes (not 0-byte empty text)
    const published = await service.PublishArtifactVersionToConnectedDrive({
      ArtifactName: 'Signed MSA',
      VersionContent: '',
      VersionContentMode: 'File',
      ArtifactVersionID: 'ver-pdf-2',
      VersionFileID: 'file-pdf-2',
      VersionMimeType: 'application/pdf',
      VersionFileName: 'Signed_MSA.pdf',
      Format: 'original',
      AccountID: 'dddd0001-0000-4000-8000-000000000001',
      TargetFolderPrefix: 'Legal',
      TargetFileName: 'Signed_MSA',
      AllowOverwrite: true,
      CurrentUser: TEST_USER,
      StorageClientOverride: {
        ListObjects: listObjectsSpy,
        CreatePreAuthUploadUrl: createUploadUrlSpy,
      },
      UploadBytesOverride: putBytesSpy,
      DownloadFileBytesOverride: async () => binaryPdf,
    });

    expect(published.ObjectPath).toBe('Legal/Signed_MSA.pdf');
    expect(published.ByteLength).toBe(binaryPdf.byteLength);
    expect(uploadedPayloads[0]).toEqual(binaryPdf);
  });

  it('compares filenames case-insensitively, consults SearchFiles when folder listing is truncated (>=100), and propagates ListObjects errors', async () => {
    const { service } = buildCreationService();
    const createUploadUrlSpy = vi.fn(async () => ({
      success: true,
      uploadUrl: 'https://drive.example.com/upload/deck',
      providerKey: 'Legal/board_deck.pptx',
    }));

    // 1) Case-insensitive collision in ListObjects ('BOARD_DECK.PPTX' vs 'board_deck.pptx')
    await expect(
      service.PublishArtifactVersionToConnectedDrive({
        ArtifactName: 'Board Deck',
        VersionContent: service.BuildStarterContent('presentation', 'Board Deck'),
        Format: 'pptx',
        AccountID: 'acc-1',
        TargetFolderPrefix: 'Legal',
        TargetFileName: 'board_deck',
        CurrentUser: TEST_USER,
        StorageClientOverride: {
          ListObjects: vi.fn(async () => ({
            objects: [
              {
                name: 'BOARD_DECK.PPTX',
                path: 'Legal/BOARD_DECK.PPTX',
                fullPath: 'Legal/BOARD_DECK.PPTX',
                size: 1024,
                contentType: 'application/octet-stream',
                lastModified: new Date(),
                isDirectory: false,
              },
            ],
            prefixes: [],
          })),
          CreatePreAuthUploadUrl: createUploadUrlSpy,
        },
      }),
    ).rejects.toBeInstanceOf(RemoteDriveFileExistsError);

    // 2) Truncated folder listing (100 objects) triggers SearchFiles fallback and catches case-insensitive match
    const searchFilesSpy = vi.fn(async () => ({
      accountResults: [
        {
          accountId: 'acc-1',
          accountName: 'OneDrive',
          success: true,
          results: [
            {
              path: 'Legal/Board_Deck.PPTX',
              name: 'Board_Deck.PPTX',
              size: 2048,
              contentType: 'application/octet-stream',
              lastModified: new Date(),
            },
          ],
          hasMore: false,
        },
      ],
      totalResultsReturned: 1,
      successfulAccounts: 1,
      failedAccounts: 0,
    }));
    const hundredUnrelatedObjects = Array.from({ length: 100 }, (_, idx) => ({
      name: `other-${idx}.pdf`,
      path: `Legal/other-${idx}.pdf`,
      fullPath: `Legal/other-${idx}.pdf`,
      size: 100,
      contentType: 'application/pdf',
      lastModified: new Date(),
      isDirectory: false,
    }));

    await expect(
      service.PublishArtifactVersionToConnectedDrive({
        ArtifactName: 'Board Deck',
        VersionContent: service.BuildStarterContent('presentation', 'Board Deck'),
        Format: 'pptx',
        AccountID: 'acc-1',
        TargetFolderPrefix: 'Legal',
        TargetFileName: 'board_deck',
        CurrentUser: TEST_USER,
        StorageClientOverride: {
          ListObjects: vi.fn(async () => ({ objects: hundredUnrelatedObjects, prefixes: [] })),
          SearchFiles: searchFilesSpy,
          CreatePreAuthUploadUrl: createUploadUrlSpy,
        },
      }),
    ).rejects.toBeInstanceOf(RemoteDriveFileExistsError);
    expect(searchFilesSpy).toHaveBeenCalledWith(['acc-1'], 'board_deck.pptx', { maxResultsPerAccount: 100 });

    // 3) Network/auth failure in ListObjects propagates instead of silently assuming the file does not exist
    await expect(
      service.PublishArtifactVersionToConnectedDrive({
        ArtifactName: 'Board Deck',
        VersionContent: service.BuildStarterContent('presentation', 'Board Deck'),
        Format: 'pptx',
        AccountID: 'acc-1',
        TargetFolderPrefix: 'Legal',
        TargetFileName: 'board_deck',
        CurrentUser: TEST_USER,
        StorageClientOverride: {
          ListObjects: vi.fn(async () => {
            throw new Error('401 OAuth token expired');
          }),
          CreatePreAuthUploadUrl: createUploadUrlSpy,
        },
      }),
    ).rejects.toThrow(/401 OAuth token expired/);
    expect(createUploadUrlSpy).not.toHaveBeenCalled();
  });
});

describe('LibraryWorkspaceComponent — unified Hub + Navigator + Studio state transitions', () => {
  function buildWorkspaceComponent(): {
    component: LibraryWorkspaceComponent;
    emittedStates: LibraryWorkspaceState[];
  } {
    const component = Object.create(LibraryWorkspaceComponent.prototype) as LibraryWorkspaceComponent;
    const emittedStates: LibraryWorkspaceState[] = [];

    Object.assign(component as object, {
      CurrentUser: TEST_USER,
      EnvironmentId: 'env-default',
      InitialMode: null,
      InitialHubTab: null,
      InitialDriveMode: false,
      StorageClientOverride: null,
      StateChange: { emit: (s: LibraryWorkspaceState) => emittedStates.push(s) },
      HostNavigate: { emit: vi.fn() },
      LoadComplete: { emit: vi.fn() },
      SurfaceMode: 'hub',
      HubTab: 'overview',
      NavigatorSection: 'all',
      ListStyle: 'cards',
      LeftRailCollapsed: false,
      SelectedCollectionId: null,
      SelectedDriveId: null,
      DriveFolderPrefix: '',
      ActiveArtifactId: null,
      ActiveVersionNumber: undefined,
      IsFullCanvasOpen: false,
      FullCanvasOriginMode: 'hub',
      SearchQuery: '',
      CategoryFilter: 'all',
      OwnershipFilter: 'all',
      FilterPanelValues: { category: 'all', ownership: 'all' },
      ArtifactPageSize: 200,
      IsLoading: false,
      IsLoadingMore: false,
      IsStreamingSharedPermissions: false,
      LoadedArtifactCount: 0,
      TotalArtifactCount: 0,
      LoadError: null,
      LoadMoreError: null,
      ExpandedCollectionIds: new Set<string>(),
      StarredArtifactIds: new Set<string>(),
      RefreshViewerSubject: new Subject<{ artifactId: string; versionNumber: number }>(),
      reloadGeneration: 0,
      ownedArtifactOffset: 0,
      directSharedArtifactOffset: 0,
      allDirectSharedArtIds: [],
      cdr: { markForCheck: vi.fn(), detectChanges: vi.fn() },
      notifications: { CreateSimpleNotification: vi.fn() },
      confirmService: { ConfirmDelete: vi.fn(async () => true) },
      isDestroyed: false,
    });

    const sampleItemA: LibraryItemSummary = {
      Id: 'item-doc-1',
      Name: 'Product Roadmap 2026',
      Description: 'Annual product plan',
      TypeId: ARTIFACT_TYPES[0].ID,
      TypeName: 'Markdown Document',
      DriverClass: 'MarkdownArtifactViewerPlugin',
      Icon: 'fa-solid fa-file-lines',
      Category: 'documents',
      CategoryBadge: 'MJ Doc',
      LatestVersionId: 'ver-1',
      LatestVersionNumber: 3,
      VersionCount: 3,
      ContentMode: 'Text',
      MimeType: 'text/markdown',
      FileName: null,
      ContentSnippet: 'Annual product plan',
      UpdatedAt: new Date('2026-11-09T12:00:00Z'),
      OwnerUserId: TEST_USER.ID,
      OwnerName: 'You',
      IsOwnedByCurrentUser: true,
      IsSharedWithMe: false,
      IsStarred: false,
      CanEdit: true,
      CanShare: true,
      CanDelete: true,
      CollectionIds: ['col-1'],
      CollectionNames: ['Strategy'],
      ArtifactEntity: { ID: 'item-doc-1', Name: 'Product Roadmap 2026' } as MJArtifactEntity,
    };

    const sampleItemB: LibraryItemSummary = {
      ...sampleItemA,
      Id: 'item-sheet-2',
      Name: 'ARR Cohort Model',
      Description: 'Shared finance model',
      TypeId: ARTIFACT_TYPES[1].ID,
      TypeName: 'Excel Spreadsheet',
      DriverClass: 'SpreadsheetArtifactViewerPlugin',
      Category: 'spreadsheets',
      CategoryBadge: 'MJ Sheet',
      IsOwnedByCurrentUser: false,
      IsSharedWithMe: true,
      CollectionIds: [],
      CollectionNames: [],
      ArtifactEntity: { ID: 'item-sheet-2', Name: 'ARR Cohort Model' } as MJArtifactEntity,
    };

    const rootCol: LibraryCollectionNode = {
      Id: 'col-1',
      Name: 'Strategy',
      Description: 'Leadership docs',
      Icon: 'fa-solid fa-folder',
      Color: 'var(--mj-brand-primary)',
      ParentId: null,
      OwnerId: TEST_USER.ID,
      OwnerName: 'You',
      DirectItemCount: 1,
      TotalItemCount: 1,
      CanEdit: true,
      CanShare: true,
      CanDelete: true,
      Children: [],
      Entity: { ID: 'col-1', Name: 'Strategy' } as MJCollectionEntity,
    };

    const drive: LibraryDriveSummary = {
      AccountId: 'drive-1',
      AccountName: 'Marketing SharePoint',
      Description: 'Shared marketing assets',
      ProviderId: 'prov-1',
      ProviderName: 'SharePoint',
      Icon: 'fa-brands fa-microsoft',
      SupportsSearch: true,
      AccountWithProvider: {
        account: { ID: 'drive-1', Name: 'Marketing SharePoint' },
        provider: { ID: 'prov-1', Name: 'SharePoint', SupportsSearch: true },
      } as LibraryDriveSummary['AccountWithProvider'],
    };

    component.AllItems = [sampleItemA, sampleItemB];
    component.CollectionTree = [rootCol];
    component.FlatCollections = [rootCol];
    component.ConnectedDrives = [drive];

    return { component, emittedStates };
  }

  it('opens Hub items in Full-Canvas Studio, docks into Split Navigator on demand, and exits cleanly', () => {
    const { component, emittedStates } = buildWorkspaceComponent();
    expect(component.SurfaceMode).toBe('hub');
    expect(component.HubTab).toBe('overview');

    // Clicking a card in Hub opens Full-Canvas Studio
    component.OpenArtifactStudio('item-doc-1');
    expect(component.IsFullCanvasOpen).toBe(true);
    expect(component.FullCanvasOriginMode).toBe('hub');
    expect(component.ActiveItem?.Name).toBe('Product Roadmap 2026');

    // Clicking "Split Navigator" docks into Power Navigator alongside the left tree & item list
    component.SwitchFullCanvasToSplitNavigator();
    expect(component.IsFullCanvasOpen).toBe(false);
    expect(component.SurfaceMode).toBe('navigator');
    expect(component.ActiveArtifactId).toBe('item-doc-1');

    // Maximizing from Split Navigator and returning restores Split Navigator
    component.ToggleStudioMaximize();
    expect(component.IsFullCanvasOpen).toBe(true);
    expect(component.FullCanvasOriginMode).toBe('navigator');
    component.ExitFullCanvasToOrigin();
    expect(component.IsFullCanvasOpen).toBe(false);
    expect(component.SurfaceMode).toBe('navigator');
    expect(component.ActiveArtifactId).toBe('item-doc-1');

    expect(emittedStates.at(-1)?.Mode).toBe('navigator');
  });

  it('filters by category, ownership, starred status, search query, and deep-link route params', () => {
    const { component } = buildWorkspaceComponent();

    // Search from Hub overview automatically reveals results in Hub 'all' tab
    component.SetSearchQuery('cohort');
    expect(component.HubTab).toBe('all');
    expect(component.FilteredItems).toHaveLength(1);
    expect(component.FilteredItems[0].Id).toBe('item-sheet-2');

    component.SetSearchQuery('');
    component.SetCategoryFilter('documents');
    expect(component.FilteredItems.map((i) => i.Id)).toEqual(['item-doc-1']);

    component.ResetFilters();
    component.ToggleStar(component.AllItems[1]);
    expect(component.StarredCount).toBe(1);
    component.SelectNavigatorView('starred');
    expect(component.FilteredItems.map((i) => i.Id)).toEqual(['item-sheet-2']);

    // Deep-link into a Connected Drive folder
    component.ApplyExternalRouteState({
      mode: 'navigator',
      driveId: 'drive-1',
      folder: 'Campaigns/Q4/',
    });
    expect(component.NavigatorSection).toBe('drive');
    expect(component.SelectedDrive?.AccountName).toBe('Marketing SharePoint');
    expect(component.DriveFolderPrefix).toBe('Campaigns/Q4/');

    // Browser Back (popstate) with omitted/null params resets all sub-state cleanly
    component.OpenArtifactStudio('item-doc-1', { versionNumber: 2, fullCanvas: true });
    expect(component.ActiveArtifactId).toBe('item-doc-1');
    expect(component.ActiveVersionNumber).toBe(2);
    expect(component.IsFullCanvasOpen).toBe(true);

    component.ApplyExternalRouteState({
      mode: null,
      tab: null,
      section: null,
      collectionId: null,
      driveId: null,
      folder: null,
      artifactId: null,
      version: null,
      canvas: null,
      q: '',
    });
    expect(component.SurfaceMode).toBe('hub');
    expect(component.HubTab).toBe('overview');
    expect(component.NavigatorSection).toBe('all');
    expect(component.SelectedCollectionId).toBeNull();
    expect(component.SelectedDriveId).toBeNull();
    expect(component.DriveFolderPrefix).toBe('');
    expect(component.ActiveArtifactId).toBeNull();
    expect(component.ActiveVersionNumber).toBeUndefined();
    expect(component.IsFullCanvasOpen).toBe(false);
    expect(component.SearchQuery).toBe('');
  });

  it('emits StateChange on drive PrefixChange and BackRequested and passes ActiveVersionNumber when exporting from Studio', () => {
    const { component, emittedStates } = buildWorkspaceComponent();
    component.OpenConnectedDrive('drive-1', '');
    emittedStates.length = 0;

    component.OnDrivePrefixChange('Decks/2026/');
    expect(component.DriveFolderPrefix).toBe('Decks/2026/');
    expect(emittedStates.at(-1)?.DriveFolderPrefix).toBe('Decks/2026/');

    component.OnDriveBackRequested();
    expect(component.SelectedDriveId).toBeNull();
    expect(component.DriveFolderPrefix).toBe('');
    expect(emittedStates.at(-1)?.DriveId).toBeNull();

    // Open v2 (not LatestVersionNumber=3) in Studio and trigger Export to Drive
    component.OpenArtifactStudio('item-doc-1', { versionNumber: 2, fullCanvas: true });
    component.OpenExportToDriveModal(component.ActiveItem, undefined, component.ActiveVersionNumber);
    expect(component.ExportingVersionNumber).toBe(2);
  });

  it('uses server-side scoped RunViews batches (excluding heavy Content) and notifies on Delete/Save failures', async () => {
    const { component } = buildWorkspaceComponent();
    const runViewsCalls: RunViewParams[][] = [];

    const mockRunViews = vi.fn(async (queries: RunViewParams[]): Promise<RunViewResult[]> => {
      runViewsCalls.push(queries);
      return queries.map((q): RunViewResult => {
        const filterStr = typeof q.ExtraFilter === 'string' ? q.ExtraFilter : '';
        if (q.EntityName === 'MJ: Artifacts' && filterStr.includes('UserID=')) {
          return okRunViewResult([
            {
              ID: 'art-owned-1',
              Name: 'Owned Doc',
              TypeID: ARTIFACT_TYPES[0].ID,
              UserID: TEST_USER.ID,
              __mj_UpdatedAt: new Date('2026-11-09T15:00:00Z'),
            },
          ]);
        }
        if (q.EntityName === 'MJ: Artifact Versions') {
          return okRunViewResult([
            {
              ID: 'ver-owned-1',
              ArtifactID: 'art-owned-1',
              VersionNumber: 1,
              Name: 'Owned Doc',
              Description: null,
              ContentMode: 'Text',
              MimeType: 'text/markdown',
              FileName: null,
              __mj_UpdatedAt: new Date('2026-11-09T15:00:00Z'),
            },
          ]);
        }
        return okRunViewResult([], 0);
      });
    });

    vi.spyOn(RunView.prototype, 'RunViews').mockImplementation(mockRunViews);
    vi.spyOn(ArtifactMetadataEngine.Instance, 'Config').mockResolvedValue(undefined);
    vi.spyOn(ArtifactMetadataEngine.Instance, 'ArtifactTypes', 'get').mockReturnValue(ARTIFACT_TYPES);

    const notifySpy = vi.fn();
    Object.assign(component as object, {
      iconService: { GetArtifactIcon: () => 'fa-solid fa-file-lines' },
      notifications: { CreateSimpleNotification: notifySpy },
      collectionPermByColId: new Map(),
      collectionLinksByCollectionAndVersion: new Map([['col-1:ver-1', 'link-1']]),
    });
    const mockFailingProvider = Object.assign(Object.create(null) as IMetadataProvider, {
      CurrentUser: TEST_USER,
      GetEntityObject: vi.fn(async () => ({
        Load: vi.fn(async () => true),
        Delete: vi.fn(async () => false),
        Save: vi.fn(async () => false),
        LatestResult: { Message: 'Permission denied' },
      })),
    });
    Object.defineProperty(component, 'ProviderToUse', {
      configurable: true,
      get: () => mockFailingProvider,
    });

    await component.ReloadWorkspaceData();

    expect(runViewsCalls.length).toBeGreaterThanOrEqual(2);
    // Batch 1 scopes MJ: Artifacts and MJ: Collections by UserID/OwnerID with zero raw __mj schema references
    for (const batch of runViewsCalls) {
      for (const q of batch) {
        expect(extraFilterAsString(q.ExtraFilter)).not.toContain('__mj.');
        if (q.EntityName === 'MJ: Artifact Versions') {
          expect(q.Fields).toBeDefined();
          expect(q.Fields).not.toContain('Content');
        }
      }
    }
    expect(component.AllItems.map((i) => i.Id)).toEqual(['art-owned-1']);
    expect(component.LoadedArtifactCount).toBe(1);
    expect(component.TotalArtifactCount).toBe(1);
    expect(component.HasMoreArtifacts).toBe(false);

    // Verify LoadMoreArtifacts paging when TotalRowCount > LoadedArtifactCount
    component.TotalArtifactCount = 2;
    expect(component.HasMoreArtifacts).toBe(true);
    mockRunViews.mockImplementationOnce(async () => [
      okRunViewResult(
        [
          {
            ID: 'art-owned-2',
            Name: 'Page 2 Doc',
            TypeID: ARTIFACT_TYPES[0].ID,
            UserID: TEST_USER.ID,
            __mj_UpdatedAt: new Date('2026-11-08T15:00:00Z'),
          },
        ],
        2,
      ),
    ]);
    mockRunViews.mockImplementationOnce(async () => [
      okRunViewResult([
        {
          ID: 'ver-owned-2',
          ArtifactID: 'art-owned-2',
          VersionNumber: 1,
          Name: 'Page 2 Doc',
          Description: null,
          ContentMode: 'Text',
          MimeType: 'text/markdown',
          FileName: null,
          __mj_UpdatedAt: new Date('2026-11-08T15:00:00Z'),
        },
      ]),
      okRunViewResult([], 0),
    ]);
    await component.LoadMoreArtifacts();
    expect(component.AllItems.map((i) => i.Id)).toEqual(['art-owned-1', 'art-owned-2']);
    expect(component.LoadedArtifactCount).toBe(2);
    expect(component.HasMoreArtifacts).toBe(false);

    // Verify failed LoadMoreArtifacts preserves already-loaded AllItems and surfaces LoadMoreError instead of replacing the list
    component.TotalArtifactCount = 3;
    expect(component.HasMoreArtifacts).toBe(true);
    mockRunViews.mockImplementationOnce(async () => [
      {
        Success: false,
        TotalRowCount: 0,
        RowCount: 0,
        ExecutionTime: 1,
        ErrorMessage: 'Transient paging failure',
        UserViewRunID: '',
        Results: [],
      },
    ]);
    await component.LoadMoreArtifacts();
    expect(component.AllItems.map((i) => i.Id)).toEqual(['art-owned-1', 'art-owned-2']);
    expect(component.LoadError).toBeNull();
    expect(component.LoadMoreError).toBe('Transient paging failure');
    expect(notifySpy).toHaveBeenCalledWith('Transient paging failure', 'error', 4000);

    // Verify per-artifact latest version query uses ROW_NUMBER() OVER (PARTITION BY [ArtifactID] ...) = 1 and IgnoreMaxRows
    const allQueries = runViewsCalls.flat();
    const latestVerQueries = allQueries.filter(
      (q) =>
        q.EntityName === 'MJ: Artifact Versions' &&
        extraFilterAsString(q.ExtraFilter).includes('ROW_NUMBER() OVER'),
    );
    expect(latestVerQueries.length).toBeGreaterThan(0);

    // Verify failed initial/full ReloadWorkspaceData sets LoadError instead of silently returning []
    mockRunViews.mockImplementationOnce(async () => [
      {
        Success: false,
        TotalRowCount: 0,
        RowCount: 0,
        ExecutionTime: 1,
        ErrorMessage: 'Database connection timeout',
        UserViewRunID: '',
        Results: [],
      },
      okRunViewResult([], 0),
      okRunViewResult([], 0),
      okRunViewResult([], 0),
    ]);
    await component.ReloadWorkspaceData();
    expect(component.LoadError).toBe('Database connection timeout');

    // Verify Delete() and Save() failure notifications
    Reflect.set(
      component,
      'collectionLinksByCollectionAndVersion',
      new Map<string, string>([['col-1:ver-1', 'link-1']]),
    );
    component.SelectedCollectionId = 'col-1';
    await component.RemoveItemFromCurrentCollection({
      ...component.AllItems[0],
      Id: 'item-doc-1',
      LatestVersionId: 'ver-1',
      CollectionIds: [],
    });
    expect(notifySpy).toHaveBeenCalledWith(expect.stringContaining('Permission denied'), 'error', 4000);

    notifySpy.mockClear();
    component.AllItems = [
      {
        ...component.AllItems[0],
        Id: 'item-doc-1',
        LatestVersionId: 'ver-1',
        CollectionIds: [],
      },
    ];
    const mockDropEvent = Object.assign(Object.create(null) as DragEvent, {
      preventDefault: vi.fn(),
      dataTransfer: Object.assign(Object.create(null) as DataTransfer, {
        getData: () => 'item-doc-1',
      }),
    });
    await component.OnCollectionDrop(
      { Id: 'col-2', Name: 'Target', CanEdit: true } as LibraryCollectionNode,
      mockDropEvent,
    );
    expect(notifySpy).toHaveBeenCalledWith(expect.stringContaining('Permission denied'), 'error', 4000);
  });

  it('bounds remote text previews to 100 KB via AbortController + stream reader and short-circuits >5 MB files', async () => {
    const pane = Object.create(LibraryRemoteDrivePaneComponent.prototype) as LibraryRemoteDrivePaneComponent;
    Object.assign(pane as object, {
      Account: {
        account: { ID: 'acc-1', Name: 'Cloud Logs' },
        provider: { ID: 'prov-1', Name: 'S3' },
      },
      StorageClientOverride: {
        CreatePreAuthDownloadUrl: vi.fn(async (_acc: string, path: string) => `https://s3.example.com/${path}`),
      },
      previewRequestSeq: 0,
      activePreviewAbort: null,
      cdr: { detectChanges: vi.fn() },
    });

    // 1) > 5 MB file metadata short-circuits without calling fetch()
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await pane.SelectRemoteFile({
      name: 'huge-server.log',
      path: 'logs/huge-server.log',
      fullPath: 'logs/huge-server.log',
      size: 500 * 1024 * 1024,
      contentType: 'text/plain',
      lastModified: new Date(),
      isDirectory: false,
    } as StorageObjectMetadata);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(pane.PreviewTextContent).toContain('File is large');

    // 2) Streamed text file aborts the underlying stream the instant 102,400 bytes have been read
    let chunksPulled = 0;
    let streamCancelled = false;
    let abortSignalFired = false;
    const sixtyFourKbChunk = new Uint8Array(65_536).fill(65); // 'A'

    fetchSpy.mockImplementationOnce(async (_input, init) => {
      init?.signal?.addEventListener('abort', () => {
        abortSignalFired = true;
      });
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          chunksPulled++;
          controller.enqueue(sixtyFourKbChunk);
        },
        cancel() {
          streamCancelled = true;
        },
      });
      return new Response(stream, { status: 200 });
    });

    await pane.SelectRemoteFile({
      name: 'unbounded-stream.log',
      path: 'logs/unbounded-stream.log',
      fullPath: 'logs/unbounded-stream.log',
      size: 0, // unknown size metadata from provider
      contentType: 'text/plain',
      lastModified: new Date(),
      isDirectory: false,
    } as StorageObjectMetadata);

    expect(abortSignalFired || streamCancelled).toBe(true);
    expect(chunksPulled).toBeLessThanOrEqual(3);
    expect(pane.PreviewTextContent).toContain('[Preview truncated at 100 KB]');
    // 102,400 'A' chars + truncation notice
    expect(pane.PreviewTextContent.startsWith('A'.repeat(102_400))).toBe(true);
    fetchSpy.mockRestore();
  });

  it('loads the specific historical Studio VersionNumber in LibraryExportDriveDialogComponent and prompts before overwrite', async () => {
    const dialog = Object.create(LibraryExportDriveDialogComponent.prototype) as LibraryExportDriveDialogComponent;
    const publishSpy = vi
      .fn()
      .mockRejectedValueOnce(new RemoteDriveFileExistsError('Exports/Roadmap.md', 'Roadmap.md'))
      .mockResolvedValueOnce({ ObjectPath: 'Exports/Roadmap.md', ByteLength: 24, MimeType: 'text/markdown' });

    vi.spyOn(RunView.prototype, 'RunView').mockResolvedValue(
      okRunViewResult([
        {
          ID: 'ver-2-id',
          ArtifactID: 'item-doc-1',
          VersionNumber: 2,
          ContentMode: 'Text',
          Content: '# Version 2 Snapshot',
          Configuration: null,
        },
      ]),
    );

    Object.assign(dialog as object, {
      IsOpen: true,
      Item: {
        Id: 'item-doc-1',
        Name: 'Roadmap',
        DriverClass: 'MarkdownArtifactViewerPlugin',
        TypeName: 'Markdown Document',
        ContentMode: 'Text',
        LatestVersionId: 'ver-3-id',
        LatestVersionNumber: 3,
      } as LibraryItemSummary,
      VersionNumber: 2,
      SelectedAccountId: 'drive-1',
      FolderPrefix: 'Exports',
      SelectedFormat: 'md',
      FileName: 'Roadmap',
      IsExporting: false,
      ErrorMessage: '',
      PendingOverwritePath: null,
      CurrentUser: TEST_USER,
      StorageClientOverride: null,
      Published: { emit: vi.fn() },
      Cancelled: { emit: vi.fn() },
      creationService: { PublishArtifactVersionToConnectedDrive: publishSpy },
      notifications: { CreateSimpleNotification: vi.fn() },
      cdr: { detectChanges: vi.fn() },
    });
    const mockDialogProvider: Partial<IMetadataProvider> = { CurrentUser: TEST_USER };
    Object.defineProperty(dialog, 'ProviderToUse', {
      configurable: true,
      get: () => mockDialogProvider as IMetadataProvider,
    });

    // First export attempt hits collision -> surfaces PendingOverwritePath instead of generic error
    await dialog.ExportNow(false);
    expect(publishSpy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        VersionContent: '# Version 2 Snapshot',
        AllowOverwrite: false,
      }),
    );
    expect(dialog.PendingOverwritePath).toBe('Exports/Roadmap.md');

    // Second export attempt with confirmOverwrite = true completes upload
    await dialog.ExportNow(true);
    expect(publishSpy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        VersionContent: '# Version 2 Snapshot',
        AllowOverwrite: true,
      }),
    );
    expect(dialog.PendingOverwritePath).toBeNull();
  });

  it('closes the TasksFullViewComponent inspector drawer on Browser Back when ActiveTaskId becomes undefined', () => {
    const view = Object.create(TasksFullViewComponent.prototype) as TasksFullViewComponent;
    const emittedSelections: Array<string | null> = [];
    Object.assign(view as object, {
      ActiveTaskId: undefined,
      InspectedGroup: { RootTaskId: 'task-1' },
      InspectedStep: { StepNumber: 1 },
      SelectedTask: { ID: 'task-1' },
      SubTasks: [{ ID: 'task-1' }],
      SubTasksWithParent: [{ ID: 'task-1' }],
      ShowDetailAnimation: true,
      TaskSelected: { emit: (id: string | null) => emittedSelections.push(id) },
    });

    view.ngOnChanges({
      activeTaskId: {
        previousValue: 'task-1',
        currentValue: undefined,
        firstChange: false,
        isFirstChange: () => false,
      },
    });

    expect(view.InspectedGroup).toBeNull();
    expect(view.SelectedTask).toBeNull();
    expect(emittedSelections).toHaveLength(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function extraFilterAsString(filter: RunViewParams['ExtraFilter']): string {
    return typeof filter === 'string' ? filter : '';
  }

  function okRunViewResult<TRow>(results: TRow[], totalRowCount: number = results.length): RunViewResult<TRow> {
    return {
      Success: true,
      TotalRowCount: totalRowCount,
      RowCount: results.length,
      ExecutionTime: 1,
      ErrorMessage: '',
      UserViewRunID: '',
      Results: results,
    };
  }

  function createDeferred(): { promise: Promise<void>; resolve: () => void } {
    let resolveFn: () => void = () => undefined;
    const promise = new Promise<void>((res) => {
      resolveFn = res;
    });
    return { promise, resolve: () => resolveFn() };
  }

  it('batches remaining MJ: Artifact Permissions pages via rv.RunViews in bounded windows and unblocks first render after Page 0', async () => {
    const { component } = buildWorkspaceComponent();
    component.ArtifactPageSize = 2;
    component.EnvironmentId = 'env-default';

    const allPermRows = Array.from({ length: 14 }, (_unused, idx) => ({
      ID: `perm-${idx + 1}`,
      ArtifactID: `art-shared-${idx + 1}`,
      UserID: TEST_USER.ID,
      CanRead: true,
      CanEdit: idx % 2 === 0,
      CanShare: false,
    }));

    const singleRunViewSpy = vi.spyOn(RunView.prototype, 'RunView');
    const permBatchOffsetWindows: number[][] = [];

    const firstRemainingPermBatchStarted = createDeferred();
    const firstRemainingPermBatchGate = createDeferred();

    vi.spyOn(RunView.prototype, 'RunViews').mockImplementation(
      async (queries: RunViewParams[]): Promise<RunViewResult[]> => {
        const isRemainingPermBatch =
          queries.length > 0 &&
          queries.every(
            (q) => q.EntityName === 'MJ: Artifact Permissions' && (q.StartRow ?? 0) > 0,
          );
        if (isRemainingPermBatch) {
          const offsets = queries.map((q) => q.StartRow ?? 0);
          permBatchOffsetWindows.push(offsets);
          for (const q of queries) {
            expect(q.OrderBy).toBe('__mj_CreatedAt DESC, ID DESC');
            expect(q.SkipTotalRowCount).toBe(true);
            expect(q.MaxRows).toBe(2);
          }
          if (permBatchOffsetWindows.length === 1) {
            firstRemainingPermBatchStarted.resolve();
            await firstRemainingPermBatchGate.promise;
          }
          return queries.map((q) => {
            const startRow = q.StartRow ?? 0;
            const maxRows = q.MaxRows ?? 2;
            return okRunViewResult(
              allPermRows.slice(startRow, startRow + maxRows),
              allPermRows.length,
            );
          });
        }

        return queries.map((q): RunViewResult => {
          const filterStr = extraFilterAsString(q.ExtraFilter);
          if (q.EntityName === 'MJ: Artifact Permissions' && (q.StartRow ?? 0) === 0) {
            expect(q.OrderBy).toBe('__mj_CreatedAt DESC, ID DESC');
            return okRunViewResult(allPermRows.slice(0, 2), allPermRows.length);
          }
          if (q.EntityName === 'MJ: Artifacts' && filterStr.includes('ID IN (')) {
            const matched = allPermRows
              .filter((p) => filterStr.includes(`'${p.ArtifactID}'`))
              .map((p, idx) => ({
                ID: p.ArtifactID,
                Name: `Shared Doc ${p.ArtifactID}`,
                TypeID: ARTIFACT_TYPES[0].ID,
                EnvironmentID: 'env-default',
                UserID: '22222222-2222-4222-8222-222222222222',
                __mj_UpdatedAt: new Date(Date.UTC(2026, 10, 9, 12, 0, idx)),
              }));
            return okRunViewResult(matched, matched.length);
          }
          if (q.EntityName === 'MJ: Artifact Versions') {
            return okRunViewResult(
              ['art-shared-1', 'art-shared-2'].map((artId, idx) => ({
                ID: `ver-${artId}`,
                ArtifactID: artId,
                VersionNumber: 1,
                Name: `Shared Doc ${artId}`,
                Description: null,
                ContentMode: 'Text',
                MimeType: 'text/markdown',
                FileName: null,
                __mj_UpdatedAt: new Date(Date.UTC(2026, 10, 9, 12, 0, idx)),
              })),
            );
          }
          return okRunViewResult([], 0);
        });
      },
    );

    vi.spyOn(ArtifactMetadataEngine.Instance, 'Config').mockResolvedValue(undefined);
    vi.spyOn(ArtifactMetadataEngine.Instance, 'ArtifactTypes', 'get').mockReturnValue(ARTIFACT_TYPES);

    const loadCompleteSpy = vi.fn();
    const mockProvider: Partial<IMetadataProvider> = { CurrentUser: TEST_USER };
    Object.assign(component as object, {
      LoadComplete: { emit: loadCompleteSpy },
      iconService: { GetArtifactIcon: () => 'fa-solid fa-file-lines' },
      collectionPermByColId: new Map(),
      collectionLinksByCollectionAndVersion: new Map(),
    });
    Object.defineProperty(component, 'ProviderToUse', {
      configurable: true,
      get: () => mockProvider as IMetadataProvider,
    });

    const reloadPromise = component.ReloadWorkspaceData();
    await firstRemainingPermBatchStarted.promise;

    // BEFORE remaining permission pages resolve, first render is ALREADY unblocked with Page 0 items,
    // and Load More is NOT stuck disabled by background Stage-2 permission streaming!
    expect(component.IsLoading).toBe(false);
    expect(component.IsLoadingMore).toBe(false);
    expect(component.IsLoadingMoreArtifacts).toBe(false);
    expect(component.IsStreamingSharedPermissions).toBe(true);
    expect(component.AllItems.map((i) => i.Id)).toEqual(['art-shared-2', 'art-shared-1']);
    expect(component.FilteredItems.map((i) => i.Id)).toEqual(['art-shared-2', 'art-shared-1']);
    expect(loadCompleteSpy).toHaveBeenCalledTimes(1);
    expect(singleRunViewSpy).not.toHaveBeenCalled();

    firstRemainingPermBatchGate.resolve();
    await reloadPromise;

    // 14 total rows with pageSize=2 => 6 remaining pages (offsets 2,4,6,8,10,12)
    // batched cleanly via rv.RunViews in bounded windows of 4: [[2, 4, 6, 8], [10, 12]], zero rv.RunView calls!
    expect(singleRunViewSpy).not.toHaveBeenCalled();
    expect(permBatchOffsetWindows).toEqual([
      [2, 4, 6, 8],
      [10, 12],
    ]);
    expect(component.IsLoading).toBe(false);
    expect(component.IsLoadingMore).toBe(false);
    expect(component.IsStreamingSharedPermissions).toBe(false);
    expect(component.CanLoadMore).toBe(true);
    expect(component.LoadError).toBeNull();
    expect(component.AllItems.map((i) => i.Id)).toEqual(['art-shared-2', 'art-shared-1']);
    expect(component.LoadedArtifactCount).toBe(2);
    expect(component.TotalArtifactCount).toBe(14);
    expect(component.HasMoreArtifacts).toBe(true);
    expect(loadCompleteSpy).toHaveBeenCalledTimes(1);
  });

  it('excludes shared artifacts from other environments in TotalArtifactCount and paging', async () => {
    const { component } = buildWorkspaceComponent();
    component.EnvironmentId = 'env-alpha';
    component.ArtifactPageSize = 2;

    const otherOwnerId = '22222222-2222-4222-8222-222222222222';
    const sharedArtifactCatalog = [
      {
        ID: 'art-shared-alpha-1',
        Name: 'Alpha Shared One',
        TypeID: ARTIFACT_TYPES[0].ID,
        EnvironmentID: 'env-alpha',
        UserID: otherOwnerId,
        __mj_UpdatedAt: new Date('2026-11-09T14:00:00Z'),
      },
      {
        ID: 'art-shared-beta-1',
        Name: 'Beta Shared One',
        TypeID: ARTIFACT_TYPES[0].ID,
        EnvironmentID: 'env-beta',
        UserID: otherOwnerId,
        __mj_UpdatedAt: new Date('2026-11-09T13:00:00Z'),
      },
      {
        ID: 'art-shared-alpha-2',
        Name: 'Alpha Shared Two',
        TypeID: ARTIFACT_TYPES[0].ID,
        EnvironmentID: 'env-alpha',
        UserID: otherOwnerId,
        __mj_UpdatedAt: new Date('2026-11-09T12:00:00Z'),
      },
      {
        ID: 'art-shared-beta-2',
        Name: 'Beta Shared Two',
        TypeID: ARTIFACT_TYPES[0].ID,
        EnvironmentID: 'env-beta',
        UserID: otherOwnerId,
        __mj_UpdatedAt: new Date('2026-11-09T11:00:00Z'),
      },
      {
        ID: 'art-shared-beta-3',
        Name: 'Beta Shared Three',
        TypeID: ARTIFACT_TYPES[0].ID,
        EnvironmentID: 'env-beta',
        UserID: otherOwnerId,
        __mj_UpdatedAt: new Date('2026-11-09T10:00:00Z'),
      },
    ];

    const permRows = sharedArtifactCatalog.map((art, idx) => ({
      ID: `perm-cross-${idx + 1}`,
      ArtifactID: art.ID,
      UserID: TEST_USER.ID,
      CanRead: true,
      CanEdit: true,
      CanShare: false,
    }));

    const recordedArtifactFilters: string[] = [];
    const singleRunViewSpy = vi.spyOn(RunView.prototype, 'RunView');
    vi.spyOn(RunView.prototype, 'RunViews').mockImplementation(async (queries: RunViewParams[]): Promise<RunViewResult[]> =>
      queries.map((q): RunViewResult => {
        const filterStr = extraFilterAsString(q.ExtraFilter);
        if (q.EntityName === 'MJ: Artifacts') {
          recordedArtifactFilters.push(filterStr);
          const startRow = q.StartRow ?? 0;

          // Owned artifacts query
          if (filterStr.includes(`UserID='${TEST_USER.ID}'`)) {
            if (startRow > 0) {
              return okRunViewResult([], 1);
            }
            return okRunViewResult(
              [
                {
                  ID: 'art-owned-alpha-1',
                  Name: 'Alpha Owned Doc',
                  TypeID: ARTIFACT_TYPES[0].ID,
                  EnvironmentID: 'env-alpha',
                  UserID: TEST_USER.ID,
                  __mj_UpdatedAt: new Date('2026-11-09T15:00:00Z'),
                },
              ],
              1,
            );
          }

          // Shared artifacts / unpaged environment verification queries
          if (filterStr.includes('ID IN (')) {
            const enforcesAlphaEnv = filterStr.includes("EnvironmentID='env-alpha'");
            const matched = sharedArtifactCatalog.filter((art) => {
              if (!filterStr.includes(`'${art.ID}'`)) {
                return false;
              }
              // Simulate server EnvironmentID filter for beta-1 & beta-2, and let beta-3 test the defensive client guard too
              if (art.ID === 'art-shared-beta-3') {
                return true;
              }
              return enforcesAlphaEnv ? art.EnvironmentID === 'env-alpha' : true;
            });
            return okRunViewResult(matched, matched.length);
          }
        }

        if (q.EntityName === 'MJ: Artifact Permissions') {
          const startRow = q.StartRow ?? 0;
          const maxRows = q.MaxRows ?? 2;
          return okRunViewResult(permRows.slice(startRow, startRow + maxRows), permRows.length);
        }

        if (q.EntityName === 'MJ: Artifact Versions') {
          const verCandidates = [
            'art-owned-alpha-1',
            'art-shared-alpha-1',
            'art-shared-alpha-2',
          ].filter((artId) => filterStr.includes(`'${artId}'`));
          return okRunViewResult(
            verCandidates.map((artId) => ({
              ID: `ver-${artId}`,
              ArtifactID: artId,
              VersionNumber: 1,
              Name: `Version for ${artId}`,
              Description: null,
              ContentMode: 'Text',
              MimeType: 'text/markdown',
              FileName: null,
              __mj_UpdatedAt: new Date('2026-11-09T15:00:00Z'),
            })),
          );
        }

        return okRunViewResult([], 0);
      }),
    );

    vi.spyOn(ArtifactMetadataEngine.Instance, 'Config').mockResolvedValue(undefined);
    vi.spyOn(ArtifactMetadataEngine.Instance, 'ArtifactTypes', 'get').mockReturnValue(ARTIFACT_TYPES);

    const mockProvider: Partial<IMetadataProvider> = { CurrentUser: TEST_USER };
    Object.assign(component as object, {
      iconService: { GetArtifactIcon: () => 'fa-solid fa-file-lines' },
      collectionPermByColId: new Map(),
      collectionLinksByCollectionAndVersion: new Map(),
    });
    Object.defineProperty(component, 'ProviderToUse', {
      configurable: true,
      get: () => mockProvider as IMetadataProvider,
    });

    await component.ReloadWorkspaceData();
    expect(component.LoadError).toBeNull();
    expect(singleRunViewSpy).not.toHaveBeenCalled();

    // Every MJ: Artifacts query scopes to EnvironmentID='env-alpha' with cross-DB-safe SQL
    expect(recordedArtifactFilters.length).toBeGreaterThanOrEqual(3);
    for (const filter of recordedArtifactFilters) {
      expect(filter).toContain("EnvironmentID='env-alpha'");
      expect(filter).not.toContain('__mj.');
      expect(filter).not.toContain('[');
      expect(filter).not.toContain(']');
    }

    // 1 owned ('env-alpha') + 1 loaded shared ('art-shared-alpha-1') + 1 unpaged shared ('art-shared-alpha-2') = 3 total
    // None of the 3 'env-beta' shares are included in AllItems or TotalArtifactCount!
    expect(component.AllItems.map((i) => i.Id)).toEqual(['art-owned-alpha-1', 'art-shared-alpha-1']);
    expect(component.LoadedArtifactCount).toBe(2);
    expect(component.TotalArtifactCount).toBe(3);
    expect(component.HasMoreArtifacts).toBe(true);

    // Paging loads the remaining 'env-alpha' shared artifact ('art-shared-alpha-2') cleanly
    await component.LoadMoreArtifacts();
    expect(component.AllItems.map((i) => i.Id)).toEqual([
      'art-owned-alpha-1',
      'art-shared-alpha-1',
      'art-shared-alpha-2',
    ]);
    expect(component.LoadedArtifactCount).toBe(3);
    expect(component.TotalArtifactCount).toBe(3);
    expect(component.HasMoreArtifacts).toBe(false);
    expect(singleRunViewSpy).not.toHaveBeenCalled();
  });

  it('discards stale background permission-page batches after ngOnDestroy', async () => {
    const { component } = buildWorkspaceComponent();
    component.ArtifactPageSize = 1;
    component.EnvironmentId = 'env-default';

    const permRows = [
      { ID: 'p1', ArtifactID: 'art-s1', UserID: TEST_USER.ID, CanRead: true, CanEdit: false, CanShare: false },
      { ID: 'p2', ArtifactID: 'art-s2', UserID: TEST_USER.ID, CanRead: true, CanEdit: false, CanShare: false },
    ];

    const tailStarted = createDeferred();
    const tailGate = createDeferred();

    vi.spyOn(RunView.prototype, 'RunViews').mockImplementation(
      async (queries: RunViewParams[]): Promise<RunViewResult[]> => {
        if (queries.every((q) => q.EntityName === 'MJ: Artifact Permissions' && (q.StartRow ?? 0) > 0)) {
          tailStarted.resolve();
          await tailGate.promise;
          return [okRunViewResult([permRows[1]], permRows.length)];
        }
        return queries.map((q): RunViewResult => {
          const filterStr = extraFilterAsString(q.ExtraFilter);
          if (q.EntityName === 'MJ: Artifact Permissions') {
            return okRunViewResult([permRows[0]], permRows.length);
          }
          if (q.EntityName === 'MJ: Artifacts' && filterStr.includes('ID IN (')) {
            return okRunViewResult([
              {
                ID: 'art-s1',
                Name: 'Shared One',
                TypeID: ARTIFACT_TYPES[0].ID,
                EnvironmentID: 'env-default',
                UserID: '22222222-2222-4222-8222-222222222222',
                __mj_UpdatedAt: new Date('2026-11-09T12:00:00Z'),
              },
            ]);
          }
          if (q.EntityName === 'MJ: Artifact Versions') {
            return okRunViewResult([
              {
                ID: 'ver-s1',
                ArtifactID: 'art-s1',
                VersionNumber: 1,
                Name: 'Shared One',
                Description: null,
                ContentMode: 'Text',
                MimeType: 'text/markdown',
                FileName: null,
                __mj_UpdatedAt: new Date('2026-11-09T12:00:00Z'),
              },
            ]);
          }
          return okRunViewResult([], 0);
        });
      },
    );

    vi.spyOn(ArtifactMetadataEngine.Instance, 'Config').mockResolvedValue(undefined);
    vi.spyOn(ArtifactMetadataEngine.Instance, 'ArtifactTypes', 'get').mockReturnValue(ARTIFACT_TYPES);

    const detectChangesSpy = vi.fn();
    const mockProvider: Partial<IMetadataProvider> = { CurrentUser: TEST_USER };
    Object.assign(component as object, {
      cdr: { markForCheck: vi.fn(), detectChanges: detectChangesSpy },
      iconService: { GetArtifactIcon: () => 'fa-solid fa-file-lines' },
      collectionPermByColId: new Map(),
      collectionLinksByCollectionAndVersion: new Map(),
    });
    Object.defineProperty(component, 'ProviderToUse', {
      configurable: true,
      get: () => mockProvider as IMetadataProvider,
    });

    const reloadPromise = component.ReloadWorkspaceData();
    await tailStarted.promise;

    expect(component.IsLoading).toBe(false);
    expect(component.AllItems.map((i) => i.Id)).toEqual(['art-s1']);
    expect(component.TotalArtifactCount).toBe(1);

    detectChangesSpy.mockClear();
    component.ngOnDestroy();

    tailGate.resolve();
    await reloadPromise;

    // Stale tail batch ignored after ngOnDestroy — TotalArtifactCount not mutated, detectChanges not called
    expect(component.TotalArtifactCount).toBe(1);
    expect(detectChangesSpy).not.toHaveBeenCalled();
  });

  it('discards LoadMoreArtifacts results without mutating AllItems, HasMoreArtifacts, or IsLoadingMore when reloadGeneration increments mid-flight', async () => {
    const { component } = buildWorkspaceComponent();
    component.ArtifactPageSize = 1;
    component.EnvironmentId = 'env-default';

    const loadMoreStarted = createDeferred();
    const loadMoreGate = createDeferred();
    let activeMode: 'initial-two-pages' | 'fresh-single-item' = 'initial-two-pages';

    vi.spyOn(RunView.prototype, 'RunViews').mockImplementation(
      async (queries: RunViewParams[]): Promise<RunViewResult[]> => {
        const isPagedOwnedLoadMore =
          queries.length === 1 &&
          queries[0].EntityName === 'MJ: Artifacts' &&
          (queries[0].StartRow ?? 0) === 1;
        if (isPagedOwnedLoadMore) {
          expect(queries[0].OrderBy).toBe('__mj_UpdatedAt DESC, ID DESC');
          loadMoreStarted.resolve();
          await loadMoreGate.promise;
          return [
            okRunViewResult(
              [
                {
                  ID: 'art-stale-page-2',
                  Name: 'Stale Page 2 Doc',
                  TypeID: ARTIFACT_TYPES[0].ID,
                  EnvironmentID: 'env-default',
                  UserID: TEST_USER.ID,
                  __mj_UpdatedAt: new Date('2026-11-09T11:00:00Z'),
                },
              ],
              2,
            ),
          ];
        }

        return queries.map((q): RunViewResult => {
          const filterStr = extraFilterAsString(q.ExtraFilter);
          if (q.EntityName === 'MJ: Artifacts' && filterStr.includes(`UserID='${TEST_USER.ID}'`)) {
            if (activeMode === 'initial-two-pages') {
              return okRunViewResult(
                [
                  {
                    ID: 'art-page-1',
                    Name: 'Initial Page 1 Doc',
                    TypeID: ARTIFACT_TYPES[0].ID,
                    EnvironmentID: 'env-default',
                    UserID: TEST_USER.ID,
                    __mj_UpdatedAt: new Date('2026-11-09T14:00:00Z'),
                  },
                ],
                2,
              );
            }
            return okRunViewResult(
              [
                {
                  ID: 'art-fresh-reload',
                  Name: 'Fresh Reload Doc',
                  TypeID: ARTIFACT_TYPES[0].ID,
                  EnvironmentID: 'env-default',
                  UserID: TEST_USER.ID,
                  __mj_UpdatedAt: new Date('2026-11-09T16:00:00Z'),
                },
              ],
              1,
            );
          }

          if (q.EntityName === 'MJ: Artifact Versions') {
            const ids = ['art-page-1', 'art-stale-page-2', 'art-fresh-reload'].filter((id) =>
              filterStr.includes(`'${id}'`),
            );
            return okRunViewResult(
              ids.map((id) => ({
                ID: `ver-${id}`,
                ArtifactID: id,
                VersionNumber: 1,
                Name: `Doc ${id}`,
                Description: null,
                ContentMode: 'Text',
                MimeType: 'text/markdown',
                FileName: null,
                __mj_UpdatedAt: new Date('2026-11-09T16:00:00Z'),
              })),
            );
          }

          return okRunViewResult([], 0);
        });
      },
    );

    vi.spyOn(ArtifactMetadataEngine.Instance, 'Config').mockResolvedValue(undefined);
    vi.spyOn(ArtifactMetadataEngine.Instance, 'ArtifactTypes', 'get').mockReturnValue(ARTIFACT_TYPES);

    const mockProvider: Partial<IMetadataProvider> = { CurrentUser: TEST_USER };
    Object.assign(component as object, {
      LoadComplete: { emit: vi.fn() },
      iconService: { GetArtifactIcon: () => 'fa-solid fa-file-lines' },
      collectionPermByColId: new Map(),
      collectionLinksByCollectionAndVersion: new Map(),
    });
    Object.defineProperty(component, 'ProviderToUse', {
      configurable: true,
      get: () => mockProvider as IMetadataProvider,
    });

    await component.ReloadWorkspaceData();
    expect(component.AllItems.map((i) => i.Id)).toEqual(['art-page-1']);
    expect(component.HasMoreArtifacts).toBe(true);
    expect(component.CanLoadMore).toBe(true);

    // Start LoadMoreArtifacts() and pause it mid-flight
    const inFlightLoadMore = component.LoadMoreArtifacts();
    await loadMoreStarted.promise;
    expect(component.IsLoadingMore).toBe(true);
    expect(component.IsLoadingMoreArtifacts).toBe(true);

    // Trigger a fresh ReloadWorkspaceData(), incrementing reloadGeneration while LoadMoreArtifacts is awaiting
    activeMode = 'fresh-single-item';
    await component.ReloadWorkspaceData();
    expect(component.AllItems.map((i) => i.Id)).toEqual(['art-fresh-reload']);
    expect(component.HasMoreArtifacts).toBe(false);
    expect(component.IsLoadingMore).toBe(false);

    // Release the stale LoadMoreArtifacts response and verify zero state mutation
    loadMoreGate.resolve();
    await inFlightLoadMore;

    expect(component.AllItems.map((i) => i.Id)).toEqual(['art-fresh-reload']);
    expect(component.LoadedArtifactCount).toBe(1);
    expect(component.TotalArtifactCount).toBe(1);
    expect(component.HasMoreArtifacts).toBe(false);
    expect(component.IsLoadingMore).toBe(false);
    expect(component.IsLoadingMoreArtifacts).toBe(false);
  });

  it('uses 100% --mj-* semantic CSS design tokens with zero hardcoded hex or rgb colors', () => {
    const filesToCheck = [
      resolve(__dirname, '../lib/components/library/library-workspace.component.css'),
      resolve(__dirname, '../lib/components/library/library-remote-drive-pane.component.ts'),
      resolve(__dirname, '../lib/components/library/library-create-dialog.component.ts'),
    ];
    for (const filePath of filesToCheck) {
      const text = readFileSync(filePath, 'utf8');
      expect(text).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(text).not.toMatch(/\brgba?\s*\(/);
    }
  });
});
