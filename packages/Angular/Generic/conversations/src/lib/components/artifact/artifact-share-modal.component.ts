import { Component, Input, Output, EventEmitter, OnInit, ChangeDetectorRef } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

import { FormsModule } from '@angular/forms';
import { MJWindowComponent, MJButtonDirective, MJEmptyStateComponent, MJConfirmService } from '@memberjunction/ng-ui-components';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { RunView, UserInfo } from '@memberjunction/core';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import {
    CreateGuestShareLinkOperation,
    type CreateGuestShareLinkInput,
    type CreateGuestShareLinkOutput,
    type MJArtifactEntity,
    type MJArtifactGuestShareLinkEntityType,
    RevokeGuestShareLinkOperation,
    type RevokeGuestShareLinkInput,
} from '@memberjunction/core-entities';
import { ArtifactPermissionService, ArtifactPermission, ArtifactPermissionSet } from '../../services/artifact-permission.service';
import { UserPickerComponent, UserSearchResult } from '../shared/user-picker.component';

interface PermissionDisplay extends ArtifactPermission {
    isEditing: boolean;
    editingPermissions: ArtifactPermissionSet;
}

export interface GuestShareLinkRow {
    ID: string;
    ArtifactID: string;
    ArtifactVersionID?: string | null;
    Label?: string | null;
    ShareMode?: string | null;
    ExpiresAt?: string | Date | null;
    RevokedAt?: string | Date | null;
    __mj_CreatedAt?: string | Date | null;
    CreatedShareUrl?: string | null;
}

interface ListGuestLinksGraphQLItem {
    ID: string;
    ArtifactID: string;
    ArtifactVersionID?: string | null;
    Label?: string | null;
    ShareMode?: string | null;
    ExpiresAt?: string | null;
    RevokedAt?: string | null;
    CreatedAt?: string | null;
}

interface ListGuestLinksGraphQLResponse {
    ListArtifactGuestShareLinks?: {
        Success: boolean;
        ErrorMessage?: string | null;
        Links?: ListGuestLinksGraphQLItem[];
    };
}

interface ExecuteGQLProvider {
    ExecuteGQL?: (
        query: string,
        variables: { artifactId: string }
    ) => Promise<ListGuestLinksGraphQLResponse | null | undefined>;
}

const LIST_ARTIFACT_GUEST_SHARE_LINKS_GQL = `
  query ListArtifactGuestShareLinks($artifactId: String!) {
    ListArtifactGuestShareLinks(artifactId: $artifactId) {
      Success
      ErrorMessage
      Links {
        ID
        ArtifactID
        ArtifactVersionID
        Label
        ShareMode
        ExpiresAt
        RevokedAt
        CreatedAt
      }
    }
  }
`;

