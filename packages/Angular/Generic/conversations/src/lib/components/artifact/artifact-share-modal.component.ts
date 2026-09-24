import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, ChangeDetectorRef } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { MJWindowComponent, MJButtonDirective, MJEmptyStateComponent, MJConfirmService } from '@memberjunction/ng-ui-components';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { UserInfo } from '@memberjunction/core';
import { MJArtifactEntity } from '@memberjunction/core-entities';
import { ArtifactPermissionService, ArtifactPermission, ArtifactPermissionSet } from '../../services/artifact-permission.service';
import { UserPickerComponent, UserSearchResult } from '../shared/user-picker.component';

interface PermissionDisplay extends ArtifactPermission {
    isEditing: boolean;
    editingPermissions: ArtifactPermissionSet;
}

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
                </div>

                <div class="modal-actions">
                    <button mjButton (click)="onCancel()">Close</button>
                </div>
            </mj-window>
        }
    `,
    styleUrls: ['./artifact-share-modal.component.css']
})
export class ArtifactShareModalComponent implements OnInit, OnChanges {
    @Input() IsOpen: boolean = false;

    /** @deprecated Use {@link IsOpen}. */
    @Input() set isOpen(value: boolean) {
        this.IsOpen = value;
    }
    /** @deprecated Use {@link IsOpen}. */
    get isOpen(): boolean {
        return this.IsOpen;
    }
    @Input() Artifact: MJArtifactEntity | null = null;

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

    constructor(
        private permissionService: ArtifactPermissionService,
        private cdr: ChangeDetectorRef,
        private confirmService: MJConfirmService
    ) {}

    async ngOnInit(): Promise<void> {
        if (this.Artifact) {
            await this.loadPermissions();
            await this.updateAvailablePermissions();
        }
    }

    async ngOnChanges(changes: SimpleChanges): Promise<void> {
        // Reload permissions when modal opens or artifact changes
        const modalOpened = changes['isOpen']?.currentValue === true && changes['isOpen']?.previousValue === false;
        const artifactChanged = changes['artifact'] && !changes['artifact'].isFirstChange();

        if ((modalOpened || artifactChanged) && this.Artifact) {
            await this.loadPermissions();
            await this.updateAvailablePermissions();
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

    onCancel(): void {
        this.cancelled.emit();
    }
}
