import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, ChangeDetectorRef, inject } from '@angular/core';
import { GraphQLDataProvider, GraphQLFileStorageClient } from '@memberjunction/graphql-dataprovider';
import { FileStorageEngineBase, StorageAccountWithProvider } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { MJNotificationService } from '@memberjunction/ng-notifications';

/**
 * Represents a file or folder item in the grid
 */
export interface FileGridItem {
  Key: string;
  name: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  Type: 'file' | 'folder';
  Size: number;
  LastModified: Date;
  ContentType?: string;
  Etag?: string;
}

/**
 * Result from a single provider's search
 */
export interface FileSearchResultItem {
  path: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  name: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  size: number;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  contentType: string;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  lastModified: string;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  relevance?: number;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  excerpt?: string;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  matchInFilename?: boolean;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  objectId?: string;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
}

/**
 * Search results from a single account
 */
export interface AccountSearchResult {
  accountID: string;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  accountName: string;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  success: boolean;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  errorMessage?: string;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  results: FileSearchResultItem[];  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  totalMatches?: number;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  hasMore: boolean;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  nextPageToken?: string;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
}

/**
 * Aggregated search results from multiple accounts
 */
export interface MultiProviderSearchResult {
  AccountResults: AccountSearchResult[];
  TotalResultsReturned: number;
  SuccessfulAccounts: number;
  FailedAccounts: number;
}

/**
 * Displays files and folders in a grid/list view.
 * Shows file metadata like name, size, type, and last modified date.
 * Supports file selection and navigation to folders.
 */
@Component({
  standalone: false,
  selector: 'mj-file-grid',
  templateUrl: './file-grid.component.html',
  styleUrls: ['./file-grid.component.css']
})
export class FileGridComponent implements OnInit, OnChanges {
  /**
   * The storage account to list files from (includes provider details)
   */
  @Input() Account: StorageAccountWithProvider | null = null;

  /** @deprecated Use {@link Account}. */
  @Input() set account(value: StorageAccountWithProvider | null) {
    this.Account = value;
  }
  /** @deprecated Use {@link Account}. */
  get account(): StorageAccountWithProvider | null {
    return this.Account;
  }

  /**
   * The current folder path to display
   */
  @Input() FolderPath: string = '';

  /** @deprecated Use {@link FolderPath}. */
  @Input() set folderPath(value: string) {
    this.FolderPath = value;
  }
  /** @deprecated Use {@link FolderPath}. */
  get folderPath(): string {
    return this.FolderPath;
  }

  /**
   * Emits when a folder is double-clicked for navigation
   */
  @Output() FolderNavigate = new EventEmitter<string>();

  /**
   * @deprecated Use {@link FolderNavigate}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (folderNavigate) keeps working. Must stay AFTER FolderNavigate: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() folderNavigate = this.FolderNavigate;

  /**
   * Emits when the folder structure has changed (e.g., new folder created)
   * This signals that the folder tree should refresh
   */
  @Output() FolderStructureChanged = new EventEmitter<void>();

  /**
   * @deprecated Use {@link FolderStructureChanged}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (folderStructureChanged) keeps working. Must stay AFTER FolderStructureChanged: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() folderStructureChanged = this.FolderStructureChanged;

  /**
   * List of files and folders in the current directory
   */
  public Items: FileGridItem[] = [];

  /** @deprecated Use {@link Items}. */
  public get items(): FileGridItem[] {
    return this.Items;
  }
  /** @deprecated Use {@link Items}. */
  public set items(value: FileGridItem[]) {
    this.Items = value;
  }

  /**
   * Currently selected item keys in the grid (Kendo stores keys, not full objects)
   */
  public SelectedItems: string[] = [];

  /** @deprecated Use {@link SelectedItems}. */
  public get selectedItems(): string[] {
    return this.SelectedItems;
  }
  /** @deprecated Use {@link SelectedItems}. */
  public set selectedItems(value: string[]) {
    this.SelectedItems = value;
  }

  private cdr = inject(ChangeDetectorRef);

  /**
   * Loading state indicator
   */
  public isLoading: boolean = false;

  /**
   * Error message if loading fails
   */
  public errorMessage: string | null = null;

  /**
   * View mode: 'grid' or 'list'
   */
  public ViewMode: 'grid' | 'list' = 'list';

  /** @deprecated Use {@link ViewMode}. */
  public get viewMode(): 'grid' | 'list' {
    return this.ViewMode;
  }
  /** @deprecated Use {@link ViewMode}. */
  public set viewMode(value: 'grid' | 'list') {
    this.ViewMode = value;
  }

  /**
   * Sort configuration for the grid
   */
  public Sort: Array<{ field: string; dir?: 'asc' | 'desc' }> = [
    { field: 'name', dir: 'asc' }
  ];

  /** @deprecated Use {@link Sort}. */
  public get sort(): Array<{ field: string; dir?: 'asc' | 'desc' }> {
    return this.Sort;
  }
  /** @deprecated Use {@link Sort}. */
  public set sort(value: Array<{ field: string; dir?: 'asc' | 'desc' }>) {
    this.Sort = value;
  }

  /**
   * Search query for filtering files/folders
   */
  public SearchQuery: string = '';

  /** @deprecated Use {@link SearchQuery}. */
  public get searchQuery(): string {
    return this.SearchQuery;
  }
  /** @deprecated Use {@link SearchQuery}. */
  public set searchQuery(value: string) {
    this.SearchQuery = value;
  }

  /**
   * File type filter ('all', 'files', 'folders')
   */
  public FileTypeFilter: 'all' | 'files' | 'folders' = 'all';

  /** @deprecated Use {@link FileTypeFilter}. */
  public get fileTypeFilter(): 'all' | 'files' | 'folders' {
    return this.FileTypeFilter;
  }
  /** @deprecated Use {@link FileTypeFilter}. */
  public set fileTypeFilter(value: 'all' | 'files' | 'folders') {
    this.FileTypeFilter = value;
  }

  /**
   * Filtered list of items based on search and filter criteria
   */
  public FilteredItems: FileGridItem[] = [];

  /** @deprecated Use {@link FilteredItems}. */
  public get filteredItems(): FileGridItem[] {
    return this.FilteredItems;
  }
  /** @deprecated Use {@link FilteredItems}. */
  public set filteredItems(value: FileGridItem[]) {
    this.FilteredItems = value;
  }

  /**
   * Drag-and-drop state
   */
  public IsDragging: boolean = false;

  /** @deprecated Use {@link IsDragging}. */
  public get isDragging(): boolean {
    return this.IsDragging;
  }
  /** @deprecated Use {@link IsDragging}. */
  public set isDragging(value: boolean) {
    this.IsDragging = value;
  }

  /**
   * Upload progress state
   */
  public IsUploading: boolean = false;

  /** @deprecated Use {@link IsUploading}. */
  public get isUploading(): boolean {
    return this.IsUploading;
  }
  /** @deprecated Use {@link IsUploading}. */
  public set isUploading(value: boolean) {
    this.IsUploading = value;
  }
  public UploadProgress: number = 0;

  /** @deprecated Use {@link UploadProgress}. */
  public get uploadProgress(): number {
    return this.UploadProgress;
  }
  /** @deprecated Use {@link UploadProgress}. */
  public set uploadProgress(value: number) {
    this.UploadProgress = value;
  }
  public UploadingFileName: string = '';

  /** @deprecated Use {@link UploadingFileName}. */
  public get uploadingFileName(): string {
    return this.UploadingFileName;
  }
  /** @deprecated Use {@link UploadingFileName}. */
  public set uploadingFileName(value: string) {
    this.UploadingFileName = value;
  }

  /**
   * New folder dialog state
   */
  public ShowNewFolderDialog: boolean = false;

  /** @deprecated Use {@link ShowNewFolderDialog}. */
  public get showNewFolderDialog(): boolean {
    return this.ShowNewFolderDialog;
  }
  /** @deprecated Use {@link ShowNewFolderDialog}. */
  public set showNewFolderDialog(value: boolean) {
    this.ShowNewFolderDialog = value;
  }
  public NewFolderName: string = '';

  /** @deprecated Use {@link NewFolderName}. */
  public get newFolderName(): string {
    return this.NewFolderName;
  }
  /** @deprecated Use {@link NewFolderName}. */
  public set newFolderName(value: string) {
    this.NewFolderName = value;
  }
  public IsCreatingFolder: boolean = false;

  /** @deprecated Use {@link IsCreatingFolder}. */
  public get isCreatingFolder(): boolean {
    return this.IsCreatingFolder;
  }
  /** @deprecated Use {@link IsCreatingFolder}. */
  public set isCreatingFolder(value: boolean) {
    this.IsCreatingFolder = value;
  }

  /**
   * Delete confirmation dialog state
   */
  public showDeleteDialog: boolean = false;
  public ItemToDelete: FileGridItem | null = null;

  /** @deprecated Use {@link ItemToDelete}. */
  public get itemToDelete(): FileGridItem | null {
    return this.ItemToDelete;
  }
  /** @deprecated Use {@link ItemToDelete}. */
  public set itemToDelete(value: FileGridItem | null) {
    this.ItemToDelete = value;
  }
  public IsDeleting: boolean = false;