@Component({
    selector: 'mj-artifact-share-modal',
    standalone: true,
    imports: [FormsModule, MJWindowComponent, MJButtonDirective, MJEmptyStateComponent, UserPickerComponent],
    template: `
        @if (isOpen && artifact) {
            <mj-window
                [Title]="'Share: ' + artifact.Name"
                [Width]="600"
                [Height]="500"
                [MinWidth]="400"
                [MinHeight]="400"
                [Visible]="true"
                (Close)="onCancel()"
            >
                <div class="share-modal-content">
                    <!-- Add User Section -->
                    <div class="add-user-section">
                        <h3 class="section-title">
                            <i class="fa-solid fa-user-plus"></i>
                            Share with User
                        </h3>

                        <mj-user-picker
                            [currentUser]="currentUser"
                            [excludeUserIds]="getExcludedUserIds()"
                            (userSelected)="onUserSelected($event)"
                        ></mj-user-picker>

                        @if (selectedUser) {
                            <div class="permissions-form">
                                <div class="selected-user-info">
                                    <div class="user-avatar">
                                        <i class="fa-solid fa-user"></i>
                                    </div>
                                    <div class="user-details">
                                        <div class="user-name">{{ selectedUser.name }}</div>
                                        <div class="user-email">{{ selectedUser.email }}</div>
                                    </div>
                                </div>

                                <div class="permissions-grid">
                                    <label class="permission-checkbox disabled">
                                        <input type="checkbox" [checked]="true" disabled>
                                        <span class="permission-label">
                                            <i class="fa-solid fa-eye"></i>
                                            Read
                                        </span>
                                        <span class="permission-desc">View artifact content</span>
                                    </label>

                                    @if (availablePermissions.includes('Share')) {
                                        <label class="permission-checkbox">
                                            <input type="checkbox" [(ngModel)]="newPermissions.canShare">
                                            <span class="permission-label">
                                                <i class="fa-solid fa-share-nodes"></i>
                                                Share
                                            </span>
                                            <span class="permission-desc">Share with others</span>
                                        </label>
                                    }

                                    @if (availablePermissions.includes('Edit')) {
                                        <label class="permission-checkbox">
                                            <input type="checkbox" [(ngModel)]="newPermissions.canEdit">
                                            <span class="permission-label">
                                                <i class="fa-solid fa-pen-to-square"></i>
                                                Edit
                                            </span>
                                            <span class="permission-desc">Edit and delete artifact</span>
                                        </label>
                                    }
                                </div>

                                <div class="form-actions">
                                    <button mjButton variant="primary" (click)="onAddUser()" [disabled]="!selectedUser">
                                        <i class="fa-solid fa-plus"></i>
                                        Add User
                                    </button>
                                    <button mjButton (click)="onClearSelection()">
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        }
                    </div>

                    <!-- Current Permissions Section -->
                    <div class="permissions-list-section">
                        <h3 class="section-title">
                            <i class="fa-solid fa-users"></i>
                            Shared With ({{ permissions.length }})
                        </h3>

                        @if (permissions.length === 0) {
                            <mj-empty-state
                                Icon="fa-solid fa-user-slash"
                                Title="Not shared with anyone yet"
                                Size="compact" />
                        } @else {
                            <div class="permissions-list">
                                @for (permission of permissions; track permission.id) {
                                    <div class="permission-item">
                                        <div class="user-avatar">
                                            <i class="fa-solid fa-user"></i>
                                        </div>
                                        <div class="permission-details">
                                            <div class="permission-user">
                                                <span class="user-name">{{ permission.userName }}</span>
                                                @if (permission.sharedByUserName) {
                                                    <span class="shared-by">shared by {{ permission.sharedByUserName }}</span>
                                                }
                                            </div>

                                            @if (!permission.isEditing) {
                                                <div class="permission-badges">
                                                    <span class="permission-badge">
                                                        <i class="fa-solid fa-eye"></i> Read
                                                    </span>
                                                    @if (permission.canShare) {
                                                        <span class="permission-badge">
                                                            <i class="fa-solid fa-share-nodes"></i> Share
                                                        </span>
                                                    }
                                                    @if (permission.canEdit) {
                                                        <span class="permission-badge">
                                                            <i class="fa-solid fa-pen-to-square"></i> Edit
                                                        </span>
                                                    }
                                                </div>
                                            } @else {
                                                <div class="permissions-edit-grid">
                                                    <label class="permission-checkbox-small disabled">
                                                        <input type="checkbox" [checked]="true" disabled>
                                                        <span>Read</span>
                                                    </label>
                                                    @if (availablePermissions.includes('Share')) {
                                                        <label class="permission-checkbox-small">
                                                            <input type="checkbox" [(ngModel)]="permission.editingPermissions.canShare">
                                                            <span>Share</span>
                                                        </label>
                                                    }
                                                    @if (availablePermissions.includes('Edit')) {
                                                        <label class="permission-checkbox-small">
                                                            <input type="checkbox" [(ngModel)]="permission.editingPermissions.canEdit">
                                                            <span>Edit</span>
                                                        </label>
                                                    }
                                                </div>
                                            }
                                        </div>

                                        @if (canModifyPermissions) {
                                            <div class="permission-actions">
                                                @if (!permission.isEditing) {
                                                    <button mjButton variant="flat" size="sm" (click)="onEditPermission(permission)" title="Edit">
                                                        <i class="fa-solid fa-pen"></i>
                                                    </button>
                                                    <button mjButton variant="danger" size="sm" (click)="onRevokePermission(permission)" title="Remove">
                                                        <i class="fa-solid fa-xmark"></i>
                                                    </button>
                                                } @else {
                                                    <button mjButton variant="success" size="sm" (click)="onSavePermission(permission)" title="Save">
                                                        <i class="fa-solid fa-check"></i>
                                                    </button>
                                                    <button mjButton variant="flat" size="sm" (click)="onCancelEdit(permission)" title="Cancel">
                                                        <i class="fa-solid fa-xmark"></i>
                                                    </button>
                                                }
                                            </div>
                                        }
                                    </div>
                                }
                            </div>
                        }
                    </div>

                    @if (CanModifyPermissions) {
                        <!-- External Guest Share Links Section (NW-1) -->
                        <div class="guest-links-section">
                            <h3 class="section-title">
                                <i class="fa-solid fa-link"></i>
                                External Guest Share Links ({{ GuestLinks.length }})
                            </h3>
                            <p class="guest-links-hint">
                                Create a read-only frozen snapshot link for external guests without MemberJunction accounts.
                            </p>

                            <div class="guest-link-create-row">
                                <input
                                    type="text"
                                    class="guest-label-input"
                                    [(ngModel)]="GuestLinkLabel"
                                    placeholder="Optional label (e.g. Board Review)"
                                    maxlength="120"
                                    data-testid="guest-link-label-input"
                                />
                                <select
                                    class="guest-expiry-select"
                                    [(ngModel)]="GuestLinkExpiryHours"
                                    aria-label="Link expiration"
                                    data-testid="guest-link-expiry-select"
                                >
                                    <option [ngValue]="24">Expires in 24 hours</option>
                                    <option [ngValue]="72">Expires in 3 days</option>
                                    <option [ngValue]="168">Expires in 7 days</option>
                                    <option [ngValue]="720">Expires in 30 days</option>
                                </select>
                                <button
                                    mjButton
                                    variant="primary"
                                    size="sm"
                                    [disabled]="IsCreatingGuestLink"
                                    (click)="CreateGuestShareLink()"
                                    data-testid="create-guest-link-btn"
                                >
                                    @if (IsCreatingGuestLink) {
                                        <i class="fa-solid fa-spinner fa-spin"></i>
                                        Creating...
                                    } @else {
                                        <i class="fa-solid fa-plus"></i>
                                        Create Guest Link
                                    }
                                </button>
                            </div>

                            @if (NewlyCreatedGuestLinkUrl) {
                                <div class="guest-link-created-banner" data-testid="guest-link-created-banner">
                                    <div class="guest-link-created-text">
                                        <span class="guest-link-created-title">New guest link ready (copy now — token is shown once)</span>
                                        <code class="guest-link-url">{{ NewlyCreatedGuestLinkUrl }}</code>
                                    </div>
                                    <button
                                        mjButton
                                        variant="secondary"
                                        size="sm"
                                        (click)="CopyGuestShareUrl(NewlyCreatedGuestLinkUrl)"
                                        data-testid="copy-new-guest-link-btn"
                                    >
                                        <i class="fa-solid fa-copy"></i>
                                        Copy Link
                                    </button>
                                </div>
                            }

                            @if (GuestLinksError) {
                                <div class="guest-links-error" role="alert">{{ GuestLinksError }}</div>
                            }

                            @if (IsLoadingGuestLinks) {
                                <div class="guest-links-loading">
                                    <i class="fa-solid fa-spinner fa-spin"></i>
                                    Loading active guest links...
                                </div>
                            } @else if (GuestLinks.length === 0) {
                                <div class="guest-links-empty">No active external guest links.</div>
                            } @else {
                                <div class="guest-links-list" data-testid="guest-links-list">
                                    @for (link of GuestLinks; track link.ID) {
                                        <div class="guest-link-item" [attr.data-testid]="'guest-link-row-' + link.ID">
                                            <div class="guest-link-meta">
                                                <div class="guest-link-name-row">
                                                    <span class="guest-link-label">{{ link.Label || 'External guest link' }}</span>
                                                    <span class="permission-badge">
                                                        <i class="fa-solid fa-snowflake"></i>
                                                        {{ link.ShareMode || 'Frozen' }}
                                                    </span>
                                                </div>
                                                <div class="guest-link-sub">
                                                    @if (link.ExpiresAt) {
                                                        <span>Expires {{ FormatGuestTimestamp(link.ExpiresAt) }}</span>
                                                    } @else {
                                                        <span>No expiration</span>
                                                    }
                                                </div>
                                            </div>
                                            <div class="guest-link-actions">
                                                @if (link.CreatedShareUrl) {
                                                    <button
                                                        mjButton
                                                        variant="flat"
                                                        size="sm"
                                                        (click)="CopyGuestShareUrl(link.CreatedShareUrl)"
                                                        title="Copy guest share link"
                                                        [attr.data-testid]="'copy-guest-link-' + link.ID"
                                                    >
                                                        <i class="fa-solid fa-copy"></i>
                                                    </button>
                                                }
                                                <button
                                                    mjButton
                                                    variant="danger"
                                                    size="sm"
                                                    [disabled]="IsGuestLinkRevoking(link.ID)"
                                                    (click)="RevokeGuestShareLink(link)"
                                                    title="Revoke guest link"
                                                    [attr.data-testid]="'revoke-guest-link-' + link.ID"
                                                >
                                                    <i class="fa-solid fa-ban"></i>
                                                </button>
                                            </div>
                                        </div>
                                    }
                                </div>
                            }
                        </div>
                    }
                </div>

                <div class="modal-actions">
                    <button mjButton (click)="onCancel()">Close</button>
                </div>
            </mj-window>
        }
    `,
    styleUrls: ['./artifact-share-modal.component.css']
})
export class ArtifactShareModalComponent extends BaseAngularComponent implements OnInit {
    private _isOpen = false;
    private _artifact: MJArtifactEntity | null = null;
    private isInitialized = false;
    private readonly sessionCreatedUrls = new Map<string, string>();

