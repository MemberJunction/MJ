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
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
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
export class ListShareDialogComponent extends BaseAngularComponent implements OnInit, OnDestroy  {
  /**
   * Configuration for the dialog
   */
  @Input() config!: ListShareDialogConfig;

  /**
   * Supporting message for the empty-state shown when a list has no shares.
   * Appends a usage hint when the current user can manage shares.
   */
  public get EmptyShareMessage(): string {
    const base = "This list hasn't been shared with anyone yet.";
    return this.CanModifyShares
      ? `${base} Use the search above to find users or roles to share with.`
      : base;
  }

  /**
   * Controls dialog visibility
   */
  @Input()
  get Visible(): boolean {
    return this._visible;
  }
  set Visible(value: boolean) {
    if (value && !this._visible) {
      this.initializeDialog();
    }
    this._visible = value;
  }

  /** @deprecated Use {@link Visible}. */
  get visible(): boolean {
    return this.Visible;
  }
  /** @deprecated Use {@link Visible}. */
  @Input() set visible(value: boolean) {
    this.Visible = value;
  }
  private _visible = false;

  /**
   * Emitted when dialog is closed with results
   */
  @Output() Complete = new EventEmitter<ListShareDialogResult>();

  /**
   * @deprecated Use {@link Complete}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (complete) keeps working. Must stay AFTER Complete: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() complete = this.Complete;

  /**
   * Emitted when dialog is cancelled
   */
  @Output() cancel = new EventEmitter<void>();

  /**
   * Emitted when the user clicks "Manage Invitations" in the footer.
   * Phase 2: opens the invitations management UI for this list.
   */
  @Output() ManageInvitations = new EventEmitter<void>();

  /**
   * @deprecated Use {@link ManageInvitations}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (manageInvitations) keeps working. Must stay AFTER ManageInvitations: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() manageInvitations = this.ManageInvitations;

  /**
   * Emitted when the user clicks "View audit log" in the footer.
   * Phase 2: opens the per-list audit log view.
   */
  @Output() ViewAuditLog = new EventEmitter<void>();

  /**
   * @deprecated Use {@link ViewAuditLog}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (viewAuditLog) keeps working. Must stay AFTER ViewAuditLog: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() viewAuditLog = this.ViewAuditLog;

  /**
   * When true (the default), newly-added shares fan out as notifications
   * to the recipient (email + in-app, depending on user preferences).
   * The state is captured on the dialog so consumers can read it back
   * via `ListShareDialogResult.notifyByEmail`.
   */
  public NotifyByEmail = true;

  /** @deprecated Use {@link NotifyByEmail}. */
  public get notifyByEmail() {
    return this.NotifyByEmail;
  }
  /** @deprecated Use {@link NotifyByEmail}. */
  public set notifyByEmail(value) {
    this.NotifyByEmail = value;
  }

  // State
  Loading = false;

  /** @deprecated Use {@link Loading}. */
  get loading() {
    return this.Loading;
  }
  /** @deprecated Use {@link Loading}. */
  set loading(value) {
    this.Loading = value;
  }
  saving = false;
  SearchText = '';

  /** @deprecated Use {@link SearchText}. */
  get searchText() {
    return this.SearchText;
  }
  /** @deprecated Use {@link SearchText}. */
  set searchText(value) {
    this.SearchText = value;
  }
  SearchType: 'User' | 'Role' = 'User';

  /** @deprecated Use {@link SearchType}. */
  get searchType(): 'User' | 'Role' {
    return this.SearchType;
  }
  /** @deprecated Use {@link SearchType}. */
  set searchType(value: 'User' | 'Role') {
    this.SearchType = value;
  }
  ShowSearchResults = false;

  /** @deprecated Use {@link ShowSearchResults}. */
  get showSearchResults() {
    return this.ShowSearchResults;
  }
  /** @deprecated Use {@link ShowSearchResults}. */
  set showSearchResults(value) {
    this.ShowSearchResults = value;
  }

