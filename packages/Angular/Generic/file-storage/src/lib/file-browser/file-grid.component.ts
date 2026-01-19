import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { RunView } from '@memberjunction/core';
import { FileStorageAccountEntity, FileStorageProviderEntity } from '@memberjunction/core-entities';
import { StorageAccountWithProvider } from './storage-providers-list.component';

/**
 * Represents a file or folder item in the grid
 */
export interface FileGridItem {
  key: string;
  name: string;
  type: 'file' | 'folder';
  size: number;
  lastModified: Date;
  contentType?: string;
  etag?: string;
}

/**
 * Result from a single provider's search
 */
export interface FileSearchResultItem {
  path: string;
  name: string;
  size: number;
  contentType: string;
  lastModified: string;
  relevance?: number;
  excerpt?: string;
  matchInFilename?: boolean;
  objectId?: string;
}

/**
 * Search results from a single account
 */
export interface AccountSearchResult {
  accountID: string;
  accountName: string;
  success: boolean;
  errorMessage?: string;
  results: FileSearchResultItem[];
  totalMatches?: number;
  hasMore: boolean;
  nextPageToken?: string;
}

/**
 * Aggregated search results from multiple accounts
 */
export interface MultiProviderSearchResult {
  accountResults: AccountSearchResult[];
  totalResultsReturned: number;
  successfulAccounts: number;
  failedAccounts: number;
}

/**
 * Displays files and folders in a grid/list view.
 * Shows file metadata like name, size, type, and last modified date.
 * Supports file selection and navigation to folders.
 */
@Component({
  selector: 'mj-file-grid',
  templateUrl: './file-grid.component.html',
  styleUrls: ['./file-grid.component.css']
})
export class FileGridComponent implements OnInit, OnChanges {
  /**
   * The storage account to list files from (includes provider details)
   */
  @Input() account: StorageAccountWithProvider | null = null;

  /**
   * The current folder path to display
   */
  @Input() folderPath: string = '';

  /**
   * Emits when a folder is double-clicked for navigation
   */
  @Output() folderNavigate = new EventEmitter<string>();

  /**
   * Emits when the folder structure has changed (e.g., new folder created)
   * This signals that the folder tree should refresh
   */
  @Output() folderStructureChanged = new EventEmitter<void>();

  /**
   * List of files and folders in the current directory
   */
  public items: FileGridItem[] = [];

  /**
   * Currently selected item keys in the grid (Kendo stores keys, not full objects)
   */
  public selectedItems: string[] = [];

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
  public viewMode: 'grid' | 'list' = 'list';

  /**
   * Sort configuration for the grid
   */
  public sort: Array<{ field: string; dir?: 'asc' | 'desc' }> = [
    { field: 'name', dir: 'asc' }
  ];

  /**
   * Search query for filtering files/folders
   */
  public searchQuery: string = '';

  /**
   * File type filter ('all', 'files', 'folders')
   */
  public fileTypeFilter: 'all' | 'files' | 'folders' = 'all';

  /**
   * Filtered list of items based on search and filter criteria
   */
  public filteredItems: FileGridItem[] = [];

  /**
   * Drag-and-drop state
   */
  public isDragging: boolean = false;

  /**
   * Upload progress state
   */
  public isUploading: boolean = false;
  public uploadProgress: number = 0;
  public uploadingFileName: string = '';

  /**
   * New folder dialog state
   */
  public showNewFolderDialog: boolean = false;
  public newFolderName: string = '';
  public isCreatingFolder: boolean = false;

  /**
   * Delete confirmation dialog state
   */
  public showDeleteDialog: boolean = false;
  public itemToDelete: FileGridItem | null = null;
  public isDeleting: boolean = false;

  /**
   * Rename dialog state
   */
  public showRenameDialog: boolean = false;
  public itemToRename: FileGridItem | null = null;
  public newItemName: string = '';
  public isRenaming: boolean = false;

  /**
   * Copy dialog state
   */
  public showCopyDialog: boolean = false;
  public itemToCopy: FileGridItem | null = null;
  public copyDestinationPath: string = '';
  public isCopying: boolean = false;

  /**
   * Move dialog state
   */
  public showMoveDialog: boolean = false;
  public itemToMove: FileGridItem | null = null;
  public moveDestinationPath: string = '';
  public isMoving: boolean = false;

  /**
   * Copy to provider dialog state
   */
  public showCopyToProviderDialog: boolean = false;
  public itemToCopyToProvider: FileGridItem | null = null;
  public availableAccounts: StorageAccountWithProvider[] = [];
  public selectedDestinationAccounts: Set<string> = new Set();
  public copyToAccountDestinationPath: string = '';
  public isCopyingToAccount: boolean = false;
  public copyToAccountProgress: { current: number; total: number; currentAccount: string } | null = null;

  /**
   * Multi-provider search state
   */
  public isMultiProviderSearchMode: boolean = false;
  public multiProviderSearchQuery: string = '';
  public selectedSearchProviders: Set<string> = new Set();
  public isSearching: boolean = false;
  public multiProviderSearchResults: MultiProviderSearchResult | null = null;

  constructor() {}

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
    if (!this.account) {
      this.items = [];
      return;
    }

    const previousItemCount = this.items.length;
    const previousItemNames = this.items.map(i => i.name);

    this.isLoading = true;
    this.errorMessage = null;