    @Input()
    public set IsOpen(value: boolean) {
        const wasOpen = this._isOpen;
        this._isOpen = Boolean(value);
        if (this.isInitialized && this._isOpen && !wasOpen && this._artifact) {
            void this.reloadModalData();
        }
    }
    public get IsOpen(): boolean {
        return this._isOpen;
    }

    /** @deprecated Use {@link IsOpen}. */
    @Input() set isOpen(value: boolean) {
        this.IsOpen = value;
    }
    /** @deprecated Use {@link IsOpen}. */
    get isOpen(): boolean {
        return this.IsOpen;
    }

    @Input()
    public set Artifact(value: MJArtifactEntity | null) {
        const prevId = this._artifact?.ID ?? null;
        const nextId = value?.ID ?? null;
        this._artifact = value;
        if (prevId !== nextId) {
            this.NewlyCreatedGuestLinkUrl = null;
            this.GuestLinksError = null;
        }
        if (this.isInitialized && this._artifact && (this._isOpen || prevId !== nextId)) {
            void this.reloadModalData();
        }
    }
    public get Artifact(): MJArtifactEntity | null {
        return this._artifact;
    }

    /** @deprecated Use {@link Artifact}. */
    @Input() set artifact(value: MJArtifactEntity | null) {
        this.Artifact = value;
    }
    /** @deprecated Use {@link Artifact}. */
    get artifact(): MJArtifactEntity | null {
        return this.Artifact;
    }
    @Input() CurrentUser!: UserInfo;

