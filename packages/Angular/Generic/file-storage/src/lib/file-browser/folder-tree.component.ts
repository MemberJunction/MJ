import { Component, EventEmitter, Input, Output, ChangeDetectorRef, inject } from '@angular/core';
import { GraphQLDataProvider, GraphQLFileStorageClient } from '@memberjunction/graphql-dataprovider';
import { StorageAccountWithProvider } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';

/**
 * Represents a breadcrumb item in the path
 */
export interface BreadcrumbItem {
  label: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  path: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/**
 * Represents a folder in the tree
 */
export interface FolderItem {
  name: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  fullPath: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/**
 * Folder tree navigation component with breadcrumbs and history navigation.
 * Provides Mac Finder-style navigation with back/forward buttons and breadcrumb path.
 * Loads actual folder structure from storage accounts via GraphQL.
 */
@Component({
  standalone: false,
  selector: 'mj-folder-tree',
  templateUrl: './folder-tree.component.html',
  styleUrls: ['./folder-tree.component.css']
})
export class FolderTreeComponent {
  /**
   * GraphQL client for file storage operations
   */
  private storageClient: GraphQLFileStorageClient;

  /**
   * Currently selected storage account with provider details
   */
  private _account: StorageAccountWithProvider | null = null;

  constructor() {
    this.storageClient = new GraphQLFileStorageClient(GraphQLDataProvider.Instance);
  }

  @Input()
  set Account(value: StorageAccountWithProvider | null) {
    const previousAccount = this._account;
    this._account = value;

    if (value && !UUIDsEqual(value.account.ID, previousAccount?.account.ID)) {
      this.resetNavigation();
      this.loadFolders();
    }
  }
  get Account(): StorageAccountWithProvider | null {
    return this._account;
  }

  /** @deprecated Use {@link Account}. */
  get account(): StorageAccountWithProvider | null {
    return this.Account;
  }
  /** @deprecated Use {@link Account}. */
  @Input() set account(value: StorageAccountWithProvider | null) {
    this.Account = value;
  }

  /**
   * Emits when a folder is selected in the tree
   */
  @Output() FolderSelected = new EventEmitter<string>();

  /**
   * @deprecated Use {@link FolderSelected}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (folderSelected) keeps working. Must stay AFTER FolderSelected: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() folderSelected = this.FolderSelected;

  /**
   * Current folder path
   */
  public CurrentPath: string = '/';

  /** @deprecated Use {@link CurrentPath}. */
  public get currentPath(): string {
    return this.CurrentPath;
  }
  /** @deprecated Use {@link CurrentPath}. */
  public set currentPath(value: string) {
    this.CurrentPath = value;
  }

  /**
   * Navigation history (for back button)
   */
  public History: string[] = [];

  /** @deprecated Use {@link History}. */
  public get history(): string[] {
    return this.History;
  }
  /** @deprecated Use {@link History}. */
  public set history(value: string[]) {
    this.History = value;
  }

  /**
   * Current position in history
   */
  public HistoryIndex: number = -1;

  /** @deprecated Use {@link HistoryIndex}. */
  public get historyIndex(): number {
    return this.HistoryIndex;
  }
  /** @deprecated Use {@link HistoryIndex}. */
  public set historyIndex(value: number) {
    this.HistoryIndex = value;
  }

  /**
   * Breadcrumb items for current path
   */
  public Breadcrumbs: BreadcrumbItem[] = [];

  /** @deprecated Use {@link Breadcrumbs}. */
  public get breadcrumbs(): BreadcrumbItem[] {
    return this.Breadcrumbs;
  }
  /** @deprecated Use {@link Breadcrumbs}. */
  public set breadcrumbs(value: BreadcrumbItem[]) {
    this.Breadcrumbs = value;
  }

  /**
   * Folders in current path
   */
  public Folders: FolderItem[] = [];

  /** @deprecated Use {@link Folders}. */
  public get folders(): FolderItem[] {
    return this.Folders;
  }
  /** @deprecated Use {@link Folders}. */
  public set folders(value: FolderItem[]) {
    this.Folders = value;
  }

  private cdr = inject(ChangeDetectorRef);

  /**
   * Loading state
   */
  public IsLoading: boolean = false;

  /** @deprecated Use {@link IsLoading}. */
  public get isLoading(): boolean {
    return this.IsLoading;
  }
  /** @deprecated Use {@link IsLoading}. */
  public set isLoading(value: boolean) {
    this.IsLoading = value;
  }

  /**
   * Error message
   */
  public ErrorMessage: string | null = null;

  /** @deprecated Use {@link ErrorMessage}. */
  public get errorMessage(): string | null {
    return this.ErrorMessage;
  }
  /** @deprecated Use {@link ErrorMessage}. */
  public set errorMessage(value: string | null) {
    this.ErrorMessage = value;
  }

  /**
   * Resets navigation when provider changes
   */
  private resetNavigation(): void {
    this.CurrentPath = '/';
    this.History = ['/'];
    this.HistoryIndex = 0;
    this.updateBreadcrumbs();
  }