    try {
      const gqlProvider = GraphQLDataProvider.Instance;

      const query = `
        query ListStorageObjects($input: ListStorageObjectsInput!) {
          ListStorageObjects(input: $input) {
            objects {
              name
              path
              fullPath
              size
              contentType
              lastModified
              isDirectory
              etag
              cacheControl
            }
            prefixes
          }
        }
      `;

      const variables = {
        input: {
          AccountID: this.account.account.ID,
          Prefix: this.folderPath || '',
          Delimiter: '/'
        }
      };

      console.log('[FileGrid] Loading items with variables:', variables);
      console.log('[FileGrid] Previous items:', { count: previousItemCount, names: previousItemNames });

      const result = await gqlProvider.ExecuteGQL(query, variables);

      console.log('[FileGrid] GraphQL result:', result);

      const data = result as {
        ListStorageObjects: {
          objects: Array<{
            name: string;
            path: string;
            fullPath: string;
            size: number;
            contentType: string;
            lastModified: string;
            isDirectory: boolean;
            etag?: string;
            cacheControl?: string;
          }>;
          prefixes: string[];
        }
      };

      this.items = [];

      // Add folders from prefixes first (so they appear before files)
      if (data.ListStorageObjects.prefixes) {
        for (const prefix of data.ListStorageObjects.prefixes) {
          // Extract the folder name from the prefix path
          // Prefix comes as "path/to/folder/" so we need to get just "folder"
          const folderName = prefix.endsWith('/')
            ? prefix.slice(0, -1).split('/').pop()
            : prefix.split('/').pop();

          if (folderName) {
            this.items.push({
              key: prefix,
              name: folderName,
              type: 'folder',
              size: 0,
              lastModified: new Date(),
              contentType: 'application/x-directory'
            });
          }
        }
      }

      // Add files from objects
      if (data.ListStorageObjects.objects) {
        for (const obj of data.ListStorageObjects.objects) {
          // Skip directories from objects - we already added them from prefixes
          if (obj.isDirectory) {
            continue;
          }

          this.items.push({
            key: obj.fullPath,
            name: obj.name,
            type: 'file',
            size: obj.size,
            lastModified: new Date(obj.lastModified),
            contentType: obj.contentType,
            etag: obj.etag
          });
        }
      }

    } catch (error) {
      this.errorMessage = 'Failed to load files';
      console.error('[FileGrid] Error loading files:', error);
    } finally {
      this.isLoading = false;
    }