    /** @deprecated Use {@link CurrentUser}. */
    @Input() set currentUser(value: UserInfo) {
        this.CurrentUser = value;
    }
    /** @deprecated Use {@link CurrentUser}. */
    get currentUser(): UserInfo {
        return this.CurrentUser;
    }

    @Output() Saved = new EventEmitter<void>();

    /**
     * @deprecated Use {@link Saved}.
     *
     * The same emitter under the old binding name, so a template still binding
     * (saved) keeps working. Must stay AFTER Saved: class fields
     * initialise in order, and the other way round this captures undefined.
     */
    @Output() saved = this.Saved;
    @Output() cancelled = new EventEmitter<void>();

    Permissions: PermissionDisplay[] = [];

    /** @deprecated Use {@link Permissions}. */
    get permissions(): PermissionDisplay[] {
        return this.Permissions;
    }
    /** @deprecated Use {@link Permissions}. */
    set permissions(value: PermissionDisplay[]) {
        this.Permissions = value;
    }
    SelectedUser: UserSearchResult | null = null;

    /** @deprecated Use {@link SelectedUser}. */
    get selectedUser(): UserSearchResult | null {
        return this.SelectedUser;
    }
    /** @deprecated Use {@link SelectedUser}. */
    set selectedUser(value: UserSearchResult | null) {
        this.SelectedUser = value;
    }
    AvailablePermissions: string[] = [];

    /** @deprecated Use {@link AvailablePermissions}. */
    get availablePermissions(): string[] {
        return this.AvailablePermissions;
    }
    /** @deprecated Use {@link AvailablePermissions}. */
    set availablePermissions(value: string[]) {
        this.AvailablePermissions = value;
    }
    CanModifyPermissions: boolean = false;

