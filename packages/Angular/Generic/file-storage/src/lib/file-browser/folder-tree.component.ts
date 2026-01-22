import { Component, EventEmitter, Input, Output } from '@angular/core';
import { GraphQLDataProvider, GraphQLFileStorageClient } from '@memberjunction/graphql-dataprovider';
import { StorageAccountWithProvider } from '@memberjunction/core-entities';

/**
 * Represents a breadcrumb item in the path
 */
export interface BreadcrumbItem {
  label: string;
  path: string;
}

/**
 * Represents a folder in the tree
 */
export interface FolderItem {
  name: string;
  fullPath: string;
}

/**
 * Folder tree navigation component with breadcrumbs and history navigation.
 * Provides Mac Finder-style navigation with back/forward buttons and breadcrumb path.
 * Loads actual folder structure from storage accounts via GraphQL.
 */
@Component({
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
  set account(value: StorageAccountWithProvider | null) {
    const previousAccount = this._account;
    this._account = value;

    if (value && value.account.ID !== previousAccount?.account.ID) {
      this.resetNavigation();
      this.loadFolders();
    }
  }
  get account(): StorageAccountWithProvider | null {
    return this._account;
  }

  /**
   * Emits when a folder is selected in the tree
   */
  @Output() folderSelected = new EventEmitter<string>();

  /**
   * Current folder path
   */
  public currentPath: string = '/';

  /**
   * Navigation history (for back button)
   */
  public history: string[] = [];

  /**
   * Current position in history
   */
  public historyIndex: number = -1;

  /**
   * Breadcrumb items for current path
   */
  public breadcrumbs: BreadcrumbItem[] = [];

  /**
   * Folders in current path
   */
  public folders: FolderItem[] = [];

  /**
   * Loading state
   */
  public isLoading: boolean = false;

  /**
   * Error message
   */
  public errorMessage: string | null = null;

  /**
   * Resets navigation when provider changes
   */
  private resetNavigation(): void {
    this.currentPath = '/';
    this.history = ['/'];
    this.historyIndex = 0;
    this.updateBreadcrumbs();
  }

  /**
   * Navigates to a specific folder path
   */
  public navigateToPath(path: string): void {
    // Don't navigate if already at this path
    if (path === this.currentPath) {
      return;
    }

    // Add to history if navigating from user action (not back/forward)
    if (this.historyIndex === this.history.length - 1) {
      this.history.push(path);
      this.historyIndex = this.history.length - 1;
    } else {
      // Navigating from middle of history - truncate forward history
      this.history = this.history.slice(0, this.historyIndex + 1);
      this.history.push(path);
      this.historyIndex = this.history.length - 1;
    }

    this.currentPath = path;
    this.updateBreadcrumbs();
    this.loadFolders();
    this.folderSelected.emit(path);
  }

  /**
   * Refreshes the current folder view without changing navigation
   * Used when folder structure changes (e.g., folder deleted) but we're staying in the same location
   */
  public refresh(): void {
    this.loadFolders();
  }

  /**
   * Navigates back in history
   */
  public navigateBack(): void {
    if (!this.canGoBack()) {
      return;
    }

    this.historyIndex--;
    this.currentPath = this.history[this.historyIndex];
    this.updateBreadcrumbs();
    this.folderSelected.emit(this.currentPath);
    this.loadFolders();
  }

  /**
   * Navigates forward in history
   */
  public navigateForward(): void {
    if (!this.canGoForward()) {
      return;
    }

    this.historyIndex++;
    this.currentPath = this.history[this.historyIndex];
    this.updateBreadcrumbs();
    this.folderSelected.emit(this.currentPath);
    this.loadFolders();
  }

  /**
   * Checks if can navigate back
   */
  public canGoBack(): boolean {
    return this.historyIndex > 0;
  }

  /**
   * Checks if can navigate forward
   */
  public canGoForward(): boolean {
    return this.historyIndex < this.history.length - 1;
  }

  /**
   * Updates breadcrumbs based on current path
   */
  private updateBreadcrumbs(): void {
    if (!this.account) {
      this.breadcrumbs = [];
      return;
    }

    // Start with account root (show account name)
    const items: BreadcrumbItem[] = [
      {
        label: this.account.account.Name,
        path: '/'
      }
    ];

    // Add path segments if not at root
    if (this.currentPath !== '/') {
      const segments = this.currentPath.split('/').filter(s => s.length > 0);
      let builtPath = '';

      for (const segment of segments) {
        builtPath += '/' + segment;
        items.push({
          label: segment,
          path: builtPath
        });
      }
    }

    this.breadcrumbs = items;
  }

  /**
   * Handles breadcrumb click
   */
  public onBreadcrumbClick(item: BreadcrumbItem): void {
    this.navigateToPath(item.path);
    this.loadFolders();
  }

  /**
   * Loads folders from the storage account for the current path
   */
  private async loadFolders(): Promise<void> {
    if (!this.account) {
      this.folders = [];
      return;
    }

    this.isLoading = true;
    this.errorMessage = null;

    try {
      const listResult = await this.storageClient.ListObjects(
        this.account.account.ID,
        this.currentPath === '/' ? '' : this.currentPath,
        '/'
      );

      console.log('[FolderTree] ListObjects result:', {
        prefixesCount: listResult.prefixes?.length || 0,
        prefixes: listResult.prefixes,
        objectsCount: listResult.objects?.length || 0
      });

      // Convert prefixes to FolderItems
      const prefixes = listResult.prefixes || [];
      console.log('[FolderTree] Processing prefixes:', prefixes);
      this.folders = prefixes.map((prefix: string) => {
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
      this.errorMessage = error instanceof Error ? error.message : 'Failed to load folders';
      this.folders = [];
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Handles folder click for navigation
   */
  public onFolderClick(folder: FolderItem): void {
    this.navigateToPath(folder.fullPath);
    this.loadFolders();
  }
}
