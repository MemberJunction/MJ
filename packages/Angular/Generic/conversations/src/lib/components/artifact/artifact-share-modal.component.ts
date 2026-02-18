import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, ChangeDetectorRef } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { WindowModule } from '@progress/kendo-angular-dialog';
import { ButtonModule } from '@progress/kendo-angular-buttons';
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
    imports: [FormsModule, WindowModule, ButtonModule, UserPickerComponent],
    template: `
        @if (isOpen && artifact) {
            <kendo-window
                [title]="'Share: ' + artifact.Name"
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
    styleUrls: ['./artifact-share-modal.component.css']
})
export class ArtifactShareModalComponent implements OnInit, OnChanges {
    @Input() isOpen: boolean = false;
    @Input() artifact: MJArtifactEntity | null = null;
    @Input() currentUser!: UserInfo;

    @Output() saved = new EventEmitter<void>();
    @Output() cancelled = new EventEmitter<void>();

    permissions: PermissionDisplay[] = [];
    selectedUser: UserSearchResult | null = null;
    availablePermissions: string[] = [];
    canModifyPermissions: boolean = false;

    newPermissions: ArtifactPermissionSet = {
        canRead: true,
        canShare: false,
        canEdit: false
    };

    constructor(
        private permissionService: ArtifactPermissionService,
        private cdr: ChangeDetectorRef
    ) {}

    async ngOnInit(): Promise<void> {
        if (this.artifact) {
            await this.loadPermissions();
            await this.updateAvailablePermissions();
        }
    }

    async ngOnChanges(changes: SimpleChanges): Promise<void> {
        // Reload permissions when modal opens or artifact changes
        const modalOpened = changes['isOpen']?.currentValue === true && changes['isOpen']?.previousValue === false;
        const artifactChanged = changes['artifact'] && !changes['artifact'].isFirstChange();

        if ((modalOpened || artifactChanged) && this.artifact) {
            await this.loadPermissions();
            await this.updateAvailablePermissions();
        }
    }

    private async loadPermissions(): Promise<void> {
        if (!this.artifact) return;

        const perms = await this.permissionService.loadPermissions(this.artifact.ID, this.currentUser);
        this.permissions = perms.map(p => ({
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
        if (!this.artifact) return;

        // Check if current user is owner
        const isOwner = await this.permissionService.isOwner(this.artifact.ID, this.currentUser.ID, this.currentUser);

        // Check if user has share permission
        const hasSharePermission = await this.permissionService.checkPermission(
            this.artifact.ID,
            this.currentUser.ID,
            'share',
            this.currentUser
        );

        // Allow modification if user is owner OR has Share permission
        this.canModifyPermissions = isOwner || hasSharePermission;

        // Get user's current permissions
        const userPerms: ArtifactPermissionSet = {
            canRead: true,
            canShare: hasSharePermission,
            canEdit: await this.permissionService.checkPermission(
                this.artifact.ID,
                this.currentUser.ID,
                'edit',
                this.currentUser
            )
        };

        this.availablePermissions = this.permissionService.getAvailablePermissions(userPerms, isOwner);

        console.log('Share modal permissions:', {
            artifactId: this.artifact?.ID,
            userId: this.artifact?.UserID,
            currentUserId: this.currentUser.ID,
            isOwner,
            availablePermissions: this.availablePermissions
        });
    }

    getExcludedUserIds(): string[] {
        const ids = this.permissions.map(p => p.userId);
        ids.push(this.currentUser.ID); // Can't share with yourself
        if (this.artifact?.UserID) {
            ids.push(this.artifact.UserID); // Owner already has all permissions
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
            canEdit: false
        };
        this.cdr.detectChanges();
    }

    async onAddUser(): Promise<void> {
        if (!this.selectedUser || !this.artifact) return;

        try {
            // Check if user is owner
            const isOwner = await this.permissionService.isOwner(this.artifact.ID, this.currentUser.ID, this.currentUser);

            // Get current user's permissions
            const userPerms: ArtifactPermissionSet = {
                canRead: true,
                canShare: await this.permissionService.checkPermission(
                    this.artifact.ID,
                    this.currentUser.ID,
                    'share',
                    this.currentUser
                ),
                canEdit: await this.permissionService.checkPermission(
                    this.artifact.ID,
                    this.currentUser.ID,
                    'edit',
                    this.currentUser
                )
            };

            // Validate permissions
            if (!this.permissionService.validatePermissions(this.newPermissions, userPerms, isOwner)) {
                alert('You cannot grant permissions you do not have');
                return;
            }

            // Grant permission
            await this.permissionService.grantPermission(
                this.artifact.ID,
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
            canEdit: permission.canEdit
        };
        this.cdr.detectChanges();
    }

    async onSavePermission(permission: PermissionDisplay): Promise<void> {
        if (!this.artifact) return;

        try {
            // Check if user is owner
            const isOwner = await this.permissionService.isOwner(this.artifact.ID, this.currentUser.ID, this.currentUser);

            // Get current user's permissions
            const userPerms: ArtifactPermissionSet = {
                canRead: true,
                canShare: await this.permissionService.checkPermission(
                    this.artifact.ID,
                    this.currentUser.ID,
                    'share',
                    this.currentUser
                ),
                canEdit: await this.permissionService.checkPermission(
                    this.artifact.ID,
                    this.currentUser.ID,
                    'edit',
                    this.currentUser
                )
            };

            // Validate permissions
            if (!this.permissionService.validatePermissions(permission.editingPermissions, userPerms, isOwner)) {
                alert('You cannot grant permissions you do not have');
                return;
            }

            // Update permission
            await this.permissionService.updatePermission(
                permission.id,
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
        if (!confirm(`Remove ${permission.userName}'s access to this artifact?`)) {
            return;
        }

        try {
            await this.permissionService.revokePermission(permission.id, this.currentUser);
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