    /** @deprecated Use {@link CanModifyPermissions}. */
    get canModifyPermissions(): boolean {
        return this.CanModifyPermissions;
    }
    /** @deprecated Use {@link CanModifyPermissions}. */
    set canModifyPermissions(value: boolean) {
        this.CanModifyPermissions = value;
    }

    NewPermissions: ArtifactPermissionSet = {
        canRead: true,
        canShare: false,
        canEdit: false
    };

    /** @deprecated Use {@link NewPermissions}. */
    get newPermissions(): ArtifactPermissionSet {
        return this.NewPermissions;
    }
    /** @deprecated Use {@link NewPermissions}. */
    set newPermissions(value: ArtifactPermissionSet) {
        this.NewPermissions = value;
    }

    GuestLinkLabel = '';
    GuestLinkExpiryHours = 168;
    IsCreatingGuestLink = false;
    IsLoadingGuestLinks = false;
    GuestLinks: GuestShareLinkRow[] = [];
    NewlyCreatedGuestLinkUrl: string | null = null;
    GuestLinksError: string | null = null;
    RevokingGuestLinkId: string | null = null;

    constructor(
        private permissionService: ArtifactPermissionService,
        private cdr: ChangeDetectorRef,
        private confirmService: MJConfirmService
    ) {
        super();
    }

    async ngOnInit(): Promise<void> {
        this.isInitialized = true;
        if (this.Artifact) {
            await this.reloadModalData();
        }
    }

    private async reloadModalData(): Promise<void> {
        if (!this.Artifact) return;
        await this.loadPermissions();
        await this.updateAvailablePermissions();
        if (this.CanModifyPermissions) {
            await this.LoadGuestShareLinks();
        } else {
            this.GuestLinks = [];
            this.cdr.detectChanges();
        }
    }

    private async loadPermissions(): Promise<void> {
        if (!this.Artifact) return;

        const perms = await this.permissionService.loadPermissions(this.Artifact.ID, this.CurrentUser);
        this.Permissions = perms.map(p => ({
            ...p,
            isEditing: false,
            editingPermissions: {
                canRead: p.canRead,
                canShare: p.canShare,
                canEdit: p.canEdit
            }
        }));
        this.cdr.detectChanges();
    }

    private async updateAvailablePermissions(): Promise<void> {
        if (!this.Artifact) return;

        // Check if current user is owner
        const isOwner = await this.permissionService.isOwner(this.Artifact.ID, this.CurrentUser.ID, this.CurrentUser);

        // Check if user has share permission
        const hasSharePermission = await this.permissionService.checkPermission(
            this.Artifact.ID,
            this.CurrentUser.ID,
            'share',
            this.CurrentUser
        );

        // Allow modification if user is owner OR has Share permission
        this.CanModifyPermissions = isOwner || hasSharePermission;

        // Get user's current permissions
        const userPerms: ArtifactPermissionSet = {
            canRead: true,
            canShare: hasSharePermission,
            canEdit: await this.permissionService.checkPermission(
                this.Artifact.ID,
                this.CurrentUser.ID,
                'edit',
                this.CurrentUser
            )
        };

        this.AvailablePermissions = this.permissionService.getAvailablePermissions(userPerms, isOwner);

        console.log('Share modal permissions:', {
            artifactId: this.Artifact?.ID,
            userId: this.Artifact?.UserID,
            currentUserId: this.CurrentUser.ID,
            isOwner,
            availablePermissions: this.AvailablePermissions
        });

        this.cdr.detectChanges(); // zone.js 0.15: async permission checks don't trigger CD
    }

    GetExcludedUserIds(): string[] {
        const ids = this.Permissions.map(p => p.userId);
        ids.push(this.CurrentUser.ID); // Can't share with yourself
        if (this.Artifact?.UserID) {
            ids.push(this.Artifact.UserID); // Owner already has all permissions
        }
        return ids;
    }

    /** @deprecated Use {@link GetExcludedUserIds}. */
    getExcludedUserIds(): string[] {
        return this.GetExcludedUserIds();
    }

    OnUserSelected(user: UserSearchResult): void {
        this.SelectedUser = user;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link OnUserSelected}. */
    onUserSelected(user: UserSearchResult): void {
        return this.OnUserSelected(user);
    }

    OnClearSelection(): void {
        this.SelectedUser = null;
        this.NewPermissions = {
            canRead: true,
            canShare: false,
            canEdit: false
        };
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link OnClearSelection}. */
    onClearSelection(): void {
        return this.OnClearSelection();
    }

