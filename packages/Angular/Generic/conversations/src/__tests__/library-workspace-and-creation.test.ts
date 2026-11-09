import '@angular/compiler';
import { readFileSync } from 'fs';
import { resolve } from 'path';
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
import { LibraryCreationService } from '../lib/services/library-creation.service';
import { GraphQLAttachmentBlobStore, UploadBlobInput, UploadBlobResult } from '../lib/services/graphql-attachment-blob-store';
import { LibraryWorkspaceComponent } from '../lib/components/library/library-workspace.component';
import { LibraryCollectionNode, LibraryDriveSummary, LibraryItemSummary, LibraryWorkspaceState } from '../lib/components/library/library.models';

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
      IsLoading: false,
      LoadError: null,
      ExpandedCollectionIds: new Set<string>(),
      StarredArtifactIds: new Set<string>(),
      cdr: { detectChanges: vi.fn() },
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
