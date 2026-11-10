import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  inject,
} from '@angular/core';
import { Subject } from 'rxjs';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { CompositeKey, RunView, RunViewParams, UserInfo } from '@memberjunction/core';
import {
  ArtifactMetadataEngine,
  FileStorageEngineBase,
  MJArtifactEntity,
  MJArtifactPermissionEntity,
  MJArtifactTypeEntity,
  MJArtifactVersionEntity,
  MJCollectionArtifactEntity,
  MJCollectionEntity,
  MJCollectionPermissionEntity,
  MJEnvironmentEntityExtended,
  UserInfoEngine,
} from '@memberjunction/core-entities';
import { EscapeSQLString, IndexByUUID, NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import { GraphQLFileStorageClient } from '@memberjunction/graphql-dataprovider';
import { ArtifactIconService } from '@memberjunction/ng-artifacts';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import {
  FilterFieldConfig,
  MJConfirmService,
  MJFilterPanelComponent,
  TabConfig,
  ViewToggleOption,
} from '@memberjunction/ng-ui-components';
import { CollectionPermission } from '../../services/collection-permission.service';
import {
  CreatedLibraryArtifactResult,
  LibraryStarterKind,
} from '../../services/library-creation.service';
import { LibraryCreateDialogTab } from './library-create-dialog.component';
import {
  LibraryCategoryFilter,
  LibraryCollectionNode,
  LibraryDriveSummary,
  LibraryHostNavigationEvent,
  LibraryHubTab,
  LibraryItemSummary,
  LibraryListStyle,
  LibraryNavigatorSection,
  LibraryOwnershipFilter,
  LibrarySurfaceMode,
  LibraryWorkspaceState,
} from './library.models';

interface VersionSummaryRow {
  ID: string;
  ArtifactID: string;
  VersionNumber: number;
  Name: string | null;
  Description: string | null;
  ContentMode: MJArtifactVersionEntity['ContentMode'];
  MimeType: string | null;
  FileName: string | null;
  __mj_UpdatedAt: Date | string;
}

interface CollectionArtifactLinkRow {
  ID: string;
  CollectionID: string;
  ArtifactVersionID: string;
  Sequence: number | null;
}

type ArtifactPermissionSummaryRow = Pick<
  MJArtifactPermissionEntity,
  'ID' | 'ArtifactID' | 'UserID' | 'CanRead' | 'CanEdit' | 'CanShare' | 'CanDelete'
>;

const SETTING_SURFACE_MODE = 'Library.SurfaceMode';
const SETTING_LIST_STYLE = 'Library.ListStyle';
const SETTING_STARRED_IDS = 'Library.StarredArtifactIDs';

const VERSION_SUMMARY_FIELDS: string[] = [
  'ID',
  'ArtifactID',
  'VersionNumber',
  'Name',
  'Description',
  'ContentMode',
  'MimeType',
  'FileName',
  '__mj_UpdatedAt',
];

const ARTIFACT_PERMISSION_SUMMARY_FIELDS: string[] = [
  'ID',
  'ArtifactID',
  'UserID',
  'CanRead',
  'CanEdit',
  'CanShare',
  'CanDelete',
];

export interface LibraryExternalRouteParams {
  mode?: string | null;
  tab?: string | null;
  section?: string | null;
  collectionId?: string | null;
  driveId?: string | null;
  folder?: string | null;
  artifactId?: string | null;
  version?: string | number | null;
  canvas?: string | boolean | null;
  q?: string | null;
}

@Component({
  standalone: false,
  selector: 'mj-library-workspace',
  templateUrl: './library-workspace.component.html',
  styleUrls: ['./library-workspace.component.css'],
})
export class LibraryWorkspaceComponent extends BaseAngularComponent implements OnInit, OnDestroy {
  @Input() CurrentUser!: UserInfo;
  @Input() EnvironmentId: string = MJEnvironmentEntityExtended.DefaultEnvironmentID;
  @Input() InitialMode: LibrarySurfaceMode | null = null;
  @Input() InitialHubTab: LibraryHubTab | null = null;
  @Input() InitialSection: LibraryNavigatorSection | null = null;
  @Input() InitialDriveMode = false;
  @Input() StorageClientOverride: GraphQLFileStorageClient | null = null;

  @Output() StateChange = new EventEmitter<LibraryWorkspaceState>();
  @Output() HostNavigate = new EventEmitter<LibraryHostNavigationEvent>();
  @Output() LoadComplete = new EventEmitter<void>();

  // Surface state
  public SurfaceMode: LibrarySurfaceMode = 'hub';
  public HubTab: LibraryHubTab = 'overview';
  public NavigatorSection: LibraryNavigatorSection = 'all';
  public ListStyle: LibraryListStyle = 'cards';
  public LeftRailCollapsed = false;

  // Selection & Studio state
  public SelectedCollectionId: string | null = null;
  public SelectedDriveId: string | null = null;
  public DriveFolderPrefix = '';
  public ActiveArtifactId: string | null = null;
  public ActiveVersionNumber: number | undefined = undefined;
  public IsFullCanvasOpen = false;
  public FullCanvasOriginMode: LibrarySurfaceMode = 'hub';

  // Search & Filter state
  public SearchQuery = '';
  public CategoryFilter: LibraryCategoryFilter = 'all';
  public OwnershipFilter: LibraryOwnershipFilter = 'all';
  public FilterPanelValues: MJFilterPanelComponent['Values'] = {
    category: 'all',
    ownership: 'all',
  };

  // Data state
  public readonly ArtifactPageSize = 200;
  public IsLoading = true;
  public IsLoadingMore = false;
  public LoadError: string | null = null;
  public LoadMoreError: string | null = null;
  public LoadedArtifactCount = 0;
  public TotalArtifactCount = 0;
  public AllItems: LibraryItemSummary[] = [];
  public CollectionTree: LibraryCollectionNode[] = [];
  public FlatCollections: LibraryCollectionNode[] = [];
  public ConnectedDrives: LibraryDriveSummary[] = [];
  public ExpandedCollectionIds = new Set<string>();
  public StarredArtifactIds = new Set<string>();

  // Drag & Drop state
  public DraggingItemId: string | null = null;
  public DragOverCollectionId: string | null = null;

  // Modal state
  public IsCreateDialogOpen = false;
  public CreateDialogTab: LibraryCreateDialogTab = 'blank';
  public CreateDialogStarter: LibraryStarterKind = 'document';

  public IsExportDriveDialogOpen = false;
  public ExportingItem: LibraryItemSummary | null = null;
  public ExportingVersionNumber: number | null = null;

  public IsCollectionFormOpen = false;
  public EditingCollectionEntity: MJCollectionEntity | undefined = undefined;
  public ParentCollectionForNew: MJCollectionEntity | undefined = undefined;

  public IsCollectionShareOpen = false;
  public SharingCollectionEntity: MJCollectionEntity | null = null;
  public SharingCollectionPerm: CollectionPermission | null = null;

  public IsArtifactShareOpen = false;
  public SharingArtifactEntity: MJArtifactEntity | null = null;

  public IsSaveToCollectionOpen = false;
  public SaveToCollectionArtifact: LibraryItemSummary | null = null;
  public SaveToCollectionExcludedIds: string[] = [];

  public readonly RefreshViewerSubject = new Subject<{ artifactId: string; versionNumber: number }>();

  public readonly SurfaceToggleOptions: ViewToggleOption[] = [
    { key: 'hub', icon: 'fa-solid fa-compass', label: 'Hub', title: 'Hub Landing View' },
    { key: 'navigator', icon: 'fa-solid fa-table-columns', label: 'Navigator', title: 'Power Navigator Split View' },
  ];

  public readonly ListStyleOptions: ViewToggleOption[] = [
    { key: 'cards', icon: 'fa-solid fa-grip', title: 'Card Grid View' },
    { key: 'list', icon: 'fa-solid fa-list', title: 'Compact Table View' },
  ];

  public readonly FilterFields: FilterFieldConfig[] = [
    {
      key: 'category',
      type: 'chips',
      label: 'Content Type',
      icon: 'fa-solid fa-shapes',
      chipOptions: [
        { text: 'All', value: 'all' },
        { text: 'Documents', value: 'documents', icon: 'fa-solid fa-file-lines' },
        { text: 'Spreadsheets', value: 'spreadsheets', icon: 'fa-solid fa-table-cells' },
        { text: 'Presentations', value: 'presentations', icon: 'fa-solid fa-person-chalkboard' },
        { text: 'Interactive', value: 'interactive', icon: 'fa-solid fa-bolt' },
        { text: 'Queries', value: 'queries', icon: 'fa-solid fa-database' },
        { text: 'Files & Media', value: 'files', icon: 'fa-solid fa-file' },
      ],
    },
    {
      key: 'ownership',
      type: 'chips',
      label: 'Scope',
      icon: 'fa-solid fa-user-check',
      chipOptions: [
        { text: 'Everything', value: 'all' },
        { text: 'Owned by Me', value: 'owned' },
        { text: 'Shared with Me', value: 'shared' },
        { text: 'Starred', value: 'starred', icon: 'fa-solid fa-star' },
      ],
    },
  ];

  private collectionPermByColId = new Map<string, CollectionPermission>();
  private collectionLinksByCollectionAndVersion = new Map<string, string>();
  private pendingExternalParams: LibraryExternalRouteParams | null = null;
  private preferredSurfaceMode: LibrarySurfaceMode = 'hub';
  private ownedArtifactOffset = 0;
  private directSharedArtifactOffset = 0;
  private allDirectSharedArtIds: string[] = [];
  private cachedWorkspaceRecords: {
    artifacts: MJArtifactEntity[];
    versions: VersionSummaryRow[];
    collections: MJCollectionEntity[];
    collectionLinks: CollectionArtifactLinkRow[];
    artifactPerms: ArtifactPermissionSummaryRow[];
    collectionPerms: MJCollectionPermissionEntity[];
  } | null = null;
  private isDestroyed = false;

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly iconService = inject(ArtifactIconService);
  private readonly notifications = inject(MJNotificationService);
  private readonly confirmService = inject(MJConfirmService);

  public ngOnInit(): void {
    this.restoreUserPreferences();
    if (this.InitialMode) {
      this.SurfaceMode = this.InitialMode;
    }
    if (this.InitialHubTab) {
      this.HubTab = this.InitialHubTab;
    }
    if (this.InitialSection) {
      this.NavigatorSection = this.InitialSection;
    }
    if (this.InitialDriveMode) {
      this.SurfaceMode = 'hub';
      this.HubTab = 'drives';
    }
    if (this.pendingExternalParams) {
      this.applyRouteParamsInternal(this.pendingExternalParams);
      this.pendingExternalParams = null;
    }
    void this.ReloadWorkspaceData();
  }

  public ngOnDestroy(): void {
    this.isDestroyed = true;
    this.RefreshViewerSubject.complete();
  }

  // ===========================================================================
  // Computed View Properties
  // ===========================================================================

  public get EffectiveEnvironmentId(): string {
    return this.EnvironmentId || MJEnvironmentEntityExtended.DefaultEnvironmentID;
  }

  public get EffectiveUser(): UserInfo {
    return this.CurrentUser ?? this.ProviderToUse.CurrentUser;
  }

  public get HasMoreArtifacts(): boolean {
    return this.LoadedArtifactCount < this.TotalArtifactCount;
  }

  public get HubTabs(): TabConfig[] {
    return [
      { key: 'overview', label: 'Overview', icon: 'fa-solid fa-sparkles' },
      {
        key: 'collections',
        label: 'Collections',
        icon: 'fa-solid fa-folder-tree',
        badge: this.FlatCollections.length || null,
      },
      {
        key: 'all',
        label: 'All Items',
        icon: 'fa-solid fa-layer-group',
        badge: this.AllItems.length || null,
      },
      {
        key: 'shared',
        label: 'Shared with Me',
        icon: 'fa-solid fa-user-group',
        badge: this.SharedWithMeCount || null,
      },
      {
        key: 'drives',
        label: 'Connected Drives',
        icon: 'fa-solid fa-cloud',
        badge: this.ConnectedDrives.length || null,
      },
    ];
  }

  public get ActiveFilterCount(): number {
    let count = 0;
    if (this.CategoryFilter !== 'all') count++;
    if (this.OwnershipFilter !== 'all') count++;
    return count;
  }

  public get SharedWithMeCount(): number {
    return this.AllItems.filter((i) => i.IsSharedWithMe).length;
  }

  public get StarredCount(): number {
    return this.AllItems.filter((i) => i.IsStarred).length;
  }

  public get ContinueWorkingItems(): LibraryItemSummary[] {
    return this.FilteredItems.slice(0, 8);
  }

  public get HighlightCollections(): LibraryCollectionNode[] {
    return this.CollectionTree.slice(0, 6);
  }

  public get SelectedCollectionNode(): LibraryCollectionNode | null {
    if (!this.SelectedCollectionId) return null;
    return this.FlatCollections.find((c) => UUIDsEqual(c.Id, this.SelectedCollectionId)) ?? null;
  }

  public get SelectedCollectionAncestors(): LibraryCollectionNode[] {
    const chain: LibraryCollectionNode[] = [];
    const flatById = IndexByUUID(this.FlatCollections, (c) => c.Id);
    let cursor = this.SelectedCollectionNode;
    const visited = new Set<string>();
    while (cursor && !visited.has(cursor.Id)) {
      visited.add(cursor.Id);
      chain.unshift(cursor);
      cursor = cursor.ParentId ? flatById.Get(cursor.ParentId) ?? null : null;
    }
    return chain;
  }

  public get SelectedDrive(): LibraryDriveSummary | null {
    if (!this.SelectedDriveId) return null;
    return this.ConnectedDrives.find((d) => UUIDsEqual(d.AccountId, this.SelectedDriveId)) ?? null;
  }

  public get ActiveItem(): LibraryItemSummary | null {
    if (!this.ActiveArtifactId) return null;
    return this.AllItems.find((i) => UUIDsEqual(i.Id, this.ActiveArtifactId)) ?? null;
  }

  public get FilteredItems(): LibraryItemSummary[] {
    let items = this.AllItems;

    // Scope by active surface view
    if (this.SurfaceMode === 'hub') {
      if (this.HubTab === 'shared') {
        items = items.filter((i) => i.IsSharedWithMe);
      }
    } else {
      if (this.NavigatorSection === 'shared') {
        items = items.filter((i) => i.IsSharedWithMe);
      } else if (this.NavigatorSection === 'starred') {
        items = items.filter((i) => i.IsStarred);
      } else if (this.NavigatorSection === 'collection' && this.SelectedCollectionId) {
        const targetId = NormalizeUUID(this.SelectedCollectionId);
        items = items.filter((i) => i.CollectionIds.some((cid) => NormalizeUUID(cid) === targetId));
      }
    }

    // Category filter
    if (this.CategoryFilter !== 'all') {
      items = items.filter((i) => i.Category === this.CategoryFilter);
    }

    // Ownership filter
    if (this.OwnershipFilter === 'owned') {
      items = items.filter((i) => i.IsOwnedByCurrentUser);
    } else if (this.OwnershipFilter === 'shared') {
      items = items.filter((i) => i.IsSharedWithMe);
    } else if (this.OwnershipFilter === 'starred') {
      items = items.filter((i) => i.IsStarred);
    }

    // Search query
    const q = this.SearchQuery.trim().toLowerCase();
    if (q) {
      items = items.filter(
        (i) =>
          i.Name.toLowerCase().includes(q) ||
          i.Description.toLowerCase().includes(q) ||
          i.TypeName.toLowerCase().includes(q) ||
          i.CollectionNames.some((cn) => cn.toLowerCase().includes(q)),
      );
    }

    return items;
  }

  public get FilteredCollections(): LibraryCollectionNode[] {
    const q = this.SearchQuery.trim().toLowerCase();
    if (!q) return this.FlatCollections;
    return this.FlatCollections.filter(
      (c) => c.Name.toLowerCase().includes(q) || c.Description.toLowerCase().includes(q),
    );
  }

  public get NavigatorHeaderTitle(): string {
    if (this.NavigatorSection === 'collection' && this.SelectedCollectionNode) {
      return this.SelectedCollectionNode.Name;
    }
    if (this.NavigatorSection === 'drive' && this.SelectedDrive) {
      return this.SelectedDrive.AccountName;
    }
    if (this.NavigatorSection === 'collections') return 'Collections';
    if (this.NavigatorSection === 'shared') return 'Shared with Me';
    if (this.NavigatorSection === 'starred') return 'Starred Items';
    return 'All Library Items';
  }

  public get NavigatorHeaderSubtitle(): string {
    if (this.NavigatorSection === 'collection' && this.SelectedCollectionNode) {
      return this.SelectedCollectionNode.Description || 'Collection items and nested folders';
    }
    if (this.NavigatorSection === 'drive' && this.SelectedDrive) {
      return `${this.SelectedDrive.ProviderName} · Dynamic remote browsing`;
    }
    if (this.NavigatorSection === 'collections') {
      return 'Organize and share documents, spreadsheets, presentations, and artifacts in folders';
    }
    if (this.NavigatorSection === 'shared') {
      return 'Documents, spreadsheets, slides, and collections shared with you';
    }
    if (this.NavigatorSection === 'starred') {
      return 'Pinned items for instant access';
    }
    return 'All native documents, spreadsheets, presentations, components, queries, and files';
  }

  // ===========================================================================
  // Public Imperative API (Used by LibraryResource & Agent Client Tools)
  // ===========================================================================

  public ApplyExternalRouteState(params: LibraryExternalRouteParams): void {
    if (this.IsLoading && this.AllItems.length === 0 && !this.isDestroyed) {
      this.pendingExternalParams = params;
      this.applyRouteParamsInternal(params);
      return;
    }
    this.applyRouteParamsInternal(params);
    this.emitWorkspaceState();
    this.cdr.detectChanges();
  }

  public SwitchSurfaceMode(mode: LibrarySurfaceMode, persistPreference = true): void {
    this.IsFullCanvasOpen = false;
    this.SurfaceMode = mode;
    if (persistPreference) {
      this.preferredSurfaceMode = mode;
      this.saveSettingSafe(SETTING_SURFACE_MODE, mode);
    }
    if (mode === 'navigator' && this.NavigatorSection === 'drive' && !this.SelectedDriveId && this.ConnectedDrives.length > 0) {
      this.SelectedDriveId = this.ConnectedDrives[0].AccountId;
    }
    this.emitWorkspaceState();
    this.cdr.detectChanges();
  }

  public SwitchHubTab(tabKey: string): void {
    const valid: LibraryHubTab[] = ['overview', 'collections', 'all', 'shared', 'drives'];
    const tab = (valid.includes(tabKey as LibraryHubTab) ? tabKey : 'overview') as LibraryHubTab;
    this.HubTab = tab;
    this.IsFullCanvasOpen = false;
    if (tab !== 'drives') {
      this.SelectedDriveId = null;
      this.DriveFolderPrefix = '';
    }
    this.emitWorkspaceState();
    this.cdr.detectChanges();
  }

  public SelectNavigatorView(section: 'all' | 'collections' | 'shared' | 'starred'): void {
    this.SurfaceMode = 'navigator';
    this.NavigatorSection = section;
    this.SelectedCollectionId = null;
    this.SelectedDriveId = null;
    this.DriveFolderPrefix = '';
    this.IsFullCanvasOpen = false;
    this.emitWorkspaceState();
    this.cdr.detectChanges();
  }

  public OpenCollectionById(collectionId: string): void {
    this.SurfaceMode = 'navigator';
    this.NavigatorSection = 'collection';
    this.SelectedCollectionId = collectionId;
    this.SelectedDriveId = null;
    this.DriveFolderPrefix = '';
    this.IsFullCanvasOpen = false;
    this.expandAncestorsOf(collectionId);
    this.emitWorkspaceState();
    this.cdr.detectChanges();
  }

  public OpenConnectedDrive(accountId: string, folderPrefix = ''): void {
    this.SelectedDriveId = accountId;
    this.DriveFolderPrefix = folderPrefix;
    this.ActiveArtifactId = null;
    this.IsFullCanvasOpen = false;
    if (this.SurfaceMode === 'hub') {
      this.HubTab = 'drives';
    } else {
      this.NavigatorSection = 'drive';
    }
    this.emitWorkspaceState();
    this.cdr.detectChanges();
  }

  public OnDrivePrefixChange(prefix: string): void {
    this.DriveFolderPrefix = prefix;
    this.emitWorkspaceState();
    this.cdr.detectChanges();
  }

  public OnDriveBackRequested(): void {
    this.SelectedDriveId = null;
    this.DriveFolderPrefix = '';
    this.emitWorkspaceState();
    this.cdr.detectChanges();
  }

  public OpenArtifactStudio(
    artifactId: string,
    options?: { fullCanvas?: boolean; versionNumber?: number; forceNavigatorSplit?: boolean },
  ): void {
    this.ActiveArtifactId = artifactId;
    this.ActiveVersionNumber = options?.versionNumber;

    if (options?.forceNavigatorSplit) {
      this.IsFullCanvasOpen = false;
      this.SurfaceMode = 'navigator';
      if (this.NavigatorSection === 'drive') {
        this.NavigatorSection = 'all';
        this.SelectedDriveId = null;
      }
    } else if (options?.fullCanvas ?? this.SurfaceMode === 'hub') {
      this.FullCanvasOriginMode = this.SurfaceMode;
      this.IsFullCanvasOpen = true;
    } else {
      this.IsFullCanvasOpen = false;
    }

    this.emitWorkspaceState();
    this.cdr.detectChanges();
  }

  public ExitFullCanvasToOrigin(): void {
    this.IsFullCanvasOpen = false;
    if (this.FullCanvasOriginMode === 'hub') {
      this.ActiveArtifactId = null;
    }
    this.SurfaceMode = this.FullCanvasOriginMode;
    this.emitWorkspaceState();
    this.cdr.detectChanges();
  }

  public SwitchFullCanvasToSplitNavigator(): void {
    if (!this.ActiveArtifactId) return;
    this.IsFullCanvasOpen = false;
    this.SurfaceMode = 'navigator';
    if (this.NavigatorSection === 'drive') {
      this.NavigatorSection = 'all';
      this.SelectedDriveId = null;
    }
    this.emitWorkspaceState();
    this.cdr.detectChanges();
  }

  public CloseSplitStudio(): void {
    this.ActiveArtifactId = null;
    this.ActiveVersionNumber = undefined;
    this.IsFullCanvasOpen = false;
    this.emitWorkspaceState();
    this.cdr.detectChanges();
  }

  public ToggleStudioMaximize(): void {
    if (!this.ActiveArtifactId) return;
    if (this.IsFullCanvasOpen) {
      this.SwitchFullCanvasToSplitNavigator();
    } else {
      this.FullCanvasOriginMode = this.SurfaceMode;
      this.IsFullCanvasOpen = true;
      this.emitWorkspaceState();
      this.cdr.detectChanges();
    }
  }

  public SetSearchQuery(value: string): void {
    this.SearchQuery = value;
    if (this.SurfaceMode === 'hub' && this.HubTab === 'overview' && value.trim().length > 0) {
      this.HubTab = 'all';
    }
    this.emitWorkspaceState();
    this.cdr.detectChanges();
  }

  public SetCategoryFilter(category: LibraryCategoryFilter): void {
    this.CategoryFilter = category;
    this.FilterPanelValues = { ...this.FilterPanelValues, category };
    if (this.SurfaceMode === 'hub' && this.HubTab === 'overview' && category !== 'all') {
      this.HubTab = 'all';
    }
    this.emitWorkspaceState();
    this.cdr.detectChanges();
  }

  public OnFilterValuesChange(values: MJFilterPanelComponent['Values']): void {
    this.FilterPanelValues = values;
    const rawCat = values['category'];
    const rawOwn = values['ownership'];
    const cat: LibraryCategoryFilter =
      typeof rawCat === 'string' &&
      ['all', 'documents', 'spreadsheets', 'presentations', 'interactive', 'queries', 'files'].includes(rawCat)
        ? (rawCat as LibraryCategoryFilter)
        : 'all';
    const own: LibraryOwnershipFilter =
      typeof rawOwn === 'string' && ['all', 'owned', 'shared', 'starred'].includes(rawOwn)
        ? (rawOwn as LibraryOwnershipFilter)
        : 'all';
    this.CategoryFilter = cat;
    this.OwnershipFilter = own;
    if (this.SurfaceMode === 'hub' && this.HubTab === 'overview' && (cat !== 'all' || own !== 'all')) {
      this.HubTab = 'all';
    }
    this.emitWorkspaceState();
    this.cdr.detectChanges();
  }

  public ResetFilters(): void {
    this.CategoryFilter = 'all';
    this.OwnershipFilter = 'all';
    this.FilterPanelValues = { category: 'all', ownership: 'all' };
    this.emitWorkspaceState();
    this.cdr.detectChanges();
  }

  public SetListStyle(key: string): void {
    const style: LibraryListStyle = key === 'list' ? 'list' : 'cards';
    this.ListStyle = style;
    this.saveSettingSafe(SETTING_LIST_STYLE, style);
    this.cdr.detectChanges();
  }

  // ===========================================================================
  // Creation, Sharing, Starring, Drag-Drop & Collection Actions
  // ===========================================================================

  public OpenCreateBlankDialog(kind: LibraryStarterKind = 'document'): void {
    this.CreateDialogTab = 'blank';
    this.CreateDialogStarter = kind;
    this.IsCreateDialogOpen = true;
    this.cdr.detectChanges();
  }

  public OpenUploadConvertDialog(): void {
    this.CreateDialogTab = 'upload';
    this.IsCreateDialogOpen = true;
    this.cdr.detectChanges();
  }

  public async OnArtifactCreated(result: CreatedLibraryArtifactResult): Promise<void> {
    this.IsCreateDialogOpen = false;
    await this.ReloadWorkspaceData();
    this.OpenArtifactStudio(result.Artifact.ID, {
      fullCanvas: true,
      versionNumber: result.Version.VersionNumber,
    });
  }

  public async OnRemoteDriveArtifactConverted(event: { ArtifactId: string; VersionNumber: number }): Promise<void> {
    await this.ReloadWorkspaceData();
    this.OpenArtifactStudio(event.ArtifactId, {
      fullCanvas: true,
      versionNumber: event.VersionNumber,
    });
  }

  public ToggleStar(item: LibraryItemSummary, event?: MouseEvent): void {
    event?.stopPropagation();
    const norm = NormalizeUUID(item.Id);
    if (this.StarredArtifactIds.has(norm)) {
      this.StarredArtifactIds.delete(norm);
      item.IsStarred = false;
    } else {
      this.StarredArtifactIds.add(norm);
      item.IsStarred = true;
    }
    this.saveSettingSafe(SETTING_STARRED_IDS, JSON.stringify(Array.from(this.StarredArtifactIds)));
    this.cdr.detectChanges();
  }

  public ToggleCollectionExpand(node: LibraryCollectionNode, event?: MouseEvent): void {
    event?.stopPropagation();
    const norm = NormalizeUUID(node.Id);
    if (this.ExpandedCollectionIds.has(norm)) {
      this.ExpandedCollectionIds.delete(norm);
    } else {
      this.ExpandedCollectionIds.add(norm);
    }
    this.cdr.detectChanges();
  }

  public IsCollectionExpanded(collectionId: string): boolean {
    return this.ExpandedCollectionIds.has(NormalizeUUID(collectionId));
  }

  public OpenNewCollectionModal(parent?: LibraryCollectionNode, event?: MouseEvent): void {
    event?.stopPropagation();
    this.EditingCollectionEntity = undefined;
    this.ParentCollectionForNew = parent?.Entity;
    this.IsCollectionFormOpen = true;
    this.cdr.detectChanges();
  }

  public OpenEditCollectionModal(node: LibraryCollectionNode, event?: MouseEvent): void {
    event?.stopPropagation();
    this.EditingCollectionEntity = node.Entity;
    this.ParentCollectionForNew = undefined;
    this.IsCollectionFormOpen = true;
    this.cdr.detectChanges();
  }

  public OpenShareCollectionModal(node: LibraryCollectionNode, event?: MouseEvent): void {
    event?.stopPropagation();
    this.SharingCollectionEntity = node.Entity;
    this.SharingCollectionPerm = this.collectionPermByColId.get(NormalizeUUID(node.Id)) ?? null;
    this.IsCollectionShareOpen = true;
    this.cdr.detectChanges();
  }

  public async DeleteCollection(node: LibraryCollectionNode, event?: MouseEvent): Promise<void> {
    event?.stopPropagation();
    const confirmed = await this.confirmService.ConfirmDelete({
      title: 'Delete Collection',
      message: `Delete collection "${node.Name}"?`,
      detail: 'Items inside the collection remain safe in your Library.',
    });
    if (!confirmed) return;

    try {
      const deleted = await node.Entity.Delete();
      if (!deleted) {
        throw new Error(node.Entity.LatestResult?.Message || 'Failed to delete collection.');
      }
      if (UUIDsEqual(this.SelectedCollectionId, node.Id)) {
        this.SelectedCollectionId = null;
        this.NavigatorSection = 'all';
      }
      this.notifications.CreateSimpleNotification(`Deleted "${node.Name}"`, 'success', 2500);
      await this.ReloadWorkspaceData();
    } catch (err) {
      this.notifications.CreateSimpleNotification(
        err instanceof Error ? err.message : 'Could not delete collection.',
        'error',
        4000,
      );
    }
  }

  public async OnCollectionSaved(saved: MJCollectionEntity): Promise<void> {
    this.IsCollectionFormOpen = false;
    await this.ReloadWorkspaceData();
    if (saved?.ID) {
      this.OpenCollectionById(saved.ID);
    }
  }

  public OpenShareArtifactModal(itemOrId: LibraryItemSummary | string, event?: MouseEvent): void {
    event?.stopPropagation();
    const item =
      typeof itemOrId === 'string'
        ? this.AllItems.find((i) => UUIDsEqual(i.Id, itemOrId)) ?? null
        : itemOrId;
    if (!item) return;
    this.SharingArtifactEntity = item.ArtifactEntity;
    this.IsArtifactShareOpen = true;
    this.cdr.detectChanges();
  }

  public OpenSaveToCollectionModal(
    request: { artifactId: string; excludedCollectionIds: string[] },
    event?: MouseEvent,
  ): void {
    event?.stopPropagation();
    const item = this.AllItems.find((i) => UUIDsEqual(i.Id, request.artifactId)) ?? null;
    if (!item || !item.LatestVersionId) return;
    this.SaveToCollectionArtifact = item;
    this.SaveToCollectionExcludedIds = request.excludedCollectionIds;
    this.IsSaveToCollectionOpen = true;
    this.cdr.detectChanges();
  }

  public OpenExportToDriveModal(
    item: LibraryItemSummary | null,
    event?: MouseEvent,
    versionNumber?: number,
  ): void {
    event?.stopPropagation();
    if (!item) return;
    this.ExportingItem = item;
    this.ExportingVersionNumber =
      versionNumber ??
      (UUIDsEqual(this.ActiveArtifactId, item.Id) && this.ActiveVersionNumber != null
        ? this.ActiveVersionNumber
        : item.LatestVersionNumber);
    this.IsExportDriveDialogOpen = true;
    this.cdr.detectChanges();
  }

  public async RemoveItemFromCurrentCollection(item: LibraryItemSummary, event?: MouseEvent): Promise<void> {
    event?.stopPropagation();
    if (!this.SelectedCollectionId || !item.LatestVersionId) return;
    const key = `${NormalizeUUID(this.SelectedCollectionId)}:${NormalizeUUID(item.LatestVersionId)}`;
    const linkId = this.collectionLinksByCollectionAndVersion.get(key);
    if (!linkId) return;

    try {
      const entity = await this.ProviderToUse.GetEntityObject<MJCollectionArtifactEntity>(
        'MJ: Collection Artifacts',
        this.EffectiveUser,
      );
      const loaded = await entity.Load(linkId);
      if (!loaded) {
        this.notifications.CreateSimpleNotification(
          entity.LatestResult?.Message || `Could not locate "${item.Name}" link in collection.`,
          'error',
          4000,
        );
        return;
      }
      const deleted = await entity.Delete();
      if (!deleted) {
        this.notifications.CreateSimpleNotification(
          entity.LatestResult?.Message || `Failed to remove "${item.Name}" from collection.`,
          'error',
          4000,
        );
        return;
      }
      this.notifications.CreateSimpleNotification(
        `Removed "${item.Name}" from collection`,
        'info',
        2500,
      );
      await this.ReloadWorkspaceData();
    } catch (err) {
      this.notifications.CreateSimpleNotification(
        err instanceof Error ? err.message : 'Failed to remove item from collection.',
        'error',
        4000,
      );
    }
  }

  // Drag and drop item -> collection
  public OnItemDragStart(item: LibraryItemSummary, event: DragEvent): void {
    this.DraggingItemId = item.Id;
    event.dataTransfer?.setData('text/plain', item.Id);
  }

  public OnItemDragEnd(): void {
    this.DraggingItemId = null;
    this.DragOverCollectionId = null;
  }

  public OnCollectionDragOver(node: LibraryCollectionNode, event: DragEvent): void {
    if (!this.DraggingItemId || !node.CanEdit) return;
    event.preventDefault();
    this.DragOverCollectionId = node.Id;
  }

  public async OnCollectionDrop(node: LibraryCollectionNode, event: DragEvent): Promise<void> {
    event.preventDefault();
    const itemId = this.DraggingItemId || event.dataTransfer?.getData('text/plain') || null;
    this.DraggingItemId = null;
    this.DragOverCollectionId = null;
    if (!itemId || !node.CanEdit) return;

    const item = this.AllItems.find((i) => UUIDsEqual(i.Id, itemId));
    if (!item || !item.LatestVersionId) return;
    if (item.CollectionIds.some((cid) => UUIDsEqual(cid, node.Id))) {
      this.notifications.CreateSimpleNotification(`"${item.Name}" is already in "${node.Name}"`, 'info', 2500);
      return;
    }

    try {
      const link = await this.ProviderToUse.GetEntityObject<MJCollectionArtifactEntity>(
        'MJ: Collection Artifacts',
        this.EffectiveUser,
      );
      link.CollectionID = node.Id;
      link.ArtifactVersionID = item.LatestVersionId;
      const saved = await link.Save();
      if (!saved) {
        this.notifications.CreateSimpleNotification(
          link.LatestResult?.Message || `Could not add "${item.Name}" to "${node.Name}".`,
          'error',
          4000,
        );
        return;
      }
      this.notifications.CreateSimpleNotification(`Added "${item.Name}" to "${node.Name}"`, 'success', 2500);
      await this.ReloadWorkspaceData();
    } catch (err) {
      this.notifications.CreateSimpleNotification(
        err instanceof Error ? err.message : 'Could not add item to collection.',
        'error',
        4000,
      );
    }
  }

  // Viewer panel outbound link routing
  public OnViewerOpenEntityRecord(event: { entityName: string; compositeKey: CompositeKey }): void {
    this.HostNavigate.emit({
      Kind: 'entity-record',
      EntityName: event.entityName,
      CompositeKey: event.compositeKey,
    });
  }

  public OnViewerNavigateToLink(event: {
    type: 'conversation' | 'collection';
    id: string;
    artifactId?: string;
    versionNumber?: number;
  }): void {
    if (event.type === 'collection') {
      this.OpenCollectionById(event.id);
      if (event.artifactId) {
        this.OpenArtifactStudio(event.artifactId, {
          forceNavigatorSplit: true,
          versionNumber: event.versionNumber,
        });
      }
      return;
    }
    this.HostNavigate.emit({
      Kind: 'conversation',
      ConversationId: event.id,
      ArtifactId: event.artifactId,
      VersionNumber: event.versionNumber,
    });
  }

  // ===========================================================================
  // Data Loading
  // ===========================================================================

  public async ReloadWorkspaceData(): Promise<void> {
    const user = this.EffectiveUser;
    if (!user) {
      this.IsLoading = false;
      this.LoadComplete.emit();
      return;
    }

    this.IsLoading = true;
    this.LoadError = null;
    this.LoadMoreError = null;
    try {
      const md = this.ProviderToUse;

      await ArtifactMetadataEngine.Instance.Config(false, user, md);
      const artifactTypes = ArtifactMetadataEngine.Instance.ArtifactTypes;

      const rv = RunView.FromMetadataProvider(md);
      const scoped = await this.loadScopedWorkspaceRecords(rv, user);
      this.cachedWorkspaceRecords = scoped;

      await this.loadConnectedDrives();

      this.hydrateWorkspaceViewModels({
        user,
        artifactTypes,
        artifacts: scoped.artifacts,
        versions: scoped.versions,
        collections: scoped.collections,
        collectionLinks: scoped.collectionLinks,
        artifactPerms: scoped.artifactPerms,
        collectionPerms: scoped.collectionPerms,
      });

      if (this.pendingExternalParams) {
        const pending = this.pendingExternalParams;
        this.pendingExternalParams = null;
        this.applyRouteParamsInternal(pending);
      }
    } catch (err) {
      this.LoadError = err instanceof Error ? err.message : 'Failed to load Library items.';
    } finally {
      this.IsLoading = false;
      this.LoadComplete.emit();
      this.emitWorkspaceState();
      if (!this.isDestroyed) {
        this.cdr.detectChanges();
      }
    }
  }

  /**
   * Loads the next page (`ArtifactPageSize = 200`) of user-accessible artifacts and their scoped
   * version rows without re-querying all collections or truncating large libraries.
   */
  public async LoadMoreArtifacts(): Promise<void> {
    if (!this.HasMoreArtifacts || this.IsLoading || this.IsLoadingMore) {
      return;
    }
    const user = this.EffectiveUser;
    if (!user) {
      return;
    }

    this.IsLoadingMore = true;
    this.LoadMoreError = null;
    try {
      const md = this.ProviderToUse;
      const rv = RunView.FromMetadataProvider(md);
      const safeEnvId = EscapeSQLString(this.EffectiveEnvironmentId);
      const safeUserId = EscapeSQLString(user.ID);
      const envFilter = `EnvironmentID='${safeEnvId}'`;
      const visibleFilter = `(Visibility IS NULL OR Visibility <> 'System Only')`;

      const hasRemainingDirectShared =
        Array.isArray(this.allDirectSharedArtIds) &&
        this.directSharedArtifactOffset < this.allDirectSharedArtIds.length;
      const nextDirectSlice = hasRemainingDirectShared
        ? this.allDirectSharedArtIds.slice(
            this.directSharedArtifactOffset,
            this.directSharedArtifactOffset + this.ArtifactPageSize,
          )
        : [];

      const pageQueries: RunViewParams[] = [
        {
          EntityName: 'MJ: Artifacts',
          ExtraFilter: `${envFilter} AND ${visibleFilter} AND UserID='${safeUserId}'`,
          OrderBy: '__mj_UpdatedAt DESC',
          StartRow: this.ownedArtifactOffset,
          MaxRows: this.ArtifactPageSize,
          ResultType: 'entity_object',
        },
      ];
      for (const chunk of this.chunkIds(nextDirectSlice)) {
        pageQueries.push({
          EntityName: 'MJ: Artifacts',
          ExtraFilter: `${envFilter} AND ${visibleFilter} AND ID IN (${this.sqlUuidInList(chunk)})`,
          OrderBy: '__mj_UpdatedAt DESC',
          StartRow: 0,
          MaxRows: chunk.length,
          ResultType: 'entity_object',
        });
      }

      const pageBatch = await rv.RunViews(pageQueries, user);
      this.assertRunViewsSucceeded(pageBatch);
      const [nextArtRes, ...directArtResList] = pageBatch;
      const nextOwnedArtifacts = (nextArtRes?.Results ?? []) as MJArtifactEntity[];
      const nextDirectArtifacts: MJArtifactEntity[] = [];
      for (const directRes of directArtResList) {
        if (directRes?.Results) {
          nextDirectArtifacts.push(...(directRes.Results as MJArtifactEntity[]));
        }
      }
      const nextArtifacts = this.dedupeEntitiesById([...nextOwnedArtifacts, ...nextDirectArtifacts]);

      if (nextArtifacts.length === 0 && nextDirectSlice.length === 0) {
        this.TotalArtifactCount = this.LoadedArtifactCount;
        return;
      }

      this.ownedArtifactOffset += nextOwnedArtifacts.length;
      if (nextDirectSlice.length > 0) {
        this.directSharedArtifactOffset += nextDirectSlice.length;
      }
      const newArtIds = this.uniqueIds(nextArtifacts.map((a) => a.ID));
      let nextVersions: VersionSummaryRow[] = [];

      if (newArtIds.length > 0) {
        const verQueries = this.buildScopedArtifactVersionQueries(newArtIds);
        const verBatch = await rv.RunViews(verQueries, user);
        this.assertRunViewsSucceeded(verBatch);
        const collected: VersionSummaryRow[] = [];
        for (const res of verBatch) {
          if (res?.Results) {
            collected.push(...(res.Results as VersionSummaryRow[]));
          }
        }
        nextVersions = this.dedupeEntitiesById(collected);
      }

      const prev = this.cachedWorkspaceRecords ?? {
        artifacts: [],
        versions: [],
        collections: [],
        collectionLinks: [],
        artifactPerms: [],
        collectionPerms: [],
      };
      const mergedArtifacts = this.dedupeEntitiesById([...prev.artifacts, ...nextArtifacts]);
      mergedArtifacts.sort((a, b) => {
        const aTime = a.__mj_UpdatedAt ? new Date(a.__mj_UpdatedAt).getTime() : 0;
        const bTime = b.__mj_UpdatedAt ? new Date(b.__mj_UpdatedAt).getTime() : 0;
        return bTime - aTime;
      });
      const mergedVersions = this.dedupeEntitiesById([...prev.versions, ...nextVersions]);

      this.cachedWorkspaceRecords = {
        ...prev,
        artifacts: mergedArtifacts,
        versions: mergedVersions,
      };
      this.LoadedArtifactCount = mergedArtifacts.length;
      const unpagedDirectCount = Array.isArray(this.allDirectSharedArtIds)
        ? Math.max(0, this.allDirectSharedArtIds.length - this.directSharedArtifactOffset)
        : 0;
      if (typeof nextArtRes?.TotalRowCount === 'number') {
        const loadedSharedCount = Math.max(0, mergedArtifacts.length - this.ownedArtifactOffset);
        this.TotalArtifactCount = Math.max(
          this.LoadedArtifactCount,
          nextArtRes.TotalRowCount + loadedSharedCount + unpagedDirectCount,
        );
      } else if (unpagedDirectCount === 0 && nextOwnedArtifacts.length < this.ArtifactPageSize) {
        this.TotalArtifactCount = this.LoadedArtifactCount;
      }

      this.hydrateWorkspaceViewModels({
        user,
        artifactTypes: ArtifactMetadataEngine.Instance.ArtifactTypes,
        artifacts: mergedArtifacts,
        versions: mergedVersions,
        collections: prev.collections,
        collectionLinks: prev.collectionLinks,
        artifactPerms: prev.artifactPerms,
        collectionPerms: prev.collectionPerms,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load additional Library items.';
      this.LoadMoreError = msg;
      this.notifications?.CreateSimpleNotification(msg, 'error', 4000);
    } finally {
      this.IsLoadingMore = false;
      this.emitWorkspaceState();
      if (!this.isDestroyed) {
        this.cdr.detectChanges();
      }
    }
  }

  private assertRunViewsSucceeded(
    results: ReadonlyArray<{ Success?: boolean; ErrorMessage?: string } | undefined>,
  ): void {
    for (const res of results) {
      if (!res || res.Success === false) {
        const msg = res?.ErrorMessage || 'Failed to load Library items.';
        throw new Error(msg);
      }
    }
  }

  /**
   * Loads user-accessible `MJ: Artifacts`, `MJ: Artifact Versions` (excluding heavy `Content`),
   * `MJ: Collections`, `MJ: Collection Artifacts`, and permission rows via 2-phase server-side
   * scoped `rv.RunViews` batches — zero unscoped table reads and zero raw `__mj` schema names
   * (100% SQL Server + PostgreSQL portable).
   */
  private async loadScopedWorkspaceRecords(
    rv: RunView,
    user: UserInfo,
  ): Promise<{
    artifacts: MJArtifactEntity[];
    versions: VersionSummaryRow[];
    collections: MJCollectionEntity[];
    collectionLinks: CollectionArtifactLinkRow[];
    artifactPerms: ArtifactPermissionSummaryRow[];
    collectionPerms: MJCollectionPermissionEntity[];
  }> {
    const safeEnvId = EscapeSQLString(this.EffectiveEnvironmentId);
    const safeUserId = EscapeSQLString(user.ID);
    const envFilter = `EnvironmentID='${safeEnvId}'`;
    const visibleFilter = `(Visibility IS NULL OR Visibility <> 'System Only')`;

    // Batch 1: First page of owned artifacts, first bounded page of lightweight artifact permission rows,
    // owned collections, and user collection grants
    const batch1Results = await rv.RunViews(
      [
        {
          EntityName: 'MJ: Artifacts',
          ExtraFilter: `${envFilter} AND ${visibleFilter} AND UserID='${safeUserId}'`,
          OrderBy: '__mj_UpdatedAt DESC',
          StartRow: 0,
          MaxRows: this.ArtifactPageSize,
          ResultType: 'entity_object',
        },
        {
          EntityName: 'MJ: Artifact Permissions',
          ExtraFilter: `UserID='${safeUserId}' AND CanRead=1`,
          Fields: ARTIFACT_PERMISSION_SUMMARY_FIELDS,
          OrderBy: '__mj_CreatedAt DESC',
          StartRow: 0,
          MaxRows: this.ArtifactPageSize,
          ResultType: 'simple',
        },
        {
          EntityName: 'MJ: Collections',
          ExtraFilter: `${envFilter} AND OwnerID='${safeUserId}'`,
          OrderBy: 'Name ASC',
          IgnoreMaxRows: true,
          ResultType: 'entity_object',
        },
        {
          EntityName: 'MJ: Collection Permissions',
          ExtraFilter: `UserID='${safeUserId}' AND CanRead=1`,
          IgnoreMaxRows: true,
          ResultType: 'entity_object',
        },
      ],
      user,
    );
    this.assertRunViewsSucceeded(batch1Results);
    const [ownedArtRes, artPermRes, ownedColRes, colPermRes] = batch1Results;

    const ownedArtifacts = (ownedArtRes?.Results ?? []) as MJArtifactEntity[];
    const firstPagePerms = (artPermRes?.Results ?? []) as ArtifactPermissionSummaryRow[];
    const artifactPerms: ArtifactPermissionSummaryRow[] = [...firstPagePerms];
    const totalPermRows =
      typeof artPermRes?.TotalRowCount === 'number' ? artPermRes.TotalRowCount : firstPagePerms.length;
    let permOffset = firstPagePerms.length;
    while (permOffset < totalPermRows && firstPagePerms.length > 0) {
      const nextPermBatch = await rv.RunViews(
        [
          {
            EntityName: 'MJ: Artifact Permissions',
            ExtraFilter: `UserID='${safeUserId}' AND CanRead=1`,
            Fields: ARTIFACT_PERMISSION_SUMMARY_FIELDS,
            OrderBy: '__mj_CreatedAt DESC',
            StartRow: permOffset,
            MaxRows: this.ArtifactPageSize,
            ResultType: 'simple',
          },
        ],
        user,
      );
      this.assertRunViewsSucceeded(nextPermBatch);
      const nextRows = (nextPermBatch[0]?.Results ?? []) as ArtifactPermissionSummaryRow[];
      if (nextRows.length === 0) {
        break;
      }
      artifactPerms.push(...nextRows);
      permOffset += nextRows.length;
    }

    const ownedCollections = (ownedColRes?.Results ?? []) as MJCollectionEntity[];
    const collectionPerms = (colPermRes?.Results ?? []) as MJCollectionPermissionEntity[];

    const ownedArtNormIds = new Set(ownedArtifacts.map((a) => NormalizeUUID(a.ID)));
    const ownedColNormIds = new Set(ownedCollections.map((c) => NormalizeUUID(c.ID)));

    const directSharedArtIds = this.uniqueIds(
      artifactPerms
        .filter((ap) => ap.CanRead && !ownedArtNormIds.has(NormalizeUUID(ap.ArtifactID)))
        .map((ap) => ap.ArtifactID),
    );
    this.allDirectSharedArtIds = directSharedArtIds;
    const firstPageDirectSharedArtIds = directSharedArtIds.slice(0, this.ArtifactPageSize);
    this.directSharedArtifactOffset = firstPageDirectSharedArtIds.length;

    const sharedColIds = this.uniqueIds(
      collectionPerms
        .filter((cp) => cp.CanRead && !ownedColNormIds.has(NormalizeUUID(cp.CollectionID)))
        .map((cp) => cp.CollectionID),
    );
    const accessibleColIds = this.uniqueIds([
      ...ownedCollections.map((c) => c.ID),
      ...sharedColIds,
    ]);

    // Batch 2: Shared collections, collection-artifact links, and first bounded page of directly shared artifacts
    const batch2Queries: RunViewParams[] = [];
    const sharedColIndices: number[] = [];
    const colLinksIndices: number[] = [];
    const directSharedArtIndices: number[] = [];
    const immediateVersionIndices: number[] = [];

    for (const chunk of this.chunkIds(sharedColIds)) {
      sharedColIndices.push(batch2Queries.length);
      batch2Queries.push({
        EntityName: 'MJ: Collections',
        ExtraFilter: `${envFilter} AND ID IN (${this.sqlUuidInList(chunk)})`,
        OrderBy: 'Name ASC',
        IgnoreMaxRows: true,
        ResultType: 'entity_object',
      });
    }

    for (const chunk of this.chunkIds(accessibleColIds)) {
      colLinksIndices.push(batch2Queries.length);
      batch2Queries.push({
        EntityName: 'MJ: Collection Artifacts',
        ExtraFilter: `CollectionID IN (${this.sqlUuidInList(chunk)})`,
        Fields: ['ID', 'CollectionID', 'ArtifactVersionID', 'Sequence'],
        IgnoreMaxRows: true,
        ResultType: 'simple',
      });
    }

    for (const chunk of this.chunkIds(firstPageDirectSharedArtIds)) {
      directSharedArtIndices.push(batch2Queries.length);
      batch2Queries.push({
        EntityName: 'MJ: Artifacts',
        ExtraFilter: `${envFilter} AND ${visibleFilter} AND ID IN (${this.sqlUuidInList(chunk)})`,
        OrderBy: '__mj_UpdatedAt DESC',
        StartRow: 0,
        MaxRows: chunk.length,
        ResultType: 'entity_object',
      });
    }

    const initialArtIds = this.uniqueIds([
      ...ownedArtifacts.map((a) => a.ID),
      ...firstPageDirectSharedArtIds,
    ]);

    // Fast path when user has zero collections: include per-artifact VersionNumber=1 + Latest inside Batch 2
    if (accessibleColIds.length === 0 && initialArtIds.length > 0) {
      for (const verQuery of this.buildScopedArtifactVersionQueries(initialArtIds)) {
        immediateVersionIndices.push(batch2Queries.length);
        batch2Queries.push(verQuery);
      }
    }

    const batch2Results = batch2Queries.length > 0 ? await rv.RunViews(batch2Queries, user) : [];
    this.assertRunViewsSucceeded(batch2Results);

    const sharedCollections: MJCollectionEntity[] = [];
    for (const idx of sharedColIndices) {
      if (batch2Results[idx]?.Results) {
        sharedCollections.push(...(batch2Results[idx].Results as MJCollectionEntity[]));
      }
    }
    const rawCollectionLinks: CollectionArtifactLinkRow[] = [];
    for (const idx of colLinksIndices) {
      if (batch2Results[idx]?.Results) {
        rawCollectionLinks.push(...(batch2Results[idx].Results as CollectionArtifactLinkRow[]));
      }
    }
    const directSharedArtifacts: MJArtifactEntity[] = [];
    for (const idx of directSharedArtIndices) {
      if (batch2Results[idx]?.Results) {
        directSharedArtifacts.push(...(batch2Results[idx].Results as MJArtifactEntity[]));
      }
    }

    const allCollections = this.dedupeEntitiesById([...ownedCollections, ...sharedCollections]);
    const envColNormIds = new Set(allCollections.map((c) => NormalizeUUID(c.ID)));
    const collectionLinks = rawCollectionLinks.filter((l) => envColNormIds.has(NormalizeUUID(l.CollectionID)));

    let allArtifacts = this.dedupeEntitiesById([...ownedArtifacts, ...directSharedArtifacts]);
    const immediateVersions: VersionSummaryRow[] = [];
    for (const idx of immediateVersionIndices) {
      if (batch2Results[idx]?.Results) {
        immediateVersions.push(...(batch2Results[idx].Results as VersionSummaryRow[]));
      }
    }
    let allVersions: VersionSummaryRow[] = this.dedupeEntitiesById(immediateVersions);

    if (accessibleColIds.length > 0) {
      const knownArtIds = allArtifacts.map((a) => a.ID);
      const knownArtNormSet = new Set(knownArtIds.map((id) => NormalizeUUID(id)));
      const linkedVersionIds = this.uniqueIds(collectionLinks.map((l) => l.ArtifactVersionID));

      const versionQueries: RunViewParams[] = [];
      if (knownArtIds.length > 0) {
        versionQueries.push(...this.buildScopedArtifactVersionQueries(knownArtIds));
      }
      for (const chunk of this.chunkIds(linkedVersionIds)) {
        versionQueries.push({
          EntityName: 'MJ: Artifact Versions',
          ExtraFilter: `ID IN (${this.sqlUuidInList(chunk)})`,
          Fields: VERSION_SUMMARY_FIELDS,
          IgnoreMaxRows: true,
          ResultType: 'simple',
        });
      }

      if (versionQueries.length > 0) {
        const verResults = await rv.RunViews(versionQueries, user);
        this.assertRunViewsSucceeded(verResults);
        const combinedVers: VersionSummaryRow[] = [];
        for (const res of verResults) {
          if (res?.Results) {
            combinedVers.push(...(res.Results as VersionSummaryRow[]));
          }
        }
        allVersions = this.dedupeEntitiesById(combinedVers);

        // Fetch any artifacts granted solely via a shared Collection (not yet in knownArtNormSet)
        const collectionOnlyArtIds = this.uniqueIds(
          allVersions
            .map((v) => v.ArtifactID)
            .filter((artId) => Boolean(artId) && !knownArtNormSet.has(NormalizeUUID(artId))),
        );

        if (collectionOnlyArtIds.length > 0) {
          const colOnlyQueries: RunViewParams[] = [];
          const colArtIndices: number[] = [];
          const colVerIndices: number[] = [];
          for (const chunk of this.chunkIds(collectionOnlyArtIds)) {
            colArtIndices.push(colOnlyQueries.length);
            colOnlyQueries.push({
              EntityName: 'MJ: Artifacts',
              ExtraFilter: `${envFilter} AND ${visibleFilter} AND ID IN (${this.sqlUuidInList(chunk)})`,
              OrderBy: '__mj_UpdatedAt DESC',
              IgnoreMaxRows: true,
              ResultType: 'entity_object',
            });
          }
          for (const verQuery of this.buildScopedArtifactVersionQueries(collectionOnlyArtIds)) {
            colVerIndices.push(colOnlyQueries.length);
            colOnlyQueries.push(verQuery);
          }
          const colArtBatch = await rv.RunViews(colOnlyQueries, user);
          this.assertRunViewsSucceeded(colArtBatch);
          const colSharedArts: MJArtifactEntity[] = [];
          for (const idx of colArtIndices) {
            if (colArtBatch[idx]?.Results) {
              colSharedArts.push(...(colArtBatch[idx].Results as MJArtifactEntity[]));
            }
          }
          const colSharedVers: VersionSummaryRow[] = [];
          for (const idx of colVerIndices) {
            if (colArtBatch[idx]?.Results) {
              colSharedVers.push(...(colArtBatch[idx].Results as VersionSummaryRow[]));
            }
          }

          allArtifacts = this.dedupeEntitiesById([...allArtifacts, ...colSharedArts]);
          allVersions = this.dedupeEntitiesById([...allVersions, ...colSharedVers]);
        }
      }
    }

    // Sort artifacts newest first across owned + shared
    allArtifacts.sort((a, b) => {
      const aTime = a.__mj_UpdatedAt ? new Date(a.__mj_UpdatedAt).getTime() : 0;
      const bTime = b.__mj_UpdatedAt ? new Date(b.__mj_UpdatedAt).getTime() : 0;
      return bTime - aTime;
    });

    this.ownedArtifactOffset = ownedArtifacts.length;
    const ownedTotal =
      typeof ownedArtRes?.TotalRowCount === 'number' && ownedArtRes.TotalRowCount >= ownedArtifacts.length
        ? ownedArtRes.TotalRowCount
        : ownedArtifacts.length;
    const loadedSharedDelta = Math.max(0, allArtifacts.length - ownedArtifacts.length);
    const unpagedDirectSharedCount = Math.max(
      0,
      directSharedArtIds.length - firstPageDirectSharedArtIds.length,
    );
    this.LoadedArtifactCount = allArtifacts.length;
    this.TotalArtifactCount = Math.max(
      this.LoadedArtifactCount,
      ownedTotal + loadedSharedDelta + unpagedDirectSharedCount,
    );

    return {
      artifacts: allArtifacts,
      versions: allVersions,
      collections: allCollections,
      collectionLinks,
      artifactPerms,
      collectionPerms,
    };
  }

  /**
   * Builds per-chunk version summary queries (`VersionNumber = 1` + exact single latest version
   * per artifact via `ROW_NUMBER() OVER (PARTITION BY [ArtifactID] ORDER BY [VersionNumber] DESC) = 1`)
   * so an artifact with thousands of historical versions never crowds out other artifacts on the page.
   */
  private buildScopedArtifactVersionQueries(artifactIds: ReadonlyArray<string>): RunViewParams[] {
    const queries: RunViewParams[] = [];
    const verEntity = this.ProviderToUse?.EntityByName?.('MJ: Artifact Versions');
    const schemaName = verEntity?.SchemaName || '__mj';
    const baseView = verEntity?.BaseView || 'vwArtifactVersions';

    for (const chunk of this.chunkIds(artifactIds)) {
      const inList = this.sqlUuidInList(chunk);
      queries.push({
        EntityName: 'MJ: Artifact Versions',
        ExtraFilter: `ArtifactID IN (${inList}) AND VersionNumber = 1`,
        Fields: VERSION_SUMMARY_FIELDS,
        IgnoreMaxRows: true,
        ResultType: 'simple',
      });
      queries.push({
        EntityName: 'MJ: Artifact Versions',
        ExtraFilter:
          `ArtifactID IN (${inList}) AND [ID] IN (` +
          `SELECT [ID] FROM (` +
          `SELECT [ID], ROW_NUMBER() OVER (PARTITION BY [ArtifactID] ORDER BY [VersionNumber] DESC) AS [__rn] ` +
          `FROM [${schemaName}].[${baseView}] ` +
          `WHERE [ArtifactID] IN (${inList})` +
          `) AS [__latest_ver] WHERE [__latest_ver].[__rn] = 1` +
          `)`,
        Fields: VERSION_SUMMARY_FIELDS,
        IgnoreMaxRows: true,
        ResultType: 'simple',
      });
    }
    return queries;
  }

  private chunkIds(ids: ReadonlyArray<string>, chunkSize = 400): string[][] {
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += chunkSize) {
      chunks.push(ids.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private uniqueIds(ids: ReadonlyArray<string | null | undefined>): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of ids) {
      const trimmed = raw?.trim();
      if (!trimmed) continue;
      const norm = NormalizeUUID(trimmed);
      if (!seen.has(norm)) {
        seen.add(norm);
        out.push(trimmed);
      }
    }
    return out;
  }

  private dedupeEntitiesById<T extends { ID: string }>(rows: ReadonlyArray<T>): T[] {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const row of rows) {
      if (!row?.ID) continue;
      const norm = NormalizeUUID(row.ID);
      if (!seen.has(norm)) {
        seen.add(norm);
        out.push(row);
      }
    }
    return out;
  }

  private sqlUuidInList(ids: ReadonlyArray<string>): string {
    return ids.map((id) => `'${EscapeSQLString(id)}'`).join(',');
  }

  public FormatRelativeTime(date: Date): string {
    const diffMs = Date.now() - date.getTime();
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  }

  // ===========================================================================
  // Private View-Model Hydration & State Helpers
  // ===========================================================================

  private async loadConnectedDrives(): Promise<void> {
    try {
      const engine = FileStorageEngineBase.Instance;
      await engine.Config(false);
      const active = engine.AccountsWithProviders.filter((a) => a.provider.IsActive !== false);
      this.ConnectedDrives = active.map((entry) => ({
        AccountId: entry.account.ID,
        AccountName: entry.account.Name,
        Description: entry.account.Description || `${entry.provider.Name} connected storage`,
        ProviderId: entry.provider.ID,
        ProviderName: entry.provider.Name,
        Icon: this.resolveDriveIcon(entry.provider.Name),
        SupportsSearch: entry.provider.SupportsSearch === true,
        AccountWithProvider: entry,
      }));
    } catch {
      this.ConnectedDrives = [];
    }
  }

  private hydrateWorkspaceViewModels(data: {
    user: UserInfo;
    artifactTypes: MJArtifactTypeEntity[];
    artifacts: MJArtifactEntity[];
    versions: VersionSummaryRow[];
    collections: MJCollectionEntity[];
    collectionLinks: CollectionArtifactLinkRow[];
    artifactPerms: ArtifactPermissionSummaryRow[];
    collectionPerms: MJCollectionPermissionEntity[];
  }): void {
    const typeById = new Map<string, MJArtifactTypeEntity>();
    for (const t of data.artifactTypes) {
      typeById.set(NormalizeUUID(t.ID), t);
    }

    // Index collection permissions for current user
    this.collectionPermByColId.clear();
    const rawColPermById = new Map<string, MJCollectionPermissionEntity>();
    for (const cp of data.collectionPerms) {
      const normCol = NormalizeUUID(cp.CollectionID);
      rawColPermById.set(normCol, cp);
      this.collectionPermByColId.set(normCol, {
        id: cp.ID,
        collectionId: cp.CollectionID,
        userId: cp.UserID,
        userName: cp.User || '',
        canRead: cp.CanRead,
        canShare: cp.CanShare,
        canEdit: cp.CanEdit,
        canDelete: cp.CanDelete,
        sharedByUserId: cp.SharedByUserID,
        sharedByUserName: null,
        sharedAt: cp.__mj_CreatedAt,
      });
    }

    // Filter readable collections
    const readableCollections = data.collections.filter((col) => {
      if (!col.OwnerID || UUIDsEqual(col.OwnerID, data.user.ID)) return true;
      const perm = rawColPermById.get(NormalizeUUID(col.ID));
      return perm?.CanRead === true;
    });

    const readableColById = new Map<string, MJCollectionEntity>();
    for (const col of readableCollections) {
      readableColById.set(NormalizeUUID(col.ID), col);
    }

    // Map versions by ArtifactID & VersionID -> ArtifactID
    const versionsByArtifact = new Map<string, VersionSummaryRow[]>();
    const artifactIdByVersionId = new Map<string, string>();
    for (const v of data.versions) {
      const normArt = NormalizeUUID(v.ArtifactID);
      artifactIdByVersionId.set(NormalizeUUID(v.ID), normArt);
      const arr = versionsByArtifact.get(normArt) ?? [];
      arr.push(v);
      versionsByArtifact.set(normArt, arr);
    }

    // Map collection links
    this.collectionLinksByCollectionAndVersion.clear();
    const collectionsForArtifact = new Map<string, Set<string>>();
    const directArtifactsPerCollection = new Map<string, Set<string>>();

    for (const link of data.collectionLinks) {
      const normCol = NormalizeUUID(link.CollectionID);
      const normVer = NormalizeUUID(link.ArtifactVersionID);
      this.collectionLinksByCollectionAndVersion.set(`${normCol}:${normVer}`, link.ID);

      if (!readableColById.has(normCol)) continue;
      const normArt = artifactIdByVersionId.get(normVer);
      if (!normArt) continue;

      const cols = collectionsForArtifact.get(normArt) ?? new Set<string>();
      cols.add(normCol);
      collectionsForArtifact.set(normArt, cols);

      const arts = directArtifactsPerCollection.get(normCol) ?? new Set<string>();
      arts.add(normArt);
      directArtifactsPerCollection.set(normCol, arts);
    }

    // Direct artifact permissions
    const artPermByArtId = new Map<string, ArtifactPermissionSummaryRow>();
    for (const ap of data.artifactPerms) {
      artPermByArtId.set(NormalizeUUID(ap.ArtifactID), ap);
    }

    // Build LibraryItemSummary list
    const items: LibraryItemSummary[] = [];
    for (const art of data.artifacts) {
      const normArt = NormalizeUUID(art.ID);
      const isOwner = UUIDsEqual(art.UserID, data.user.ID);
      const directPerm = artPermByArtId.get(normArt);
      const linkedColNormIds = Array.from(collectionsForArtifact.get(normArt) ?? []);

      let colCanRead = false;
      let colCanEdit = false;
      let colCanShare = false;
      let colCanDelete = false;
      for (const cid of linkedColNormIds) {
        const colEntity = readableColById.get(cid);
        if (colEntity && UUIDsEqual(colEntity.OwnerID, data.user.ID)) {
          colCanRead = true;
          colCanEdit = true;
          colCanShare = true;
          colCanDelete = true;
        }
        const cp = rawColPermById.get(cid);
        if (cp?.CanRead) colCanRead = true;
        if (cp?.CanEdit) colCanEdit = true;
        if (cp?.CanShare) colCanShare = true;
        if (cp?.CanDelete) colCanDelete = true;
      }

      const canRead = isOwner || directPerm?.CanRead === true || colCanRead;
      if (!canRead) continue;

      const typeEntity = typeById.get(NormalizeUUID(art.TypeID));
      const versions = versionsByArtifact.get(normArt) ?? [];
      versions.sort((a, b) => b.VersionNumber - a.VersionNumber);
      const latest = versions[0] ?? null;

      const driverClass = typeEntity?.DriverClass ?? '';
      const typeName = art.Type || typeEntity?.Name || 'Artifact';
      const categoryInfo = this.classifyArtifactCategory(driverClass, typeName, latest?.ContentMode ?? 'Text');

      const colEntities = linkedColNormIds
        .map((cid) => readableColById.get(cid))
        .filter((c): c is MJCollectionEntity => !!c);

      items.push({
        Id: art.ID,
        Name: art.Name,
        Description: art.Description || latest?.Description || '',
        TypeId: art.TypeID,
        TypeName: typeName,
        DriverClass: driverClass,
        Icon: this.iconService.GetArtifactIcon(art),
        Category: categoryInfo.Category,
        CategoryBadge: categoryInfo.Badge,
        LatestVersionId: latest?.ID ?? null,
        LatestVersionNumber: latest?.VersionNumber ?? 1,
        VersionCount: Math.max(latest?.VersionNumber ?? 1, versions.length, 1),
        ContentMode: latest?.ContentMode ?? 'Text',
        MimeType: latest?.MimeType ?? typeEntity?.ContentType ?? null,
        FileName: latest?.FileName ?? null,
        ContentSnippet: art.Description || latest?.Description || typeEntity?.Description || '',
        UpdatedAt: art.__mj_UpdatedAt instanceof Date ? art.__mj_UpdatedAt : new Date(art.__mj_UpdatedAt),
        OwnerUserId: art.UserID,
        OwnerName: art.User || (isOwner ? 'You' : 'Shared'),
        IsOwnedByCurrentUser: isOwner,
        IsSharedWithMe: !isOwner,
        IsStarred: this.StarredArtifactIds.has(normArt),
        CanEdit: isOwner || directPerm?.CanEdit === true || colCanEdit,
        CanShare: isOwner || directPerm?.CanShare === true || colCanShare,
        CanDelete: isOwner || directPerm?.CanDelete === true || colCanDelete,
        CollectionIds: colEntities.map((c) => c.ID),
        CollectionNames: colEntities.map((c) => c.Name),
        ArtifactEntity: art,
      });
    }

    this.AllItems = items;

    // Build Collection tree
    const nodesByNormId = new Map<string, LibraryCollectionNode>();
    for (const col of readableCollections) {
      const normCol = NormalizeUUID(col.ID);
      const isColOwner = !col.OwnerID || UUIDsEqual(col.OwnerID, data.user.ID);
      const cp = rawColPermById.get(normCol);
      const directCount = directArtifactsPerCollection.get(normCol)?.size ?? 0;

      nodesByNormId.set(normCol, {
        Id: col.ID,
        Name: col.Name,
        Description: col.Description || '',
        Icon: col.Icon || 'fa-solid fa-folder',
        Color: col.Color || 'var(--mj-brand-primary)',
        ParentId: col.ParentID || null,
        OwnerId: col.OwnerID || null,
        OwnerName: col.Owner || (isColOwner ? 'You' : 'Shared'),
        DirectItemCount: directCount,
        TotalItemCount: directCount,
        CanEdit: isColOwner || cp?.CanEdit === true,
        CanShare: isColOwner || cp?.CanShare === true,
        CanDelete: isColOwner || cp?.CanDelete === true,
        Children: [],
        Entity: col,
      });
    }

    const roots: LibraryCollectionNode[] = [];
    for (const node of nodesByNormId.values()) {
      if (node.ParentId) {
        const parent = nodesByNormId.get(NormalizeUUID(node.ParentId));
        if (parent) {
          parent.Children.push(node);
          continue;
        }
      }
      roots.push(node);
    }

    const computeTotalItems = (n: LibraryCollectionNode): number => {
      let sum = n.DirectItemCount;
      for (const child of n.Children) {
        sum += computeTotalItems(child);
      }
      n.TotalItemCount = sum;
      return sum;
    };
    for (const r of roots) {
      computeTotalItems(r);
    }

    this.CollectionTree = roots;
    this.FlatCollections = Array.from(nodesByNormId.values());

    if (this.SelectedCollectionId) {
      this.expandAncestorsOf(this.SelectedCollectionId);
    }
  }

  private classifyArtifactCategory(
    driverClass: string,
    typeName: string,
    contentMode: MJArtifactVersionEntity['ContentMode'],
  ): { Category: Exclude<LibraryCategoryFilter, 'all'>; Badge: string } {
    const lowerName = typeName.toLowerCase();
    if (driverClass === 'MarkdownArtifactViewerPlugin' || lowerName.includes('markdown')) {
      return { Category: 'documents', Badge: 'MJ Doc' };
    }
    if (driverClass === 'SpreadsheetArtifactViewerPlugin' || lowerName.includes('spreadsheet') || lowerName === 'csv') {
      return { Category: 'spreadsheets', Badge: 'MJ Sheet' };
    }
    if (driverClass === 'SlideDeckArtifactViewerPlugin' || lowerName.includes('presentation')) {
      return { Category: 'presentations', Badge: 'MJ Slides' };
    }
    if (
      driverClass === 'ComponentArtifactViewerPlugin' ||
      driverClass === 'WhiteboardArtifactViewerPlugin' ||
      driverClass === 'HtmlArtifactViewerPlugin'
    ) {
      return {
        Category: 'interactive',
        Badge: lowerName.includes('whiteboard') ? 'Whiteboard' : 'Interactive',
      };
    }
    if (lowerName === 'sql' || driverClass === 'DataArtifactViewerPlugin') {
      return { Category: 'queries', Badge: lowerName === 'sql' ? 'SQL Query' : 'Data' };
    }
    if (contentMode === 'File' || driverClass.includes('Pdf') || driverClass.includes('Docx') || driverClass.includes('Image') || driverClass.includes('Video') || driverClass.includes('Audio')) {
      return { Category: 'files', Badge: typeName };
    }
    return { Category: 'documents', Badge: typeName };
  }

  private resolveDriveIcon(providerName: string): string {
    const lower = providerName.toLowerCase();
    if (lower.includes('google drive')) return 'fa-brands fa-google-drive';
    if (lower.includes('sharepoint') || lower.includes('onedrive') || lower.includes('azure')) return 'fa-brands fa-microsoft';
    if (lower.includes('aws') || lower.includes('s3')) return 'fa-brands fa-aws';
    if (lower.includes('dropbox')) return 'fa-brands fa-dropbox';
    if (lower.includes('box')) return 'fa-solid fa-box';
    return 'fa-solid fa-cloud';
  }

  private expandAncestorsOf(collectionId: string): void {
    const flatById = IndexByUUID(this.FlatCollections, (c) => c.Id);
    let cur = flatById.Get(collectionId) ?? null;
    const guard = new Set<string>();
    while (cur && !guard.has(cur.Id)) {
      guard.add(cur.Id);
      if (cur.ParentId) {
        this.ExpandedCollectionIds.add(NormalizeUUID(cur.ParentId));
        cur = flatById.Get(cur.ParentId) ?? null;
      } else {
        cur = null;
      }
    }
  }

  private applyRouteParamsInternal(params: LibraryExternalRouteParams): void {
    const fallbackMode: LibrarySurfaceMode = this.InitialDriveMode
      ? 'hub'
      : (this.InitialMode ?? this.preferredSurfaceMode ?? 'hub');
    const fallbackHubTab: LibraryHubTab = this.InitialDriveMode
      ? 'drives'
      : (this.InitialHubTab ?? 'overview');
    const fallbackSection: LibraryNavigatorSection = this.InitialSection ?? 'all';

    if (params.mode === 'hub' || params.mode === 'navigator') {
      this.SurfaceMode = params.mode;
    } else {
      this.SurfaceMode = fallbackMode;
    }

    if (params.tab && ['overview', 'collections', 'all', 'shared', 'drives'].includes(params.tab)) {
      this.HubTab = params.tab as LibraryHubTab;
    } else {
      this.HubTab = fallbackHubTab;
    }

    if (
      params.section &&
      ['all', 'collections', 'shared', 'starred', 'collection', 'drive'].includes(params.section)
    ) {
      this.NavigatorSection = params.section as LibraryNavigatorSection;
    } else {
      this.NavigatorSection = fallbackSection;
    }

    if (params.collectionId) {
      this.SelectedCollectionId = params.collectionId;
      this.SurfaceMode = 'navigator';
      this.NavigatorSection = 'collection';
      this.expandAncestorsOf(params.collectionId);
    } else {
      this.SelectedCollectionId = null;
    }

    if (params.driveId) {
      this.SelectedDriveId = params.driveId;
      this.DriveFolderPrefix = params.folder ?? '';
      if (this.SurfaceMode === 'hub') {
        this.HubTab = 'drives';
      } else {
        this.NavigatorSection = 'drive';
      }
    } else {
      this.SelectedDriveId = null;
      this.DriveFolderPrefix = '';
    }

    this.SearchQuery = params.q ?? '';

    if (params.artifactId) {
      this.ActiveArtifactId = params.artifactId;
      const parsedVer = params.version ? Number(params.version) : undefined;
      this.ActiveVersionNumber = parsedVer && Number.isFinite(parsedVer) ? parsedVer : undefined;
      this.IsFullCanvasOpen =
        params.canvas === '1' || params.canvas === 'true' || params.canvas === true || this.SurfaceMode === 'hub';
    } else {
      this.ActiveArtifactId = null;
      this.ActiveVersionNumber = undefined;
      this.IsFullCanvasOpen = false;
    }
  }

  private restoreUserPreferences(): void {
    try {
      const mode = UserInfoEngine.Instance.GetSetting(SETTING_SURFACE_MODE);
      if (mode === 'hub' || mode === 'navigator') {
        this.SurfaceMode = mode;
        this.preferredSurfaceMode = mode;
      }
      const listStyle = UserInfoEngine.Instance.GetSetting(SETTING_LIST_STYLE);
      if (listStyle === 'cards' || listStyle === 'list') {
        this.ListStyle = listStyle;
      }
      const starredRaw = UserInfoEngine.Instance.GetSetting(SETTING_STARRED_IDS);
      if (starredRaw) {
        const parsed = JSON.parse(starredRaw) as string[];
        if (Array.isArray(parsed)) {
          this.StarredArtifactIds = new Set(parsed.map((id) => NormalizeUUID(id)));
        }
      }
    } catch {
      // Safe defaults on uninitialized UserInfoEngine in isolated unit tests
    }
  }

  private saveSettingSafe(key: string, value: string): void {
    try {
      UserInfoEngine.Instance.SetSettingDebounced(key, value);
    } catch {
      // No-op in isolated test environments without UserInfoEngine bootstrap
    }
  }

  private emitWorkspaceState(): void {
    const activeItem = this.ActiveItem;
    const selectedCol = this.SelectedCollectionNode;
    const selectedDrive = this.SelectedDrive;

    const snapshot: LibraryWorkspaceState = {
      Mode: this.SurfaceMode,
      HubTab: this.HubTab,
      NavigatorSection: this.NavigatorSection,
      CollectionId: this.SelectedCollectionId,
      CollectionName: selectedCol?.Name ?? null,
      DriveId: this.SelectedDriveId,
      DriveName: selectedDrive?.AccountName ?? null,
      DriveFolderPrefix: this.DriveFolderPrefix,
      ActiveArtifactId: this.ActiveArtifactId,
      ActiveArtifactName: activeItem?.Name ?? null,
      ActiveVersionNumber: this.ActiveVersionNumber ?? activeItem?.LatestVersionNumber ?? null,
      IsFullCanvasOpen: this.IsFullCanvasOpen,
      SearchQuery: this.SearchQuery,
      CategoryFilter: this.CategoryFilter,
      OwnershipFilter: this.OwnershipFilter,
      VisibleItems: this.FilteredItems.slice(0, 25).map((i) => ({
        Id: i.Id,
        Name: i.Name,
        TypeName: i.TypeName,
        Category: i.Category,
        VersionNumber: i.LatestVersionNumber,
        UpdatedAtIso: i.UpdatedAt.toISOString(),
      })),
      Collections: this.FlatCollections.slice(0, 25).map((c) => ({
        Id: c.Id,
        Name: c.Name,
        ParentId: c.ParentId,
        ItemCount: c.TotalItemCount,
      })),
      ConnectedDrives: this.ConnectedDrives.slice(0, 25).map((d) => ({
        AccountId: d.AccountId,
        AccountName: d.AccountName,
        ProviderName: d.ProviderName,
      })),
    };
    this.StateChange.emit(snapshot);
  }
}