  /** @deprecated Use {@link IsDeleting}. */
  public get isDeleting(): boolean {
    return this.IsDeleting;
  }
  /** @deprecated Use {@link IsDeleting}. */
  public set isDeleting(value: boolean) {
    this.IsDeleting = value;
  }

  /**
   * Rename dialog state
   */
  public ShowRenameDialog: boolean = false;

  /** @deprecated Use {@link ShowRenameDialog}. */
  public get showRenameDialog(): boolean {
    return this.ShowRenameDialog;
  }
  /** @deprecated Use {@link ShowRenameDialog}. */
  public set showRenameDialog(value: boolean) {
    this.ShowRenameDialog = value;
  }
  public ItemToRename: FileGridItem | null = null;

  /** @deprecated Use {@link ItemToRename}. */
  public get itemToRename(): FileGridItem | null {
    return this.ItemToRename;
  }
  /** @deprecated Use {@link ItemToRename}. */
  public set itemToRename(value: FileGridItem | null) {
    this.ItemToRename = value;
  }
  public NewItemName: string = '';

  /** @deprecated Use {@link NewItemName}. */
  public get newItemName(): string {
    return this.NewItemName;
  }
  /** @deprecated Use {@link NewItemName}. */
  public set newItemName(value: string) {
    this.NewItemName = value;
  }
  public IsRenaming: boolean = false;

  /** @deprecated Use {@link IsRenaming}. */
  public get isRenaming(): boolean {
    return this.IsRenaming;
  }
  /** @deprecated Use {@link IsRenaming}. */
  public set isRenaming(value: boolean) {
    this.IsRenaming = value;
  }

  /**
   * Copy dialog state
   */
  public ShowCopyDialog: boolean = false;

  /** @deprecated Use {@link ShowCopyDialog}. */
  public get showCopyDialog(): boolean {
    return this.ShowCopyDialog;
  }
  /** @deprecated Use {@link ShowCopyDialog}. */
  public set showCopyDialog(value: boolean) {
    this.ShowCopyDialog = value;
  }
  public ItemToCopy: FileGridItem | null = null;

  /** @deprecated Use {@link ItemToCopy}. */
  public get itemToCopy(): FileGridItem | null {
    return this.ItemToCopy;
  }
  /** @deprecated Use {@link ItemToCopy}. */
  public set itemToCopy(value: FileGridItem | null) {
    this.ItemToCopy = value;
  }
  public CopyDestinationPath: string = '';

  /** @deprecated Use {@link CopyDestinationPath}. */
  public get copyDestinationPath(): string {
    return this.CopyDestinationPath;
  }
  /** @deprecated Use {@link CopyDestinationPath}. */
  public set copyDestinationPath(value: string) {
    this.CopyDestinationPath = value;
  }
  public IsCopying: boolean = false;

  /** @deprecated Use {@link IsCopying}. */
  public get isCopying(): boolean {
    return this.IsCopying;
  }
  /** @deprecated Use {@link IsCopying}. */
  public set isCopying(value: boolean) {
    this.IsCopying = value;
  }

  /**
   * Move dialog state
   */
  public ShowMoveDialog: boolean = false;

  /** @deprecated Use {@link ShowMoveDialog}. */
  public get showMoveDialog(): boolean {
    return this.ShowMoveDialog;
  }
  /** @deprecated Use {@link ShowMoveDialog}. */
  public set showMoveDialog(value: boolean) {
    this.ShowMoveDialog = value;
  }
  public ItemToMove: FileGridItem | null = null;

  /** @deprecated Use {@link ItemToMove}. */
  public get itemToMove(): FileGridItem | null {
    return this.ItemToMove;
  }
  /** @deprecated Use {@link ItemToMove}. */
  public set itemToMove(value: FileGridItem | null) {
    this.ItemToMove = value;
  }
  public MoveDestinationPath: string = '';

  /** @deprecated Use {@link MoveDestinationPath}. */
  public get moveDestinationPath(): string {
    return this.MoveDestinationPath;
  }
  /** @deprecated Use {@link MoveDestinationPath}. */
  public set moveDestinationPath(value: string) {
    this.MoveDestinationPath = value;
  }
  public IsMoving: boolean = false;

  /** @deprecated Use {@link IsMoving}. */
  public get isMoving(): boolean {
    return this.IsMoving;
  }
  /** @deprecated Use {@link IsMoving}. */
  public set isMoving(value: boolean) {
    this.IsMoving = value;
  }

  /**
   * Copy to provider dialog state
   */
  public ShowCopyToProviderDialog: boolean = false;

  /** @deprecated Use {@link ShowCopyToProviderDialog}. */
  public get showCopyToProviderDialog(): boolean {
    return this.ShowCopyToProviderDialog;
  }
  /** @deprecated Use {@link ShowCopyToProviderDialog}. */
  public set showCopyToProviderDialog(value: boolean) {
    this.ShowCopyToProviderDialog = value;
  }
  public ItemToCopyToProvider: FileGridItem | null = null;

  /** @deprecated Use {@link ItemToCopyToProvider}. */
  public get itemToCopyToProvider(): FileGridItem | null {
    return this.ItemToCopyToProvider;
  }
  /** @deprecated Use {@link ItemToCopyToProvider}. */
  public set itemToCopyToProvider(value: FileGridItem | null) {
    this.ItemToCopyToProvider = value;
  }
  public AvailableAccounts: StorageAccountWithProvider[] = [];

  /** @deprecated Use {@link AvailableAccounts}. */
  public get availableAccounts(): StorageAccountWithProvider[] {
    return this.AvailableAccounts;
  }
  /** @deprecated Use {@link AvailableAccounts}. */
  public set availableAccounts(value: StorageAccountWithProvider[]) {
    this.AvailableAccounts = value;
  }
  public SelectedDestinationAccounts: Set<string> = new Set();

  /** @deprecated Use {@link SelectedDestinationAccounts}. */
  public get selectedDestinationAccounts(): Set<string> {
    return this.SelectedDestinationAccounts;
  }
  /** @deprecated Use {@link SelectedDestinationAccounts}. */
  public set selectedDestinationAccounts(value: Set<string>) {
    this.SelectedDestinationAccounts = value;
  }
  public CopyToAccountDestinationPath: string = '';

  /** @deprecated Use {@link CopyToAccountDestinationPath}. */
  public get copyToAccountDestinationPath(): string {
    return this.CopyToAccountDestinationPath;
  }
  /** @deprecated Use {@link CopyToAccountDestinationPath}. */
  public set copyToAccountDestinationPath(value: string) {
    this.CopyToAccountDestinationPath = value;
  }
  public IsCopyingToAccount: boolean = false;

  /** @deprecated Use {@link IsCopyingToAccount}. */
  public get isCopyingToAccount(): boolean {
    return this.IsCopyingToAccount;
  }
  /** @deprecated Use {@link IsCopyingToAccount}. */
  public set isCopyingToAccount(value: boolean) {
    this.IsCopyingToAccount = value;
  }
  public CopyToAccountProgress: { current: number; total: number; currentAccount: string } | null = null;

  /** @deprecated Use {@link CopyToAccountProgress}. */
  public get copyToAccountProgress(): { current: number; total: number; currentAccount: string } | null {
    return this.CopyToAccountProgress;
  }
  /** @deprecated Use {@link CopyToAccountProgress}. */
  public set copyToAccountProgress(value: { current: number; total: number; currentAccount: string } | null) {
    this.CopyToAccountProgress = value;
  }

  /**
   * Multi-provider search state
   */
  public IsMultiProviderSearchMode: boolean = false;

  /** @deprecated Use {@link IsMultiProviderSearchMode}. */
  public get isMultiProviderSearchMode(): boolean {
    return this.IsMultiProviderSearchMode;
  }
  /** @deprecated Use {@link IsMultiProviderSearchMode}. */
  public set isMultiProviderSearchMode(value: boolean) {
    this.IsMultiProviderSearchMode = value;
  }
  public MultiProviderSearchQuery: string = '';

  /** @deprecated Use {@link MultiProviderSearchQuery}. */
  public get multiProviderSearchQuery(): string {
    return this.MultiProviderSearchQuery;
  }
  /** @deprecated Use {@link MultiProviderSearchQuery}. */
  public set multiProviderSearchQuery(value: string) {
    this.MultiProviderSearchQuery = value;
  }
  public SelectedSearchProviders: Set<string> = new Set();

  /** @deprecated Use {@link SelectedSearchProviders}. */
  public get selectedSearchProviders(): Set<string> {
    return this.SelectedSearchProviders;
  }
  /** @deprecated Use {@link SelectedSearchProviders}. */
  public set selectedSearchProviders(value: Set<string>) {
    this.SelectedSearchProviders = value;
  }
  public IsSearching: boolean = false;

  /** @deprecated Use {@link IsSearching}. */
  public get isSearching(): boolean {
    return this.IsSearching;
  }
  /** @deprecated Use {@link IsSearching}. */
  public set isSearching(value: boolean) {
    this.IsSearching = value;
  }
  public MultiProviderSearchResults: MultiProviderSearchResult | null = null;

  /** @deprecated Use {@link MultiProviderSearchResults}. */
  public get multiProviderSearchResults(): MultiProviderSearchResult | null {
    return this.MultiProviderSearchResults;
  }
  /** @deprecated Use {@link MultiProviderSearchResults}. */
  public set multiProviderSearchResults(value: MultiProviderSearchResult | null) {
    this.MultiProviderSearchResults = value;
  }

