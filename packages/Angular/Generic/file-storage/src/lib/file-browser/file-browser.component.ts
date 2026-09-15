import { Component, ViewChild } from '@angular/core';
import { FolderTreeComponent } from './folder-tree.component';
import { StorageAccountWithProvider } from '@memberjunction/core-entities';

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
 * Responsive layout is handled via CSS media queries.
 */
@Component({
  standalone: false,
  selector: 'mj-file-browser',
  templateUrl: './file-browser.component.html',
  styleUrls: ['./file-browser.component.css'],
})
export class FileBrowserComponent {
  /**
   * Reference to the folder tree component for programmatic navigation
   */
  @ViewChild(FolderTreeComponent) folderTree!: FolderTreeComponent;

  /**
   * Controls manual collapse of the sidebar (toggle button on mobile).
   * CSS media queries handle the responsive layout automatically.
   */
  public IsSidebarCollapsed: boolean = false;

  /** @deprecated Use {@link IsSidebarCollapsed}. */
  public get isSidebarCollapsed(): boolean {
    return this.IsSidebarCollapsed;
  }
  /** @deprecated Use {@link IsSidebarCollapsed}. */
  public set isSidebarCollapsed(value: boolean) {
    this.IsSidebarCollapsed = value;
  }

  /**
   * Currently selected storage account with its provider details.
   */
  public SelectedAccount: StorageAccountWithProvider | null = null;

  /** @deprecated Use {@link SelectedAccount}. */
  public get selectedAccount(): StorageAccountWithProvider | null {
    return this.SelectedAccount;
  }
  /** @deprecated Use {@link SelectedAccount}. */
  public set selectedAccount(value: StorageAccountWithProvider | null) {
    this.SelectedAccount = value;
  }

  /**
   * Currently selected folder path in the tree.
   */
  public SelectedFolderPath: string = '/';

  /** @deprecated Use {@link SelectedFolderPath}. */
  public get selectedFolderPath(): string {
    return this.SelectedFolderPath;
  }
  /** @deprecated Use {@link SelectedFolderPath}. */
  public set selectedFolderPath(value: string) {
    this.SelectedFolderPath = value;
  }

  constructor() {}

  /**
   * Toggles the visibility of the accounts sidebar.
   * Used for manual toggle on mobile devices.
   */
  public ToggleSidebar(): void {
    this.IsSidebarCollapsed = !this.IsSidebarCollapsed;
  }

  /** @deprecated Use {@link ToggleSidebar}. */
  public toggleSidebar(): void {
    return this.ToggleSidebar();
  }

  /**
   * Handles storage account selection from the sidebar.
   *
   * @param accountWithProvider - The selected storage account with provider details, or null if no accounts available
   */
  public OnAccountSelected(accountWithProvider: StorageAccountWithProvider | null): void {
    this.SelectedAccount = accountWithProvider;
    this.SelectedFolderPath = '/'; // Reset to root when switching accounts
  }

  /** @deprecated Use {@link OnAccountSelected}. */
  public onAccountSelected(accountWithProvider: StorageAccountWithProvider | null): void {
    return this.OnAccountSelected(accountWithProvider);
  }

  /**
   * Handles folder selection from the tree navigation.
   *
   * @param folderPath - The full path of the selected folder
   */
  public OnFolderSelected(folderPath: string): void {
    this.SelectedFolderPath = folderPath;
  }

  /** @deprecated Use {@link OnFolderSelected}. */
  public onFolderSelected(folderPath: string): void {
    return this.OnFolderSelected(folderPath);
  }

  /**
   * Handles folder navigation from the file grid (double-click on folder).
   * Updates the folder tree to navigate to the selected folder.
   *
   * @param folderPath - The full path of the folder to navigate to
   */
  public OnFolderNavigate(folderPath: string): void {
    if (this.folderTree) {
      this.folderTree.navigateToPath(folderPath);
    }
  }

  /** @deprecated Use {@link OnFolderNavigate}. */
  public onFolderNavigate(folderPath: string): void {
    return this.OnFolderNavigate(folderPath);
  }

  /**
   * Handles folder structure changes (e.g., new folder created, folder deleted).
   * Refreshes the folder tree to show the new structure.
   */
  public OnFolderStructureChanged(): void {
    if (this.folderTree) {
      // Trigger a refresh of the folder tree without changing navigation
      // This will reload the folders at the current location
      this.folderTree.refresh();
    }
  }

  /** @deprecated Use {@link OnFolderStructureChanged}. */
  public onFolderStructureChanged(): void {
    return this.OnFolderStructureChanged();
  }
}