  // Data
  CurrentShares: ListShareInfo[] = [];

  /** @deprecated Use {@link CurrentShares}. */
  get currentShares(): ListShareInfo[] {
    return this.CurrentShares;
  }
  /** @deprecated Use {@link CurrentShares}. */
  set currentShares(value: ListShareInfo[]) {
    this.CurrentShares = value;
  }
  SearchResults: ShareRecipient[] = [];

  /** @deprecated Use {@link SearchResults}. */
  get searchResults(): ShareRecipient[] {
    return this.SearchResults;
  }
  /** @deprecated Use {@link SearchResults}. */
  set searchResults(value: ShareRecipient[]) {
    this.SearchResults = value;
  }
  SelectedRecipient: ShareRecipient | null = null;

  /** @deprecated Use {@link SelectedRecipient}. */
  get selectedRecipient(): ShareRecipient | null {
    return this.SelectedRecipient;
  }
  /** @deprecated Use {@link SelectedRecipient}. */
  set selectedRecipient(value: ShareRecipient | null) {
    this.SelectedRecipient = value;
  }
  SelectedPermission: ListPermissionLevel = 'View';

  /** @deprecated Use {@link SelectedPermission}. */
  get selectedPermission(): ListPermissionLevel {
    return this.SelectedPermission;
  }
  /** @deprecated Use {@link SelectedPermission}. */
  set selectedPermission(value: ListPermissionLevel) {
    this.SelectedPermission = value;
  }

  // Track changes
  SharesAdded: ListShareInfo[] = [];

  /** @deprecated Use {@link SharesAdded}. */
  get sharesAdded(): ListShareInfo[] {
    return this.SharesAdded;
  }
  /** @deprecated Use {@link SharesAdded}. */
  set sharesAdded(value: ListShareInfo[]) {
    this.SharesAdded = value;
  }
  SharesUpdated: ListShareInfo[] = [];

  /** @deprecated Use {@link SharesUpdated}. */
  get sharesUpdated(): ListShareInfo[] {
    return this.SharesUpdated;
  }
  /** @deprecated Use {@link SharesUpdated}. */
  set sharesUpdated(value: ListShareInfo[]) {
    this.SharesUpdated = value;
  }
  SharesRemoved: string[] = [];

  /** @deprecated Use {@link SharesRemoved}. */
  get sharesRemoved(): string[] {
    return this.SharesRemoved;
  }
  /** @deprecated Use {@link SharesRemoved}. */
  set sharesRemoved(value: string[]) {
    this.SharesRemoved = value;
  }

  // Permission options
  PermissionOptions: { value: ListPermissionLevel; label: string; description: string }[] = [
    { value: 'View', label: 'Viewer', description: 'Can view list contents' },
    { value: 'Edit', label: 'Editor', description: 'Can add/remove items' },
    { value: 'Owner', label: 'Co-owner', description: 'Full control including sharing' }
  ];

  /** @deprecated Use {@link PermissionOptions}. */
  get permissionOptions(): { value: ListPermissionLevel; label: string; description: string }[] {
    return this.PermissionOptions;
  }
  /** @deprecated Use {@link PermissionOptions}. */
  set permissionOptions(value: { value: ListPermissionLevel; label: string; description: string }[]) {
    this.PermissionOptions = value;
  }

  // Cleanup
  private destroy$ = new Subject<void>();
  private searchSubject = new Subject<string>();

  constructor(
    private sharingService: ListSharingService,
    private cdr: ChangeDetectorRef
  ) {
  super();}

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
  get DialogTitle(): string {
    return `Share "${this.config?.listName || 'List'}"`;
  }

  /** @deprecated Use {@link DialogTitle}. */
  get dialogTitle(): string {
    return this.DialogTitle;
  }