  /**
   * Preview modal state
   */
  public ShowPreviewModal: boolean = false;

  /** @deprecated Use {@link ShowPreviewModal}. */
  public get showPreviewModal(): boolean {
    return this.ShowPreviewModal;
  }
  /** @deprecated Use {@link ShowPreviewModal}. */
  public set showPreviewModal(value: boolean) {
    this.ShowPreviewModal = value;
  }
  public PreviewItem: FileGridItem | null = null;

  /** @deprecated Use {@link PreviewItem}. */
  public get previewItem(): FileGridItem | null {
    return this.PreviewItem;
  }
  /** @deprecated Use {@link PreviewItem}. */
  public set previewItem(value: FileGridItem | null) {
    this.PreviewItem = value;
  }
  public PreviewUrl: string | null = null;

  /** @deprecated Use {@link PreviewUrl}. */
  public get previewUrl(): string | null {
    return this.PreviewUrl;
  }
  /** @deprecated Use {@link PreviewUrl}. */
  public set previewUrl(value: string | null) {
    this.PreviewUrl = value;
  }
  public IsLoadingPreview: boolean = false;

  /** @deprecated Use {@link IsLoadingPreview}. */
  public get isLoadingPreview(): boolean {
    return this.IsLoadingPreview;
  }
  /** @deprecated Use {@link IsLoadingPreview}. */
  public set isLoadingPreview(value: boolean) {
    this.IsLoadingPreview = value;
  }
  public PreviewMediaType: string = 'unknown';

  /** @deprecated Use {@link PreviewMediaType}. */
  public get previewMediaType(): string {
    return this.PreviewMediaType;
  }
  /** @deprecated Use {@link PreviewMediaType}. */
  public set previewMediaType(value: string) {
    this.PreviewMediaType = value;
  }

  /**
   * GraphQL client for file storage operations
   */
  private storageClient: GraphQLFileStorageClient;

  /**
   * Global notifications service for user toast feedback
   */
  protected notifications = inject(MJNotificationService);

  constructor() {
    this.storageClient = new GraphQLFileStorageClient(GraphQLDataProvider.Instance);
  }

  ngOnInit(): void {
    // Don't load items here - wait for ngOnChanges when inputs are set
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Reload items when provider or folder path changes
    if (changes['account'] || changes['folderPath']) {
      this.loadItems();
    }
  }

  /**
   * Loads files and folders from the current path
   */
  private async loadItems(): Promise<void> {
    if (!this.Account) {
      this.Items = [];
      return;
    }

    const previousItemCount = this.Items.length;
    const previousItemNames = this.Items.map(i => i.name);

    this.isLoading = true;
    this.cdr.detectChanges();
    this.errorMessage = null;

    try {
      console.log('[FileGrid] Loading items for account:', this.Account.account.ID, 'path:', this.FolderPath);
      console.log('[FileGrid] Previous items:', { count: previousItemCount, names: previousItemNames });

      const listResult = await this.storageClient.ListObjects(
        this.Account.account.ID,
        this.FolderPath || '',
        '/'
      );

      console.log('[FileGrid] ListObjects result:', listResult);

      this.Items = [];

      // Add folders from prefixes first (so they appear before files)
      if (listResult.prefixes) {
        for (const prefix of listResult.prefixes) {
          // Extract the folder name from the prefix path
          // Prefix comes as "path/to/folder/" so we need to get just "folder"
          const folderName = prefix.endsWith('/')
            ? prefix.slice(0, -1).split('/').pop()
            : prefix.split('/').pop();

          if (folderName) {
            this.Items.push({
              Key: prefix,
              name: folderName,
              Type: 'folder',
              Size: 0,
              LastModified: new Date(),
              ContentType: 'application/x-directory'
            });
          }
        }
      }

      // Add files from objects
      if (listResult.objects) {
        for (const obj of listResult.objects) {
          // Skip directories from objects - we already added them from prefixes
          if (obj.isDirectory) {
            continue;
          }

          this.Items.push({
            Key: obj.fullPath,
            name: obj.name,
            Type: 'file',
            Size: obj.size,
            LastModified: obj.lastModified,
            ContentType: obj.contentType,
            Etag: obj.etag
          });
        }
      }

    } catch (error) {
      this.errorMessage = 'Failed to load files';
      console.error('[FileGrid] Error loading files:', error);
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }

    // Apply filters after loading
    this.applyFilters();
  }

  /**
   * Applies search and filter criteria to the items list
   */
  private applyFilters(): void {
    let filtered = [...this.Items];

    // Apply file type filter
    if (this.FileTypeFilter === 'files') {
      filtered = filtered.filter(item => item.Type === 'file');
    } else if (this.FileTypeFilter === 'folders') {
      filtered = filtered.filter(item => item.Type === 'folder');
    }

    // Apply search query
    if (this.SearchQuery.trim()) {
      const query = this.SearchQuery.toLowerCase();
      filtered = filtered.filter(item =>
        item.name.toLowerCase().includes(query)
      );
    }

    this.FilteredItems = filtered;
  }

  /**
   * Handles search query changes
   */
  public OnSearchChange(query: string): void {
    this.SearchQuery = query;
    this.applyFilters();
  }

  /** @deprecated Use {@link OnSearchChange}. */
  public onSearchChange(query: string): void {
    return this.OnSearchChange(query);
  }

  /**
   * Clears the search query
   */
  public ClearSearch(): void {
    this.SearchQuery = '';
    this.applyFilters();
  }

  /** @deprecated Use {@link ClearSearch}. */
  public clearSearch(): void {
    return this.ClearSearch();
  }

  /**
   * Handles file type filter changes
   */
  public OnFileTypeFilterChange(filterType: 'all' | 'files' | 'folders'): void {
    this.FileTypeFilter = filterType;
    this.applyFilters();
  }

  /** @deprecated Use {@link OnFileTypeFilterChange}. */
  public onFileTypeFilterChange(filterType: 'all' | 'files' | 'folders'): void {
    return this.OnFileTypeFilterChange(filterType);
  }

  /**
   * Formats a file size in bytes to a human-readable string
   */
  public FormatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  /** @deprecated Use {@link FormatFileSize}. */
  public formatFileSize(bytes: number): string {
    return this.FormatFileSize(bytes);
  }

  /**
   * Formats a date to a readable string
   */
  public formatDate(date: Date): string {
    return date.toLocaleString();
  }