  /**
   * Navigates to a specific folder path
   */
  public NavigateToPath(path: string): void {
    // Don't navigate if already at this path
    if (path === this.CurrentPath) {
      return;
    }

    // Add to history if navigating from user action (not back/forward)
    if (this.HistoryIndex === this.History.length - 1) {
      this.History.push(path);
      this.HistoryIndex = this.History.length - 1;
    } else {
      // Navigating from middle of history - truncate forward history
      this.History = this.History.slice(0, this.HistoryIndex + 1);
      this.History.push(path);
      this.HistoryIndex = this.History.length - 1;
    }

    this.CurrentPath = path;
    this.updateBreadcrumbs();
    this.loadFolders();
    this.FolderSelected.emit(path);
  }

  /** @deprecated Use {@link NavigateToPath}. */
  public navigateToPath(path: string): void {
    return this.NavigateToPath(path);
  }

  /**
   * Refreshes the current folder view without changing navigation
   * Used when folder structure changes (e.g., folder deleted) but we're staying in the same location
   */
  public Refresh(): void {
    this.loadFolders();
  }

  /** @deprecated Use {@link Refresh}. */
  public refresh(): void {
    return this.Refresh();
  }

  /**
   * Navigates back in history
   */
  public NavigateBack(): void {
    if (!this.CanGoBack()) {
      return;
    }

    this.HistoryIndex--;
    this.CurrentPath = this.History[this.HistoryIndex];
    this.updateBreadcrumbs();
    this.FolderSelected.emit(this.CurrentPath);
    this.loadFolders();
  }

  /** @deprecated Use {@link NavigateBack}. */
  public navigateBack(): void {
    return this.NavigateBack();
  }

  /**
   * Navigates forward in history
   */
  public NavigateForward(): void {
    if (!this.CanGoForward()) {
      return;
    }

    this.HistoryIndex++;
    this.CurrentPath = this.History[this.HistoryIndex];
    this.updateBreadcrumbs();
    this.FolderSelected.emit(this.CurrentPath);
    this.loadFolders();
  }

  /** @deprecated Use {@link NavigateForward}. */
  public navigateForward(): void {
    return this.NavigateForward();
  }

  /**
   * Checks if can navigate back
   */
  public CanGoBack(): boolean {
    return this.HistoryIndex > 0;
  }

  /** @deprecated Use {@link CanGoBack}. */
  public canGoBack(): boolean {
    return this.CanGoBack();
  }

  /**
   * Checks if can navigate forward
   */
  public CanGoForward(): boolean {
    return this.HistoryIndex < this.History.length - 1;
  }

  /** @deprecated Use {@link CanGoForward}. */
  public canGoForward(): boolean {
    return this.CanGoForward();
  }

  /**
   * Updates breadcrumbs based on current path
   */
  private updateBreadcrumbs(): void {
    if (!this.Account) {
      this.Breadcrumbs = [];
      return;
    }

    // Start with account root (show account name)
    const items: BreadcrumbItem[] = [
      {
        label: this.Account.account.Name,
        path: '/'
      }
    ];

    // Add path segments if not at root
    if (this.CurrentPath !== '/') {
      const segments = this.CurrentPath.split('/').filter(s => s.length > 0);
      let builtPath = '';

      for (const segment of segments) {
        builtPath += '/' + segment;
        items.push({
          label: segment,
          path: builtPath
        });
      }
    }

    this.Breadcrumbs = items;
  }

  /**
   * Handles breadcrumb click
   */
  public OnBreadcrumbClick(item: BreadcrumbItem): void {
    this.NavigateToPath(item.path);
    this.loadFolders();
  }

  /** @deprecated Use {@link OnBreadcrumbClick}. */
  public onBreadcrumbClick(item: BreadcrumbItem): void {
    return this.OnBreadcrumbClick(item);
  }

  /**
   * Loads folders from the storage account for the current path
   */
  private async loadFolders(): Promise<void> {
    if (!this.Account) {
      this.Folders = [];
      return;
    }

    this.IsLoading = true;
    this.ErrorMessage = null;
    this.cdr.detectChanges();

    try {
      // Blob keys (Azure/S3) have NO leading slash and use a trailing slash to denote a
      // directory prefix. currentPath is stored with a leading slash (e.g. "/test"), which
      // never matches real keys — so nested-folder listings came back empty (empty folder
      // names). Normalize to a slash-free, trailing-slash prefix before listing.
      const rawPath = this.CurrentPath && this.CurrentPath !== '/' ? this.CurrentPath : '';
      const listPrefix = rawPath ? rawPath.replace(/^\/+/, '').replace(/\/+$/, '') + '/' : '';
      const listResult = await this.storageClient.ListObjects(
        this.Account.account.ID,
        listPrefix,
        '/'
      );

      // Convert prefixes to FolderItems
      const prefixes = listResult.prefixes || [];
      this.Folders = prefixes.map((prefix: string) => {
        // Remove trailing slash and get just the folder name
        const cleanPath = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
        const name = cleanPath.split('/').pop() || cleanPath;

        return {
          name,
          fullPath: prefix
        };
      });
    } catch (error) {
      console.error('Error loading folders:', error);
      this.ErrorMessage = error instanceof Error ? error.message : 'Failed to load folders';
      this.Folders = [];
    } finally {
      this.IsLoading = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Handles folder click for navigation
   */
  public OnFolderClick(folder: FolderItem): void {
    this.NavigateToPath(folder.fullPath);
    this.loadFolders();
  }

  /** @deprecated Use {@link OnFolderClick}. */
  public onFolderClick(folder: FolderItem): void {
    return this.OnFolderClick(folder);
  }
}