    async OnAddUser(): Promise<void> {
        if (!this.SelectedUser || !this.Artifact) return;

        try {
            // Check if user is owner
            const isOwner = await this.permissionService.isOwner(this.Artifact.ID, this.CurrentUser.ID, this.CurrentUser);

            // Get current user's permissions
            const userPerms: ArtifactPermissionSet = {
                canRead: true,
                canShare: await this.permissionService.checkPermission(
                    this.Artifact.ID,
                    this.CurrentUser.ID,
                    'share',
                    this.CurrentUser
                ),
                canEdit: await this.permissionService.checkPermission(
                    this.Artifact.ID,
                    this.CurrentUser.ID,
                    'edit',
                    this.CurrentUser
                )
            };

            // Validate permissions
            if (!this.permissionService.validatePermissions(this.NewPermissions, userPerms, isOwner)) {
                MJNotificationService.Instance.CreateSimpleNotification('You cannot grant permissions you do not have', 'warning', 4000);
                return;
            }

            // Grant permission
            await this.permissionService.grantPermission(
                this.Artifact.ID,
                this.SelectedUser.id,
                this.NewPermissions,
                this.CurrentUser.ID,
                this.CurrentUser
            );

            await this.loadPermissions();
            this.OnClearSelection();
            this.Saved.emit();
        } catch (error) {
            console.error('Error adding user:', error);
            MJNotificationService.Instance.CreateSimpleNotification('Failed to add user. Please try again.', 'error', 5000);
        }
    }

    /** @deprecated Use {@link OnAddUser}. */
    async onAddUser(): Promise<void> {
        return this.OnAddUser();
    }

    OnEditPermission(permission: PermissionDisplay): void {
        permission.isEditing = true;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link OnEditPermission}. */
    onEditPermission(permission: PermissionDisplay): void {
        return this.OnEditPermission(permission);
    }

    OnCancelEdit(permission: PermissionDisplay): void {
        permission.isEditing = false;
        permission.editingPermissions = {
            canRead: permission.canRead,
            canShare: permission.canShare,
            canEdit: permission.canEdit
        };
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link OnCancelEdit}. */
    onCancelEdit(permission: PermissionDisplay): void {
        return this.OnCancelEdit(permission);
    }

    async OnSavePermission(permission: PermissionDisplay): Promise<void> {
        if (!this.Artifact) return;

        try {
            // Check if user is owner
            const isOwner = await this.permissionService.isOwner(this.Artifact.ID, this.CurrentUser.ID, this.CurrentUser);

            // Get current user's permissions
            const userPerms: ArtifactPermissionSet = {
                canRead: true,
                canShare: await this.permissionService.checkPermission(
                    this.Artifact.ID,
                    this.CurrentUser.ID,
                    'share',
                    this.CurrentUser
                ),
                canEdit: await this.permissionService.checkPermission(
                    this.Artifact.ID,
                    this.CurrentUser.ID,
                    'edit',
                    this.CurrentUser
                )
            };

            // Validate permissions
            if (!this.permissionService.validatePermissions(permission.editingPermissions, userPerms, isOwner)) {
                MJNotificationService.Instance.CreateSimpleNotification('You cannot grant permissions you do not have', 'warning', 4000);
                return;
            }

            // Update permission
            await this.permissionService.updatePermission(
                permission.id,
                permission.editingPermissions,
                this.CurrentUser
            );

            await this.loadPermissions();
            this.Saved.emit();
        } catch (error) {
            console.error('Error updating permission:', error);
            MJNotificationService.Instance.CreateSimpleNotification('Failed to update permissions. Please try again.', 'error', 5000);
        }
    }

    /** @deprecated Use {@link OnSavePermission}. */
    async onSavePermission(permission: PermissionDisplay): Promise<void> {
        return this.OnSavePermission(permission);
    }

    async OnRevokePermission(permission: PermissionDisplay): Promise<void> {
        if (!(await this.confirmService.ConfirmDelete({ title: 'Remove Access', message: `Remove ${permission.userName}'s access to this artifact?`, confirmText: 'Remove' }))) {
            return;
        }

        try {
            await this.permissionService.revokePermission(permission.id, this.CurrentUser);
            await this.loadPermissions();
            this.Saved.emit();
        } catch (error) {
            console.error('Error revoking permission:', error);
            MJNotificationService.Instance.CreateSimpleNotification('Failed to revoke permission. Please try again.', 'error', 5000);
        }
    }

