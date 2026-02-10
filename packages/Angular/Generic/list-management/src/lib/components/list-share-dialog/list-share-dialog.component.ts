import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  ChangeDetectorRef
} from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { Metadata } from '@memberjunction/core';
import { ListSharingService } from '../../services/list-sharing.service';
import {
  ListShareDialogConfig,
  ListShareDialogResult,
  ListShareInfo,
  ListPermissionLevel,
  ShareRecipient
} from '../../models/list-sharing.models';

/**
 * Dialog component for managing list sharing.
 * Allows users to share lists with other users or roles with different permission levels.
 *
 * Features:
 * - User/role search with autocomplete
 * - Permission level selection (View, Edit, Owner)
 * - Current shares management
 * - Remove access functionality
 */
@Component({
  standalone: false,
  selector: 'mj-list-share-dialog',
  templateUrl: './list-share-dialog.component.html',
  styleUrls: ['./list-share-dialog.component.css']
})
export class ListShareDialogComponent implements OnInit, OnDestroy {
  /**
   * Configuration for the dialog
   */
  @Input() config!: ListShareDialogConfig;

  /**
   * Controls dialog visibility
   */
  @Input()
  get visible(): boolean {
    return this._visible;
  }
  set visible(value: boolean) {
    if (value && !this._visible) {
      this.initializeDialog();
    }
    this._visible = value;
  }
  private _visible = false;

  /**
   * Emitted when dialog is closed with results
   */
  @Output() complete = new EventEmitter<ListShareDialogResult>();

  /**
   * Emitted when dialog is cancelled
   */
  @Output() cancel = new EventEmitter<void>();

  // State
  loading = false;
  saving = false;
  searchText = '';
  searchType: 'User' | 'Role' = 'User';
  showSearchResults = false;

  // Data
  currentShares: ListShareInfo[] = [];
  searchResults: ShareRecipient[] = [];
  selectedRecipient: ShareRecipient | null = null;
  selectedPermission: ListPermissionLevel = 'View';

  // Track changes
  sharesAdded: ListShareInfo[] = [];
  sharesUpdated: ListShareInfo[] = [];
  sharesRemoved: string[] = [];

  // Permission options
  permissionOptions: { value: ListPermissionLevel; label: string; description: string }[] = [
    { value: 'View', label: 'Viewer', description: 'Can view list contents' },
    { value: 'Edit', label: 'Editor', description: 'Can add/remove items' },
    { value: 'Owner', label: 'Co-owner', description: 'Full control including sharing' }
  ];

  // Cleanup
  private destroy$ = new Subject<void>();
  private searchSubject = new Subject<string>();

