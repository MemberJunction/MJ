import { Component, OnInit, ViewChild } from '@angular/core';
import { FolderTreeComponent } from './folder-tree.component';
import { StorageAccountWithProvider } from './storage-providers-list.component';

/**
 * Mac Finder-style file browser component with three-panel layout.
 *
 * Layout:
 * - Left sidebar: Storage account selection
 * - Middle panel: Folder tree navigation
 * - Right panel: File grid with current folder contents
 *
 * In the enterprise model, users select from organizational storage accounts
 * rather than connecting their own OAuth credentials.
 *
 * Features responsive design with collapsible sidebar for mobile devices.
 */
@Component({
  selector: 'mj-file-browser',
  templateUrl: './file-browser.component.html',
  styleUrls: ['./file-browser.component.css'],
})
export class FileBrowserComponent implements OnInit {
  /**
   * Reference to the folder tree component for programmatic navigation
   */
  @ViewChild(FolderTreeComponent) folderTree!: FolderTreeComponent;

  /**
   * Controls visibility of the accounts sidebar on mobile devices.
   */
  public isSidebarVisible: boolean = true;

  /**
   * Currently selected storage account with its provider details.
   */
  public selectedAccount: StorageAccountWithProvider | null = null;

  /**
   * Currently selected folder path in the tree.
   */
  public selectedFolderPath: string = '/';

  constructor() {}

  ngOnInit(): void {
    this.initializeResponsiveLayout();
  }

  /**
   * Initializes responsive layout based on screen size.
   * Collapses sidebar on mobile devices by default.
   */
  private initializeResponsiveLayout(): void {
    const isMobile = window.innerWidth < 768;
    this.isSidebarVisible = !isMobile;
  }

  /**
   * Toggles the visibility of the accounts sidebar.
   * Used for mobile responsive design.
   */
  public toggleSidebar(): void {
    this.isSidebarVisible = !this.isSidebarVisible;
  }

  /**
   * Handles storage account selection from the sidebar.
   *
   * @param accountWithProvider - The selected storage account with provider details, or null if no accounts available
   */
  public onAccountSelected(accountWithProvider: StorageAccountWithProvider | null): void {
    this.selectedAccount = accountWithProvider;
    this.selectedFolderPath = '/'; // Reset to root when switching accounts
  }

  /**
   * Handles folder selection from the tree navigation.
   *
   * @param folderPath - The full path of the selected folder
   */
  public onFolderSelected(folderPath: string): void {
    this.selectedFolderPath = folderPath;
  }

  /**
   * Handles folder navigation from the file grid (double-click on folder).
   * Updates the folder tree to navigate to the selected folder.
   *
   * @param folderPath - The full path of the folder to navigate to
   */
  public onFolderNavigate(folderPath: string): void {
    if (this.folderTree) {
      this.folderTree.navigateToPath(folderPath);
    }
  }

  /**
   * Handles folder structure changes (e.g., new folder created, folder deleted).
   * Refreshes the folder tree to show the new structure.
   */
  public onFolderStructureChanged(): void {
    if (this.folderTree) {
      // Trigger a refresh of the folder tree without changing navigation
      // This will reload the folders at the current location
      this.folderTree.refresh();
    }
  }

  /**
   * Window resize handler for responsive layout adjustments.
   * Automatically shows/hides sidebar based on viewport width.
   */
  public onWindowResize(event: Event): void {
    const target = event.target as Window;
    const isMobile = target.innerWidth < 768;

    if (isMobile && this.isSidebarVisible) {
      this.isSidebarVisible = false;
    } else if (!isMobile && !this.isSidebarVisible) {
      this.isSidebarVisible = true;
    }
  }
}