    /** @deprecated Use {@link OnRevokePermission}. */
    async onRevokePermission(permission: PermissionDisplay): Promise<void> {
        return this.OnRevokePermission(permission);
    }

    public async LoadGuestShareLinks(): Promise<void> {
        if (!this.Artifact || !this.CanModifyPermissions) {
            this.GuestLinks = [];
            return;
        }
        this.IsLoadingGuestLinks = true;
        this.GuestLinksError = null;
        this.cdr.detectChanges();

        try {
            const cache = this.sessionCreatedUrls;
            const fallbackArtifactId = this.Artifact.ID;
            const gqlProvider = this.ProviderToUse as ExecuteGQLProvider;
            if (typeof gqlProvider?.ExecuteGQL === 'function') {
                const gqlData = await gqlProvider.ExecuteGQL(LIST_ARTIFACT_GUEST_SHARE_LINKS_GQL, {
                    artifactId: fallbackArtifactId,
                });
                const payload = gqlData?.ListArtifactGuestShareLinks;
                if (!payload || !payload.Success) {
                    this.GuestLinksError = payload?.ErrorMessage || 'Failed to load guest share links.';
                    this.GuestLinks = [];
                    return;
                }
                this.GuestLinks = (payload.Links ?? [])
                    .filter((row) => typeof row.ID === 'string' && row.ID.length > 0)
                    .map((row) => ({
                        ID: row.ID,
                        ArtifactID: row.ArtifactID || fallbackArtifactId,
                        ArtifactVersionID: row.ArtifactVersionID ?? null,
                        Label: row.Label ?? null,
                        ShareMode: row.ShareMode ?? 'Frozen',
                        ExpiresAt: row.ExpiresAt ?? null,
                        RevokedAt: row.RevokedAt ?? null,
                        __mj_CreatedAt: row.CreatedAt ?? null,
                        CreatedShareUrl: cache.get(row.ID) ?? null,
                    }));
                return;
            }

            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const result = await rv.RunView<MJArtifactGuestShareLinkEntityType>(
                {
                    EntityName: 'MJ: Artifact Guest Share Links',
                    ExtraFilter: `ArtifactID='${EscapeSQLString(this.Artifact.ID)}' AND RevokedAt IS NULL`,
                    OrderBy: '__mj_CreatedAt DESC',
                    ResultType: 'simple',
                },
                this.CurrentUser
            );
            if (!result.Success) {
                this.GuestLinksError = result.ErrorMessage || 'Failed to load guest share links.';
                this.GuestLinks = [];
                return;
            }
            this.GuestLinks = (result.Results ?? [])
                .filter((row) => typeof row.ID === 'string' && row.ID.length > 0)
                .map((row) => {
                    const id = row.ID ?? '';
                    return {
                        ID: id,
                        ArtifactID: row.ArtifactID ?? fallbackArtifactId,
                        ArtifactVersionID: row.ArtifactVersionID ?? null,
                        Label: row.Label ?? null,
                        ShareMode: 'Frozen',
                        ExpiresAt: row.ExpiresAt ?? null,
                        RevokedAt: row.RevokedAt ?? null,
                        __mj_CreatedAt: row.__mj_CreatedAt ?? null,
                        CreatedShareUrl: cache.get(id) ?? null,
                    };
                });
        } catch (err) {
            this.GuestLinksError = err instanceof Error ? err.message : 'Failed to load guest share links.';
            this.GuestLinks = [];
        } finally {
            this.IsLoadingGuestLinks = false;
            this.cdr.detectChanges();
        }
    }