    // Apply filters after loading
    this.applyFilters();
  }

  /**
   * Applies search and filter criteria to the items list
   */
  private applyFilters(): void {
    let filtered = [...this.items];

    // Apply file type filter
    if (this.fileTypeFilter === 'files') {
      filtered = filtered.filter(item => item.type === 'file');
    } else if (this.fileTypeFilter === 'folders') {
      filtered = filtered.filter(item => item.type === 'folder');
    }

    // Apply search query
    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(item =>
        item.name.toLowerCase().includes(query)
      );
    }

    this.filteredItems = filtered;
  }

  /**
   * Handles search query changes
   */
  public onSearchChange(query: string): void {
    this.searchQuery = query;
    this.applyFilters();
  }

  /**
   * Clears the search query
   */
  public clearSearch(): void {
    this.searchQuery = '';
    this.applyFilters();
  }

  /**
   * Handles file type filter changes
   */
  public onFileTypeFilterChange(filterType: 'all' | 'files' | 'folders'): void {
    this.fileTypeFilter = filterType;
    this.applyFilters();
  }

  /**
   * Formats a file size in bytes to a human-readable string
   */
  public formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
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
  public getItemIcon(item: FileGridItem): string {
    if (!item || !item.name) {
      return 'fa-solid fa-file';
    }

    if (item.type === 'folder') {
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

  /**
   * Handles item selection change (not used - Kendo handles selection internally)
   */
  public onSelectionChange(selectedKeys: string[]): void {
    this.selectedItems = selectedKeys;
  }

  /**
   * Handles tile click in grid view for selection
   */
  public onTileClick(item: FileGridItem, event: MouseEvent): void {
    if (event.ctrlKey || event.metaKey) {
      // Multi-select: toggle item key
      const index = this.selectedItems.indexOf(item.key);
      if (index >= 0) {
        this.selectedItems.splice(index, 1);
      } else {
        this.selectedItems.push(item.key);
      }
    } else if (event.shiftKey && this.selectedItems.length > 0) {
      // Range select: select from last selected to current
      const lastSelectedKey = this.selectedItems[this.selectedItems.length - 1];
      const lastSelected = this.items.find(i => i.key === lastSelectedKey);
      if (lastSelected) {
        const lastIndex = this.items.indexOf(lastSelected);
        const currentIndex = this.items.indexOf(item);
        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);
        this.selectedItems = this.items.slice(start, end + 1).map(i => i.key);
      }
    } else {
      // Single select: replace selection
      this.selectedItems = [item.key];
    }
  }

  /**
   * Handles double-click on an item
   * For folders, navigate into them. For files, open/download them.
   */
  public onItemDoubleClick(item: FileGridItem): void {
    if (item.type === 'folder') {
      // Navigate into folder by emitting the folder path
      console.log('[FileGrid] Navigating to folder:', item.key);
      this.folderNavigate.emit(item.key);
    } else {
      // Download file
      this.downloadFile(item);
    }
  }

  /**
   * Downloads a file by creating a pre-authenticated download URL
   */
  private async downloadFile(item: FileGridItem): Promise<void> {
    if (!this.account) {
      return;
    }

    try {
      console.log('[FileGrid] Downloading file:', item.key);

      const gqlProvider = GraphQLDataProvider.Instance;

      // Use the CreatePreAuthDownloadUrl mutation to get a signed URL
      const query = `
        query CreatePreAuthDownloadUrl($input: CreatePreAuthDownloadUrlInput!) {
          CreatePreAuthDownloadUrl(input: $input)
        }
      `;

      const variables = {
        input: {
          AccountID: this.account.account.ID,
          ObjectName: item.key
        }
      };

      const result = await gqlProvider.ExecuteGQL(query, variables);

      console.log('[FileGrid] GraphQL result:', result);

      const downloadUrl = result.CreatePreAuthDownloadUrl as string;

      if (downloadUrl) {
        // Trigger browser download
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = item.name;
        link.target = '_blank'; // Open in new tab as fallback
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        console.log('[FileGrid] File download initiated:', item.name);
      } else {
        console.error('[FileGrid] Failed to get download URL - result was:', result);
        this.errorMessage = 'Failed to generate download URL';
      }
    } catch (error) {
      console.error('[FileGrid] Error downloading file:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.errorMessage = `Failed to download file: ${errorMessage}`;

      // Clear error after 5 seconds
      setTimeout(() => {
        if (this.errorMessage?.startsWith('Failed to download')) {
          this.errorMessage = null;
        }
      }, 5000);
    }
  }

  /**
   * Toggles between grid and list view
   */
  public toggleViewMode(): void {
    this.viewMode = this.viewMode === 'grid' ? 'list' : 'grid';
  }

  /**
   * Refreshes the current directory
   */
  public refresh(): void {
    this.loadItems();
  }

  /**
   * Navigates up to the parent directory
   */
  public navigateUp(): void {
    if (!this.folderPath) {
      // Already at root
      return;
    }

    // Remove trailing slash if present
    const cleanPath = this.folderPath.endsWith('/')
      ? this.folderPath.slice(0, -1)
      : this.folderPath;

    // Get parent path by removing last segment
    const segments = cleanPath.split('/').filter(s => s.length > 0);
    segments.pop(); // Remove last segment

    const parentPath = segments.length > 0 ? segments.join('/') + '/' : '';

    // Emit navigation event to update the folder tree and path
    this.folderNavigate.emit(parentPath);
  }

  /**
   * Checks if we can navigate up (not at root)
   */
  public canNavigateUp(): boolean {
    return this.folderPath !== '' && this.folderPath !== '/';
  }

  /**
   * Handles sort change event from the grid
   */
  public onSortChange(sort: Array<{ field: string; dir?: 'asc' | 'desc' }>): void {
    this.sort = sort;
  }

  /**
   * Gets a human-readable file type based on extension
   */
  public getFileType(item: FileGridItem): string {
    if (item.type === 'folder') {
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

  /**
   * Handles upload button click - triggers file input
   */
  public onUploadClick(): void {
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

  /**
   * Handles drag enter event
   */
  public onDragEnter(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = true;
  }

  /**
   * Handles drag over event
   */
  public onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  /**
   * Handles drag leave event
   */
  public onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();

    // Only hide if leaving the container itself, not child elements
    if (event.currentTarget === event.target) {
      this.isDragging = false;
    }
  }

  /**
   * Handles drop event
   */
  public onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.uploadFiles(Array.from(files));
    }
  }

  /**
   * Uploads multiple files to the current folder
   */
  private async uploadFiles(files: File[]): Promise<void> {
    if (!this.account) {
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
   * Uploads a single file
   */
  private async uploadSingleFile(file: File, current: number, total: number): Promise<void> {
    if (!this.account) {
      return;
    }

    this.isUploading = true;
    this.uploadingFileName = `${file.name} (${current}/${total})`;
    this.uploadProgress = 0;

    try {
      const gqlProvider = GraphQLDataProvider.Instance;

      // Construct the full object name with folder path
      // Remove trailing slash from folderPath to avoid double slashes
      let objectName: string;
      if (this.folderPath) {
        const cleanPath = this.folderPath.endsWith('/')
          ? this.folderPath.slice(0, -1)
          : this.folderPath;
        objectName = `${cleanPath}/${file.name}`;
      } else {
        objectName = file.name;
      }

      console.log('[FileGrid] Getting upload URL for:', objectName);

      // Get pre-authenticated upload URL
      const query = `
        mutation CreatePreAuthUploadUrl($input: CreatePreAuthUploadUrlInput!) {
          CreatePreAuthUploadUrl(input: $input) {
            UploadUrl
            ProviderKey
          }
        }
      `;

      const variables = {
        input: {
          AccountID: this.account.account.ID,
          ObjectName: objectName,
          ContentType: file.type || 'application/octet-stream'
        }
      };

      const result = await gqlProvider.ExecuteGQL(query, variables);
      const uploadData = result.CreatePreAuthUploadUrl as { UploadUrl: string; ProviderKey?: string };

      console.log('[FileGrid] Got upload URL:', uploadData.UploadUrl);

      // Upload the file using XMLHttpRequest to track progress
      await this.uploadFileToUrl(file, uploadData.UploadUrl);

      console.log('[FileGrid] File uploaded successfully:', file.name);

    } catch (error) {
      console.error('[FileGrid] Error uploading file:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Check if this is an unsupported operation error (e.g., Google Drive doesn't support pre-auth uploads)
      if (errorMessage.includes('not supported')) {
        this.errorMessage = `Upload not supported for ${this.account?.account.Name || 'this account'}. Try using a different storage account.`;
      } else {
        this.errorMessage = `Failed to upload ${file.name}: ${errorMessage}`;
      }

      // Clear error after 5 seconds
      setTimeout(() => {
        if (this.errorMessage?.startsWith('Failed to upload') || this.errorMessage?.startsWith('Upload not supported')) {
          this.errorMessage = null;
        }
      }, 5000);
    } finally {
      this.isUploading = false;
      this.uploadProgress = 0;
      this.uploadingFileName = '';
    }
  }

  /**
   * Uploads file to the pre-authenticated URL with progress tracking
   */
  private uploadFileToUrl(file: File, url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          this.uploadProgress = Math.round((event.loaded / event.total) * 100);
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

      // Use POST for Dropbox temporary upload links (required by Dropbox API)
      // Use PUT for other providers like S3
      // Dropbox requires POST with application/octet-stream
      xhr.open('POST', url, true);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.send(file);
    });
  }

  /**
   * Opens the new folder dialog
   */
  public onNewFolderClick(): void {
    this.newFolderName = '';
    this.showNewFolderDialog = true;
  }

  /**
   * Closes the new folder dialog
   */
  public onCancelNewFolder(): void {
    this.showNewFolderDialog = false;
    this.newFolderName = '';
  }

  /**
   * Creates a new folder in the current directory
   */
  public async onCreateFolder(): Promise<void> {
    if (!this.account || !this.newFolderName.trim()) {
      return;
    }

    this.isCreatingFolder = true;

    try {
      const gqlProvider = GraphQLDataProvider.Instance;

      // Construct the full folder path
      // Remove trailing slash from folderPath to avoid double slashes
      let folderPath: string;
      if (this.folderPath) {
        const cleanPath = this.folderPath.endsWith('/')
          ? this.folderPath.slice(0, -1)
          : this.folderPath;
        folderPath = `${cleanPath}/${this.newFolderName.trim()}`;
      } else {
        folderPath = this.newFolderName.trim();
      }

      console.log('[FileGrid] Creating folder:', folderPath);

      // Call CreateDirectory mutation
      const query = `
        mutation CreateDirectory($input: CreateDirectoryInput!) {
          CreateDirectory(input: $input)
        }
      `;

      const variables = {
        input: {
          AccountID: this.account.account.ID,
          Path: folderPath
        }
      };

      const result = await gqlProvider.ExecuteGQL(query, variables);
      const success = result.CreateDirectory as boolean;

      if (success) {
        console.log('[FileGrid] Folder created successfully:', folderPath);

        // Close dialog and refresh
        this.showNewFolderDialog = false;
        this.newFolderName = '';

        // Notify parent that folder structure changed
        this.folderStructureChanged.emit();

        // Refresh the file grid
        this.loadItems();
      } else {
        this.errorMessage = 'Failed to create folder';
      }
    } catch (error) {
      console.error('[FileGrid] Error creating folder:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.errorMessage = `Failed to create folder: ${errorMessage}`;

      // Clear error after 5 seconds
      setTimeout(() => {
        if (this.errorMessage?.startsWith('Failed to create')) {
          this.errorMessage = null;
        }
      }, 5000);
    } finally {
      this.isCreatingFolder = false;
    }
  }

  /**
   * Opens the delete confirmation dialog for the selected items
   */
  public onDeleteClick(): void {
    if (this.selectedItems.length === 0) {
      return;
    }

    // selectedItems contains keys (strings), not full objects
    // Find the actual item object from the items array
    const selectedKey = this.selectedItems[0];
    const item = this.items.find(i => i.key === selectedKey);

    if (!item) {
      console.error('[FileGrid] Could not find selected item with key:', selectedKey);
      return;
    }

    this.itemToDelete = item;
    this.showDeleteDialog = true;
  }

  /**
   * Closes the delete confirmation dialog
   */
  public onCancelDelete(): void {
    this.showDeleteDialog = false;
    this.itemToDelete = null;
  }

  /**
   * Deletes the selected item after confirmation
   */
  public async onConfirmDelete(): Promise<void> {
    if (!this.account || !this.itemToDelete) {
      return;
    }

    this.isDeleting = true;

    try {
      const gqlProvider = GraphQLDataProvider.Instance;

      // Construct the full path to the item
      const itemPath = this.constructItemPath(this.itemToDelete);

      console.log('[FileGrid] Deleting item:', itemPath);

      const query = `
        mutation DeleteStorageObject($input: DeleteStorageObjectInput!) {
          DeleteStorageObject(input: $input)
        }
      `;

      const variables = {
        input: {
          AccountID: this.account.account.ID,
          ObjectName: itemPath
        }
      };

      const result = await gqlProvider.ExecuteGQL(query, variables);
      const success = result.DeleteStorageObject as boolean;

      console.log('[FileGrid] Delete mutation result:', { success, result });

      if (success) {
        console.log('[FileGrid] Item deleted successfully:', itemPath);

        // Check if we deleted a folder (before clearing itemToDelete)
        const wasFolder = this.itemToDelete.type === 'folder';

        console.log('[FileGrid] Item details:', {
          type: this.itemToDelete.type,
          name: this.itemToDelete.name,
          key: this.itemToDelete.key,
          wasFolder
        });

        // Close dialog
        this.showDeleteDialog = false;
        this.itemToDelete = null;

        // Clear selection
        this.selectedItems = [];

        // If we deleted a folder, notify parent that folder structure changed
        if (wasFolder) {
          console.log('[FileGrid] Emitting folderStructureChanged event');
          this.folderStructureChanged.emit();
        }

        // Refresh the file grid
        console.log('[FileGrid] Calling loadItems() to refresh grid');
        this.loadItems();
      } else {
        console.error('[FileGrid] Delete operation returned false');
        this.errorMessage = `Failed to delete ${this.itemToDelete.type}`;
      }
    } catch (error) {
      console.error('[FileGrid] Error deleting item:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.errorMessage = `Failed to delete: ${errorMessage}`;

      // Clear error after 5 seconds
      setTimeout(() => {
        if (this.errorMessage?.startsWith('Failed to delete')) {
          this.errorMessage = null;
        }
      }, 5000);
    } finally {
      this.isDeleting = false;
    }
  }

  /**
   * Opens the rename dialog for the selected item
   */
  public onRenameClick(): void {
    if (this.selectedItems.length !== 1) {
      return;
    }

    // selectedItems contains keys (strings), not full objects
    // Find the actual item object from the items array
    const selectedKey = this.selectedItems[0];
    const item = this.items.find(i => i.key === selectedKey);

    if (!item) {
      console.error('[FileGrid] Could not find selected item with key:', selectedKey);
      return;
    }

    this.itemToRename = item;
    this.newItemName = item.name;
    this.showRenameDialog = true;
  }

  /**
   * Closes the rename dialog
   */
  public onCancelRename(): void {
    this.showRenameDialog = false;
    this.itemToRename = null;
    this.newItemName = '';
  }

  /**
   * Renames the selected item after confirmation
   */
  public async onConfirmRename(): Promise<void> {
    if (!this.account || !this.itemToRename || !this.newItemName.trim()) {
      return;
    }

    // Check if name actually changed
    if (this.newItemName.trim() === this.itemToRename.name) {
      this.onCancelRename();
      return;
    }

    this.isRenaming = true;

    try {
      const gqlProvider = GraphQLDataProvider.Instance;

      // Construct the old and new paths
      const oldPath = this.constructItemPath(this.itemToRename);

      // Build the new path by replacing the old name with the new name
      const pathParts = oldPath.split('/');
      pathParts[pathParts.length - 1] = this.newItemName.trim();
      const newPath = pathParts.join('/');

      console.log('[FileGrid] Renaming item:', { oldPath, newPath });

      const query = `
        mutation MoveStorageObject($input: MoveStorageObjectInput!) {
          MoveStorageObject(input: $input)
        }
      `;

      const variables = {
        input: {
          AccountID: this.account.account.ID,
          OldName: oldPath,
          NewName: newPath
        }
      };

      const result = await gqlProvider.ExecuteGQL(query, variables);
      const success = result.MoveStorageObject as boolean;

      console.log('[FileGrid] Rename mutation result:', { success, result });

      if (success) {
        console.log('[FileGrid] Item renamed successfully:', { oldPath, newPath });

        // Check if we renamed a folder (before clearing itemToRename)
        const wasFolder = this.itemToRename.type === 'folder';

        // Close dialog
        this.showRenameDialog = false;
        this.itemToRename = null;
        this.newItemName = '';

        // Clear selection
        this.selectedItems = [];

        // If we renamed a folder, notify parent that folder structure changed
        if (wasFolder) {
          console.log('[FileGrid] Emitting folderStructureChanged event');
          this.folderStructureChanged.emit();
        }

        // Refresh the file grid
        console.log('[FileGrid] Calling loadItems() to refresh grid');
        this.loadItems();
      } else {
        console.error('[FileGrid] Rename operation returned false');
        this.errorMessage = `Failed to rename ${this.itemToRename.type}`;
      }
    } catch (error) {
      console.error('[FileGrid] Error renaming item:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.errorMessage = `Failed to rename: ${errorMessage}`;

      // Clear error after 5 seconds
      setTimeout(() => {
        if (this.errorMessage?.startsWith('Failed to rename')) {
          this.errorMessage = null;
        }
      }, 5000);
    } finally {
      this.isRenaming = false;
    }
  }

  /**
   * Downloads the selected file
   */
  public async onDownloadClick(): Promise<void> {
    if (this.selectedItems.length !== 1) {
      return;
    }

    // Find the selected item
    const selectedKey = this.selectedItems[0];
    const item = this.items.find(i => i.key === selectedKey);

    if (!item) {
      console.error('[FileGrid] Could not find selected item with key:', selectedKey);
      return;
    }

    // Can only download files, not folders
    if (item.type === 'folder') {
      this.errorMessage = 'Cannot download folders. Please select a file.';
      setTimeout(() => {
        if (this.errorMessage?.includes('Cannot download folders')) {
          this.errorMessage = null;
        }
      }, 3000);
      return;
    }

    if (!this.account) {
      return;
    }

    try {
      const gqlProvider = GraphQLDataProvider.Instance;
      const itemPath = this.constructItemPath(item);

      console.log('[FileGrid] Creating download URL for:', itemPath);

      const query = `
        query CreatePreAuthDownloadUrl($input: CreatePreAuthDownloadUrlInput!) {
          CreatePreAuthDownloadUrl(input: $input)
        }
      `;

      const variables = {
        input: {
          AccountID: this.account.account.ID,
          ObjectName: itemPath
        }
      };

      const result = await gqlProvider.ExecuteGQL(query, variables);
      const downloadUrl = result.CreatePreAuthDownloadUrl as string;

      if (downloadUrl) {
        console.log('[FileGrid] Download URL created, initiating download');

        // Create a temporary anchor element to trigger download
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = item.name;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        this.errorMessage = 'Failed to create download URL';
      }
    } catch (error) {
      console.error('[FileGrid] Error downloading file:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.errorMessage = `Failed to download: ${errorMessage}`;

      // Clear error after 5 seconds
      setTimeout(() => {
        if (this.errorMessage?.startsWith('Failed to download')) {
          this.errorMessage = null;
        }
      }, 5000);
    }
  }

  /**
   * Opens the copy dialog for the selected item
   */
  public onCopyClick(): void {
    if (this.selectedItems.length !== 1) {
      return;
    }

    const selectedKey = this.selectedItems[0];
    const item = this.items.find(i => i.key === selectedKey);

    if (!item) {
      console.error('[FileGrid] Could not find selected item with key:', selectedKey);
      return;
    }

    this.itemToCopy = item;
    this.copyDestinationPath = this.folderPath + item.name + '-copy';
    this.showCopyDialog = true;
  }

  /**
   * Cancels the copy operation
   */
  public onCancelCopy(): void {
    this.showCopyDialog = false;
    this.itemToCopy = null;
    this.copyDestinationPath = '';
  }

  /**
   * Confirms and executes the copy operation
   */
  public async onConfirmCopy(): Promise<void> {
    if (!this.account || !this.itemToCopy || !this.copyDestinationPath.trim()) {
      return;
    }

    this.isCopying = true;

    try {
      const gqlProvider = GraphQLDataProvider.Instance;
      const sourcePath = this.constructItemPath(this.itemToCopy);

      const query = `
        mutation CopyStorageObject($input: CopyStorageObjectInput!) {
          CopyStorageObject(input: $input)
        }
      `;

      const variables = {
        input: {
          AccountID: this.account.account.ID,
          SourceName: sourcePath,
          DestinationName: this.copyDestinationPath.trim()
        }
      };

      const result = await gqlProvider.ExecuteGQL(query, variables);
      const success = result.CopyStorageObject as boolean;

      if (success) {
        // Close dialog
        this.showCopyDialog = false;
        this.itemToCopy = null;
        this.copyDestinationPath = '';

        // Clear selection
        this.selectedItems = [];

        // Refresh the file grid
        this.loadItems();
      } else {
        this.errorMessage = 'Failed to copy item';
      }
    } catch (error) {
      console.error('[FileGrid] Error copying item:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.errorMessage = `Failed to copy: ${errorMessage}`;

      setTimeout(() => {
        if (this.errorMessage?.startsWith('Failed to copy')) {
          this.errorMessage = null;
        }
      }, 5000);
    } finally {
      this.isCopying = false;
    }
  }

  /**
   * Opens the move dialog for the selected item
   */
  public onMoveClick(): void {
    if (this.selectedItems.length !== 1) {
      return;
    }

    const selectedKey = this.selectedItems[0];
    const item = this.items.find(i => i.key === selectedKey);

    if (!item) {
      console.error('[FileGrid] Could not find selected item with key:', selectedKey);
      return;
    }

    this.itemToMove = item;
    // Suggest a different folder path
    this.moveDestinationPath = this.folderPath;
    this.showMoveDialog = true;
  }

  /**
   * Cancels the move operation
   */
  public onCancelMove(): void {
    this.showMoveDialog = false;
    this.itemToMove = null;
    this.moveDestinationPath = '';
  }

  /**
   * Confirms and executes the move operation
   */
  public async onConfirmMove(): Promise<void> {
    if (!this.account || !this.itemToMove || !this.moveDestinationPath.trim()) {
      return;
    }

    this.isMoving = true;

    try {
      const gqlProvider = GraphQLDataProvider.Instance;
      const sourcePath = this.constructItemPath(this.itemToMove);
      const destPath = this.moveDestinationPath.trim().endsWith('/')
        ? this.moveDestinationPath.trim() + this.itemToMove.name
        : this.moveDestinationPath.trim();

      const query = `
        mutation MoveStorageObject($input: MoveStorageObjectInput!) {
          MoveStorageObject(input: $input)
        }
      `;

      const variables = {
        input: {
          AccountID: this.account.account.ID,
          OldName: sourcePath,
          NewName: destPath
        }
      };

      const result = await gqlProvider.ExecuteGQL(query, variables);
      const success = result.MoveStorageObject as boolean;

      if (success) {
        const wasFolder = this.itemToMove.type === 'folder';

        // Close dialog
        this.showMoveDialog = false;
        this.itemToMove = null;
        this.moveDestinationPath = '';

        // Clear selection
        this.selectedItems = [];

        // If we moved a folder, notify parent that folder structure changed
        if (wasFolder) {
          this.folderStructureChanged.emit();
        }

        // Refresh the file grid
        this.loadItems();
      } else {
        this.errorMessage = 'Failed to move item';
      }
    } catch (error) {
      console.error('[FileGrid] Error moving item:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.errorMessage = `Failed to move: ${errorMessage}`;

      setTimeout(() => {
        if (this.errorMessage?.startsWith('Failed to move')) {
          this.errorMessage = null;
        }
      }, 5000);
    } finally {
      this.isMoving = false;
    }
  }

  /**
   * Constructs the full path for an item
   */
  private constructItemPath(item: FileGridItem): string {
    // Validate that we have either key or name
    if (!item.key && !item.name) {
      console.error('[FileGrid] Cannot construct path - item has no key or name:', item);
      throw new Error('Cannot construct path for item without key or name');
    }

    // If item.key exists and is at root level, use it directly
    if (!this.folderPath || this.folderPath === '/') {
      return item.key || item.name;
    }

    // If the item key already includes the folder path, use it as is
    if (item.key && item.key.startsWith(this.folderPath)) {
      return item.key;
    }

    // Otherwise, combine folder path with item name
    const normalizedFolderPath = this.folderPath.endsWith('/')
      ? this.folderPath.slice(0, -1)
      : this.folderPath;

    // Make sure we have a name to use
    const itemName = item.name || item.key;
    if (!itemName) {
      console.error('[FileGrid] Cannot construct path - item has no usable name:', item);
      throw new Error('Cannot construct path for item without name');
    }

    return `${normalizedFolderPath}/${itemName}`;
  }

  /**
   * Gets the currently selected item (if exactly one is selected)
   */
  public getSelectedItem(): FileGridItem | null {
    if (this.selectedItems.length !== 1) {
      return null;
    }
    return this.items.find(item => item.key === this.selectedItems[0]) || null;
  }

  /**
   * Opens the copy to account dialog
   */
  public async onCopyToAccountClick(): Promise<void> {
    const item = this.getSelectedItem();
    if (!item || item.type === 'folder') {
      return;
    }

    // Load available accounts using RunViews
    try {
      const rv = new RunView();
      const [accountsResult, providersResult] = await rv.RunViews([
        {
          EntityName: 'MJ: File Storage Accounts',
          ExtraFilter: '',
          OrderBy: 'Name ASC',
          ResultType: 'entity_object'
        },
        {
          EntityName: 'File Storage Providers',
          ExtraFilter: 'IsActive = 1',
          OrderBy: 'Name ASC',
          ResultType: 'entity_object'
        }
      ]);

      if (!accountsResult.Success || !providersResult.Success) {
        console.error('[FileGrid] Error loading accounts:', accountsResult.ErrorMessage || providersResult.ErrorMessage);
        this.errorMessage = 'Failed to load storage accounts';
        return;
      }

      const accounts = accountsResult.Results as FileStorageAccountEntity[];
      const providers = providersResult.Results as FileStorageProviderEntity[];

      // Create provider map for lookup
      const providerMap = new Map<string, FileStorageProviderEntity>();
      providers.forEach(p => providerMap.set(p.ID, p));

      // Build available accounts (excluding current account)
      this.availableAccounts = accounts
        .filter(a => a.ID !== this.account?.account.ID)
        .map(account => {
          const provider = providerMap.get(account.ProviderID);
          if (!provider) return null;
          return { account, provider };
        })
        .filter((item): item is StorageAccountWithProvider => item !== null);

      if (this.availableAccounts.length === 0) {
        this.errorMessage = 'No other storage accounts available';
        setTimeout(() => {
          if (this.errorMessage?.includes('No other storage accounts')) {
            this.errorMessage = null;
          }
        }, 3000);
        return;
      }

      this.itemToCopyToProvider = item;
      this.copyToAccountDestinationPath = item.name; // Default to same filename
      this.selectedDestinationAccounts.clear();
      this.copyToAccountProgress = null;
      this.showCopyToProviderDialog = true;

    } catch (error) {
      console.error('[FileGrid] Error loading accounts:', error);
      this.errorMessage = 'Failed to load storage accounts';
    }
  }

  /**
   * Cancels the copy to account dialog
   */
  public onCancelCopyToAccount(): void {
    this.showCopyToProviderDialog = false;
    this.itemToCopyToProvider = null;
    this.selectedDestinationAccounts.clear();
    this.copyToAccountDestinationPath = '';
    this.copyToAccountProgress = null;
  }

  /**
   * Toggles selection of a destination account for copying
   */
  public toggleDestinationAccount(accountId: string): void {
    if (this.selectedDestinationAccounts.has(accountId)) {
      this.selectedDestinationAccounts.delete(accountId);
    } else {
      this.selectedDestinationAccounts.add(accountId);
    }
  }

  /**
   * Checks if an account is selected as a destination
   */
  public isDestinationAccountSelected(accountId: string): boolean {
    return this.selectedDestinationAccounts.has(accountId);
  }

  /**
   * Executes the cross-account copy to multiple selected accounts
   */
  public async onConfirmCopyToAccount(): Promise<void> {
    if (!this.itemToCopyToProvider || this.selectedDestinationAccounts.size === 0 || !this.account) {
      return;
    }

    this.isCopyingToAccount = true;

    // Get selected accounts
    const selectedAccounts = this.availableAccounts.filter(a =>
      this.selectedDestinationAccounts.has(a.account.ID)
    );

    const successfulCopies: string[] = [];
    const failedCopies: { account: string; error: string }[] = [];

    try {
      const gqlProvider = GraphQLDataProvider.Instance;

      // Construct source path and normalize it
      const rawSourcePath = this.constructItemPath(this.itemToCopyToProvider);
      const sourcePath = rawSourcePath.replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/');
      console.log('[FileGrid] Cross-account copy sourcePath:', { raw: rawSourcePath, normalized: sourcePath });

      const query = `
        mutation CopyObjectBetweenAccounts($input: CopyObjectBetweenAccountsInput!) {
          CopyObjectBetweenAccounts(input: $input) {
            success
            message
            bytesTransferred
            sourceAccount
            destinationAccount
            sourcePath
            destinationPath
          }
        }
      `;

      // Copy to each selected account
      for (let i = 0; i < selectedAccounts.length; i++) {
        const destAccount = selectedAccounts[i];
        this.copyToAccountProgress = {
          current: i + 1,
          total: selectedAccounts.length,
          currentAccount: destAccount.account.Name
        };

        try {
          const variables = {
            input: {
              SourceAccountID: this.account.account.ID,
              DestinationAccountID: destAccount.account.ID,
              SourcePath: sourcePath,
              DestinationPath: this.copyToAccountDestinationPath
            }
          };

          console.log('[FileGrid] Copying to account:', destAccount.account.Name, variables);

          const result = await gqlProvider.ExecuteGQL(query, variables);
          const copyResult = result.CopyObjectBetweenAccounts as {
            success: boolean;
            message: string;
            bytesTransferred?: number;
          };

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
        this.errorMessage = `Successfully copied to ${successfulCopies.length} account${successfulCopies.length > 1 ? 's' : ''}: ${successfulCopies.join(', ')}`;
      } else if (successfulCopies.length === 0) {
        this.errorMessage = `Copy failed for all accounts: ${failedCopies.map(f => `${f.account} (${f.error})`).join(', ')}`;
      } else {
        this.errorMessage = `Copied to ${successfulCopies.length} account(s). Failed: ${failedCopies.map(f => f.account).join(', ')}`;
      }

      setTimeout(() => {
        if (this.errorMessage?.includes('copied') || this.errorMessage?.includes('Copy failed')) {
          this.errorMessage = null;
        }
      }, 5000);

      // Close dialog
      this.showCopyToProviderDialog = false;
      this.itemToCopyToProvider = null;
      this.selectedDestinationAccounts.clear();
      this.copyToAccountDestinationPath = '';
      this.copyToAccountProgress = null;

    } catch (error) {
      console.error('[FileGrid] Error copying to accounts:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.errorMessage = `Copy failed: ${errorMessage}`;

      setTimeout(() => {
        if (this.errorMessage?.startsWith('Copy failed')) {
          this.errorMessage = null;
        }
      }, 5000);
    } finally {
      this.isCopyingToAccount = false;
      this.copyToAccountProgress = null;
    }
  }

  // ==========================================
  // Multi-Account Search Methods
  // ==========================================

  /**
   * Toggles multi-account search mode
   */
  public toggleMultiAccountSearchMode(): void {
    this.isMultiProviderSearchMode = !this.isMultiProviderSearchMode;

    if (this.isMultiProviderSearchMode) {
      // Load available accounts if not already loaded
      if (this.availableAccounts.length === 0) {
        this.loadAvailableAccountsForSearch();
      }
      // Pre-select current account if available
      if (this.account) {
        this.selectedSearchProviders.add(this.account.account.ID);
      }
    } else {
      // Clear search results when exiting search mode
      this.multiProviderSearchResults = null;
      this.multiProviderSearchQuery = '';
    }
  }

  /**
   * Loads available accounts for search selection
   */
  private async loadAvailableAccountsForSearch(): Promise<void> {
    try {
      const rv = new RunView();
      const [accountsResult, providersResult] = await rv.RunViews([
        {
          EntityName: 'MJ: File Storage Accounts',
          ExtraFilter: '',
          OrderBy: 'Name ASC',
          ResultType: 'entity_object'
        },
        {
          EntityName: 'File Storage Providers',
          ExtraFilter: 'IsActive = 1',
          OrderBy: 'Name ASC',
          ResultType: 'entity_object'
        }
      ]);

      if (accountsResult.Success && providersResult.Success) {
        const accounts = accountsResult.Results as FileStorageAccountEntity[];
        const providers = providersResult.Results as FileStorageProviderEntity[];

        const providerMap = new Map<string, FileStorageProviderEntity>();
        providers.forEach(p => providerMap.set(p.ID, p));

        this.availableAccounts = accounts
          .map(account => {
            const provider = providerMap.get(account.ProviderID);
            if (!provider) return null;
            return { account, provider };
          })
          .filter((item): item is StorageAccountWithProvider => item !== null);
      }
    } catch (error) {
      console.error('[FileGrid] Error loading accounts for search:', error);
    }
  }

  /**
   * Toggles account selection for search
   */
  public toggleSearchAccount(accountID: string): void {
    if (this.selectedSearchProviders.has(accountID)) {
      this.selectedSearchProviders.delete(accountID);
    } else {
      this.selectedSearchProviders.add(accountID);
    }
  }

  /**
   * Checks if an account is selected for search
   */
  public isAccountSelectedForSearch(accountID: string): boolean {
    return this.selectedSearchProviders.has(accountID);
  }

  /**
   * Checks if an account's provider supports search
   */
  public accountSupportsSearch(accountWithProvider: StorageAccountWithProvider): boolean {
    return accountWithProvider.provider.SupportsSearch === true;
  }

  /**
   * Executes multi-account search
   */
  public async executeMultiAccountSearch(): Promise<void> {
    if (!this.multiProviderSearchQuery.trim() || this.selectedSearchProviders.size === 0) {
      return;
    }

    this.isSearching = true;
    this.multiProviderSearchResults = null;

    try {
      const gqlProvider = GraphQLDataProvider.Instance;

      const query = `
        query SearchAcrossAccounts($input: SearchAcrossAccountsInput!) {
          SearchAcrossAccounts(input: $input) {
            accountResults {
              accountID
              accountName
              success
              errorMessage
              results {
                path
                name
                size
                contentType
                lastModified
                relevance
                excerpt
                matchInFilename
                objectId
              }
              totalMatches
              hasMore
              nextPageToken
            }
            totalResultsReturned
            successfulAccounts
            failedAccounts
          }
        }
      `;

      const variables = {
        input: {
          AccountIDs: Array.from(this.selectedSearchProviders),
          Query: this.multiProviderSearchQuery,
          MaxResultsPerAccount: 50
        }
      };

      console.log('[FileGrid] Executing multi-account search:', variables);

      const result = await gqlProvider.ExecuteGQL(query, variables);

      console.log('[FileGrid] Multi-account search result:', result);

      const data = result as {
        SearchAcrossAccounts: MultiProviderSearchResult;
      };

      this.multiProviderSearchResults = data.SearchAcrossAccounts;

    } catch (error) {
      console.error('[FileGrid] Error executing multi-provider search:', error);
      this.errorMessage = 'Search failed. Please try again.';
      setTimeout(() => {
        if (this.errorMessage === 'Search failed. Please try again.') {
          this.errorMessage = null;
        }
      }, 5000);
    } finally {
      this.isSearching = false;
    }
  }

  /**
   * Clears multi-provider search results
   */
  public clearMultiProviderSearch(): void {
    this.multiProviderSearchQuery = '';
    this.multiProviderSearchResults = null;
  }

  /**
   * Gets icon for a search result based on content type
   */
  public getSearchResultIcon(result: FileSearchResultItem): string {
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

  /**
   * Formats file size for search results
   */
  public formatSearchResultSize(bytes: number): string {
    return this.formatFileSize(bytes);
  }

  /**
   * Formats date for search results
   */
  public formatSearchResultDate(dateStr: string): string {
    return new Date(dateStr).toLocaleString();
  }
}