  /**
   * Gets the icon class for a file or folder
   */
  public GetItemIcon(item: FileGridItem): string {
    if (!item || !item.name) {
      return 'fa-solid fa-file';
    }

    if (item.Type === 'folder') {
      return 'fa-solid fa-folder';
    }

    // Determine file icon based on content type or extension
    const extension = item.name.split('.').pop()?.toLowerCase() || '';

    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg'].includes(extension)) {
      return 'fa-solid fa-file-image';
    } else if (['pdf'].includes(extension)) {
      return 'fa-solid fa-file-pdf';
    } else if (['doc', 'docx'].includes(extension)) {
      return 'fa-solid fa-file-word';
    } else if (['xls', 'xlsx'].includes(extension)) {
      return 'fa-solid fa-file-excel';
    } else if (['ppt', 'pptx'].includes(extension)) {
      return 'fa-solid fa-file-powerpoint';
    } else if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension)) {
      return 'fa-solid fa-file-zipper';
    } else if (['mp4', 'avi', 'mov', 'wmv'].includes(extension)) {
      return 'fa-solid fa-file-video';
    } else if (['mp3', 'wav', 'ogg', 'flac'].includes(extension)) {
      return 'fa-solid fa-file-audio';
    } else if (['txt', 'log'].includes(extension)) {
      return 'fa-solid fa-file-lines';
    } else if (['js', 'ts', 'html', 'css', 'json', 'xml', 'py', 'java', 'cpp'].includes(extension)) {
      return 'fa-solid fa-file-code';
    } else {
      return 'fa-solid fa-file';
    }
  }

  /** @deprecated Use {@link GetItemIcon}. */
  public getItemIcon(item: FileGridItem): string {
    return this.GetItemIcon(item);
  }

  /**
   * Handles item selection change (not used - Kendo handles selection internally)
   */
  public OnSelectionChange(selectedKeys: string[]): void {
    this.SelectedItems = selectedKeys;
  }

  /** @deprecated Use {@link OnSelectionChange}. */
  public onSelectionChange(selectedKeys: string[]): void {
    return this.OnSelectionChange(selectedKeys);
  }

  /**
   * Handles tile click in grid view for selection
   */
  public OnTileClick(item: FileGridItem, event: MouseEvent): void {
    if (event.ctrlKey || event.metaKey) {
      // Multi-select: toggle item key
      const index = this.SelectedItems.indexOf(item.Key);
      if (index >= 0) {
        this.SelectedItems.splice(index, 1);
      } else {
        this.SelectedItems.push(item.Key);
      }
    } else if (event.shiftKey && this.SelectedItems.length > 0) {
      // Range select: select from last selected to current
      const lastSelectedKey = this.SelectedItems[this.SelectedItems.length - 1];
      const lastSelected = this.Items.find(i => i.Key === lastSelectedKey);
      if (lastSelected) {
        const lastIndex = this.Items.indexOf(lastSelected);
        const currentIndex = this.Items.indexOf(item);
        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);
        this.SelectedItems = this.Items.slice(start, end + 1).map(i => i.Key);
      }
    } else {
      // Single select: replace selection
      this.SelectedItems = [item.Key];
    }
  }

  /** @deprecated Use {@link OnTileClick}. */
  public onTileClick(item: FileGridItem, event: MouseEvent): void {
    return this.OnTileClick(item, event);
  }

  /**
   * Handles double-click on an item
   * For folders, navigate into them. For files, open in-browser preview.
   */
  public OnItemDoubleClick(item: FileGridItem): void {
    if (item.Type === 'folder') {
      // Navigate into folder by emitting the folder path
      console.log('[FileGrid] Navigating to folder:', item.Key);
      this.FolderNavigate.emit(item.Key);
    } else {
      // Open in-browser preview
      this.OpenPreview(item);
    }
  }

  /** @deprecated Use {@link OnItemDoubleClick}. */
  public onItemDoubleClick(item: FileGridItem): void {
    return this.OnItemDoubleClick(item);
  }

  /**
   * Downloads a file by creating a pre-authenticated download URL
   */
  public async DownloadFile(item: FileGridItem): Promise<void> {
    if (!this.Account) {
      return;
    }

    try {
      console.log('[FileGrid] Downloading file:', item.Key);

      const downloadUrl = await this.storageClient.CreatePreAuthDownloadUrl(
        this.Account.account.ID,
        item.Key
      );

      console.log('[FileGrid] Download URL created:', downloadUrl ? 'success' : 'failed');

      if (downloadUrl) {
        // Open file in new browser tab for viewing/download
        window.open(downloadUrl, '_blank', 'noopener,noreferrer');
        this.notifications.CreateSimpleNotification(`Opening ${item.name}...`, 'info');
      } else {
        this.notifications.CreateSimpleNotification('Failed to generate download URL', 'error');
      }
    } catch (error) {
      console.error('[FileGrid] Error downloading file:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.notifications.CreateSimpleNotification(`Failed to download ${item.name}: ${errorMessage}`, 'error');
    }
  }

  /** @deprecated Use {@link DownloadFile}. */
  public async downloadFile(item: FileGridItem): Promise<void> {
    return this.DownloadFile(item);
  }

  /**
   * Toggles between grid and list view
   */
  public ToggleViewMode(): void {
    this.ViewMode = this.ViewMode === 'grid' ? 'list' : 'grid';
  }

  /** @deprecated Use {@link ToggleViewMode}. */
  public toggleViewMode(): void {
    return this.ToggleViewMode();
  }

  /**
   * Refreshes the current directory
   */
  public Refresh(): void {
    this.loadItems();
  }

  /** @deprecated Use {@link Refresh}. */
  public refresh(): void {
    return this.Refresh();
  }

  /**
   * Navigates up to the parent directory
   */
  public NavigateUp(): void {
    if (!this.FolderPath) {
      // Already at root
      return;
    }

    // Remove trailing slash if present
    const cleanPath = this.FolderPath.endsWith('/')
      ? this.FolderPath.slice(0, -1)
      : this.FolderPath;

    // Get parent path by removing last segment
    const segments = cleanPath.split('/').filter(s => s.length > 0);
    segments.pop(); // Remove last segment

    const parentPath = segments.length > 0 ? segments.join('/') + '/' : '';

    // Emit navigation event to update the folder tree and path
    this.FolderNavigate.emit(parentPath);
  }

  /** @deprecated Use {@link NavigateUp}. */
  public navigateUp(): void {
    return this.NavigateUp();
  }

  /**
   * Checks if we can navigate up (not at root)
   */
  public CanNavigateUp(): boolean {
    return this.FolderPath !== '' && this.FolderPath !== '/';
  }

  /** @deprecated Use {@link CanNavigateUp}. */
  public canNavigateUp(): boolean {
    return this.CanNavigateUp();
  }

  /**
   * Handles sort change event from the grid
   */
  public OnSortChange(sort: Array<{ field: string; dir?: 'asc' | 'desc' }>): void {
    this.Sort = sort;
  }

  /** @deprecated Use {@link OnSortChange}. */
  public onSortChange(sort: Array<{ field: string; dir?: 'asc' | 'desc' }>): void {
    return this.OnSortChange(sort);
  }

  /**
   * Gets a human-readable file type based on extension
   */
  public GetFileType(item: FileGridItem): string {
    if (item.Type === 'folder') {
      return 'Folder';
    }

    const extension = item.name.split('.').pop()?.toLowerCase() || '';

    const typeMap: Record<string, string> = {
      // Documents
      pdf: 'PDF Document',
      doc: 'Word Document',
      docx: 'Word Document',
      xls: 'Excel Spreadsheet',
      xlsx: 'Excel Spreadsheet',
      ppt: 'PowerPoint',
      pptx: 'PowerPoint',
      txt: 'Text File',

      // Images
      jpg: 'JPEG Image',
      jpeg: 'JPEG Image',
      png: 'PNG Image',
      gif: 'GIF Image',
      bmp: 'Bitmap Image',
      svg: 'SVG Image',

      // Archives
      zip: 'ZIP Archive',
      rar: 'RAR Archive',
      '7z': '7-Zip Archive',
      tar: 'TAR Archive',
      gz: 'GZIP Archive',

      // Media
      mp4: 'MP4 Video',
      avi: 'AVI Video',
      mov: 'QuickTime Video',
      mp3: 'MP3 Audio',
      wav: 'WAV Audio',

      // Code
      js: 'JavaScript',
      ts: 'TypeScript',
      html: 'HTML',
      css: 'CSS',
      json: 'JSON',
      xml: 'XML',
      py: 'Python',
      java: 'Java',
      cpp: 'C++'
    };

    return typeMap[extension] || `${extension.toUpperCase()} File`;
  }

  /** @deprecated Use {@link GetFileType}. */
  public getFileType(item: FileGridItem): string {
    return this.GetFileType(item);
  }

  /**
   * Handles upload button click - triggers file input
   */
  public OnUploadClick(): void {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = true;
    fileInput.onchange = (event: Event) => {
      const target = event.target as HTMLInputElement;
      if (target.files && target.files.length > 0) {
        this.uploadFiles(Array.from(target.files));
      }
    };
    fileInput.click();
  }

  /** @deprecated Use {@link OnUploadClick}. */
  public onUploadClick(): void {
    return this.OnUploadClick();
  }

  /**
   * Handles drag enter event
   */
  public OnDragEnter(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.IsDragging = true;
  }

  /** @deprecated Use {@link OnDragEnter}. */
  public onDragEnter(event: DragEvent): void {
    return this.OnDragEnter(event);
  }

  /**
   * Handles drag over event
   */
  public OnDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  /** @deprecated Use {@link OnDragOver}. */
  public onDragOver(event: DragEvent): void {
    return this.OnDragOver(event);
  }

  /**
   * Handles drag leave event
   */
  public OnDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();

    // Only hide if leaving the container itself, not child elements
    if (event.currentTarget === event.target) {
      this.IsDragging = false;
    }
  }

  /** @deprecated Use {@link OnDragLeave}. */
  public onDragLeave(event: DragEvent): void {
    return this.OnDragLeave(event);
  }

  /**
   * Handles drop event
   */
  public OnDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.IsDragging = false;

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.uploadFiles(Array.from(files));
    }
  }

  /** @deprecated Use {@link OnDrop}. */
  public onDrop(event: DragEvent): void {
    return this.OnDrop(event);
  }

  /**
   * Uploads multiple files to the current folder
   */
  private async uploadFiles(files: File[]): Promise<void> {
    if (!this.Account) {
      return;
    }

    console.log('[FileGrid] Uploading files:', files.map(f => f.name));

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      await this.uploadSingleFile(file, i + 1, files.length);
    }

    // Refresh the file list after all uploads complete
    this.loadItems();
  }

  /**
   * Uploads a single file using server-side MJ Storage (supports all providers)
   */
  private async uploadSingleFile(file: File, current: number, total: number): Promise<void> {
    if (!this.Account) {
      return;
    }

    this.IsUploading = true;
    this.UploadingFileName = `${file.name} (${current}/${total})`;
    this.UploadProgress = 0;

    try {
      let cleanPath = '';
      if (this.FolderPath && this.FolderPath !== '/') {
        cleanPath = this.FolderPath.endsWith('/') ? this.FolderPath.slice(0, -1) : this.FolderPath;
        if (cleanPath.startsWith('/')) {
          cleanPath = cleanPath.substring(1);
        }
      }

      console.log('[FileGrid] Uploading file via MJ Storage:', { name: file.name, path: cleanPath });
      const base64Data = await this.readFileAsBase64(file);

      const result = await this.storageClient.UploadFile({
        FileName: file.name,
        Base64Data: base64Data,
        MimeType: file.type || 'application/octet-stream',
        AccountID: this.Account.account.ID,
        PathPrefix: cleanPath || undefined,
      });

      if (!result.Success) {
        throw new Error(result.ErrorMessage || 'Upload failed');
      }

      this.UploadProgress = 100;
      console.log('[FileGrid] File uploaded successfully via MJ Storage:', file.name);
    } catch (error) {
      console.error('[FileGrid] Error uploading file:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.errorMessage = `Failed to upload ${file.name}: ${errorMessage}`;

      // Clear error after 5 seconds
      setTimeout(() => {
        if (this.errorMessage?.startsWith('Failed to upload')) {
          this.errorMessage = null;
        }
      }, 5000);
    } finally {
      this.IsUploading = false;
      this.UploadProgress = 0;
      this.UploadingFileName = '';
    }
  }

  /**
   * Reads a browser File object as a base64 encoded string
   */
  private readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === 'string') {
          const base64 = result.substring(result.indexOf(',') + 1);
          resolve(base64);
        } else {
          reject(new Error('Failed to read file as base64 string'));
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  }

  /**
   * Uploads file to the pre-authenticated URL with progress tracking
   */
  private uploadFileToUrl(file: File, url: string, driverKey?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          this.UploadProgress = Math.round((event.loaded / event.total) * 100);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Network error during upload'));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error('Upload cancelled'));
      });

      // Provider-specific upload semantics for the pre-authenticated URL:
      //  - Dropbox temporary upload links require POST.
      //  - Azure Blob "Put Blob" requires PUT and the `x-ms-blob-type: BlockBlob` header;
      //    without the header Azure rejects the request and the upload silently no-ops.
      //  - S3 and other pre-signed-PUT providers require PUT.
      const isDropbox = driverKey === 'Dropbox Storage';
      const isAzure = driverKey === 'Azure Blob Storage';
      xhr.open(isDropbox ? 'POST' : 'PUT', url, true);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      if (isAzure) {
        xhr.setRequestHeader('x-ms-blob-type', 'BlockBlob');
      }
      xhr.send(file);
    });
  }

  /**
   * Opens the new folder dialog
   */
  public OnNewFolderClick(): void {
    this.NewFolderName = '';
    this.ShowNewFolderDialog = true;
  }

  /** @deprecated Use {@link OnNewFolderClick}. */
  public onNewFolderClick(): void {
    return this.OnNewFolderClick();
  }

  /**
   * Closes the new folder dialog
   */
  public OnCancelNewFolder(): void {
    this.ShowNewFolderDialog = false;
    this.NewFolderName = '';
  }

  /** @deprecated Use {@link OnCancelNewFolder}. */
  public onCancelNewFolder(): void {
    return this.OnCancelNewFolder();
  }

  /**
   * Creates a new folder in the current directory
   */
  public async OnCreateFolder(): Promise<void> {
    if (!this.Account || !this.NewFolderName.trim()) {
      return;
    }

    this.IsCreatingFolder = true;

    try {
      // Construct the full folder path
      // Remove trailing slash from folderPath to avoid double slashes
      let folderPath: string;
      if (this.FolderPath) {
        const cleanPath = this.FolderPath.endsWith('/')
          ? this.FolderPath.slice(0, -1)
          : this.FolderPath;
        folderPath = `${cleanPath}/${this.NewFolderName.trim()}`;
      } else {
        folderPath = this.NewFolderName.trim();
      }

      console.log('[FileGrid] Creating folder:', folderPath);

      const success = await this.storageClient.CreateDirectory(
        this.Account.account.ID,
        folderPath
      );

      if (success) {
        console.log('[FileGrid] Folder created successfully:', folderPath);

        const createdName = this.NewFolderName.trim();
        // Close dialog and refresh
        this.ShowNewFolderDialog = false;
        this.NewFolderName = '';

        this.notifications.CreateSimpleNotification(`Created folder "${createdName}"`, 'success');

        // Notify parent that folder structure changed
        this.FolderStructureChanged.emit();

        // Refresh the file grid
        this.loadItems();
      } else {
        this.notifications.CreateSimpleNotification('Failed to create folder', 'error');
      }
    } catch (error) {
      console.error('[FileGrid] Error creating folder:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.notifications.CreateSimpleNotification(`Failed to create folder: ${errorMessage}`, 'error');
    } finally {
      this.IsCreatingFolder = false;
    }
  }

  /** @deprecated Use {@link OnCreateFolder}. */
  public async onCreateFolder(): Promise<void> {
    return this.OnCreateFolder();
  }

  /**
   * Opens the delete confirmation dialog for the selected items
   */
  public OnDeleteClick(): void {
    if (this.SelectedItems.length === 0) {
      return;
    }

    // selectedItems contains keys (strings), not full objects
    // Find the actual item object from the items array
    const selectedKey = this.SelectedItems[0];
    const item = this.Items.find(i => i.Key === selectedKey);

    if (!item) {
      console.error('[FileGrid] Could not find selected item with key:', selectedKey);
      return;
    }

    this.ItemToDelete = item;
    this.showDeleteDialog = true;
  }

  /** @deprecated Use {@link OnDeleteClick}. */
  public onDeleteClick(): void {
    return this.OnDeleteClick();
  }

  /**
   * Closes the delete confirmation dialog
   */
  public OnCancelDelete(): void {
    this.showDeleteDialog = false;
    this.ItemToDelete = null;
  }

  /** @deprecated Use {@link OnCancelDelete}. */
  public onCancelDelete(): void {
    return this.OnCancelDelete();
  }

  /**
   * Deletes the selected item after confirmation
   */
  public async OnConfirmDelete(): Promise<void> {
    if (!this.Account || !this.ItemToDelete) {
      return;
    }

    this.IsDeleting = true;

    try {
      // Construct the full path to the item
      const itemPath = this.constructItemPath(this.ItemToDelete);

      console.log('[FileGrid] Deleting item:', itemPath);

      const success = await this.storageClient.DeleteObject(
        this.Account.account.ID,
        itemPath
      );

      console.log('[FileGrid] Delete result:', { success });

      if (success) {
        console.log('[FileGrid] Item deleted successfully:', itemPath);

        // Check if we deleted a folder (before clearing itemToDelete)
        const wasFolder = this.ItemToDelete.Type === 'folder';
        const deletedName = this.ItemToDelete.name;

        // Close dialog
        this.showDeleteDialog = false;
        this.ItemToDelete = null;

        // Clear selection
        this.SelectedItems = [];

        this.notifications.CreateSimpleNotification(`Deleted "${deletedName}"`, 'info');

        // If we deleted a folder, notify parent that folder structure changed
        if (wasFolder) {
          console.log('[FileGrid] Emitting folderStructureChanged event');
          this.FolderStructureChanged.emit();
        }

        // Refresh the file grid
        console.log('[FileGrid] Calling loadItems() to refresh grid');
        this.loadItems();
      } else {
        console.error('[FileGrid] Delete operation returned false');
        this.notifications.CreateSimpleNotification(`Failed to delete ${this.ItemToDelete.Type}`, 'error');
      }
    } catch (error) {
      console.error('[FileGrid] Error deleting item:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.notifications.CreateSimpleNotification(`Failed to delete: ${errorMessage}`, 'error');
    } finally {
      this.IsDeleting = false;
    }
  }

  /** @deprecated Use {@link OnConfirmDelete}. */
  public async onConfirmDelete(): Promise<void> {
    return this.OnConfirmDelete();
  }

  /**
   * Opens the rename dialog for the selected item
   */
  public OnRenameClick(): void {
    if (this.SelectedItems.length !== 1) {
      return;
    }

    // selectedItems contains keys (strings), not full objects
    // Find the actual item object from the items array
    const selectedKey = this.SelectedItems[0];
    const item = this.Items.find(i => i.Key === selectedKey);

    if (!item) {
      console.error('[FileGrid] Could not find selected item with key:', selectedKey);
      return;
    }

    this.ItemToRename = item;
    this.NewItemName = item.name;
    this.ShowRenameDialog = true;
  }

  /** @deprecated Use {@link OnRenameClick}. */
  public onRenameClick(): void {
    return this.OnRenameClick();
  }

  /**
   * Closes the rename dialog
   */
  public OnCancelRename(): void {
    this.ShowRenameDialog = false;
    this.ItemToRename = null;
    this.NewItemName = '';
  }

  /** @deprecated Use {@link OnCancelRename}. */
  public onCancelRename(): void {
    return this.OnCancelRename();
  }

  /**
   * Renames the selected item after confirmation
   */
  public async OnConfirmRename(): Promise<void> {
    if (!this.Account || !this.ItemToRename || !this.NewItemName.trim()) {
      return;
    }

    // Check if name actually changed
    if (this.NewItemName.trim() === this.ItemToRename.name) {
      this.OnCancelRename();
      return;
    }

    this.IsRenaming = true;

    try {
      // Construct the old and new paths
      const oldPath = this.constructItemPath(this.ItemToRename);

      // Build the new path by replacing the old name with the new name
      const pathParts = oldPath.split('/');
      pathParts[pathParts.length - 1] = this.NewItemName.trim();
      const newPath = pathParts.join('/');

      console.log('[FileGrid] Renaming item:', { oldPath, newPath });

      const success = await this.storageClient.MoveObject(
        this.Account.account.ID,
        oldPath,
        newPath
      );

      console.log('[FileGrid] Rename result:', { success });

      if (success) {
        console.log('[FileGrid] Item renamed successfully:', { oldPath, newPath });

        // Check if we renamed a folder (before clearing itemToRename)
        const wasFolder = this.ItemToRename.Type === 'folder';
        const oldName = this.ItemToRename.name;
        const newName = this.NewItemName.trim();

        // Close dialog
        this.ShowRenameDialog = false;
        this.ItemToRename = null;
        this.NewItemName = '';

        // Clear selection
        this.SelectedItems = [];

        this.notifications.CreateSimpleNotification(`Renamed "${oldName}" to "${newName}"`, 'success');

        // If we renamed a folder, notify parent that folder structure changed
        if (wasFolder) {
          console.log('[FileGrid] Emitting folderStructureChanged event');
          this.FolderStructureChanged.emit();
        }

        // Refresh the file grid
        console.log('[FileGrid] Calling loadItems() to refresh grid');
        this.loadItems();
      } else {
        console.error('[FileGrid] Rename operation returned false');
        this.notifications.CreateSimpleNotification(`Failed to rename ${this.ItemToRename.Type}`, 'error');
      }
    } catch (error) {
      console.error('[FileGrid] Error renaming item:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.notifications.CreateSimpleNotification(`Failed to rename: ${errorMessage}`, 'error');
    } finally {
      this.IsRenaming = false;
    }
  }

  /** @deprecated Use {@link OnConfirmRename}. */
  public async onConfirmRename(): Promise<void> {
    return this.OnConfirmRename();
  }

  /**
   * Downloads the selected file
   */
  public async OnDownloadClick(): Promise<void> {
    if (this.SelectedItems.length !== 1) {
      return;
    }

    // Find the selected item
    const selectedKey = this.SelectedItems[0];
    const item = this.Items.find(i => i.Key === selectedKey);

    if (!item) {
      console.error('[FileGrid] Could not find selected item with key:', selectedKey);
      return;
    }

    // Can only download files, not folders
    if (item.Type === 'folder') {
      this.notifications.CreateSimpleNotification('Cannot download folders. Please select a file.', 'warning');
      return;
    }

    if (!this.Account) {
      return;
    }

    try {
      const itemPath = this.constructItemPath(item);

      console.log('[FileGrid] Creating download URL for:', itemPath);

      const downloadUrl = await this.storageClient.CreatePreAuthDownloadUrl(
        this.Account.account.ID,
        itemPath
      );

      if (downloadUrl) {
        console.log('[FileGrid] Download URL created, opening in new tab');
        window.open(downloadUrl, '_blank', 'noopener,noreferrer');
        this.notifications.CreateSimpleNotification(`Opening ${item.name}...`, 'info');
      } else {
        this.notifications.CreateSimpleNotification('Failed to create download URL', 'error');
      }
    } catch (error) {
      console.error('[FileGrid] Error downloading file:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.notifications.CreateSimpleNotification(`Failed to download: ${errorMessage}`, 'error');
    }
  }

  /** @deprecated Use {@link OnDownloadClick}. */
  public async onDownloadClick(): Promise<void> {
    return this.OnDownloadClick();
  }

  /**
   * Opens the copy dialog for the selected item
   */
  public OnCopyClick(): void {
    if (this.SelectedItems.length !== 1) {
      return;
    }

    const selectedKey = this.SelectedItems[0];
    const item = this.Items.find(i => i.Key === selectedKey);

    if (!item) {
      console.error('[FileGrid] Could not find selected item with key:', selectedKey);
      return;
    }

    this.ItemToCopy = item;
    this.CopyDestinationPath = this.FolderPath + item.name + '-copy';
    this.ShowCopyDialog = true;
  }

  /** @deprecated Use {@link OnCopyClick}. */
  public onCopyClick(): void {
    return this.OnCopyClick();
  }

  /**
   * Cancels the copy operation
   */
  public OnCancelCopy(): void {
    this.ShowCopyDialog = false;
    this.ItemToCopy = null;
    this.CopyDestinationPath = '';
  }

  /** @deprecated Use {@link OnCancelCopy}. */
  public onCancelCopy(): void {
    return this.OnCancelCopy();
  }

  /**
   * Confirms and executes the copy operation
   */
  public async OnConfirmCopy(): Promise<void> {
    if (!this.Account || !this.ItemToCopy || !this.CopyDestinationPath.trim()) {
      return;
    }

    this.IsCopying = true;

    try {
      const sourcePath = this.constructItemPath(this.ItemToCopy);

      const success = await this.storageClient.CopyObject(
        this.Account.account.ID,
        sourcePath,
        this.CopyDestinationPath.trim()
      );

      if (success) {
        // Close dialog
        this.ShowCopyDialog = false;
        this.ItemToCopy = null;
        this.CopyDestinationPath = '';

        // Clear selection
        this.SelectedItems = [];

        this.notifications.CreateSimpleNotification('Item copied successfully', 'success');

        // Refresh the file grid
        this.loadItems();
      } else {
        this.notifications.CreateSimpleNotification('Failed to copy item', 'error');
      }
    } catch (error) {
      console.error('[FileGrid] Error copying item:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.notifications.CreateSimpleNotification(`Failed to copy: ${errorMessage}`, 'error');
    } finally {
      this.IsCopying = false;
    }
  }

  /** @deprecated Use {@link OnConfirmCopy}. */
  public async onConfirmCopy(): Promise<void> {
    return this.OnConfirmCopy();
  }

  /**
   * Opens the move dialog for the selected item
   */
  public OnMoveClick(): void {
    if (this.SelectedItems.length !== 1) {
      return;
    }

    const selectedKey = this.SelectedItems[0];
    const item = this.Items.find(i => i.Key === selectedKey);

    if (!item) {
      console.error('[FileGrid] Could not find selected item with key:', selectedKey);
      return;
    }

    this.ItemToMove = item;
    // Suggest a different folder path
    this.MoveDestinationPath = this.FolderPath;
    this.ShowMoveDialog = true;
  }

  /** @deprecated Use {@link OnMoveClick}. */
  public onMoveClick(): void {
    return this.OnMoveClick();
  }

  /**
   * Cancels the move operation
   */
  public OnCancelMove(): void {
    this.ShowMoveDialog = false;
    this.ItemToMove = null;
    this.MoveDestinationPath = '';
  }

  /** @deprecated Use {@link OnCancelMove}. */
  public onCancelMove(): void {
    return this.OnCancelMove();
  }

  /**
   * Confirms and executes the move operation
   */
  public async OnConfirmMove(): Promise<void> {
    if (!this.Account || !this.ItemToMove || !this.MoveDestinationPath.trim()) {
      return;
    }

    this.IsMoving = true;

    try {
      const sourcePath = this.constructItemPath(this.ItemToMove);
      const destPath = this.MoveDestinationPath.trim().endsWith('/')
        ? this.MoveDestinationPath.trim() + this.ItemToMove.name
        : this.MoveDestinationPath.trim();

      const success = await this.storageClient.MoveObject(
        this.Account.account.ID,
        sourcePath,
        destPath
      );

      if (success) {
        const wasFolder = this.ItemToMove.Type === 'folder';

        // Close dialog
        this.ShowMoveDialog = false;
        this.ItemToMove = null;
        this.MoveDestinationPath = '';

        // Clear selection
        this.SelectedItems = [];

        this.notifications.CreateSimpleNotification('Item moved successfully', 'success');

        // If we moved a folder, notify parent that folder structure changed
        if (wasFolder) {
          this.FolderStructureChanged.emit();
        }

        // Refresh the file grid
        this.loadItems();
      } else {
        this.notifications.CreateSimpleNotification('Failed to move item', 'error');
      }
    } catch (error) {
      console.error('[FileGrid] Error moving item:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.notifications.CreateSimpleNotification(`Failed to move: ${errorMessage}`, 'error');
    } finally {
      this.IsMoving = false;
    }
  }

  /** @deprecated Use {@link OnConfirmMove}. */
  public async onConfirmMove(): Promise<void> {
    return this.OnConfirmMove();
  }

  /**
   * Constructs the full path for an item
   */
  private constructItemPath(item: FileGridItem): string {
    // Validate that we have either key or name
    if (!item.Key && !item.name) {
      console.error('[FileGrid] Cannot construct path - item has no key or name:', item);
      throw new Error('Cannot construct path for item without key or name');
    }

    // If item.key exists and is at root level, use it directly
    if (!this.FolderPath || this.FolderPath === '/') {
      return item.Key || item.name;
    }

    // If the item key already includes the folder path, use it as is
    if (item.Key && item.Key.startsWith(this.FolderPath)) {
      return item.Key;
    }

    // Otherwise, combine folder path with item name
    const normalizedFolderPath = this.FolderPath.endsWith('/')
      ? this.FolderPath.slice(0, -1)
      : this.FolderPath;

    // Make sure we have a name to use
    const itemName = item.name || item.Key;
    if (!itemName) {
      console.error('[FileGrid] Cannot construct path - item has no usable name:', item);
      throw new Error('Cannot construct path for item without name');
    }

    return `${normalizedFolderPath}/${itemName}`;
  }

  /**
   * Gets the currently selected item (if exactly one is selected)
   */
  public GetSelectedItem(): FileGridItem | null {
    if (this.SelectedItems.length !== 1) {
      return null;
    }
    return this.Items.find(item => item.Key === this.SelectedItems[0]) || null;
  }

  /** @deprecated Use {@link GetSelectedItem}. */
  public getSelectedItem(): FileGridItem | null {
    return this.GetSelectedItem();
  }

  /**
   * Opens the copy to account dialog
   */
  public async OnCopyToAccountClick(): Promise<void> {
    const item = this.GetSelectedItem();
    if (!item || item.Type === 'folder') {
      return;
    }

    try {
      const engine = FileStorageEngineBase.Instance;
      await engine.Config(false);  // Use cached data if available

      // Build available accounts (excluding current account)
      this.AvailableAccounts = engine.AccountsWithProviders
        .filter(a => !UUIDsEqual(a.account.ID, this.Account?.account.ID));

      if (this.AvailableAccounts.length === 0) {
        this.notifications.CreateSimpleNotification('No other storage accounts available', 'warning');
        return;
      }

      this.ItemToCopyToProvider = item;
      this.CopyToAccountDestinationPath = item.name; // Default to same filename
      this.SelectedDestinationAccounts.clear();
      this.CopyToAccountProgress = null;
      this.ShowCopyToProviderDialog = true;

    } catch (error) {
      console.error('[FileGrid] Error loading accounts:', error);
      this.notifications.CreateSimpleNotification('Failed to load storage accounts', 'error');
    }
  }

  /** @deprecated Use {@link OnCopyToAccountClick}. */
  public async onCopyToAccountClick(): Promise<void> {
    return this.OnCopyToAccountClick();
  }

  /**
   * Cancels the copy to account dialog
   */
  public OnCancelCopyToAccount(): void {
    this.ShowCopyToProviderDialog = false;
    this.ItemToCopyToProvider = null;
    this.SelectedDestinationAccounts.clear();
    this.CopyToAccountDestinationPath = '';
    this.CopyToAccountProgress = null;
  }

  /** @deprecated Use {@link OnCancelCopyToAccount}. */
  public onCancelCopyToAccount(): void {
    return this.OnCancelCopyToAccount();
  }

  /**
   * Toggles selection of a destination account for copying
   */
  public ToggleDestinationAccount(accountId: string): void {
    if (this.SelectedDestinationAccounts.has(accountId)) {
      this.SelectedDestinationAccounts.delete(accountId);
    } else {
      this.SelectedDestinationAccounts.add(accountId);
    }
  }

  /** @deprecated Use {@link ToggleDestinationAccount}. */
  public toggleDestinationAccount(accountId: string): void {
    return this.ToggleDestinationAccount(accountId);
  }

  /**
   * Checks if an account is selected as a destination
   */
  public IsDestinationAccountSelected(accountId: string): boolean {
    return this.SelectedDestinationAccounts.has(accountId);
  }

  /** @deprecated Use {@link IsDestinationAccountSelected}. */
  public isDestinationAccountSelected(accountId: string): boolean {
    return this.IsDestinationAccountSelected(accountId);
  }

  /**
   * Executes the cross-account copy to multiple selected accounts
   */
  public async OnConfirmCopyToAccount(): Promise<void> {
    if (!this.ItemToCopyToProvider || this.SelectedDestinationAccounts.size === 0 || !this.Account) {
      return;
    }

    this.IsCopyingToAccount = true;

    // Get selected accounts
    const selectedAccounts = this.AvailableAccounts.filter(a =>
      this.SelectedDestinationAccounts.has(a.account.ID)
    );

    const successfulCopies: string[] = [];
    const failedCopies: { account: string; error: string }[] = [];

    try {
      // Construct source path and normalize it
      const rawSourcePath = this.constructItemPath(this.ItemToCopyToProvider);
      const sourcePath = rawSourcePath.replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/');
      console.log('[FileGrid] Cross-account copy sourcePath:', { raw: rawSourcePath, normalized: sourcePath });

      // Copy to each selected account
      for (let i = 0; i < selectedAccounts.length; i++) {
        const destAccount = selectedAccounts[i];
        this.CopyToAccountProgress = {
          current: i + 1,
          total: selectedAccounts.length,
          currentAccount: destAccount.account.Name
        };

        try {
          console.log('[FileGrid] Copying to account:', destAccount.account.Name);

          const copyResult = await this.storageClient.CopyObjectBetweenAccounts(
            this.Account.account.ID,
            destAccount.account.ID,
            sourcePath,
            this.CopyToAccountDestinationPath
          );

          if (copyResult.success) {
            successfulCopies.push(destAccount.account.Name);
          } else {
            failedCopies.push({ account: destAccount.account.Name, error: copyResult.message });
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          failedCopies.push({ account: destAccount.account.Name, error: errorMessage });
        }
      }

      // Show results
      if (failedCopies.length === 0) {
        this.notifications.CreateSimpleNotification(`Successfully copied to ${successfulCopies.length} account${successfulCopies.length > 1 ? 's' : ''}`, 'success');
      } else if (successfulCopies.length === 0) {
        this.notifications.CreateSimpleNotification(`Copy failed for all accounts: ${failedCopies.map(f => f.account).join(', ')}`, 'error');
      } else {
        this.notifications.CreateSimpleNotification(`Copied to ${successfulCopies.length} account(s). Failed: ${failedCopies.map(f => f.account).join(', ')}`, 'warning');
      }

      // Close dialog
      this.ShowCopyToProviderDialog = false;
      this.ItemToCopyToProvider = null;
      this.SelectedDestinationAccounts.clear();
      this.CopyToAccountDestinationPath = '';
      this.CopyToAccountProgress = null;

    } catch (error) {
      console.error('[FileGrid] Error copying to accounts:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.notifications.CreateSimpleNotification(`Copy failed: ${errorMessage}`, 'error');
    } finally {
      this.IsCopyingToAccount = false;
      this.CopyToAccountProgress = null;
    }
  }

  /** @deprecated Use {@link OnConfirmCopyToAccount}. */
  public async onConfirmCopyToAccount(): Promise<void> {
    return this.OnConfirmCopyToAccount();
  }

  // ==========================================
  // Multi-Account Search Methods
  // ==========================================

  /**
   * Toggles multi-account search mode
   */
  public ToggleMultiAccountSearchMode(): void {
    this.IsMultiProviderSearchMode = !this.IsMultiProviderSearchMode;

    if (this.IsMultiProviderSearchMode) {
      // Load available accounts if not already loaded
      if (this.AvailableAccounts.length === 0) {
        this.loadAvailableAccountsForSearch();
      }
      // Pre-select current account if available
      if (this.Account) {
        this.SelectedSearchProviders.add(this.Account.account.ID);
      }
    } else {
      // Clear search results when exiting search mode
      this.MultiProviderSearchResults = null;
      this.MultiProviderSearchQuery = '';
    }
  }

  /** @deprecated Use {@link ToggleMultiAccountSearchMode}. */
  public toggleMultiAccountSearchMode(): void {
    return this.ToggleMultiAccountSearchMode();
  }

  /**
   * Loads available accounts for search selection
   */
  private async loadAvailableAccountsForSearch(): Promise<void> {
    try {
      const engine = FileStorageEngineBase.Instance;
      await engine.Config(false);  // Use cached data if available
      this.AvailableAccounts = engine.AccountsWithProviders;
    } catch (error) {
      console.error('[FileGrid] Error loading accounts for search:', error);
    }
  }

  /**
   * Toggles account selection for search
   */
  public ToggleSearchAccount(accountID: string): void {
    if (this.SelectedSearchProviders.has(accountID)) {
      this.SelectedSearchProviders.delete(accountID);
    } else {
      this.SelectedSearchProviders.add(accountID);
    }
  }

  /** @deprecated Use {@link ToggleSearchAccount}. */
  public toggleSearchAccount(accountID: string): void {
    return this.ToggleSearchAccount(accountID);
  }

  /**
   * Checks if an account is selected for search
   */
  public IsAccountSelectedForSearch(accountID: string): boolean {
    return this.SelectedSearchProviders.has(accountID);
  }

  /** @deprecated Use {@link IsAccountSelectedForSearch}. */
  public isAccountSelectedForSearch(accountID: string): boolean {
    return this.IsAccountSelectedForSearch(accountID);
  }

  /**
   * Checks if an account's provider supports search
   */
  public AccountSupportsSearch(accountWithProvider: StorageAccountWithProvider): boolean {
    return accountWithProvider.provider.SupportsSearch === true;
  }

  /** @deprecated Use {@link AccountSupportsSearch}. */
  public accountSupportsSearch(accountWithProvider: StorageAccountWithProvider): boolean {
    return this.AccountSupportsSearch(accountWithProvider);
  }

  /**
   * Executes multi-account search
   */
  public async ExecuteMultiAccountSearch(): Promise<void> {
    if (!this.MultiProviderSearchQuery.trim() || this.SelectedSearchProviders.size === 0) {
      return;
    }

    this.IsSearching = true;
    this.MultiProviderSearchResults = null;

    try {
      console.log('[FileGrid] Executing multi-account search:', {
        accountIds: Array.from(this.SelectedSearchProviders),
        query: this.MultiProviderSearchQuery
      });

      const searchResult = await this.storageClient.SearchFiles(
        Array.from(this.SelectedSearchProviders),
        this.MultiProviderSearchQuery,
        { maxResultsPerAccount: 50 }
      );

      console.log('[FileGrid] Multi-account search result:', searchResult);

      // Map the client result to the component's expected format
      this.MultiProviderSearchResults = {
        AccountResults: searchResult.accountResults.map((ar: { accountId: string; accountName: string; success: boolean; errorMessage?: string; results: Array<{ path: string; name: string; size: number; contentType: string; lastModified: Date; relevance?: number; excerpt?: string; matchInFilename?: boolean; objectId?: string }>; totalMatches?: number; hasMore: boolean; nextPageToken?: string }) => ({
          accountID: ar.accountId,
          accountName: ar.accountName,
          success: ar.success,
          errorMessage: ar.errorMessage,
          results: ar.results.map((r: { path: string; name: string; size: number; contentType: string; lastModified: Date; relevance?: number; excerpt?: string; matchInFilename?: boolean; objectId?: string }) => ({
            path: r.path,
            name: r.name,
            size: r.size,
            contentType: r.contentType,
            lastModified: r.lastModified.toISOString(),
            relevance: r.relevance,
            excerpt: r.excerpt,
            matchInFilename: r.matchInFilename,
            objectId: r.objectId
          })),
          totalMatches: ar.totalMatches,
          hasMore: ar.hasMore,
          nextPageToken: ar.nextPageToken
        })),
        TotalResultsReturned: searchResult.totalResultsReturned,
        SuccessfulAccounts: searchResult.successfulAccounts,
        FailedAccounts: searchResult.failedAccounts
      };

    } catch (error) {
      console.error('[FileGrid] Error executing multi-provider search:', error);
      this.errorMessage = 'Search failed. Please try again.';
      setTimeout(() => {
        if (this.errorMessage === 'Search failed. Please try again.') {
          this.errorMessage = null;
        }
      }, 5000);
    } finally {
      this.IsSearching = false;
    }
  }

  /** @deprecated Use {@link ExecuteMultiAccountSearch}. */
  public async executeMultiAccountSearch(): Promise<void> {
    return this.ExecuteMultiAccountSearch();
  }

  /**
   * Clears multi-provider search results
   */
  public ClearMultiProviderSearch(): void {
    this.MultiProviderSearchQuery = '';
    this.MultiProviderSearchResults = null;
  }

  /** @deprecated Use {@link ClearMultiProviderSearch}. */
  public clearMultiProviderSearch(): void {
    return this.ClearMultiProviderSearch();
  }

  /**
   * Gets icon for a search result based on content type
   */
  public GetSearchResultIcon(result: FileSearchResultItem): string {
    const extension = result.name.split('.').pop()?.toLowerCase() || '';

    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg'].includes(extension)) {
      return 'fa-solid fa-file-image';
    } else if (['pdf'].includes(extension)) {
      return 'fa-solid fa-file-pdf';
    } else if (['doc', 'docx'].includes(extension)) {
      return 'fa-solid fa-file-word';
    } else if (['xls', 'xlsx'].includes(extension)) {
      return 'fa-solid fa-file-excel';
    } else if (['ppt', 'pptx'].includes(extension)) {
      return 'fa-solid fa-file-powerpoint';
    } else if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension)) {
      return 'fa-solid fa-file-zipper';
    } else if (['mp4', 'avi', 'mov', 'wmv'].includes(extension)) {
      return 'fa-solid fa-file-video';
    } else if (['mp3', 'wav', 'ogg', 'flac'].includes(extension)) {
      return 'fa-solid fa-file-audio';
    } else {
      return 'fa-solid fa-file';
    }
  }

  /** @deprecated Use {@link GetSearchResultIcon}. */
  public getSearchResultIcon(result: FileSearchResultItem): string {
    return this.GetSearchResultIcon(result);
  }

  /**
   * Formats file size for search results
   */
  public FormatSearchResultSize(bytes: number): string {
    return this.FormatFileSize(bytes);
  }

  /** @deprecated Use {@link FormatSearchResultSize}. */
  public formatSearchResultSize(bytes: number): string {
    return this.FormatSearchResultSize(bytes);
  }

  /**
   * Formats date for search results
   */
  public FormatSearchResultDate(dateStr: string): string {
    return new Date(dateStr).toLocaleString();
  }

  /** @deprecated Use {@link FormatSearchResultDate}. */
  public formatSearchResultDate(dateStr: string): string {
    return this.FormatSearchResultDate(dateStr);
  }

  /**
   * Determines media category for a file item
   */
  public GetMediaType(item: FileGridItem): string {
    const ext = item.name.split('.').pop()?.toLowerCase() || '';
    const mime = item.ContentType?.toLowerCase() || '';

    if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) {
      return 'image';
    }
    if (mime === 'application/pdf' || ext === 'pdf') {
      return 'pdf';
    }
    if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a'].includes(ext)) {
      return 'audio';
    }
    if (mime.startsWith('video/') || ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'].includes(ext)) {
      return 'video';
    }
    if (['json', 'ts', 'js', 'html', 'css', 'scss', 'xml', 'yaml', 'yml', 'md', 'sql', 'py', 'java', 'c', 'cpp'].includes(ext)) {
      return 'code';
    }
    if (mime.startsWith('text/') || ['txt', 'log', 'csv'].includes(ext)) {
      return 'text';
    }
    if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) {
      return 'document';
    }
    return 'unknown';
  }

  /** @deprecated Use {@link GetMediaType}. */
  public getMediaType(item: FileGridItem): string {
    return this.GetMediaType(item);
  }

  /**
   * Gets specific badge class for media type
   */
  public GetItemColorClass(item: FileGridItem): string {
    if (item.Type === 'folder') {
      return 'mj-file-thumb--folder';
    }
    const mediaType = this.GetMediaType(item);
    return `mj-file-thumb--${mediaType}`;
  }

  /** @deprecated Use {@link GetItemColorClass}. */
  public getItemColorClass(item: FileGridItem): string {
    return this.GetItemColorClass(item);
  }

  /**
   * Generates clickable path breadcrumbs
   */
  public GetPathBreadcrumbs(): Array<{ name: string; path: string }> {
    const raw = (this.FolderPath || '').trim();
    if (!raw || raw === '/') {
      return [{ name: 'Root', path: '/' }];
    }
    const clean = raw.startsWith('/') ? raw.substring(1) : raw;
    const parts = clean.split('/').filter((p) => p.trim().length > 0);
    const crumbs: Array<{ name: string; path: string }> = [
      { name: 'Root', path: '/' },
    ];
    let currentPath = '';
    for (const part of parts) {
      currentPath += '/' + part;
      crumbs.push({ name: part, path: currentPath });
    }
    return crumbs;
  }

  /** @deprecated Use {@link GetPathBreadcrumbs}. */
  public getPathBreadcrumbs(): Array<{ name: string; path: string }> {
    return this.GetPathBreadcrumbs();
  }

  /**
   * Navigates to a specific breadcrumb path
   */
  public NavigateToBreadcrumb(path: string): void {
    this.FolderNavigate.emit(path);
  }

  /** @deprecated Use {@link NavigateToBreadcrumb}. */
  public navigateToBreadcrumb(path: string): void {
    return this.NavigateToBreadcrumb(path);
  }

  /**
   * Toggles selection of a file/folder item
   */
  public ToggleItemSelection(item: FileGridItem, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    const idx = this.SelectedItems.indexOf(item.Key);
    if (idx >= 0) {
      this.SelectedItems = this.SelectedItems.filter((k) => k !== item.Key);
    } else {
      this.SelectedItems = [...this.SelectedItems, item.Key];
    }
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link ToggleItemSelection}. */
  public toggleItemSelection(item: FileGridItem, event?: Event): void {
    return this.ToggleItemSelection(item, event);
  }

  /**
   * Selects all current filtered items
   */
  public SelectAll(): void {
    this.SelectedItems = this.FilteredItems.map((i) => i.Key);
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link SelectAll}. */
  public selectAll(): void {
    return this.SelectAll();
  }

  /**
   * Clears selection
   */
  public DeselectAll(): void {
    this.SelectedItems = [];
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link DeselectAll}. */
  public deselectAll(): void {
    return this.DeselectAll();
  }

  /**
   * Checks if all items are selected
   */
  public AreAllSelected(): boolean {
    return (
      this.FilteredItems.length > 0 &&
      this.SelectedItems.length === this.FilteredItems.length
    );
  }

  /** @deprecated Use {@link AreAllSelected}. */
  public areAllSelected(): boolean {
    return this.AreAllSelected();
  }

  /**
   * Opens in-browser preview modal
   */
  public async OpenPreview(item: FileGridItem): Promise<void> {
    if (item.Type === 'folder' || !this.Account) {
      return;
    }

    this.PreviewItem = item;
    this.PreviewMediaType = this.GetMediaType(item);
    this.ShowPreviewModal = true;
    this.IsLoadingPreview = true;
    this.PreviewUrl = null;
    this.cdr.markForCheck();

    try {
      const itemPath = this.constructItemPath(item);
      const url = await this.storageClient.CreatePreAuthDownloadUrl(
        this.Account.account.ID,
        itemPath
      );
      this.PreviewUrl = url;
    } catch (err) {
      console.error('[FileGrid] Preview error:', err);
    } finally {
      this.IsLoadingPreview = false;
      this.cdr.markForCheck();
    }
  }

  /** @deprecated Use {@link OpenPreview}. */
  public async openPreview(item: FileGridItem): Promise<void> {
    return this.OpenPreview(item);
  }

  /**
   * Closes the preview modal
   */
  public ClosePreview(): void {
    this.ShowPreviewModal = false;
    this.PreviewItem = null;
    this.PreviewUrl = null;
    this.IsLoadingPreview = false;
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link ClosePreview}. */
  public closePreview(): void {
    return this.ClosePreview();
  }
}