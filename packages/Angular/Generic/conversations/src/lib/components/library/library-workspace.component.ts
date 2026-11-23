import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
  inject,
} from '@angular/core';
import { Subject } from 'rxjs';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { CompositeKey, IRunViewProvider, LogError, RunView, RunViewParams, UserInfo } from '@memberjunction/core';
import {
  ArtifactMetadataEngine,
  ArtifactPermissionEngine,
  CONVERSATIONS_RESOURCE_TYPE_ID,
  FileStorageEngineBase,
  MJArtifactEntity,
  MJArtifactPermissionEntity,
  MJArtifactTypeEntity,
  MJArtifactVersionEntity,
  MJCollectionArtifactEntity,
  MJCollectionEntity,
  MJCollectionPermissionEntity,
  MJConversationEntity,
  MJEnvironmentEntityExtended,
  MJResourcePermissionEntity,
  ParseArtifactVersionConfiguration,
  ResolveArtifactTypeThumbnailPolicy,
  UserInfoEngine,
} from '@memberjunction/core-entities';
import { EscapeSQLString, IndexByUUID, NormalizeUUID, UUIDSet, UUIDsEqual } from '@memberjunction/global';
import { GraphQLDataProvider, GraphQLFileStorageClient } from '@memberjunction/graphql-dataprovider';
import {
  ArtifactIconService,
  ArtifactViewerPanelComponent,
  type ArtifactVersionSavedEvent,
} from '@memberjunction/ng-artifacts';
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
  LibraryCreationService,
  LibraryStarterKind,
  RemoteDriveConflictError,
  SynthesizeArtifactFromSourcesResult,
} from '../../services/library-creation.service';
import { LibraryCreateDialogTab } from './library-create-dialog.component';
import {
  LibraryBreadcrumbSegment,
  LibraryCategoryFilter,
  LibraryCollectionNode,
  LibraryDriveSummary,
  LibraryHostNavigationEvent,
  LibraryHubTab,
  LibraryItemSummary,
  LibraryListStyle,
  LibraryNavigatorSection,
  LibraryOwnershipFilter,
  LibrarySharedEntry,
  LibrarySharedPermissionLevel,
  LibrarySurfaceMode,
  LibraryUnifiedLayout,
  LibraryUnifiedScope,
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
  Configuration?: string | null;
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
  | 'ID'
  | 'ArtifactID'
  | 'UserID'
  | 'User'
  | 'SharedByUserID'
  | 'SharedByUser'
  | 'CanRead'
  | 'CanEdit'
  | 'CanShare'
  | 'CanDelete'
  | '__mj_CreatedAt'
>;

interface ConversationShareSummaryRow {
  ID: string;
  ResourceRecordID: string;
  Type: MJResourcePermissionEntity['Type'];
  RoleID: string | null;
  UserID: string | null;
  PermissionLevel: MJResourcePermissionEntity['PermissionLevel'];
  SharedByUserID: string | null;
  SharedByUser: string | null;
  User: string | null;
  Role: string | null;
  __mj_CreatedAt: Date | string;
}

interface SharedConversationRow {
  ID: string;
  Name: string | null;
  Description: string | null;
  UserID: string | null;
  User: string | null;
  ParentID: string | null;
  __mj_UpdatedAt: Date | string;
}

interface EnvironmentScopedArtifactIdRow {
  ID: string;
  EnvironmentID?: string | null;
  UserID?: string | null;
}

interface ScopedWorkspaceRecords {
  artifacts: MJArtifactEntity[];
  versions: VersionSummaryRow[];
  collections: MJCollectionEntity[];
  collectionLinks: CollectionArtifactLinkRow[];
  artifactPerms: ArtifactPermissionSummaryRow[];
  collectionPerms: MJCollectionPermissionEntity[];
}

interface InitialScopedWorkspaceLoadResult {
  scoped: ScopedWorkspaceRecords;
  ownedTotal: number;
  ownedArtNormIds: Set<string>;
  checkedDirectSharedNormIds: Set<string>;
  remainingPermOffsets: number[];
}

const PERMISSION_PAGE_BATCH_SIZE = 4;

const SETTING_SURFACE_MODE = 'Library.SurfaceMode';
const SETTING_LIST_STYLE = 'Library.ListStyle';
const SETTING_STARRED_IDS = 'Library.StarredArtifactIDs';
const SETTING_LEFT_RAIL_COLLAPSED = 'MJ.Library.LeftRailCollapsed';
const SETTING_ITEM_VIEW_MODE = 'MJ.Library.ItemViewMode';
const SETTING_SHOW_CARD_THUMBNAILS = 'Library/ShowCardThumbnails';

const VERSION_SUMMARY_FIELDS: string[] = [
  'ID',
  'ArtifactID',
  'VersionNumber',
  'Name',
  'Description',
  'ContentMode',
  'MimeType',
  'FileName',
  'Configuration',
  '__mj_UpdatedAt',
];

const ARTIFACT_PERMISSION_SUMMARY_FIELDS: string[] = [
  'ID',
  'ArtifactID',
  'UserID',
  'User',
  'SharedByUserID',
  'SharedByUser',
  'CanRead',
  'CanEdit',
  'CanShare',
  'CanDelete',
  '__mj_CreatedAt',
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
  public PreferredItemViewMode: 'split' | 'full' = 'split';
  public ShowCardThumbnails = true;

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
  @Input() public ArtifactPageSize = 200;
  public IsLoading = true;
  public IsLoadingMore = false;
  public IsStreamingSharedPermissions = false;
  public LoadError: string | null = null;
  public LoadMoreError: string | null = null;
  public LoadedArtifactCount = 0;
  public TotalArtifactCount = 0;
  public AllItems: LibraryItemSummary[] = [];
  public SharedWithMeEntries: LibrarySharedEntry[] = [];
  public SharedByMeEntries: LibrarySharedEntry[] = [];
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
  public DefaultSynthesisArtifactIds: string[] = [];

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

  @ViewChild('fullCanvasViewerPanel') public FullCanvasViewerPanel?: ArtifactViewerPanelComponent;
  @ViewChild('splitViewerPanel') public SplitViewerPanel?: ArtifactViewerPanelComponent;

  // Frozen-only External Guest Share Link state (§6.3)
  public IsDriveSyncing = false;

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
  private collectionLinksByCollectionAndArtifact = new Map<string, string[]>();
  private engineReadableArtifactIds = new Set<string>();
  private offPageActiveItem: LibraryItemSummary | null = null;
  private offPageArtifactRequestSeq = 0;
  private pendingExternalParams: LibraryExternalRouteParams | null = null;
  private preferredSurfaceMode: LibrarySurfaceMode = 'hub';
  private ownedArtifactOffset = 0;
  private directSharedArtifactOffset = 0;
  private allDirectSharedArtIds: string[] = [];
  private cachedWorkspaceRecords: ScopedWorkspaceRecords | null = null;
  private reloadGeneration = 0;
  private isDestroyed = false;

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly iconService = inject(ArtifactIconService);
  private readonly notifications = inject(MJNotificationService);
  private readonly confirmService = inject(MJConfirmService);
  private readonly creationService = inject(LibraryCreationService);

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
    queueMicrotask(() => {
      if (!this.isDestroyed) {
        void this.ReloadWorkspaceData();
      }
    });
  }

  public ngOnDestroy(): void {
    this.isDestroyed = true;
    this.reloadGeneration = this.reloadGeneration + 1;
    this.IsLoadingMore = false;
    this.IsStreamingSharedPermissions = false;
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

  public get IsLoadingMoreArtifacts(): boolean {
    return this.IsLoadingMore;
  }

  public get CanLoadMore(): boolean {
    return this.HasMoreArtifacts && !this.IsLoading && !this.IsLoadingMore;
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
        key: 'shared-by-me',
        label: 'Shared by Me',
        icon: 'fa-solid fa-paper-plane',
        badge: this.SharedByMeCount || null,
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
    const entries = this.SharedWithMeEntries ?? [];
    return entries.length > 0
      ? entries.length
      : (this.AllItems ?? []).filter((i) => i.IsSharedWithMe).length;
  }

  public get SharedByMeCount(): number {
    return (this.SharedByMeEntries ?? []).length;
  }

  public get FilteredSharedWithMeEntries(): LibrarySharedEntry[] {
    return this.filterSharedEntries(this.SharedWithMeEntries ?? []);
  }

  public get FilteredSharedByMeEntries(): LibrarySharedEntry[] {
    return this.filterSharedEntries(this.SharedByMeEntries ?? []);
  }

  public get ActiveSharedEntries(): LibrarySharedEntry[] {
    return this.UnifiedScope === 'shared-by-me'
      ? this.FilteredSharedByMeEntries
      : this.FilteredSharedWithMeEntries;
  }

  public get StarredCount(): number {
    return this.AllItems.filter((i) => i.IsStarred).length;
  }

  public get ContinueWorkingItems(): LibraryItemSummary[] {
    return this.FilteredItems;
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
    const loaded = this.AllItems.find((i) => UUIDsEqual(i.Id, this.ActiveArtifactId)) ?? null;
    if (loaded) return loaded;
    if (this.offPageActiveItem && UUIDsEqual(this.offPageActiveItem.Id, this.ActiveArtifactId)) {
      return this.offPageActiveItem;
    }
    return null;
  }

  public get UnifiedScope(): LibraryUnifiedScope {
    if (
      this.SelectedDriveId ||
      (this.SurfaceMode === 'hub' && this.HubTab === 'drives') ||
      (this.SurfaceMode === 'navigator' && this.NavigatorSection === 'drive')
    ) {
      return 'drive';
    }
    if (this.SelectedCollectionId) {
      return 'collection';
    }
    if (this.SurfaceMode === 'navigator') {
      if (this.NavigatorSection === 'shared') return 'shared';
      if (this.NavigatorSection === 'shared-by-me') return 'shared-by-me';
      if (this.NavigatorSection === 'starred') return 'starred';
      return 'home';
    }
    if (this.HubTab === 'shared') return 'shared';
    if (this.HubTab === 'shared-by-me') return 'shared-by-me';
    return 'home';
  }

  public get UnifiedLayout(): LibraryUnifiedLayout {
    if (this.SurfaceMode === 'navigator') return 'split';
    return this.ListStyle === 'list' ? 'list' : 'grid';
  }

  public get LibraryBreadcrumbs(): LibraryBreadcrumbSegment[] {
    const segments: LibraryBreadcrumbSegment[] = [{ Label: 'Library', Scope: 'home' }];
    const scope = this.UnifiedScope;
    if (scope === 'all') {
      segments.push({ Label: 'All Items', Scope: 'all' });
    } else if (scope === 'shared') {
      segments.push({ Label: 'Shared with Me', Scope: 'shared' });
    } else if (scope === 'shared-by-me') {
      segments.push({ Label: 'Shared by Me', Scope: 'shared-by-me' });
    } else if (scope === 'starred') {
      segments.push({ Label: 'Starred', Scope: 'starred' });
    } else if (scope === 'collection') {
      segments.push({ Label: 'Collections', Scope: 'home' });
      for (const anc of this.SelectedCollectionAncestors) {
        segments.push({ Label: anc.Name, Scope: 'collection', CollectionId: anc.Id });
      }
    } else if (scope === 'drive') {
      segments.push({
        Label: this.SelectedDrive?.AccountName || 'Connected Drives',
        Scope: 'drive',
      });
    }
    return segments;
  }

  public get CurrentScopeLabel(): string {
    const scope = this.UnifiedScope;
    if (scope === 'collection' && this.SelectedCollectionNode) {
      return this.SelectedCollectionNode.Name;
    }
    if (scope === 'drive') {
      return this.SelectedDrive?.AccountName || 'Connected Drives';
    }
    if (scope === 'shared') return 'Shared with Me';
    if (scope === 'shared-by-me') return 'Shared by Me';
    if (scope === 'starred') return 'Starred Items';
    if (scope === 'all') return 'All Items';
    return 'Library Home';
  }

  public get CurrentScopeSubtitle(): string {
    const scope = this.UnifiedScope;
    if (scope === 'collection' && this.SelectedCollectionNode) {
      return this.SelectedCollectionNode.Description || 'Collection items and nested folders';
    }
    if (scope === 'drive' && this.SelectedDrive) {
      return `${this.SelectedDrive.ProviderName} · Dynamic remote browsing`;
    }
    if (scope === 'shared') {
      return 'Conversations, side threads, and artifacts shared with you';
    }
    if (scope === 'shared-by-me') {
      return 'Conversations and artifacts you have shared with teammates';
    }
    if (scope === 'starred') {
      return 'Pinned items for instant access';
    }
    if (scope === 'all') {
      return 'All native documents, spreadsheets, presentations, components, queries, and files';
    }
    return 'Your documents, spreadsheets, presentations, and collections in one unified workspace';
  }

  public get SubCollectionsOfSelected(): LibraryCollectionNode[] {
    if (!this.SelectedCollectionId) return [];
    return this.SelectedCollectionNode?.Children ?? [];
  }

  public get FilteredItems(): LibraryItemSummary[] {
    let items = this.AllItems;

    // Scope by unified scope (preserved across Grid / List / Split layouts)
    const scope = this.UnifiedScope;
    if (scope === 'shared') {
      items = items.filter((i) => i.IsSharedWithMe);
    } else if (scope === 'starred') {
      items = items.filter((i) => i.IsStarred);
    } else if (scope === 'collection' && this.SelectedCollectionId) {
      const targetId = NormalizeUUID(this.SelectedCollectionId);
      items = items.filter((i) => i.CollectionIds.some((cid) => NormalizeUUID(cid) === targetId));
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
    if (this.NavigatorSection === 'shared-by-me') return 'Shared by Me';
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
    if (this.NavigatorSection === 'shared-by-me') {
      return 'Conversations and artifacts you have shared with teammates';
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
    if (mode === 'hub') {
      this.ActiveArtifactId = null;
      this.ActiveVersionNumber = undefined;
    }
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
    const valid: LibraryHubTab[] = ['overview', 'collections', 'all', 'shared', 'shared-by-me', 'drives'];
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

  public SelectNavigatorView(section: 'all' | 'collections' | 'shared' | 'shared-by-me' | 'starred'): void {
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
    this.NavigatorSection = 'collection';
    this.SelectedCollectionId = collectionId;
    this.SelectedDriveId = null;
    this.DriveFolderPrefix = '';
    this.IsFullCanvasOpen = false;
    this.expandAncestorsOf(collectionId);
    void this.resolveSelectedCollectionAncestryPermissions(collectionId);
    this.emitWorkspaceState();
    this.cdr.detectChanges();
  }

  public SetUnifiedScope(scope: LibraryUnifiedScope, collectionId?: string | null): void {
    this.IsFullCanvasOpen = false;
    if (this.UnifiedLayout !== 'split') {
      this.ActiveArtifactId = null;
      this.ActiveVersionNumber = undefined;
      this.offPageActiveItem = null;
    }
    if (scope === 'collection') {
      const targetId = collectionId ?? this.SelectedCollectionId;
      if (!targetId) {
        this.SetUnifiedScope('home');
        return;
      }
      this.NavigatorSection = 'collection';
      this.SelectedCollectionId = targetId;
      this.SelectedDriveId = null;
      this.DriveFolderPrefix = '';
      this.expandAncestorsOf(targetId);
      void this.resolveSelectedCollectionAncestryPermissions(targetId);
    } else if (scope === 'drive') {
      this.HubTab = 'drives';
      this.NavigatorSection = 'drive';
      this.SelectedCollectionId = null;
      if (!this.SelectedDriveId && this.ConnectedDrives.length > 0) {
        this.SelectedDriveId = this.ConnectedDrives[0].AccountId;
      }
    } else {
      this.SelectedCollectionId = null;
      this.SelectedDriveId = null;
      this.DriveFolderPrefix = '';
      if (scope === 'shared') {
        this.HubTab = 'shared';
        this.NavigatorSection = 'shared';
      } else if (scope === 'shared-by-me') {
        this.HubTab = 'shared-by-me';
        this.NavigatorSection = 'shared-by-me';
      } else if (scope === 'starred') {
        this.HubTab = 'all';
        this.NavigatorSection = 'starred';
      } else if (scope === 'all') {
        this.HubTab = 'all';
        this.NavigatorSection = 'all';
      } else {
        this.HubTab = 'overview';
        this.NavigatorSection = 'all';
      }
    }
    this.emitWorkspaceState();
    this.cdr.detectChanges();
  }

  /** Opens a shared conversation (or `ParentID` side thread) or shared artifact from the Library sharing view. */
  public OpenSharedEntry(entry: LibrarySharedEntry, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    if (entry.ItemKind === 'conversation') {
      this.HostNavigate.emit({
        Kind: 'conversation',
        ConversationId: entry.ResourceId,
      });
      return;
    }
    this.OpenArtifactStudio(entry.ResourceId);
  }

  /**
   * Revokes a permission record granted by the current user (`Shared by Me` view) and immediately
   * removes the revoked entry from the view. Conversation shares enforce owner-only revocation.
   */
  public async RevokeSharedEntry(entry: LibrarySharedEntry, event?: Event): Promise<boolean> {
    if (event) {
      event.stopPropagation();
    }
    if (!entry.CanRevoke || !entry.PermissionRecordId || entry.IsRevoking) {
      return false;
    }

    const user = this.EffectiveUser;
    const md = this.ProviderToUse;
    entry.IsRevoking = true;
    this.notifyViewCheck();

    try {
      const entityName =
        entry.ItemKind === 'conversation' ? 'MJ: Resource Permissions' : 'MJ: Artifact Permissions';
      const perm = await md.GetEntityObject<MJResourcePermissionEntity | MJArtifactPermissionEntity>(
        entityName,
        user,
      );
      const loaded = await perm.Load(entry.PermissionRecordId);
      if (!loaded) {
        this.SharedByMeEntries = this.SharedByMeEntries.filter((e) => e.Id !== entry.Id);
        this.notifications.CreateSimpleNotification(
          'Share record was already removed or cannot be accessed.',
          'info',
          3500,
        );
        return false;
      }

      const deleted = await perm.Delete();
      if (!deleted) {
        const msg =
          perm.LatestResult?.CompleteMessage ||
          perm.LatestResult?.Message ||
          `Failed to revoke access for "${entry.Title}".`;
        this.notifications.CreateSimpleNotification(msg, 'error', 4000);
        return false;
      }

      this.SharedByMeEntries = this.SharedByMeEntries.filter((e) => e.Id !== entry.Id);
      this.notifications.CreateSimpleNotification(
        `Revoked ${entry.RecipientName}'s access to "${entry.Title}".`,
        'success',
        3000,
      );
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to revoke share permission.';
      this.notifications.CreateSimpleNotification(msg, 'error', 4000);
      return false;
    } finally {
      entry.IsRevoking = false;
      this.emitWorkspaceState();
      this.notifyViewCheck();
    }
  }

  /** Formats a share grant date concisely for `Shared with Me` and `Shared by Me` rows/cards. */
  public FormatShareDate(value: Date | string | null | undefined): string {
    if (!value) return 'Unknown date';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown date';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  private filterSharedEntries(entries: LibrarySharedEntry[]): LibrarySharedEntry[] {
    const q = this.SearchQuery.trim().toLowerCase();
    return entries.filter((entry) => {
      if (this.CategoryFilter !== 'all' && entry.ItemKind === 'conversation') {
        return false;
      }
      if (!q) return true;
      const itemLabel = entry.ItemKind === 'conversation' ? 'conversation' : 'artifact';
      return (
        entry.Title.toLowerCase().includes(q) ||
        entry.Description.toLowerCase().includes(q) ||
        entry.SharerName.toLowerCase().includes(q) ||
        entry.RecipientName.toLowerCase().includes(q) ||
        entry.PermissionLevel.toLowerCase().includes(q) ||
        itemLabel.includes(q)
      );
    });
  }

  public SetUnifiedLayout(layout: LibraryUnifiedLayout): void {
    this.IsFullCanvasOpen = false;
    if (layout === 'split') {
      this.ListStyle = 'cards';
      if (!this.ActiveArtifactId && this.FilteredItems.length > 0 && this.UnifiedScope !== 'drive') {
        this.ActiveArtifactId = this.FilteredItems[0].Id;
        this.ActiveVersionNumber = undefined;
      }
      this.PreferredItemViewMode = 'split';
      this.saveSettingSafe(SETTING_ITEM_VIEW_MODE, 'split');
      this.SwitchSurfaceMode('navigator', true);
      return;
    }
    this.ActiveArtifactId = null;
    this.ActiveVersionNumber = undefined;
    const nextListStyle: LibraryListStyle = layout === 'list' ? 'list' : 'cards';
    this.ListStyle = nextListStyle;
    this.saveSettingSafe(SETTING_LIST_STYLE, nextListStyle);
    this.SwitchSurfaceMode('hub', true);
  }

  public ToggleLeftRail(): void {
    this.LeftRailCollapsed = !this.LeftRailCollapsed;
    this.saveSettingSafe(SETTING_LEFT_RAIL_COLLAPSED, this.LeftRailCollapsed ? '1' : '0');
    this.cdr.detectChanges();
  }

  public OpenConnectedDrive(accountId: string, folderPrefix = ''): void {
    this.SelectedDriveId = accountId;
    this.DriveFolderPrefix = folderPrefix;
    this.SelectedCollectionId = null;
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
    this.offPageActiveItem = null;

    const openInFullCanvas = options?.forceNavigatorSplit
      ? false
      : options?.fullCanvas !== undefined
        ? options.fullCanvas
        : this.PreferredItemViewMode === 'full';

    if (openInFullCanvas) {
      this.FullCanvasOriginMode = this.SurfaceMode;
      this.IsFullCanvasOpen = true;
    } else {
      this.IsFullCanvasOpen = false;
      this.SurfaceMode = 'navigator';
      if (this.NavigatorSection === 'drive') {
        this.NavigatorSection = 'all';
        this.SelectedDriveId = null;
      }
    }

    if (!this.AllItems.some((i) => UUIDsEqual(i.Id, artifactId))) {
      void this.hydrateActiveArtifactIfMissing(artifactId);
    }

    this.emitWorkspaceState();
    this.cdr.detectChanges();
  }

  public ExitFullCanvasToOrigin(): void {
    this.IsFullCanvasOpen = false;
    if (this.FullCanvasOriginMode === 'hub') {
      this.ActiveArtifactId = null;
      this.ActiveVersionNumber = undefined;
      this.offPageActiveItem = null;
    }
    this.SurfaceMode = this.FullCanvasOriginMode;
    this.emitWorkspaceState();
    this.cdr.detectChanges();
  }

  public SwitchFullCanvasToSplitNavigator(): void {
    if (!this.ActiveArtifactId) return;
    this.IsFullCanvasOpen = false;
    this.SurfaceMode = 'navigator';
    this.PreferredItemViewMode = 'split';
    this.saveSettingSafe(SETTING_ITEM_VIEW_MODE, 'split');
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
    this.SurfaceMode = 'hub';
    this.saveSettingSafe(SETTING_SURFACE_MODE, 'hub');
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
      this.PreferredItemViewMode = 'full';
      this.saveSettingSafe(SETTING_ITEM_VIEW_MODE, 'full');
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
    this.DefaultSynthesisArtifactIds = [];
    this.IsCreateDialogOpen = true;
    this.cdr.detectChanges();
  }

  public OpenUploadConvertDialog(): void {
    this.CreateDialogTab = 'upload';
    this.DefaultSynthesisArtifactIds = [];
    this.IsCreateDialogOpen = true;
    this.cdr.detectChanges();
  }

  public OpenSynthesizeDialog(sourceArtifactIds?: ReadonlyArray<string>): void {
    this.CreateDialogTab = 'synthesize';
    if (sourceArtifactIds && sourceArtifactIds.length > 0) {
      this.DefaultSynthesisArtifactIds = Array.from(sourceArtifactIds);
    } else if (this.SelectedCollectionId) {
      this.DefaultSynthesisArtifactIds = this.FilteredItems.map((i) => i.Id);
    } else if (this.ActiveArtifactId) {
      this.DefaultSynthesisArtifactIds = [this.ActiveArtifactId];
    } else {
      this.DefaultSynthesisArtifactIds = [];
    }
    this.IsCreateDialogOpen = true;
    this.cdr.detectChanges();
  }

  public async OnArtifactCreated(result: CreatedLibraryArtifactResult): Promise<void> {
    this.IsCreateDialogOpen = false;
    await this.ReloadWorkspaceData();
    this.OpenArtifactStudio(result.Artifact.ID, {
      fullCanvas: true,
    });
  }

  public async OnArtifactSynthesized(result: SynthesizeArtifactFromSourcesResult): Promise<void> {
    this.IsCreateDialogOpen = false;
    await this.ReloadWorkspaceData();
    this.OpenArtifactStudio(result.ArtifactID, {
      fullCanvas: true,
    });
  }

  public async OnRemoteDriveArtifactConverted(event: { ArtifactId: string; VersionNumber: number }): Promise<void> {
    await this.ReloadWorkspaceData();
    this.OpenArtifactStudio(event.ArtifactId, {
      fullCanvas: true,
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
    if (!this.SelectedCollectionId) return;
    const normCol = NormalizeUUID(this.SelectedCollectionId);
    const normArt = NormalizeUUID(item.Id);

    const linkIds = new Set<string>(
      this.collectionLinksByCollectionAndArtifact?.get(`${normCol}:${normArt}`) ?? [],
    );
    if (item.LatestVersionId) {
      const latestKey = `${normCol}:${NormalizeUUID(item.LatestVersionId)}`;
      const latestLink = this.collectionLinksByCollectionAndVersion.get(latestKey);
      if (latestLink) {
        linkIds.add(latestLink);
      }
    }

    // Fallback DB lookup when the item was linked under an earlier version (v1) after v2+ was created
    if (linkIds.size === 0 && this.EffectiveUser) {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const verRes = await rv.RunView<{ ID: string }>(
        {
          EntityName: 'MJ: Artifact Versions',
          ExtraFilter: `ArtifactID='${EscapeSQLString(item.Id)}'`,
          Fields: ['ID'],
          IgnoreMaxRows: true,
          ResultType: 'simple',
        },
        this.EffectiveUser,
      );
      const versionIds = (verRes.Success ? verRes.Results ?? [] : [])
        .map((r) => r.ID)
        .filter((id): id is string => Boolean(id));
      if (versionIds.length > 0) {
        const linkRes = await rv.RunView<{ ID: string }>(
          {
            EntityName: 'MJ: Collection Artifacts',
            ExtraFilter: `CollectionID='${EscapeSQLString(this.SelectedCollectionId)}' AND ArtifactVersionID IN (${this.sqlUuidInList(versionIds)})`,
            Fields: ['ID'],
            IgnoreMaxRows: true,
            ResultType: 'simple',
          },
          this.EffectiveUser,
        );
        for (const row of linkRes.Success ? linkRes.Results ?? [] : []) {
          if (row.ID) {
            linkIds.add(row.ID);
          }
        }
      }
    }

    if (linkIds.size === 0) return;

    try {
      for (const linkId of linkIds) {
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

  public OnViewerVersionSaved(event: ArtifactVersionSavedEvent): void {
    const idx = this.AllItems.findIndex((i) => UUIDsEqual(i.Id, event.ArtifactID));
    if (idx < 0) {
      return;
    }
    const existing = this.AllItems[idx];
    const parsedConfig = ParseArtifactVersionConfiguration(event.Configuration);
    const allTypes = ArtifactMetadataEngine.Instance.ArtifactTypes ?? [];
    const typeEntity = allTypes.find((t) => UUIDsEqual(t.ID, existing.TypeId)) ?? existing.TypeName;
    const thumbPolicy = ResolveArtifactTypeThumbnailPolicy(typeEntity, allTypes, existing.DriverClass);
    const allowPreview = thumbPolicy.Enabled && thumbPolicy.Mode === 'Rendered';
    const nextSnapshot = allowPreview
      ? event.PreviewSnapshot ?? parsedConfig?.previewSnapshot ?? existing.PreviewSnapshot ?? null
      : null;
    const nextThumb = allowPreview
      ? event.ThumbnailDataUrl ?? parsedConfig?.thumbnailDataUrl ?? existing.ThumbnailDataUrl ?? null
      : null;
    const updated: LibraryItemSummary = {
      ...existing,
      LatestVersionId: event.VersionID ?? existing.LatestVersionId,
      LatestVersionNumber: Math.max(existing.LatestVersionNumber, event.VersionNumber),
      VersionCount: Math.max(existing.VersionCount, event.VersionNumber),
      PreviewSnapshot: nextSnapshot,
      ThumbnailDataUrl: nextThumb,
      ThumbnailPolicyMode: thumbPolicy.Mode,
      UpdatedAt: event.UpdatedAt,
    };
    this.AllItems = [
      ...this.AllItems.slice(0, idx),
      updated,
      ...this.AllItems.slice(idx + 1),
    ];
    this.cdr.detectChanges();
  }

  /**
   * Handles 1-Click Connected Drive Round-Trip Sync (`push` / `pull`) triggered from
   * `ArtifactViewerPanelComponent`'s header sync controls (§6.1).
   */
  public async OnConnectedDriveSyncRequested(event: {
    artifactId: string;
    versionId?: string;
    direction: 'push' | 'pull';
  }): Promise<void> {
    if (this.IsDriveSyncing || !this.EffectiveUser) {
      return;
    }
    const user = this.EffectiveUser;
    const provider = this.ProviderToUse;
    const storageOverride = this.StorageClientOverride ?? undefined;
    this.IsDriveSyncing = true;
    this.cdr.detectChanges();

    try {
      if (event.direction === 'push') {
        try {
          const pushed = await this.creationService.PushVersionToConnectedDrive({
            ArtifactID: event.artifactId,
            VersionID: event.versionId ?? null,
            CurrentUser: user,
            Provider: provider,
            StorageClientOverride: storageOverride,
          });
          this.notifications.CreateSimpleNotification(
            `Pushed v${pushed.VersionNumber} to Connected Drive (${pushed.ObjectPath})`,
            'success',
            3500,
          );
          this.RefreshViewerSubject.next({
            artifactId: pushed.ArtifactID,
            versionNumber: pushed.VersionNumber,
          });
        } catch (err) {
          if (err instanceof RemoteDriveConflictError) {
            const confirmed = await this.confirmService.Confirm({
              title: 'Connected Drive File Changed',
              message: `${err.message} Overwrite the remote Connected Drive copy with this MJ version?`,
              confirmText: 'Overwrite Remote',
              cancelText: 'Cancel',
              type: 'warning',
            });
            if (confirmed) {
              const forced = await this.creationService.PushVersionToConnectedDrive({
                ArtifactID: event.artifactId,
                VersionID: event.versionId ?? null,
                ForceOverwrite: true,
                CurrentUser: user,
                Provider: provider,
                StorageClientOverride: storageOverride,
              });
              this.notifications.CreateSimpleNotification(
                `Overwrote remote Connected Drive copy (${forced.ObjectPath})`,
                'success',
                3500,
              );
              this.RefreshViewerSubject.next({
                artifactId: forced.ArtifactID,
                versionNumber: forced.VersionNumber,
              });
            }
            return;
          }
          throw err;
        }
        return;
      }

      const pulled = await this.creationService.PullLatestFromConnectedDriveAsNewVersion({
        ArtifactID: event.artifactId,
        VersionID: event.versionId ?? null,
        CurrentUser: user,
        Provider: provider,
        StorageClientOverride: storageOverride,
      });
      this.ActiveVersionNumber = pulled.NewVersionNumber;
      this.notifications.CreateSimpleNotification(
        `Pulled Connected Drive update as v${pulled.NewVersionNumber} (comparing v${pulled.PreviousVersionNumber} vs v${pulled.NewVersionNumber})`,
        'success',
        4000,
      );
      await this.ReloadWorkspaceData();
      this.RefreshViewerSubject.next({
        artifactId: pulled.ArtifactID,
        versionNumber: pulled.NewVersionNumber,
      });
      const panel = this.IsFullCanvasOpen ? this.FullCanvasViewerPanel : this.SplitViewerPanel;
      if (panel) {
        await panel.OpenVersionCompare(pulled.PreviousVersionNumber, pulled.NewVersionNumber);
      }
    } catch (err) {
      this.notifications.CreateSimpleNotification(
        err instanceof Error ? err.message : 'Connected Drive sync failed.',
        'error',
        4500,
      );
    } finally {
      this.IsDriveSyncing = false;
      this.cdr.detectChanges();
    }
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

    const generation = this.reloadGeneration + 1;
    this.reloadGeneration = generation;

    this.IsLoading = true;
    this.IsLoadingMore = false;
    this.IsStreamingSharedPermissions = false;
    this.LoadError = null;
    this.LoadMoreError = null;
    let emittedInitialCompletion = false;

    try {
      const md = this.ProviderToUse;

      await ArtifactMetadataEngine.Instance.Config(false, user, md);
      if (this.isReloadStale(generation)) {
        return;
      }
      const artifactTypes = ArtifactMetadataEngine.Instance.ArtifactTypes;

      const rv = RunView.FromMetadataProvider(md);
      const initial = await this.loadInitialScopedWorkspaceRecords(rv, user);
      if (this.isReloadStale(generation)) {
        return;
      }
      this.cachedWorkspaceRecords = initial.scoped;

      await this.loadConnectedDrives();
      if (this.isReloadStale(generation)) {
        return;
      }

      await this.loadEngineReadableArtifactIds(user);
      if (this.isReloadStale(generation)) {
        return;
      }

      this.hydrateWorkspaceViewModels({
        user,
        artifactTypes,
        artifacts: initial.scoped.artifacts,
        versions: initial.scoped.versions,
        collections: initial.scoped.collections,
        collectionLinks: initial.scoped.collectionLinks,
        artifactPerms: initial.scoped.artifactPerms,
        collectionPerms: initial.scoped.collectionPerms,
      });

      if (this.pendingExternalParams) {
        const pending = this.pendingExternalParams;
        this.pendingExternalParams = null;
        this.applyRouteParamsInternal(pending);
      }

      if (this.ActiveArtifactId && !this.AllItems.some((i) => UUIDsEqual(i.Id, this.ActiveArtifactId))) {
        void this.hydrateActiveArtifactIfMissing(this.ActiveArtifactId);
      } else {
        this.offPageActiveItem = null;
      }

      const hasRemainingPermissionPages = initial.remainingPermOffsets.length > 0;

      // Unblock first render as soon as Page 0 owned + shared items are hydrated
      this.IsLoading = false;
      this.IsStreamingSharedPermissions = hasRemainingPermissionPages;
      emittedInitialCompletion = true;
      this.LoadComplete.emit();
      this.emitWorkspaceState();
      this.notifyViewCheck();

      if (hasRemainingPermissionPages) {
        await this.loadRemainingSharedPermissionPages({
          rv,
          user,
          artifactTypes,
          generation,
          remainingPermOffsets: initial.remainingPermOffsets,
          ownedTotal: initial.ownedTotal,
          ownedArtNormIds: initial.ownedArtNormIds,
          checkedDirectSharedNormIds: initial.checkedDirectSharedNormIds,
        });
      }

      await this.loadSharingEntries(rv, user, generation);
    } catch (err) {
      if (!this.isReloadStale(generation)) {
        this.LoadError = err instanceof Error ? err.message : 'Failed to load Library items.';
      }
    } finally {
      if (!this.isReloadStale(generation)) {
        this.IsLoading = false;
        this.IsStreamingSharedPermissions = false;
        if (!emittedInitialCompletion) {
          this.LoadComplete.emit();
        }
        this.emitWorkspaceState();
        this.notifyViewCheck();
      }
    }
  }

  /**
   * Loads the next page (`ArtifactPageSize = 200`) of user-accessible artifacts and their scoped
   * version rows without re-querying all collections or truncating large libraries.
   */
  public async LoadMoreArtifacts(): Promise<void> {
    if (!this.CanLoadMore) {
      return;
    }
    const user = this.EffectiveUser;
    if (!user) {
      return;
    }

    const generation = this.reloadGeneration;
    const ownedOffsetSnapshot = this.ownedArtifactOffset;
    const directOffsetSnapshot = this.directSharedArtifactOffset;
    this.IsLoadingMore = true;
    this.LoadMoreError = null;
    try {
      const md = this.ProviderToUse;
      const rv = RunView.FromMetadataProvider(md);
      const safeEnvId = EscapeSQLString(this.EffectiveEnvironmentId);
      const safeUserId = EscapeSQLString(user.ID);
      const targetEnvNorm = NormalizeUUID(this.EffectiveEnvironmentId);
      const envFilter = `EnvironmentID='${safeEnvId}'`;
      const visibleFilter = `(Visibility IS NULL OR Visibility <> 'System Only')`;
      const pageSize = this.ArtifactPageSize > 0 ? this.ArtifactPageSize : 200;

      const hasRemainingDirectShared =
        Array.isArray(this.allDirectSharedArtIds) &&
        directOffsetSnapshot < this.allDirectSharedArtIds.length;
      const nextDirectSlice = hasRemainingDirectShared
        ? this.allDirectSharedArtIds.slice(directOffsetSnapshot, directOffsetSnapshot + pageSize)
        : [];

      const pageQueries: RunViewParams[] = [
        {
          EntityName: 'MJ: Artifacts',
          ExtraFilter: `${envFilter} AND ${visibleFilter} AND UserID='${safeUserId}'`,
          OrderBy: '__mj_UpdatedAt DESC, ID DESC',
          StartRow: ownedOffsetSnapshot,
          MaxRows: pageSize,
          ResultType: 'entity_object',
        },
      ];
      for (const chunk of this.chunkIds(nextDirectSlice)) {
        pageQueries.push({
          EntityName: 'MJ: Artifacts',
          ExtraFilter: `${envFilter} AND ${visibleFilter} AND UserID <> '${safeUserId}' AND ID IN (${this.sqlUuidInList(chunk)})`,
          OrderBy: '__mj_UpdatedAt DESC, ID DESC',
          StartRow: 0,
          MaxRows: chunk.length,
          ResultType: 'entity_object',
        });
      }

      const pageBatch = await rv.RunViews(pageQueries, user);
      if (this.isReloadStale(generation)) {
        return;
      }
      this.assertRunViewsSucceeded(pageBatch);
      const [nextArtRes, ...directArtResList] = pageBatch;
      const nextOwnedArtifacts = ((nextArtRes?.Results ?? []) as MJArtifactEntity[]).filter(
        (a) => !a.EnvironmentID || NormalizeUUID(a.EnvironmentID) === targetEnvNorm,
      );
      const nextDirectArtifacts: MJArtifactEntity[] = [];
      for (const directRes of directArtResList) {
        if (directRes?.Results) {
          for (const art of directRes.Results as MJArtifactEntity[]) {
            if (!art.EnvironmentID || NormalizeUUID(art.EnvironmentID) === targetEnvNorm) {
              nextDirectArtifacts.push(art);
            }
          }
        }
      }
      const nextArtifacts = this.dedupeEntitiesById([...nextOwnedArtifacts, ...nextDirectArtifacts]);

      if (nextArtifacts.length === 0 && nextDirectSlice.length === 0) {
        this.TotalArtifactCount = this.LoadedArtifactCount;
        return;
      }

      const newArtIds = this.uniqueIds(nextArtifacts.map((a) => a.ID));
      let nextVersions: VersionSummaryRow[] = [];

      if (newArtIds.length > 0) {
        const verQueries = this.buildScopedArtifactVersionQueries(newArtIds);
        const verBatch = await rv.RunViews(verQueries, user);
        if (this.isReloadStale(generation)) {
          return;
        }
        this.assertRunViewsSucceeded(verBatch);
        const collected: VersionSummaryRow[] = [];
        for (const res of verBatch) {
          if (res?.Results) {
            collected.push(...(res.Results as VersionSummaryRow[]));
          }
        }
        nextVersions = this.dedupeEntitiesById(collected);
      }

      this.ownedArtifactOffset = Math.max(
        this.ownedArtifactOffset,
        ownedOffsetSnapshot + nextOwnedArtifacts.length,
      );
      if (nextDirectSlice.length > 0) {
        this.directSharedArtifactOffset = Math.max(
          this.directSharedArtifactOffset,
          directOffsetSnapshot + nextDirectSlice.length,
        );
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
      } else if (unpagedDirectCount === 0 && nextOwnedArtifacts.length < pageSize) {
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
      if (!this.isReloadStale(generation)) {
        const msg = err instanceof Error ? err.message : 'Failed to load additional Library items.';
        this.LoadMoreError = msg;
        this.notifications.CreateSimpleNotification(msg, 'error', 4000);
      }
    } finally {
      if (!this.isReloadStale(generation)) {
        this.IsLoadingMore = false;
        this.emitWorkspaceState();
        this.notifyViewCheck();
      }
    }
  }

  private isReloadStale(generation: number): boolean {
    return Boolean(this.isDestroyed) || generation !== this.reloadGeneration;
  }

  private toShareDate(primary: Date | string | null | undefined, fallback?: Date | string | null): Date {
    const raw = primary ?? fallback;
    if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
      return raw;
    }
    if (typeof raw === 'string' && raw.length > 0) {
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
    return new Date(0);
  }

  private toShareLevel(raw: MJResourcePermissionEntity['PermissionLevel'] | boolean | null | undefined): LibrarySharedPermissionLevel {
    if (raw === true || raw === 'Edit' || raw === 'Owner') {
      return 'Edit';
    }
    return 'View';
  }

  /**
   * Builds baseline `Shared with Me` artifact entries from hydrated Library items and
   * `MJ: Artifact Permissions` rows, preserving any conversation entries already loaded.
   */
  private syncArtifactSharedWithMeEntries(artifactPerms: ReadonlyArray<ArtifactPermissionSummaryRow>): void {
    const permByArtId = new Map<string, ArtifactPermissionSummaryRow>();
    for (const ap of artifactPerms) {
      if (ap.CanRead) {
        permByArtId.set(NormalizeUUID(ap.ArtifactID), ap);
      }
    }
    const currentUser = this.EffectiveUser;
    const recipientName = currentUser?.Name || 'You';
    const artifactEntries: LibrarySharedEntry[] = this.AllItems
      .filter((item) => item.IsSharedWithMe)
      .map((item) => {
        const perm = permByArtId.get(NormalizeUUID(item.Id));
        return {
          Id: perm ? `art-in:${perm.ID}` : `art-in-col:${item.Id}`,
          ItemKind: 'artifact',
          ResourceId: item.Id,
          Title: item.Name,
          Description: item.Description || item.TypeName,
          Icon: item.Icon,
          SharerName: perm?.SharedByUser || item.OwnerName || 'Shared user',
          RecipientName: recipientName,
          ShareDate: this.toShareDate(perm?.__mj_CreatedAt, item.UpdatedAt),
          PermissionLevel: perm ? this.toShareLevel(perm.CanEdit) : this.toShareLevel(item.CanEdit),
          IsSideThread: false,
          ParentConversationId: null,
          PermissionRecordId: perm?.ID ?? null,
          CanRevoke: false,
        };
      });

    const existingConversations = (this.SharedWithMeEntries ?? []).filter(
      (e) => e.ItemKind === 'conversation',
    );
    this.SharedWithMeEntries = [...artifactEntries, ...existingConversations].sort(
      (a, b) => b.ShareDate.getTime() - a.ShareDate.getTime(),
    );
    this.SharedByMeEntries ??= [];
  }

  /**
   * Loads both `Shared with Me` conversations (including explicitly shared `ParentID` side threads)
   * and `Shared by Me` permissions across conversations and artifacts.
   */
  private async loadSharingEntries(rv: RunView, user: UserInfo, generation: number): Promise<void> {
    const safeUserId = EscapeSQLString(user.ID);
    const safeEnvId = EscapeSQLString(this.EffectiveEnvironmentId);
    const safeConvTypeId = EscapeSQLString(CONVERSATIONS_RESOURCE_TYPE_ID);
    this.SharedWithMeEntries ??= [];
    this.SharedByMeEntries ??= [];
    const baseArtifactSharedWithMe = this.SharedWithMeEntries.filter((e) => e.ItemKind === 'artifact');

    try {
      const results = await rv.RunViews(
        [
          {
            EntityName: 'MJ: Resource Permissions',
            ExtraFilter: `ResourceTypeID='${safeConvTypeId}' AND Status='Approved' AND UserID='${safeUserId}'`,
            Fields: [
              'ID',
              'ResourceRecordID',
              'Type',
              'RoleID',
              'UserID',
              'PermissionLevel',
              'SharedByUserID',
              'SharedByUser',
              'User',
              'Role',
              '__mj_CreatedAt',
            ],
            OrderBy: '__mj_CreatedAt DESC',
            IgnoreMaxRows: true,
            ResultType: 'simple',
          },
          {
            EntityName: 'MJ: Resource Permissions',
            ExtraFilter: `ResourceTypeID='${safeConvTypeId}' AND Status='Approved' AND SharedByUserID='${safeUserId}'`,
            Fields: [
              'ID',
              'ResourceRecordID',
              'Type',
              'RoleID',
              'UserID',
              'PermissionLevel',
              'SharedByUserID',
              'SharedByUser',
              'User',
              'Role',
              '__mj_CreatedAt',
            ],
            OrderBy: '__mj_CreatedAt DESC',
            IgnoreMaxRows: true,
            ResultType: 'simple',
          },
          {
            EntityName: 'MJ: Artifact Permissions',
            ExtraFilter: `SharedByUserID='${safeUserId}' AND CanRead=1`,
            Fields: ARTIFACT_PERMISSION_SUMMARY_FIELDS,
            OrderBy: '__mj_CreatedAt DESC',
            IgnoreMaxRows: true,
            ResultType: 'simple',
          },
          {
            EntityName: 'MJ: Conversations',
            ExtraFilter: `UserID='${safeUserId}' AND (IsArchived IS NULL OR IsArchived=0)`,
            Fields: ['ID', 'Name', 'Description', 'UserID', 'User', 'ParentID', '__mj_UpdatedAt'],
            IgnoreMaxRows: true,
            ResultType: 'simple',
          },
        ],
        user,
      );

      if (this.isReloadStale(generation) || !Array.isArray(results)) {
        return;
      }

      const convInPerms =
        results[0]?.Success ? ((results[0].Results ?? []) as ConversationShareSummaryRow[]) : [];
      const convOutByGrantorPerms =
        results[1]?.Success ? ((results[1].Results ?? []) as ConversationShareSummaryRow[]) : [];
      const artOutPerms =
        results[2]?.Success ? ((results[2].Results ?? []) as ArtifactPermissionSummaryRow[]) : [];
      const ownedConversations =
        results[3]?.Success ? ((results[3].Results ?? []) as SharedConversationRow[]) : [];

      const ownedConvByNormId = new Map<string, SharedConversationRow>();
      for (const conv of ownedConversations) {
        ownedConvByNormId.set(NormalizeUUID(conv.ID), conv);
      }

      // Also check permissions on owned conversations (covers grants where SharedByUserID was omitted)
      let convOutAllPerms = [...convOutByGrantorPerms];
      if (ownedConversations.length > 0) {
        const ownedConvIdFilter = this.sqlUuidInList(ownedConversations.map((c) => c.ID));
        const extraPermRes = await rv.RunView<ConversationShareSummaryRow>(
          {
            EntityName: 'MJ: Resource Permissions',
            ExtraFilter: `ResourceTypeID='${safeConvTypeId}' AND Status='Approved' AND ResourceRecordID IN (${ownedConvIdFilter})`,
            Fields: [
              'ID',
              'ResourceRecordID',
              'Type',
              'RoleID',
              'UserID',
              'PermissionLevel',
              'SharedByUserID',
              'SharedByUser',
              'User',
              'Role',
              '__mj_CreatedAt',
            ],
            OrderBy: '__mj_CreatedAt DESC',
            IgnoreMaxRows: true,
            ResultType: 'simple',
          },
          user,
        );
        if (extraPermRes?.Success && Array.isArray(extraPermRes.Results)) {
          const seenPermIds = new Set(convOutAllPerms.map((p) => NormalizeUUID(p.ID)));
          for (const row of extraPermRes.Results) {
            const key = NormalizeUUID(row.ID);
            if (!seenPermIds.has(key)) {
              seenPermIds.add(key);
              convOutAllPerms.push(row);
            }
          }
        }
      }

      if (this.isReloadStale(generation)) {
        return;
      }

      const neededConvIds = this.uniqueIds([
        ...convInPerms.map((p) => p.ResourceRecordID),
        ...convOutAllPerms.map((p) => p.ResourceRecordID),
      ]).filter((id) => !ownedConvByNormId.has(NormalizeUUID(id)));

      const allItemByNormId = new Map<string, LibraryItemSummary>();
      for (const item of this.AllItems) {
        allItemByNormId.set(NormalizeUUID(item.Id), item);
      }
      const missingArtifactIds = this.uniqueIds(artOutPerms.map((p) => p.ArtifactID)).filter(
        (id) => !allItemByNormId.has(NormalizeUUID(id)),
      );

      const hydrateQueries: RunViewParams[] = [];
      const convQueryIndices: number[] = [];
      const artQueryIndices: number[] = [];
      for (const chunk of this.chunkIds(neededConvIds)) {
        convQueryIndices.push(hydrateQueries.length);
        hydrateQueries.push({
          EntityName: 'MJ: Conversations',
          ExtraFilter: `EnvironmentID='${safeEnvId}' AND ID IN (${this.sqlUuidInList(chunk)})`,
          Fields: ['ID', 'Name', 'Description', 'UserID', 'User', 'ParentID', '__mj_UpdatedAt'],
          IgnoreMaxRows: true,
          ResultType: 'simple',
        });
      }
      for (const chunk of this.chunkIds(missingArtifactIds)) {
        artQueryIndices.push(hydrateQueries.length);
        hydrateQueries.push({
          EntityName: 'MJ: Artifacts',
          ExtraFilter: `EnvironmentID='${safeEnvId}' AND ID IN (${this.sqlUuidInList(chunk)})`,
          Fields: ['ID', 'Name', 'Description', 'TypeID', 'Type', 'UserID', 'User', '__mj_UpdatedAt'],
          IgnoreMaxRows: true,
          ResultType: 'simple',
        });
      }

      const hydrateResults =
        hydrateQueries.length > 0 ? await rv.RunViews(hydrateQueries, user) : [];
      if (this.isReloadStale(generation)) {
        return;
      }

      const convByNormId = new Map<string, SharedConversationRow>(ownedConvByNormId);
      for (const idx of convQueryIndices) {
        const res = hydrateResults[idx];
        if (res?.Success && Array.isArray(res.Results)) {
          for (const conv of res.Results as SharedConversationRow[]) {
            convByNormId.set(NormalizeUUID(conv.ID), conv);
          }
        }
      }

      const fetchedArtByNormId = new Map<
        string,
        Pick<MJArtifactEntity, 'ID' | 'Name' | 'Description' | 'Type' | 'UserID' | '__mj_UpdatedAt'>
      >();
      for (const idx of artQueryIndices) {
        const res = hydrateResults[idx];
        if (res?.Success && Array.isArray(res.Results)) {
          for (const art of res.Results as Array<
            Pick<MJArtifactEntity, 'ID' | 'Name' | 'Description' | 'Type' | 'UserID' | '__mj_UpdatedAt'>
          >) {
            fetchedArtByNormId.set(NormalizeUUID(art.ID), art);
          }
        }
      }

      const sharedWithMeConversations: LibrarySharedEntry[] = [];
      for (const perm of convInPerms) {
        const conv = convByNormId.get(NormalizeUUID(perm.ResourceRecordID));
        if (!conv) continue;
        if (conv.UserID && UUIDsEqual(conv.UserID, user.ID)) continue;
        const isSideThread = Boolean(conv.ParentID);
        sharedWithMeConversations.push({
          Id: `conv-in:${perm.ID}`,
          ItemKind: 'conversation',
          ResourceId: conv.ID,
          Title: conv.Name || 'Shared Conversation',
          Description: conv.Description || (isSideThread ? 'Shared side thread' : 'Shared conversation'),
          Icon: isSideThread ? 'fa-solid fa-code-branch' : 'fa-solid fa-comments',
          SharerName: perm.SharedByUser || conv.User || 'Owner',
          RecipientName: user.Name || 'You',
          ShareDate: this.toShareDate(perm.__mj_CreatedAt, conv.__mj_UpdatedAt),
          PermissionLevel: this.toShareLevel(perm.PermissionLevel),
          IsSideThread: isSideThread,
          ParentConversationId: conv.ParentID ?? null,
          PermissionRecordId: perm.ID,
          CanRevoke: false,
        });
      }

      const sharedByMeEntries: LibrarySharedEntry[] = [];
      for (const perm of convOutAllPerms) {
        if (perm.UserID && UUIDsEqual(perm.UserID, user.ID)) continue;
        const conv = convByNormId.get(NormalizeUUID(perm.ResourceRecordID));
        if (!conv) continue;
        const isOwner = Boolean(conv.UserID && UUIDsEqual(conv.UserID, user.ID));
        if (!isOwner) continue;
        const isSideThread = Boolean(conv.ParentID);
        sharedByMeEntries.push({
          Id: `conv-out:${perm.ID}`,
          ItemKind: 'conversation',
          ResourceId: conv.ID,
          Title: conv.Name || 'Shared Conversation',
          Description: conv.Description || (isSideThread ? 'Shared side thread' : 'Conversation share'),
          Icon: isSideThread ? 'fa-solid fa-code-branch' : 'fa-solid fa-comments',
          SharerName: user.Name || 'You',
          RecipientName: perm.User || perm.Role || 'Recipient',
          ShareDate: this.toShareDate(perm.__mj_CreatedAt, conv.__mj_UpdatedAt),
          PermissionLevel: this.toShareLevel(perm.PermissionLevel),
          IsSideThread: isSideThread,
          ParentConversationId: conv.ParentID ?? null,
          PermissionRecordId: perm.ID,
          CanRevoke: true,
        });
      }

      for (const ap of artOutPerms) {
        if (ap.UserID && UUIDsEqual(ap.UserID, user.ID)) continue;
        const normArt = NormalizeUUID(ap.ArtifactID);
        const itemSummary = allItemByNormId.get(normArt);
        const rawArt = fetchedArtByNormId.get(normArt);
        if (!itemSummary && !rawArt) continue;
        const canRevoke =
          Boolean(itemSummary?.IsOwnedByCurrentUser) ||
          Boolean(rawArt?.UserID && UUIDsEqual(rawArt.UserID, user.ID)) ||
          Boolean(ap.SharedByUserID && UUIDsEqual(ap.SharedByUserID, user.ID));
        sharedByMeEntries.push({
          Id: `art-out:${ap.ID}`,
          ItemKind: 'artifact',
          ResourceId: ap.ArtifactID,
          Title: itemSummary?.Name || rawArt?.Name || 'Shared Artifact',
          Description:
            itemSummary?.Description ||
            rawArt?.Description ||
            itemSummary?.TypeName ||
            rawArt?.Type ||
            'Artifact share',
          Icon: itemSummary?.Icon || 'fa-solid fa-file-lines',
          SharerName: user.Name || 'You',
          RecipientName: ap.User || 'Recipient',
          ShareDate: this.toShareDate(ap.__mj_CreatedAt, itemSummary?.UpdatedAt ?? rawArt?.__mj_UpdatedAt),
          PermissionLevel: this.toShareLevel(ap.CanEdit),
          IsSideThread: false,
          ParentConversationId: null,
          PermissionRecordId: ap.ID,
          CanRevoke: canRevoke,
        });
      }

      this.SharedWithMeEntries = [...baseArtifactSharedWithMe, ...sharedWithMeConversations].sort(
        (a, b) => b.ShareDate.getTime() - a.ShareDate.getTime(),
      );
      this.SharedByMeEntries = sharedByMeEntries.sort(
        (a, b) => b.ShareDate.getTime() - a.ShareDate.getTime(),
      );
      this.emitWorkspaceState();
      this.notifyViewCheck();
    } catch {
      // Optional sharing feed query failure keeps baseline artifact entries without blocking Library
    }
  }

  private notifyViewCheck(): void {
    if (!this.isDestroyed) {
      this.cdr.markForCheck();
      this.cdr.detectChanges();
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
   * Loads the first page of user-accessible `MJ: Artifacts`, `MJ: Artifact Versions` (excluding heavy
   * `Content`), `MJ: Collections`, `MJ: Collection Artifacts`, and Page 0 of `MJ: Artifact Permissions`
   * via server-side scoped `rv.RunViews` batches — unblocking first render immediately before streaming
   * any remaining permission pages (`page >= 1`).
   */
  private async loadInitialScopedWorkspaceRecords(
    rv: RunView,
    user: UserInfo,
  ): Promise<InitialScopedWorkspaceLoadResult> {
    const safeEnvId = EscapeSQLString(this.EffectiveEnvironmentId);
    const safeUserId = EscapeSQLString(user.ID);
    const targetEnvNorm = NormalizeUUID(this.EffectiveEnvironmentId);
    const currentUserNorm = NormalizeUUID(user.ID);
    const envFilter = `EnvironmentID='${safeEnvId}'`;
    const visibleFilter = `(Visibility IS NULL OR Visibility <> 'System Only')`;
    const pageSize = this.ArtifactPageSize > 0 ? this.ArtifactPageSize : 200;

    // Batch 1: First page of owned artifacts, Page 0 of lightweight artifact permission rows,
    // owned collections, and user collection grants
    const batch1Results = await rv.RunViews(
      [
        {
          EntityName: 'MJ: Artifacts',
          ExtraFilter: `${envFilter} AND ${visibleFilter} AND UserID='${safeUserId}'`,
          OrderBy: '__mj_UpdatedAt DESC, ID DESC',
          StartRow: 0,
          MaxRows: pageSize,
          ResultType: 'entity_object',
        },
        {
          EntityName: 'MJ: Artifact Permissions',
          ExtraFilter: `UserID='${safeUserId}' AND CanRead=1`,
          Fields: ARTIFACT_PERMISSION_SUMMARY_FIELDS,
          OrderBy: '__mj_CreatedAt DESC, ID DESC',
          StartRow: 0,
          MaxRows: pageSize,
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

    const ownedArtifacts = ((ownedArtRes?.Results ?? []) as MJArtifactEntity[]).filter(
      (a) => !a.EnvironmentID || NormalizeUUID(a.EnvironmentID) === targetEnvNorm,
    );
    const firstPagePerms = (artPermRes?.Results ?? []) as ArtifactPermissionSummaryRow[];
    const artifactPerms: ArtifactPermissionSummaryRow[] = [...firstPagePerms];
    const totalPermRows =
      typeof artPermRes?.TotalRowCount === 'number' ? artPermRes.TotalRowCount : firstPagePerms.length;
    const remainingPermOffsets: number[] = [];
    if (firstPagePerms.length > 0 && totalPermRows > firstPagePerms.length) {
      for (let startRow = firstPagePerms.length; startRow < totalPermRows; startRow += pageSize) {
        remainingPermOffsets.push(startRow);
      }
    }

    const ownedCollections = ((ownedColRes?.Results ?? []) as MJCollectionEntity[]).filter(
      (c) => !c.EnvironmentID || NormalizeUUID(c.EnvironmentID) === targetEnvNorm,
    );
    const collectionPerms = (colPermRes?.Results ?? []) as MJCollectionPermissionEntity[];

    const ownedArtNormIds = new Set(ownedArtifacts.map((a) => NormalizeUUID(a.ID)));
    const ownedColNormIds = new Set(ownedCollections.map((c) => NormalizeUUID(c.ID)));

    const candidateDirectSharedArtIds = this.uniqueIds(
      artifactPerms
        .filter((ap) => ap.CanRead && !ownedArtNormIds.has(NormalizeUUID(ap.ArtifactID)))
        .map((ap) => ap.ArtifactID),
    );
    const checkedDirectSharedNormIds = new Set(
      candidateDirectSharedArtIds.map((id) => NormalizeUUID(id)),
    );
    const firstPageDirectSharedArtIds = candidateDirectSharedArtIds.slice(0, pageSize);
    const remainingCandidateDirectSharedIds = candidateDirectSharedArtIds.slice(pageSize);

    const sharedColIds = this.uniqueIds(
      collectionPerms
        .filter((cp) => cp.CanRead && !ownedColNormIds.has(NormalizeUUID(cp.CollectionID)))
        .map((cp) => cp.CollectionID),
    );
    const accessibleColIds = this.uniqueIds([
      ...ownedCollections.map((c) => c.ID),
      ...sharedColIds,
    ]);

    // Batch 2: Shared collections, collection-artifact links, Page 0 of directly shared artifacts,
    // and lightweight environment-scoped ID verification for any excess Page 0 direct share candidates
    const batch2Queries: RunViewParams[] = [];
    const sharedColIndices: number[] = [];
    const colLinksIndices: number[] = [];
    const directSharedArtIndices: number[] = [];
    const remainingDirectSharedEnvCheckIndices: number[] = [];
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
        ExtraFilter: `${envFilter} AND ${visibleFilter} AND UserID <> '${safeUserId}' AND ID IN (${this.sqlUuidInList(chunk)})`,
        OrderBy: '__mj_UpdatedAt DESC, ID DESC',
        StartRow: 0,
        MaxRows: chunk.length,
        ResultType: 'entity_object',
      });
    }

    for (const chunk of this.chunkIds(remainingCandidateDirectSharedIds)) {
      remainingDirectSharedEnvCheckIndices.push(batch2Queries.length);
      batch2Queries.push({
        EntityName: 'MJ: Artifacts',
        ExtraFilter: `${envFilter} AND ${visibleFilter} AND UserID <> '${safeUserId}' AND ID IN (${this.sqlUuidInList(chunk)})`,
        Fields: ['ID', 'EnvironmentID', 'UserID'],
        OrderBy: '__mj_UpdatedAt DESC',
        IgnoreMaxRows: true,
        SkipTotalRowCount: true,
        ResultType: 'simple',
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
        for (const col of batch2Results[idx].Results as MJCollectionEntity[]) {
          if (!col.EnvironmentID || NormalizeUUID(col.EnvironmentID) === targetEnvNorm) {
            sharedCollections.push(col);
          }
        }
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
        for (const art of batch2Results[idx].Results as MJArtifactEntity[]) {
          const inTargetEnv = !art.EnvironmentID || NormalizeUUID(art.EnvironmentID) === targetEnvNorm;
          const notOwnedByCurrent = !art.UserID || NormalizeUUID(art.UserID) !== currentUserNorm;
          if (inTargetEnv && notOwnedByCurrent) {
            directSharedArtifacts.push(art);
          }
        }
      }
    }
    const remainingEnvDirectSharedRows: EnvironmentScopedArtifactIdRow[] = [];
    for (const idx of remainingDirectSharedEnvCheckIndices) {
      if (batch2Results[idx]?.Results) {
        for (const row of batch2Results[idx].Results as EnvironmentScopedArtifactIdRow[]) {
          const inTargetEnv = !row.EnvironmentID || NormalizeUUID(row.EnvironmentID) === targetEnvNorm;
          const notOwnedByCurrent = !row.UserID || NormalizeUUID(row.UserID) !== currentUserNorm;
          if (row.ID && inTargetEnv && notOwnedByCurrent) {
            remainingEnvDirectSharedRows.push(row);
          }
        }
      }
    }

    let allCollections = this.dedupeEntitiesById([...ownedCollections, ...sharedCollections]);
    let combinedCollectionLinks = [...rawCollectionLinks];

    // Walk descendant child collections whose ParentID belongs to an accessible ancestor collection
    if (accessibleColIds.length > 0) {
      const seenDescendantColNorms = new Set(allCollections.map((c) => NormalizeUUID(c.ID)));
      let frontier = this.uniqueIds(allCollections.map((c) => c.ID));
      const newlyDiscoveredColIds: string[] = [];
      for (let depth = 0; depth < 16 && frontier.length > 0; depth++) {
        const childQueries: RunViewParams[] = [];
        for (const chunk of this.chunkIds(frontier)) {
          childQueries.push({
            EntityName: 'MJ: Collections',
            ExtraFilter: `${envFilter} AND ParentID IN (${this.sqlUuidInList(chunk)})`,
            OrderBy: 'Name ASC',
            IgnoreMaxRows: true,
            ResultType: 'entity_object',
          });
        }
        const childResults = childQueries.length > 0 ? await rv.RunViews(childQueries, user) : [];
        const nextFrontier: string[] = [];
        for (const res of childResults) {
          if (!res?.Success || !res.Results) continue;
          for (const col of res.Results as MJCollectionEntity[]) {
            if (!col.EnvironmentID || NormalizeUUID(col.EnvironmentID) === targetEnvNorm) {
              const norm = NormalizeUUID(col.ID);
              if (!seenDescendantColNorms.has(norm)) {
                seenDescendantColNorms.add(norm);
                allCollections = this.dedupeEntitiesById([...allCollections, col]);
                newlyDiscoveredColIds.push(col.ID);
                nextFrontier.push(col.ID);
              }
            }
          }
        }
        frontier = nextFrontier;
      }

      if (newlyDiscoveredColIds.length > 0) {
        const extraLinkQueries: RunViewParams[] = [];
        for (const chunk of this.chunkIds(newlyDiscoveredColIds)) {
          extraLinkQueries.push({
            EntityName: 'MJ: Collection Artifacts',
            ExtraFilter: `CollectionID IN (${this.sqlUuidInList(chunk)})`,
            Fields: ['ID', 'CollectionID', 'ArtifactVersionID', 'Sequence'],
            IgnoreMaxRows: true,
            ResultType: 'simple',
          });
        }
        const extraLinkResults = await rv.RunViews(extraLinkQueries, user);
        for (const res of extraLinkResults) {
          if (res?.Success && res.Results) {
            combinedCollectionLinks.push(...(res.Results as CollectionArtifactLinkRow[]));
          }
        }
      }
    }

    const envColNormIds = new Set(allCollections.map((c) => NormalizeUUID(c.ID)));
    const collectionLinks = combinedCollectionLinks.filter((l) => envColNormIds.has(NormalizeUUID(l.CollectionID)));
    const expandedAccessibleColIds = this.uniqueIds([
      ...accessibleColIds,
      ...allCollections.map((c) => c.ID),
    ]);

    let allArtifacts = this.dedupeEntitiesById([...ownedArtifacts, ...directSharedArtifacts]);
    const immediateVersions: VersionSummaryRow[] = [];
    for (const idx of immediateVersionIndices) {
      if (batch2Results[idx]?.Results) {
        immediateVersions.push(...(batch2Results[idx].Results as VersionSummaryRow[]));
      }
    }
    let allVersions: VersionSummaryRow[] = this.dedupeEntitiesById(immediateVersions);

    if (expandedAccessibleColIds.length > 0) {
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
              for (const art of colArtBatch[idx].Results as MJArtifactEntity[]) {
                if (!art.EnvironmentID || NormalizeUUID(art.EnvironmentID) === targetEnvNorm) {
                  colSharedArts.push(art);
                }
              }
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

    const loadedArtNormSet = new Set(allArtifacts.map((a) => NormalizeUUID(a.ID)));
    const loadedDirectSharedIds = this.uniqueIds(directSharedArtifacts.map((a) => a.ID));
    const unpagedEnvDirectSharedIds = this.uniqueIds(
      remainingEnvDirectSharedRows.map((r) => r.ID),
    ).filter((id) => !loadedArtNormSet.has(NormalizeUUID(id)));

    this.allDirectSharedArtIds = [...loadedDirectSharedIds, ...unpagedEnvDirectSharedIds];
    this.directSharedArtifactOffset = loadedDirectSharedIds.length;

    this.ownedArtifactOffset = ownedArtifacts.length;
    const ownedTotal =
      typeof ownedArtRes?.TotalRowCount === 'number' && ownedArtRes.TotalRowCount >= ownedArtifacts.length
        ? ownedArtRes.TotalRowCount
        : ownedArtifacts.length;
    const loadedSharedDelta = Math.max(0, allArtifacts.length - ownedArtifacts.length);
    const unpagedDirectSharedCount = unpagedEnvDirectSharedIds.length;
    this.LoadedArtifactCount = allArtifacts.length;
    this.TotalArtifactCount = Math.max(
      this.LoadedArtifactCount,
      ownedTotal + loadedSharedDelta + unpagedDirectSharedCount,
    );

    return {
      scoped: {
        artifacts: allArtifacts,
        versions: allVersions,
        collections: allCollections,
        collectionLinks,
        artifactPerms,
        collectionPerms,
      },
      ownedTotal,
      ownedArtNormIds,
      checkedDirectSharedNormIds,
      remainingPermOffsets,
    };
  }

  /**
   * Streams remaining `MJ: Artifact Permissions` pages (`page >= 1`) in bounded `rv.RunViews(...)`
   * batch windows (`PERMISSION_PAGE_BATCH_SIZE = 4`) AFTER Page 0 has already rendered.
   */
  private async loadRemainingSharedPermissionPages(params: {
    rv: RunView;
    user: UserInfo;
    artifactTypes: MJArtifactTypeEntity[];
    generation: number;
    remainingPermOffsets: ReadonlyArray<number>;
    ownedTotal: number;
    ownedArtNormIds: Set<string>;
    checkedDirectSharedNormIds: Set<string>;
  }): Promise<void> {
    const {
      rv,
      user,
      artifactTypes,
      generation,
      remainingPermOffsets,
      ownedTotal,
      ownedArtNormIds,
      checkedDirectSharedNormIds,
    } = params;

    const safeEnvId = EscapeSQLString(this.EffectiveEnvironmentId);
    const safeUserId = EscapeSQLString(user.ID);
    const targetEnvNorm = NormalizeUUID(this.EffectiveEnvironmentId);
    const currentUserNorm = NormalizeUUID(user.ID);
    const envFilter = `EnvironmentID='${safeEnvId}'`;
    const visibleFilter = `(Visibility IS NULL OR Visibility <> 'System Only')`;
    const pageSize = this.ArtifactPageSize > 0 ? this.ArtifactPageSize : 200;

    try {
      for (
        let windowIdx = 0;
        windowIdx < remainingPermOffsets.length;
        windowIdx += PERMISSION_PAGE_BATCH_SIZE
      ) {
        if (this.isReloadStale(generation)) {
          return;
        }

        const offsetWindow = remainingPermOffsets.slice(
          windowIdx,
          windowIdx + PERMISSION_PAGE_BATCH_SIZE,
        );
        const permBatchQueries: RunViewParams[] = offsetWindow.map((startRow) => ({
          EntityName: 'MJ: Artifact Permissions',
          ExtraFilter: `UserID='${safeUserId}' AND CanRead=1`,
          Fields: ARTIFACT_PERMISSION_SUMMARY_FIELDS,
          OrderBy: '__mj_CreatedAt DESC, ID DESC',
          StartRow: startRow,
          MaxRows: pageSize,
          SkipTotalRowCount: true,
          ResultType: 'simple',
        }));

        const permBatchResults = await rv.RunViews(permBatchQueries, user);
        if (this.isReloadStale(generation)) {
          return;
        }
        this.assertRunViewsSucceeded(permBatchResults);

        const batchPerms: ArtifactPermissionSummaryRow[] = [];
        for (const pageRes of permBatchResults) {
          const rows = (pageRes?.Results ?? []) as ArtifactPermissionSummaryRow[];
          if (rows.length > 0) {
            batchPerms.push(...rows);
          }
        }
        if (batchPerms.length === 0) {
          break;
        }

        const cached = this.cachedWorkspaceRecords;
        if (!cached) {
          return;
        }

        const loadedArtNormSet = new Set(cached.artifacts.map((a) => NormalizeUUID(a.ID)));
        const existingDirectNormSet = new Set(
          this.allDirectSharedArtIds.map((id) => NormalizeUUID(id)),
        );

        const touchesLoadedArtifact = batchPerms.some((ap) =>
          loadedArtNormSet.has(NormalizeUUID(ap.ArtifactID)),
        );

        const newCandidateSharedIds: string[] = [];
        for (const ap of batchPerms) {
          if (!ap.CanRead || !ap.ArtifactID) {
            continue;
          }
          const normArtId = NormalizeUUID(ap.ArtifactID);
          if (ownedArtNormIds.has(normArtId) || checkedDirectSharedNormIds.has(normArtId)) {
            continue;
          }
          checkedDirectSharedNormIds.add(normArtId);
          newCandidateSharedIds.push(ap.ArtifactID);
        }

        let hydratedNewArtifacts: MJArtifactEntity[] = [];
        let hydratedNewVersions: VersionSummaryRow[] = [];
        const verifiedUnpagedIds: string[] = [];

        if (newCandidateSharedIds.length > 0) {
          const envCheckQueries: RunViewParams[] = this.chunkIds(newCandidateSharedIds).map(
            (chunk) => ({
              EntityName: 'MJ: Artifacts',
              ExtraFilter: `${envFilter} AND ${visibleFilter} AND UserID <> '${safeUserId}' AND ID IN (${this.sqlUuidInList(chunk)})`,
              Fields: ['ID', 'EnvironmentID', 'UserID'],
              OrderBy: '__mj_UpdatedAt DESC',
              IgnoreMaxRows: true,
              SkipTotalRowCount: true,
              ResultType: 'simple',
            }),
          );
          const envCheckResults = await rv.RunViews(envCheckQueries, user);
          if (this.isReloadStale(generation)) {
            return;
          }
          this.assertRunViewsSucceeded(envCheckResults);

          const validSharedIds: string[] = [];
          for (const checkRes of envCheckResults) {
            if (checkRes?.Results) {
              for (const row of checkRes.Results as EnvironmentScopedArtifactIdRow[]) {
                const inTargetEnv =
                  !row.EnvironmentID || NormalizeUUID(row.EnvironmentID) === targetEnvNorm;
                const notOwnedByCurrent =
                  !row.UserID || NormalizeUUID(row.UserID) !== currentUserNorm;
                if (row.ID && inTargetEnv && notOwnedByCurrent) {
                  validSharedIds.push(row.ID);
                }
              }
            }
          }

          const dedupedValidIds = this.uniqueIds(validSharedIds).filter((id) => {
            const norm = NormalizeUUID(id);
            return !loadedArtNormSet.has(norm) && !existingDirectNormSet.has(norm);
          });

          // If Page 0 yielded zero visible items (e.g., all Page 0 shares belonged to another environment),
          // hydrate up to one page immediately so the workspace is not left empty.
          if ((this.cachedWorkspaceRecords?.artifacts.length ?? 0) === 0 && dedupedValidIds.length > 0) {
            const hydrateSlice = dedupedValidIds.slice(0, pageSize);
            const unpagedRemainder = dedupedValidIds.slice(pageSize);

            const hydrateQueries: RunViewParams[] = [];
            const artQueryIndices: number[] = [];
            const verQueryIndices: number[] = [];

            for (const chunk of this.chunkIds(hydrateSlice)) {
              artQueryIndices.push(hydrateQueries.length);
              hydrateQueries.push({
                EntityName: 'MJ: Artifacts',
                ExtraFilter: `${envFilter} AND ${visibleFilter} AND UserID <> '${safeUserId}' AND ID IN (${this.sqlUuidInList(chunk)})`,
                OrderBy: '__mj_UpdatedAt DESC, ID DESC',
                StartRow: 0,
                MaxRows: chunk.length,
                ResultType: 'entity_object',
              });
            }
            for (const verQuery of this.buildScopedArtifactVersionQueries(hydrateSlice)) {
              verQueryIndices.push(hydrateQueries.length);
              hydrateQueries.push(verQuery);
            }

            const hydrateBatch = await rv.RunViews(hydrateQueries, user);
            if (this.isReloadStale(generation)) {
              return;
            }
            this.assertRunViewsSucceeded(hydrateBatch);

            for (const idx of artQueryIndices) {
              if (hydrateBatch[idx]?.Results) {
                for (const art of hydrateBatch[idx].Results as MJArtifactEntity[]) {
                  const inTargetEnv =
                    !art.EnvironmentID || NormalizeUUID(art.EnvironmentID) === targetEnvNorm;
                  const notOwnedByCurrent =
                    !art.UserID || NormalizeUUID(art.UserID) !== currentUserNorm;
                  if (inTargetEnv && notOwnedByCurrent) {
                    hydratedNewArtifacts.push(art);
                  }
                }
              }
            }
            for (const idx of verQueryIndices) {
              if (hydrateBatch[idx]?.Results) {
                hydratedNewVersions.push(...(hydrateBatch[idx].Results as VersionSummaryRow[]));
              }
            }

            hydratedNewArtifacts = this.dedupeEntitiesById(hydratedNewArtifacts);
            hydratedNewVersions = this.dedupeEntitiesById(hydratedNewVersions);

            const hydratedIds = this.uniqueIds(hydratedNewArtifacts.map((a) => a.ID));
            this.allDirectSharedArtIds = [
              ...this.allDirectSharedArtIds.slice(0, this.directSharedArtifactOffset),
              ...hydratedIds,
              ...this.allDirectSharedArtIds.slice(this.directSharedArtifactOffset),
              ...unpagedRemainder,
            ];
            this.directSharedArtifactOffset += hydratedIds.length;
          } else {
            verifiedUnpagedIds.push(...dedupedValidIds);
          }
        }

        if (verifiedUnpagedIds.length > 0) {
          this.allDirectSharedArtIds = [...this.allDirectSharedArtIds, ...verifiedUnpagedIds];
        }

        const latestCached = this.cachedWorkspaceRecords;
        if (!latestCached || this.isReloadStale(generation)) {
          return;
        }

        const latestMergedPerms = this.dedupeEntitiesById([
          ...latestCached.artifactPerms,
          ...batchPerms,
        ]);
        const latestLoadedArtNormSet = new Set(
          latestCached.artifacts.map((a) => NormalizeUUID(a.ID)),
        );
        const latestTouchesLoadedArtifact =
          touchesLoadedArtifact ||
          batchPerms.some((ap) => latestLoadedArtNormSet.has(NormalizeUUID(ap.ArtifactID)));

        const updatedArtifacts =
          hydratedNewArtifacts.length > 0
            ? this.dedupeEntitiesById([...latestCached.artifacts, ...hydratedNewArtifacts])
            : latestCached.artifacts;
        if (hydratedNewArtifacts.length > 0) {
          updatedArtifacts.sort((a, b) => {
            const aTime = a.__mj_UpdatedAt ? new Date(a.__mj_UpdatedAt).getTime() : 0;
            const bTime = b.__mj_UpdatedAt ? new Date(b.__mj_UpdatedAt).getTime() : 0;
            return bTime - aTime;
          });
        }
        const updatedVersions =
          hydratedNewVersions.length > 0
            ? this.dedupeEntitiesById([...latestCached.versions, ...hydratedNewVersions])
            : latestCached.versions;

        this.cachedWorkspaceRecords = {
          ...latestCached,
          artifacts: updatedArtifacts,
          versions: updatedVersions,
          artifactPerms: latestMergedPerms,
        };

        this.LoadedArtifactCount = updatedArtifacts.length;
        const loadedSharedDelta = Math.max(0, updatedArtifacts.length - this.ownedArtifactOffset);
        const unpagedDirectCount = Math.max(
          0,
          this.allDirectSharedArtIds.length - this.directSharedArtifactOffset,
        );
        this.TotalArtifactCount = Math.max(
          this.LoadedArtifactCount,
          ownedTotal + loadedSharedDelta + unpagedDirectCount,
        );

        if (hydratedNewArtifacts.length > 0 || latestTouchesLoadedArtifact) {
          this.hydrateWorkspaceViewModels({
            user,
            artifactTypes,
            artifacts: updatedArtifacts,
            versions: updatedVersions,
            collections: latestCached.collections,
            collectionLinks: latestCached.collectionLinks,
            artifactPerms: latestMergedPerms,
            collectionPerms: latestCached.collectionPerms,
          });
        }

        this.emitWorkspaceState();
        this.notifyViewCheck();
      }
    } catch (err) {
      if (!this.isReloadStale(generation)) {
        const msg =
          err instanceof Error ? err.message : 'Failed to load shared Library permissions.';
        this.LoadMoreError = msg;
        this.notifications.CreateSimpleNotification(msg, 'error', 4000);
      }
    }
  }

  /**
   * Builds portable per-chunk version summary queries ordered newest-first per artifact so callers
   * group and pick the latest version across any database provider without vendor-specific SQL.
   */
  private buildScopedArtifactVersionQueries(artifactIds: ReadonlyArray<string>): RunViewParams[] {
    const queries: RunViewParams[] = [];
    for (const chunk of this.chunkIds(artifactIds)) {
      const inList = this.sqlUuidInList(chunk);
      queries.push({
        EntityName: 'MJ: Artifact Versions',
        ExtraFilter: `ArtifactID IN (${inList})`,
        Fields: VERSION_SUMMARY_FIELDS,
        OrderBy: 'ArtifactID ASC, VersionNumber DESC',
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

    // Index direct collection permissions & propagate ParentID ancestry inheritance
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

    const colEntityByNormId = new Map<string, MJCollectionEntity>();
    for (const col of data.collections) {
      colEntityByNormId.set(NormalizeUUID(col.ID), col);
    }

    const effectiveColGrants = new Map<
      string,
      { CanRead: boolean; CanEdit: boolean; CanShare: boolean; CanDelete: boolean }
    >();
    for (const col of data.collections) {
      const grants = { CanRead: false, CanEdit: false, CanShare: false, CanDelete: false };
      let cursor: MJCollectionEntity | undefined = col;
      const visited = new Set<string>();
      for (let depth = 0; depth < 16 && cursor; depth++) {
        const normCur = NormalizeUUID(cursor.ID);
        if (visited.has(normCur)) break;
        visited.add(normCur);
        if (!cursor.OwnerID || UUIDsEqual(cursor.OwnerID, data.user.ID)) {
          grants.CanRead = true;
          grants.CanEdit = true;
          grants.CanShare = true;
          grants.CanDelete = true;
          break;
        }
        const directCp = rawColPermById.get(normCur);
        if (directCp) {
          if (directCp.CanRead) grants.CanRead = true;
          if (directCp.CanEdit) grants.CanEdit = true;
          if (directCp.CanShare) grants.CanShare = true;
          if (directCp.CanDelete) grants.CanDelete = true;
        }
        cursor = cursor.ParentID ? colEntityByNormId.get(NormalizeUUID(cursor.ParentID)) : undefined;
      }
      effectiveColGrants.set(NormalizeUUID(col.ID), grants);
    }

    // Filter readable collections (direct OR inherited via ParentID ancestry)
    const readableCollections = data.collections.filter((col) => {
      return effectiveColGrants.get(NormalizeUUID(col.ID))?.CanRead === true;
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

    // Map collection links (both by version and by artifact so v2+ removal stays reliable)
    this.collectionLinksByCollectionAndVersion ??= new Map<string, string>();
    this.collectionLinksByCollectionAndVersion.clear();
    this.collectionLinksByCollectionAndArtifact ??= new Map<string, string[]>();
    this.collectionLinksByCollectionAndArtifact.clear();
    this.engineReadableArtifactIds ??= new Set<string>();
    const collectionsForArtifact = new Map<string, Set<string>>();
    const directArtifactsPerCollection = new Map<string, Set<string>>();

    for (const link of data.collectionLinks) {
      const normCol = NormalizeUUID(link.CollectionID);
      const normVer = NormalizeUUID(link.ArtifactVersionID);
      this.collectionLinksByCollectionAndVersion.set(`${normCol}:${normVer}`, link.ID);

      if (!readableColById.has(normCol)) continue;
      const normArt = artifactIdByVersionId.get(normVer);
      if (!normArt) continue;

      const artKey = `${normCol}:${normArt}`;
      const existingLinks = this.collectionLinksByCollectionAndArtifact.get(artKey) ?? [];
      if (!new UUIDSet(existingLinks).Has(link.ID)) {
        existingLinks.push(link.ID);
      }
      this.collectionLinksByCollectionAndArtifact.set(artKey, existingLinks);

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
        const grants = effectiveColGrants.get(cid);
        if (grants) {
          if (grants.CanRead) colCanRead = true;
          if (grants.CanEdit) colCanEdit = true;
          if (grants.CanShare) colCanShare = true;
          if (grants.CanDelete) colCanDelete = true;
        }
      }

      const canRead =
        isOwner ||
        directPerm?.CanRead === true ||
        colCanRead ||
        this.engineReadableArtifactIds.has(normArt);
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

      const parsedConfig = ParseArtifactVersionConfiguration(latest?.Configuration);
      const allTypes = ArtifactMetadataEngine.Instance.ArtifactTypes ?? [];
      const thumbPolicy = ResolveArtifactTypeThumbnailPolicy(
        typeEntity ?? typeName,
        allTypes.length > 0 ? allTypes : Array.from(typeById.values()),
        driverClass,
      );
      const allowPreview = thumbPolicy.Enabled && thumbPolicy.Mode === 'Rendered';

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
        PreviewSnapshot: allowPreview ? parsedConfig?.previewSnapshot ?? null : null,
        ThumbnailDataUrl: allowPreview ? parsedConfig?.thumbnailDataUrl ?? null : null,
        ThumbnailPolicyMode: thumbPolicy.Mode,
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
    this.syncArtifactSharedWithMeEntries(data.artifactPerms);

    // Build Collection tree
    const nodesByNormId = new Map<string, LibraryCollectionNode>();
    for (const col of readableCollections) {
      const normCol = NormalizeUUID(col.ID);
      const isColOwner = !col.OwnerID || UUIDsEqual(col.OwnerID, data.user.ID);
      const cp = rawColPermById.get(normCol);
      const colGrants = effectiveColGrants.get(normCol);
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
        CanEdit: colGrants?.CanEdit === true || isColOwner || cp?.CanEdit === true,
        CanShare: colGrants?.CanShare === true || isColOwner || cp?.CanShare === true,
        CanDelete: colGrants?.CanDelete === true || isColOwner || cp?.CanDelete === true,
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

    if (params.tab && ['overview', 'collections', 'all', 'shared', 'shared-by-me', 'drives'].includes(params.tab)) {
      this.HubTab = params.tab as LibraryHubTab;
    } else {
      this.HubTab = fallbackHubTab;
    }

    if (
      params.section &&
      ['all', 'collections', 'shared', 'shared-by-me', 'starred', 'collection', 'drive'].includes(params.section)
    ) {
      this.NavigatorSection = params.section as LibraryNavigatorSection;
    } else if (params.mode !== 'hub') {
      this.NavigatorSection = fallbackSection;
    }

    if (
      params.collectionId &&
      !params.driveId &&
      (!params.section || params.section === 'collection')
    ) {
      this.SelectedCollectionId = params.collectionId;
      if (this.SurfaceMode !== 'hub' || params.section === 'collection') {
        this.NavigatorSection = 'collection';
      }
      this.expandAncestorsOf(params.collectionId);
      void this.resolveSelectedCollectionAncestryPermissions(params.collectionId);
    } else if (!params.section || params.section !== 'collection') {
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
      const rawVersion =
        params.version != null ? String(params.version).trim().toLowerCase() : undefined;
      const parsedVer =
        rawVersion && rawVersion !== 'latest' ? Number(rawVersion) : undefined;
      this.ActiveVersionNumber =
        parsedVer !== undefined && Number.isFinite(parsedVer) && parsedVer > 0
          ? Math.floor(parsedVer)
          : undefined;
      this.IsFullCanvasOpen =
        params.canvas === '1' || params.canvas === 'true' || params.canvas === true || this.SurfaceMode === 'hub';
      if (!this.AllItems.some((i) => UUIDsEqual(i.Id, params.artifactId!))) {
        void this.hydrateActiveArtifactIfMissing(params.artifactId);
      }
    } else {
      this.ActiveArtifactId = null;
      this.ActiveVersionNumber = undefined;
      this.offPageActiveItem = null;
      this.IsFullCanvasOpen = false;
      const explicitHub = params.mode === 'hub';
      if (
        explicitHub ||
        (!params.mode && this.InitialMode !== 'navigator' && this.SurfaceMode === 'navigator')
      ) {
        this.SurfaceMode = 'hub';
      }
    }
  }

  private restoreUserPreferences(): void {
    const mode = UserInfoEngine.Instance.GetSetting(SETTING_SURFACE_MODE);
    if ((mode === 'hub' || mode === 'navigator') && !this.InitialMode) {
      this.preferredSurfaceMode = mode;
      // Only keep Navigator/Split active on startup if an artifact is already open
      this.SurfaceMode = mode === 'navigator' && !this.ActiveArtifactId ? 'hub' : mode;
    }
    const itemViewMode = UserInfoEngine.Instance.GetSetting(SETTING_ITEM_VIEW_MODE);
    if (itemViewMode === 'full' || itemViewMode === 'split') {
      this.PreferredItemViewMode = itemViewMode;
    }
    const listStyle = UserInfoEngine.Instance.GetSetting(SETTING_LIST_STYLE);
    if (listStyle === 'cards' || listStyle === 'list') {
      this.ListStyle = listStyle;
    }
    const railCollapsed = UserInfoEngine.Instance.GetSetting(SETTING_LEFT_RAIL_COLLAPSED);
    if (railCollapsed === '1' || railCollapsed === 'true') {
      this.LeftRailCollapsed = true;
    } else if (railCollapsed === '0' || railCollapsed === 'false') {
      this.LeftRailCollapsed = false;
    }
    const showThumbPref = UserInfoEngine.Instance.GetSetting(SETTING_SHOW_CARD_THUMBNAILS);
    if (showThumbPref === 'false' || showThumbPref === '0') {
      this.ShowCardThumbnails = false;
    } else if (showThumbPref === 'true' || showThumbPref === '1') {
      this.ShowCardThumbnails = true;
    }
    const starredRaw = UserInfoEngine.Instance.GetSetting(SETTING_STARRED_IDS);
    if (starredRaw) {
      try {
        const parsed = JSON.parse(starredRaw) as string[];
        if (Array.isArray(parsed)) {
          this.StarredArtifactIds = new Set(parsed.map((id) => NormalizeUUID(id)));
        }
      } catch (err) {
        LogError(`LibraryWorkspaceComponent: failed to parse ${SETTING_STARRED_IDS}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  public ToggleCardThumbnails(): void {
    this.ShowCardThumbnails = !this.ShowCardThumbnails;
    this.saveSettingSafe(SETTING_SHOW_CARD_THUMBNAILS, this.ShowCardThumbnails ? 'true' : 'false');
    this.cdr.detectChanges();
  }

  private saveSettingSafe(key: string, value: string): void {
    UserInfoEngine.Instance.SetSettingDebounced(key, value);
  }

  private async loadEngineReadableArtifactIds(user: UserInfo): Promise<void> {
    this.engineReadableArtifactIds ??= new Set<string>();
    this.engineReadableArtifactIds.clear();
    const engine = ArtifactPermissionEngine.Instance;
    const rvProvider = this.ProviderToUse as Partial<IRunViewProvider> | null | undefined;
    if (
      typeof engine?.BuildReadableArtifactIdSet !== 'function' ||
      typeof rvProvider?.RunView !== 'function'
    ) {
      return;
    }
    try {
      const readableSet = await engine.BuildReadableArtifactIdSet(this.ProviderToUse, user);
      for (const id of readableSet) {
        if (id) {
          this.engineReadableArtifactIds.add(NormalizeUUID(id));
        }
      }
    } catch {
      // Partial test providers without full permission tables cleanly keep engineReadableArtifactIds empty
    }
  }

  private async resolveSelectedCollectionAncestryPermissions(collectionId: string): Promise<void> {
    const engine = ArtifactPermissionEngine.Instance;
    const user = this.EffectiveUser;
    if (!collectionId || !user || typeof engine?.ResolveCollectionAncestryPermissions !== 'function') {
      return;
    }
    try {
      const resolved = await engine.ResolveCollectionAncestryPermissions(
        this.ProviderToUse,
        collectionId,
        user,
      );
      if (this.isDestroyed || !UUIDsEqual(this.SelectedCollectionId, collectionId)) {
        return;
      }
      const normCol = NormalizeUUID(collectionId);
      const existingPerm = this.collectionPermByColId.get(normCol);
      if (resolved.CanRead) {
        this.collectionPermByColId.set(normCol, {
          id: existingPerm?.id ?? '',
          collectionId,
          userId: user.ID,
          userName: existingPerm?.userName ?? user.Name ?? '',
          canRead: resolved.CanRead,
          canEdit: existingPerm?.canEdit || resolved.CanEdit,
          canShare: existingPerm?.canShare || resolved.CanShare,
          canDelete: existingPerm?.canDelete || resolved.CanDelete,
          sharedByUserId: existingPerm?.sharedByUserId ?? null,
          sharedByUserName: existingPerm?.sharedByUserName ?? null,
          sharedAt: existingPerm?.sharedAt ?? new Date(),
        });
      }
      const node = this.FlatCollections.find((c) => UUIDsEqual(c.Id, collectionId));
      if (node) {
        const nextEdit = node.CanEdit || resolved.CanEdit;
        const nextShare = node.CanShare || resolved.CanShare;
        const nextDelete = node.CanDelete || resolved.CanDelete;
        if (node.CanEdit !== nextEdit || node.CanShare !== nextShare || node.CanDelete !== nextDelete) {
          node.CanEdit = nextEdit;
          node.CanShare = nextShare;
          node.CanDelete = nextDelete;
          this.notifyViewCheck();
        }
      }
    } catch {
      // Graceful fallback when running with mock metadata providers
    }
  }

  private async hydrateActiveArtifactIfMissing(artifactId: string): Promise<void> {
    const targetId = artifactId.trim();
    const user = this.EffectiveUser;
    if (!targetId || !user) return;
    if (this.AllItems.some((i) => UUIDsEqual(i.Id, targetId))) {
      this.offPageActiveItem = null;
      return;
    }

    const reqSeq = ++this.offPageArtifactRequestSeq;
    const md = this.ProviderToUse;
    try {
      const [perms, artifact, verRes] = await Promise.all([
        typeof ArtifactPermissionEngine.Instance?.ResolvePermissions === 'function'
          ? ArtifactPermissionEngine.Instance.ResolvePermissions(md, targetId, user).catch(() => ({
              CanRead: false,
              CanEdit: false,
              CanShare: false,
              CanDelete: false,
            }))
          : Promise.resolve({ CanRead: false, CanEdit: false, CanShare: false, CanDelete: false }),
        md.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', user).then(async (e) =>
          (await e.Load(targetId)) ? e : null,
        ),
        RunView.FromMetadataProvider(md).RunView<VersionSummaryRow>(
          {
            EntityName: 'MJ: Artifact Versions',
            ExtraFilter: `ArtifactID='${EscapeSQLString(targetId)}'`,
            Fields: VERSION_SUMMARY_FIELDS,
            OrderBy: 'VersionNumber DESC',
            MaxRows: 1,
            ResultType: 'simple',
          },
          user,
        ),
      ]);

      if (
        this.isDestroyed ||
        reqSeq !== this.offPageArtifactRequestSeq ||
        !UUIDsEqual(this.ActiveArtifactId, targetId) ||
        !artifact
      ) {
        return;
      }

      const isOwner = UUIDsEqual(artifact.UserID, user.ID);
      const canRead = isOwner || perms.CanRead === true;
      if (!canRead) {
        return;
      }

      const latest = verRes.Success && verRes.Results && verRes.Results.length > 0 ? verRes.Results[0] : null;
      const allTypes = ArtifactMetadataEngine.Instance.ArtifactTypes ?? [];
      const typeEntity = allTypes.find((t) => UUIDsEqual(t.ID, artifact.TypeID));
      const driverClass = typeEntity?.DriverClass ?? '';
      const typeName = artifact.Type || typeEntity?.Name || 'Artifact';
      const categoryInfo = this.classifyArtifactCategory(
        driverClass,
        typeName,
        latest?.ContentMode ?? 'Text',
      );
      const parsedConfig = ParseArtifactVersionConfiguration(latest?.Configuration);
      const thumbPolicy = ResolveArtifactTypeThumbnailPolicy(
        typeEntity ?? typeName,
        allTypes,
        driverClass,
      );
      const allowPreview = thumbPolicy.Enabled && thumbPolicy.Mode === 'Rendered';

      this.offPageActiveItem = {
        Id: artifact.ID,
        Name: artifact.Name,
        Description: artifact.Description || latest?.Description || '',
        TypeId: artifact.TypeID,
        TypeName: typeName,
        DriverClass: driverClass,
        Icon: this.iconService.GetArtifactIcon(artifact),
        Category: categoryInfo.Category,
        CategoryBadge: categoryInfo.Badge,
        LatestVersionId: latest?.ID ?? null,
        LatestVersionNumber: latest?.VersionNumber ?? 1,
        VersionCount: Math.max(latest?.VersionNumber ?? 1, 1),
        ContentMode: latest?.ContentMode ?? 'Text',
        MimeType: latest?.MimeType ?? typeEntity?.ContentType ?? null,
        FileName: latest?.FileName ?? null,
        ContentSnippet: artifact.Description || latest?.Description || typeEntity?.Description || '',
        PreviewSnapshot: allowPreview ? parsedConfig?.previewSnapshot ?? null : null,
        ThumbnailDataUrl: allowPreview ? parsedConfig?.thumbnailDataUrl ?? null : null,
        ThumbnailPolicyMode: thumbPolicy.Mode,
        UpdatedAt:
          artifact.__mj_UpdatedAt instanceof Date
            ? artifact.__mj_UpdatedAt
            : new Date(artifact.__mj_UpdatedAt),
        OwnerUserId: artifact.UserID,
        OwnerName: artifact.User || (isOwner ? 'You' : 'Shared'),
        IsOwnedByCurrentUser: isOwner,
        IsSharedWithMe: !isOwner,
        IsStarred: this.StarredArtifactIds.has(NormalizeUUID(artifact.ID)),
        CanEdit: isOwner || perms.CanEdit === true,
        CanShare: isOwner || perms.CanShare === true,
        CanDelete: isOwner || perms.CanDelete === true,
        CollectionIds: [],
        CollectionNames: [],
        ArtifactEntity: artifact,
      };

      this.emitWorkspaceState();
      this.notifyViewCheck();
    } catch {
      // Fall back cleanly if the off-page artifact is inaccessible or provider does not support GetEntityObject
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