  constructor(
    private sharingService: ListSharingService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.setupSearchDebounce();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Get dialog title
   */
  get dialogTitle(): string {
    return `Share "${this.config?.listName || 'List'}"`;
  }

  /**
   * Check if there are pending changes
   */
  get hasChanges(): boolean {
    return this.sharesAdded.length > 0 ||
           this.sharesUpdated.length > 0 ||
           this.sharesRemoved.length > 0;
  }

  /**
   * Setup search with debounce
   */
  private setupSearchDebounce(): void {
    this.searchSubject.pipe(
      debounceTime(300),
      takeUntil(this.destroy$)
    ).subscribe(async (searchText: string) => {
      if (searchText.trim().length >= 2) {
        await this.performSearch(searchText);
      } else {
        this.searchResults = [];
        this.showSearchResults = false;
      }
      this.cdr.detectChanges();
    });
  }

  /**
   * Initialize dialog when opened
   */
  private async initializeDialog(): Promise<void> {
    this.resetState();
    await this.loadCurrentShares();
  }

  /**
   * Reset all state
   */
  private resetState(): void {
    this.searchText = '';
    this.searchType = 'User';
    this.showSearchResults = false;
    this.searchResults = [];
    this.selectedRecipient = null;
    this.selectedPermission = 'View';
    this.sharesAdded = [];
    this.sharesUpdated = [];
    this.sharesRemoved = [];
  }

  /**
   * Load current shares for the list
   */
  private async loadCurrentShares(): Promise<void> {
    if (!this.config) return;

    this.loading = true;
    this.cdr.detectChanges();

    try {
      this.currentShares = await this.sharingService.getListShares(this.config.listId);
    } catch (error) {
      console.error('Error loading shares:', error);
      this.currentShares = [];
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Handle search input
   */
  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchText = value;
    this.searchSubject.next(value);
  }

  /**
   * Clear search
   */
  clearSearch(): void {
    this.searchText = '';
    this.searchResults = [];
    this.showSearchResults = false;
    this.selectedRecipient = null;
  }

  /**
   * Switch search type
   */
  setSearchType(type: 'User' | 'Role'): void {
    this.searchType = type;
    if (this.searchText.trim().length >= 2) {
      this.searchSubject.next(this.searchText);
    }
  }

  /**
   * Perform search
   */
  private async performSearch(searchText: string): Promise<void> {
    try {
      if (this.searchType === 'User') {
        this.searchResults = await this.sharingService.searchUsers(searchText);
      } else {
        this.searchResults = await this.sharingService.searchRoles(searchText);
      }

      // Filter out recipients that already have access
      const existingIds = new Set(this.currentShares.map(s => s.recipientId));
      this.searchResults = this.searchResults.filter(r => !existingIds.has(r.id));

      // Also filter out the list owner
      this.searchResults = this.searchResults.filter(r => r.id !== this.config?.currentUserId);

      this.showSearchResults = this.searchResults.length > 0;
    } catch (error) {
      console.error('Error searching:', error);
      this.searchResults = [];
    }
  }

  /**
   * Select a recipient from search results
   */
  selectRecipient(recipient: ShareRecipient): void {
    this.selectedRecipient = recipient;
    this.searchText = recipient.name;
    this.showSearchResults = false;
    this.cdr.detectChanges();
  }

  /**
   * Add the selected recipient as a share
   */
  async addShare(): Promise<void> {
    if (!this.selectedRecipient || !this.config) return;

    this.saving = true;

    try {
      const md = new Metadata();
      let result;

      if (this.selectedRecipient.type === 'User') {
        result = await this.sharingService.shareListWithUser(
          this.config.listId,
          this.selectedRecipient.id,
          this.selectedPermission,
          this.config.currentUserId
        );
      } else {
        result = await this.sharingService.shareListWithRole(
          this.config.listId,
          this.selectedRecipient.id,
          this.selectedPermission,
          this.config.currentUserId
        );
      }

      if (result.success && result.shareId) {
        // Create a ListShareInfo for tracking
        const newShare: ListShareInfo = {
          shareId: result.shareId,
          listId: this.config.listId,
          type: this.selectedRecipient.type,
          recipientId: this.selectedRecipient.id,
          recipientName: this.selectedRecipient.name,
          recipientEmail: this.selectedRecipient.email,
          permissionLevel: this.selectedPermission,
          status: 'Approved'
        };

        this.currentShares.push(newShare);
        this.sharesAdded.push(newShare);

        // Clear selection
        this.clearSearch();
        this.selectedPermission = 'View';
      } else {
        console.error('Failed to add share:', result.message);
      }
    } catch (error) {
      console.error('Error adding share:', error);
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Update permission level for an existing share
   */
  async updateSharePermission(share: ListShareInfo, newLevel: ListPermissionLevel): Promise<void> {
    if (share.permissionLevel === newLevel) return;

    this.saving = true;

    try {
      const result = await this.sharingService.updateSharePermission(share.shareId, newLevel);

      if (result.success) {
        share.permissionLevel = newLevel;

        // Track the update if not already tracked
        const existingUpdate = this.sharesUpdated.find(s => s.shareId === share.shareId);
        if (!existingUpdate) {
          this.sharesUpdated.push({ ...share });
        }
      } else {
        console.error('Failed to update permission:', result.message);
      }
    } catch (error) {
      console.error('Error updating permission:', error);
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Remove a share
   */
  async removeShare(share: ListShareInfo): Promise<void> {
    this.saving = true;

    try {
      const result = await this.sharingService.removeShare(share.shareId);

      if (result.success) {
        // Remove from current shares
        this.currentShares = this.currentShares.filter(s => s.shareId !== share.shareId);

        // Track the removal
        this.sharesRemoved.push(share.shareId);

        // Remove from added if it was just added in this session
        this.sharesAdded = this.sharesAdded.filter(s => s.shareId !== share.shareId);
      } else {
        console.error('Failed to remove share:', result.message);
      }
    } catch (error) {
      console.error('Error removing share:', error);
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Get icon for share type
   */
  getShareTypeIcon(type: 'User' | 'Role'): string {
    return type === 'User' ? 'fa-solid fa-user' : 'fa-solid fa-users';
  }

  /**
   * Get permission label
   */
  getPermissionLabel(level: ListPermissionLevel): string {
    const option = this.permissionOptions.find(o => o.value === level);
    return option?.label || level;
  }

  /**
   * Close dialog with results
   */
  onDone(): void {
    const result: ListShareDialogResult = {
      action: 'apply',
      sharesAdded: this.sharesAdded,
      sharesUpdated: this.sharesUpdated,
      sharesRemoved: this.sharesRemoved
    };

    this._visible = false;
    this.complete.emit(result);
  }

  /**
   * Cancel and close dialog
   */
  onCancel(): void {
    this._visible = false;
    this.cancel.emit();
  }

  /**
   * Check if current user can modify shares
   */
  get canModifyShares(): boolean {
    return this.config?.isOwner === true;
  }
}
