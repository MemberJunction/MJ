import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, ChangeDetectorRef } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { WindowModule } from '@progress/kendo-angular-dialog';
import { ButtonModule } from '@progress/kendo-angular-buttons';
import { UserInfo } from '@memberjunction/core';
import { MJCollectionEntity } from '@memberjunction/core-entities';
import { CollectionPermissionService, CollectionPermission, PermissionSet } from '../../services/collection-permission.service';
import { UserPickerComponent, UserSearchResult } from '../shared/user-picker.component';

interface PermissionDisplay extends CollectionPermission {
    isEditing: boolean;
    editingPermissions: PermissionSet;
}

@Component({
    selector: 'mj-collection-share-modal',
    standalone: true,
    imports: [FormsModule, WindowModule, ButtonModule, UserPickerComponent],
    template: `
        @if (isOpen && collection) {
            <kendo-window
                [title]="'Share: ' + collection.Name"
                [width]="600"
                [height]="500"
                [minWidth]="400"
                [minHeight]="400"
                (close)="onCancel()"
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
                                        <span class="permission-desc">View collection and artifacts</span>
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
                                            <span class="permission-desc">Add/remove artifacts</span>
                                        </label>
                                    }

                                    @if (availablePermissions.includes('Delete')) {
                                        <label class="permission-checkbox">
                                            <input type="checkbox" [(ngModel)]="newPermissions.canDelete">
                                            <span class="permission-label">
                                                <i class="fa-solid fa-trash"></i>
                                                Delete
                                            </span>
                                            <span class="permission-desc">Delete collection</span>
                                        </label>
                                    }
                                </div>

                                <div class="form-actions">
                                    <button kendoButton (click)="onAddUser()" [disabled]="!selectedUser" class="btn-primary">
                                        <i class="fa-solid fa-plus"></i>
                                        Add User
                                    </button>
                                    <button kendoButton (click)="onClearSelection()" class="btn-secondary">
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
                            <div class="empty-state">
                                <i class="fa-solid fa-user-slash"></i>
                                <p>Not shared with anyone yet</p>
                            </div>
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
                                                    @if (permission.canDelete) {
                                                        <span class="permission-badge">
                                                            <i class="fa-solid fa-trash"></i> Delete
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
                                                    @if (availablePermissions.includes('Delete')) {
                                                        <label class="permission-checkbox-small">
                                                            <input type="checkbox" [(ngModel)]="permission.editingPermissions.canDelete">
                                                            <span>Delete</span>
                                                        </label>
                                                    }
                                                </div>
                                            }
                                        </div>

                                        @if (canModifyPermissions) {
                                            <div class="permission-actions">
                                                @if (!permission.isEditing) {
                                                    <button kendoButton class="btn-icon" (click)="onEditPermission(permission)" title="Edit">
                                                        <i class="fa-solid fa-pen"></i>
                                                    </button>
                                                    <button kendoButton class="btn-icon btn-danger" (click)="onRevokePermission(permission)" title="Remove">
                                                        <i class="fa-solid fa-xmark"></i>
                                                    </button>
                                                } @else {
                                                    <button kendoButton class="btn-icon btn-success" (click)="onSavePermission(permission)" title="Save">
                                                        <i class="fa-solid fa-check"></i>
                                                    </button>
                                                    <button kendoButton class="btn-icon" (click)="onCancelEdit(permission)" title="Cancel">
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
                    <button kendoButton (click)="onCancel()">Close</button>
                </div>
            </kendo-window>
        }
    `,
    styleUrls: ['./collection-share-modal.component.css']
})
export class CollectionShareModalComponent implements OnInit, OnChanges {
    @Input() isOpen: boolean = false;
    @Input() collection: MJCollectionEntity | null = null;
    @Input() currentUser!: UserInfo;
    @Input() currentUserPermissions: CollectionPermission | null = null;

    @Output() saved = new EventEmitter<void>();
    @Output() cancelled = new EventEmitter<void>();

    permissions: PermissionDisplay[] = [];
    selectedUser: UserSearchResult | null = null;
    availablePermissions: string[] = [];
    canModifyPermissions: boolean = false;

    newPermissions: PermissionSet = {
        canRead: true,
        canShare: false,
        canEdit: false,
        canDelete: false
    };

    constructor(
        private permissionService: CollectionPermissionService,
        private cdr: ChangeDetectorRef
    ) {}

    async ngOnInit(): Promise<void> {
        if (this.collection) {
            await this.loadPermissions();
            this.updateAvailablePermissions();
            this.cdr.detectChanges(); // zone.js 0.15: sync changes after async don't trigger CD
        }
    }

    async ngOnChanges(changes: SimpleChanges): Promise<void> {
        // Reload permissions when modal opens or collection/permissions change
        const modalOpened = changes['isOpen']?.currentValue === true && changes['isOpen']?.previousValue === false;
        const collectionChanged = changes['collection'] && !changes['collection'].isFirstChange();
        const permissionsChanged = changes['currentUserPermissions'] && !changes['currentUserPermissions'].isFirstChange();

        if ((modalOpened || collectionChanged || permissionsChanged) && this.collection) {
            await this.loadPermissions();
            this.updateAvailablePermissions();
            this.cdr.detectChanges(); // zone.js 0.15: sync changes after async don't trigger CD
        }
    }