  /**
   * Check if there are pending changes
   */
  get HasChanges(): boolean {
    return this.SharesAdded.length > 0 ||
           this.SharesUpdated.length > 0 ||
           this.SharesRemoved.length > 0;
  }

  /** @deprecated Use {@link HasChanges}. */
  get hasChanges(): boolean {
    return this.HasChanges;
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
        this.SearchResults = [];
        this.ShowSearchResults = false;
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
    this.SearchText = '';
    this.SearchType = 'User';
    this.ShowSearchResults = false;
    this.SearchResults = [];
    this.SelectedRecipient = null;
    this.SelectedPermission = 'View';
    this.SharesAdded = [];
    this.SharesUpdated = [];
    this.SharesRemoved = [];
  }

  /**
   * Load current shares for the list
   */
  private async loadCurrentShares(): Promise<void> {
    if (!this.config) return;

    this.Loading = true;
    this.cdr.detectChanges();

    try {
      this.CurrentShares = await this.sharingService.getListShares(this.config.listId);
    } catch (error) {
      console.error('Error loading shares:', error);
      this.CurrentShares = [];
    } finally {
      this.Loading = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Handle search input
   */
  OnSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.SearchText = value;
    this.searchSubject.next(value);
  }

  /** @deprecated Use {@link OnSearchInput}. */
  onSearchInput(event: Event): void {
    return this.OnSearchInput(event);
  }

  /**
   * Clear search
   */
  ClearSearch(): void {
    this.SearchText = '';
    this.SearchResults = [];
    this.ShowSearchResults = false;
    this.SelectedRecipient = null;
  }

  /** @deprecated Use {@link ClearSearch}. */
  clearSearch(): void {
    return this.ClearSearch();
  }

  /**
   * Switch search type
   */
  SetSearchType(type: 'User' | 'Role'): void {
    this.SearchType = type;
    if (this.SearchText.trim().length >= 2) {
      this.searchSubject.next(this.SearchText);
    }
  }

  /** @deprecated Use {@link SetSearchType}. */
  setSearchType(type: 'User' | 'Role'): void {
    return this.SetSearchType(type);
  }

  /**
   * Perform search
   */
  private async performSearch(searchText: string): Promise<void> {
    try {
      if (this.SearchType === 'User') {
        this.SearchResults = await this.sharingService.searchUsers(searchText);
      } else {
        this.SearchResults = await this.sharingService.searchRoles(searchText);
      }

      // Filter out recipients that already have access
      const existingIds = new Set(this.CurrentShares.map(s => s.recipientId));
      this.SearchResults = this.SearchResults.filter(r => !existingIds.has(r.id));

      // Also filter out the list owner
      this.SearchResults = this.SearchResults.filter(r => r.id !== this.config?.currentUserId);

      this.ShowSearchResults = this.SearchResults.length > 0;
    } catch (error) {
      console.error('Error searching:', error);
      this.SearchResults = [];
    }
  }

  /**
   * Select a recipient from search results
   */
  SelectRecipient(recipient: ShareRecipient): void {
    this.SelectedRecipient = recipient;
    this.SearchText = recipient.name;
    this.ShowSearchResults = false;
    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link SelectRecipient}. */
  selectRecipient(recipient: ShareRecipient): void {
    return this.SelectRecipient(recipient);
  }

  /**
   * Add the selected recipient as a share
   */
  async AddShare(): Promise<void> {
    if (!this.SelectedRecipient || !this.config) return;

    this.saving = true;

    try {
      const md = this.ProviderToUse;
      let result;

      if (this.SelectedRecipient.type === 'User') {
        result = await this.sharingService.shareListWithUser(
          this.config.listId,
          this.SelectedRecipient.id,
          this.SelectedPermission,
          this.config.currentUserId
        );
      } else {
        result = await this.sharingService.shareListWithRole(
          this.config.listId,
          this.SelectedRecipient.id,
          this.SelectedPermission,
          this.config.currentUserId
        );
      }

      if (result.success && result.shareId) {
        // Create a ListShareInfo for tracking
        const newShare: ListShareInfo = {
          shareId: result.shareId,
          listId: this.config.listId,
          type: this.SelectedRecipient.type,
          recipientId: this.SelectedRecipient.id,
          recipientName: this.SelectedRecipient.name,
          recipientEmail: this.SelectedRecipient.email,
          permissionLevel: this.SelectedPermission,
          status: 'Approved'
        };

        this.CurrentShares.push(newShare);
        this.SharesAdded.push(newShare);

        // Clear selection
        this.ClearSearch();
        this.SelectedPermission = 'View';
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

  /** @deprecated Use {@link AddShare}. */
  async addShare(): Promise<void> {
    return this.AddShare();
  }

  /**
   * Update permission level for an existing share
   */
  async UpdateSharePermission(share: ListShareInfo, newLevel: ListPermissionLevel): Promise<void> {
    if (share.permissionLevel === newLevel) return;

    this.saving = true;

    try {
      const result = await this.sharingService.updateSharePermission(share.shareId, newLevel);

      if (result.success) {
        share.permissionLevel = newLevel;

        // Track the update if not already tracked
        const existingUpdate = this.SharesUpdated.find(s => s.shareId === share.shareId);
        if (!existingUpdate) {
          this.SharesUpdated.push({ ...share });
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

  /** @deprecated Use {@link UpdateSharePermission}. */
  async updateSharePermission(share: ListShareInfo, newLevel: ListPermissionLevel): Promise<void> {
    return this.UpdateSharePermission(share, newLevel);
  }

  /**
   * Remove a share
   */
  async RemoveShare(share: ListShareInfo): Promise<void> {
    this.saving = true;

    try {
      const result = await this.sharingService.removeShare(share.shareId);

      if (result.success) {
        // Remove from current shares
        this.CurrentShares = this.CurrentShares.filter(s => s.shareId !== share.shareId);

        // Track the removal
        this.SharesRemoved.push(share.shareId);

        // Remove from added if it was just added in this session
        this.SharesAdded = this.SharesAdded.filter(s => s.shareId !== share.shareId);
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

  /** @deprecated Use {@link RemoveShare}. */
  async removeShare(share: ListShareInfo): Promise<void> {
    return this.RemoveShare(share);
  }

  /**
   * Get icon for share type
   */
  GetShareTypeIcon(type: 'User' | 'Role'): string {
    return type === 'User' ? 'fa-solid fa-user' : 'fa-solid fa-users';
  }

  /** @deprecated Use {@link GetShareTypeIcon}. */
  getShareTypeIcon(type: 'User' | 'Role'): string {
    return this.GetShareTypeIcon(type);
  }

  /**
   * Get permission label
   */
  GetPermissionLabel(level: ListPermissionLevel): string {
    const option = this.PermissionOptions.find(o => o.value === level);
    return option?.label || level;
  }

  /** @deprecated Use {@link GetPermissionLabel}. */
  getPermissionLabel(level: ListPermissionLevel): string {
    return this.GetPermissionLabel(level);
  }

  /**
   * Close dialog with results
   */
  OnDone(): void {
    const result: ListShareDialogResult = {
      action: 'apply',
      sharesAdded: this.SharesAdded,
      sharesUpdated: this.SharesUpdated,
      sharesRemoved: this.SharesRemoved,
      notifyByEmail: this.NotifyByEmail
    };

    this._visible = false;
    this.Complete.emit(result);
  }

  /** @deprecated Use {@link OnDone}. */
  onDone(): void {
    return this.OnDone();
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
  get CanModifyShares(): boolean {
    return this.config?.isOwner === true;
  }

  /** @deprecated Use {@link CanModifyShares}. */
  get canModifyShares(): boolean {
    return this.CanModifyShares;
  }
}