    public async CreateGuestShareLink(): Promise<void> {
        if (!this.Artifact || this.IsCreatingGuestLink) {
            return;
        }
        this.IsCreatingGuestLink = true;
        this.GuestLinksError = null;
        this.cdr.detectChanges();

        try {
            const input: CreateGuestShareLinkInput = {
                ArtifactID: this.Artifact.ID,
                ExpiresInHours: Number(this.GuestLinkExpiryHours) || 168,
                Label: this.GuestLinkLabel.trim() || undefined,
            };
            const op = new CreateGuestShareLinkOperation();
            const opResult = await op.Execute(input, { provider: this.ProviderToUse });
            if (!opResult.Success || !opResult.Output) {
                const msg = opResult.ErrorMessage || 'Failed to create guest share link.';
                this.GuestLinksError = msg;
                MJNotificationService.Instance.CreateSimpleNotification(msg, 'error', 5000);
                return;
            }

            const fullUrl = this.buildFullGuestShareUrl(opResult.Output.ShareUrlPath, opResult.Output.Token);
            this.sessionCreatedUrls.set(opResult.Output.LinkID, fullUrl);
            this.NewlyCreatedGuestLinkUrl = fullUrl;
            this.GuestLinkLabel = '';
            MJNotificationService.Instance.CreateSimpleNotification('External guest link created', 'success', 3000);
            await this.LoadGuestShareLinks();
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to create guest share link.';
            this.GuestLinksError = msg;
            MJNotificationService.Instance.CreateSimpleNotification(msg, 'error', 5000);
        } finally {
            this.IsCreatingGuestLink = false;
            this.cdr.detectChanges();
        }
    }

    public async CopyGuestShareUrl(url: string | null | undefined): Promise<boolean> {
        const trimmed = (url ?? '').trim();
        if (!trimmed) {
            return false;
        }
        try {
            if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
                throw new Error('Clipboard API unavailable');
            }
            await navigator.clipboard.writeText(trimmed);
            MJNotificationService.Instance.CreateSimpleNotification('Guest link copied to clipboard', 'success', 3000);
            return true;
        } catch (err) {
            console.error('Failed to copy guest link:', err);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Failed to copy link to clipboard. Please copy it manually.',
                'error',
                5000
            );
            return false;
        }
    }

    public async RevokeGuestShareLink(link: GuestShareLinkRow): Promise<void> {
        if (!this.Artifact || !link?.ID) {
            return;
        }
        const confirmed = await this.confirmService.ConfirmDelete({
            title: 'Revoke Guest Link',
            message: `Revoke "${link.Label || 'External guest link'}"? External guests using this link will lose access immediately.`,
            confirmText: 'Revoke',
        });
        if (!confirmed) {
            return;
        }

        this.RevokingGuestLinkId = link.ID;
        this.GuestLinksError = null;
        this.cdr.detectChanges();

        try {
            const input: RevokeGuestShareLinkInput = {
                ArtifactID: this.Artifact.ID,
                VersionID: link.ArtifactVersionID ?? '',
                LinkID: link.ID,
            };
            const op = new RevokeGuestShareLinkOperation();
            const opResult = await op.Execute(input, { provider: this.ProviderToUse });
            if (!opResult.Success) {
                const msg = opResult.ErrorMessage || 'Failed to revoke guest link.';
                this.GuestLinksError = msg;
                MJNotificationService.Instance.CreateSimpleNotification(msg, 'error', 5000);
                return;
            }

            this.sessionCreatedUrls.delete(link.ID);
            if (this.NewlyCreatedGuestLinkUrl && link.CreatedShareUrl === this.NewlyCreatedGuestLinkUrl) {
                this.NewlyCreatedGuestLinkUrl = null;
            }
            this.GuestLinks = this.GuestLinks.filter((item) => !UUIDsEqual(item.ID, link.ID));
            MJNotificationService.Instance.CreateSimpleNotification('Guest link revoked', 'success', 3000);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to revoke guest link.';
            this.GuestLinksError = msg;
            MJNotificationService.Instance.CreateSimpleNotification(msg, 'error', 5000);
        } finally {
            this.RevokingGuestLinkId = null;
            this.cdr.detectChanges();
        }
    }

    public IsGuestLinkRevoking(linkId: string): boolean {
        return Boolean(this.RevokingGuestLinkId && UUIDsEqual(this.RevokingGuestLinkId, linkId));
    }

    public FormatGuestTimestamp(value: string | Date | null | undefined): string {
        if (!value) {
            return '';
        }
        const parsed = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(parsed.getTime())) {
            return value instanceof Date ? '' : value;
        }
        return parsed.toLocaleString();
    }

    private buildFullGuestShareUrl(shareUrlPath: string, token: string): string {
        const normalizedPath = shareUrlPath?.trim() || `/guest/artifact/${encodeURIComponent(token)}`;
        if (/^https?:\/\//i.test(normalizedPath)) {
            return normalizedPath;
        }
        const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
        const prefixed = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
        return `${origin}${prefixed}`;
    }

    onCancel(): void {
        this.cancelled.emit();
    }
}