    private async loadPermissions(): Promise<void> {
        if (!this.collection) return;

        const perms = await this.permissionService.loadPermissions(this.collection.ID, this.currentUser);
        this.permissions = perms.map(p => ({
            ...p,
            isEditing: false,
            editingPermissions: {
                canRead: p.canRead,
                canShare: p.canShare,
                canEdit: p.canEdit,
                canDelete: p.canDelete
            }
        }));
        this.cdr.detectChanges();
    }

    private updateAvailablePermissions(): void {
        // User is owner if:
        // 1. OwnerID is null/undefined (backwards compatibility with old collections)
        // 2. OwnerID matches current user ID
        const isOwner = !this.collection?.OwnerID || this.collection.OwnerID === this.currentUser.ID;

        // Allow modification if user is owner OR has Share permission
        this.canModifyPermissions = isOwner || (this.currentUserPermissions?.canShare || false);

        const userPerms = this.currentUserPermissions || {
            canRead: true,
            canShare: false,
            canEdit: false,
            canDelete: false
        };

        this.availablePermissions = this.permissionService.getAvailablePermissions(userPerms, isOwner);
        console.log('Share modal permissions:', {
            collectionId: this.collection?.ID,
            ownerId: this.collection?.OwnerID,
            currentUserId: this.currentUser.ID,
            isOwner,
            availablePermissions: this.availablePermissions
        });
    }

    getExcludedUserIds(): string[] {
        const ids = this.permissions.map(p => p.userId);
        ids.push(this.currentUser.ID); // Can't share with yourself
        if (this.collection?.OwnerID) {
            ids.push(this.collection.OwnerID); // Owner already has all permissions
        }
        return ids;
    }

    onUserSelected(user: UserSearchResult): void {
        this.selectedUser = user;
        this.cdr.detectChanges();
    }

    onClearSelection(): void {
        this.selectedUser = null;
        this.newPermissions = {
            canRead: true,
            canShare: false,
            canEdit: false,
            canDelete: false
        };
        this.cdr.detectChanges();
    }

    async onAddUser(): Promise<void> {
        if (!this.selectedUser || !this.collection) return;

        try {
            // User is owner if OwnerID is null (old collections) or matches current user
            const isOwner = !this.collection.OwnerID || this.collection.OwnerID === this.currentUser.ID;
            const userPerms = this.currentUserPermissions || {
                canRead: true,
                canShare: false,
                canEdit: false,
                canDelete: false
            };

            // Validate permissions
            if (!this.permissionService.validatePermissions(this.newPermissions, userPerms, isOwner)) {
                alert('You cannot grant permissions you do not have');
                return;
            }

            // Use cascade grant to apply permissions to all child collections
            await this.permissionService.grantPermissionCascade(
                this.collection.ID,
                this.selectedUser.id,
                this.newPermissions,
                this.currentUser.ID,
                this.currentUser
            );

            await this.loadPermissions();
            this.onClearSelection();
            this.saved.emit();
        } catch (error) {
            console.error('Error adding user:', error);
            alert('Failed to add user. Please try again.');
        }
    }

    onEditPermission(permission: PermissionDisplay): void {
        permission.isEditing = true;
        this.cdr.detectChanges();
    }

    onCancelEdit(permission: PermissionDisplay): void {
        permission.isEditing = false;
        permission.editingPermissions = {
            canRead: permission.canRead,
            canShare: permission.canShare,
            canEdit: permission.canEdit,
            canDelete: permission.canDelete
        };
        this.cdr.detectChanges();
    }

    async onSavePermission(permission: PermissionDisplay): Promise<void> {
        try {
            // User is owner if OwnerID is null (old collections) or matches current user
            const isOwner = !this.collection?.OwnerID || this.collection?.OwnerID === this.currentUser.ID;
            const userPerms = this.currentUserPermissions || {
                canRead: true,
                canShare: false,
                canEdit: false,
                canDelete: false
            };

            // Validate permissions
            if (!this.permissionService.validatePermissions(permission.editingPermissions, userPerms, isOwner)) {
                alert('You cannot grant permissions you do not have');
                return;
            }

            // Use cascade update to apply changes to all child collections
            await this.permissionService.updatePermissionCascade(
                this.collection!.ID,
                permission.userId,
                permission.editingPermissions,
                this.currentUser
            );

            await this.loadPermissions();
            this.saved.emit();
        } catch (error) {
            console.error('Error updating permission:', error);
            alert('Failed to update permissions. Please try again.');
        }
    }

    async onRevokePermission(permission: PermissionDisplay): Promise<void> {
        if (!confirm(`Remove ${permission.userName}'s access to this collection and all its child collections?`)) {
            return;
        }

        try {
            // Use cascade revoke to remove access from all child collections
            await this.permissionService.revokePermissionCascade(
                this.collection!.ID,
                permission.userId,
                this.currentUser
            );
            await this.loadPermissions();
            this.saved.emit();
        } catch (error) {
            console.error('Error revoking permission:', error);
            alert('Failed to revoke permission. Please try again.');
        }
    }

    onCancel(): void {
        this.cancelled.emit();
    }
}
