import { Component, OnInit, ViewChild } from '@angular/core';
import { DialogRef } from '@progress/kendo-angular-dialog';
import { AIAgentPermissionEntity, UserEntity } from '@memberjunction/core-entities';
import { AIAgentEntityExtended } from "@memberjunction/ai-core-plus";
import { Metadata, RoleInfo, RunView } from '@memberjunction/core';
import { SharedService } from '@memberjunction/ng-shared';
import { GridDataResult, DataStateChangeEvent, GridComponent } from '@progress/kendo-angular-grid';
import { State, SortDescriptor, CompositeFilterDescriptor, process } from '@progress/kendo-data-query';

/**
 * Dialog component for managing AI Agent permissions.
 * Allows viewing, adding, editing, and removing permission records for an agent.
 */
@Component({
    selector: 'mj-agent-permissions-dialog',
    template: `
        <kendo-dialog
            [title]="dialogTitle"
            [width]="900"
            [height]="600"
            (close)="onCancel()">

            <div class="permissions-dialog-content">
                <!-- Header with agent info and add button -->
                <div class="dialog-header">
                    <div class="agent-info">
                        <h3>{{ agent.Name }}</h3>
                        <p class="agent-description" *ngIf="agent.Description">{{ agent.Description }}</p>
                        <div class="owner-info">
                            <i class="fas fa-crown"></i>
                            <span>Owner: {{ ownerName || 'Not Set' }}</span>
                        </div>
                    </div>
                    <button kendoButton
                            themeColor="primary"
                            [disabled]="isAddingPermission"
                            (click)="addPermission()">
                        <i class="fas fa-plus"></i> Add Permission
                    </button>
                </div>

                <!-- Add/Edit Permission Form -->
                <div class="permission-form" *ngIf="isAddingPermission || editingPermission">
                    <h4>{{ editingPermission ? 'Edit Permission' : 'Add New Permission' }}</h4>

                    <div class="form-row">
                        <div class="form-field">
                            <label>Grant To:</label>
                            <kendo-buttongroup [selection]="'single'">
                                <button kendoButton
                                        [toggleable]="true"
                                        [selected]="grantType === 'user'"
                                        (click)="grantType = 'user'; selectedRoleId = null; selectedUserId = null">
                                    <i class="fas fa-user"></i> User
                                </button>
                                <button kendoButton
                                        [toggleable]="true"
                                        [selected]="grantType === 'role'"
                                        (click)="grantType = 'role'; selectedRoleId = null; selectedUserId = null">
                                    <i class="fas fa-users"></i> Role
                                </button>
                            </kendo-buttongroup>
                        </div>

                        <div class="form-field" *ngIf="grantType === 'user'">
                            <label>User:</label>
                            <kendo-dropdownlist
                                [data]="users"
                                [textField]="'Name'"
                                [valueField]="'ID'"
                                [(value)]="selectedUserId"
                                [filterable]="true"
                                [loading]="loadingUsers"
                                placeholder="Select a user...">
                            </kendo-dropdownlist>
                        </div>

                        <div class="form-field" *ngIf="grantType === 'role'">
                            <label>Role:</label>
                            <kendo-dropdownlist
                                [data]="roles"
                                [textField]="'Name'"
                                [valueField]="'ID'"
                                [(value)]="selectedRoleId"
                                [filterable]="true"
                                [loading]="loadingRoles"
                                placeholder="Select a role...">
                            </kendo-dropdownlist>
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="permissions-checkboxes">
                            <label class="permission-checkbox">
                                <input type="checkbox"
                                       [(ngModel)]="newPermission.CanView"
                                       [disabled]="newPermission.CanRun || newPermission.CanEdit || newPermission.CanDelete">
                                <span>
                                    <i class="fas fa-eye"></i> View
                                    <small>See agent configuration</small>
                                </span>
                            </label>

                            <label class="permission-checkbox">
                                <input type="checkbox"
                                       [(ngModel)]="newPermission.CanRun"
                                       (change)="onPermissionChange('run')"
                                       [disabled]="newPermission.CanEdit || newPermission.CanDelete">
                                <span>
                                    <i class="fas fa-play"></i> Run
                                    <small>Execute the agent</small>
                                </span>
                            </label>

                            <label class="permission-checkbox">
                                <input type="checkbox"
                                       [(ngModel)]="newPermission.CanEdit"
                                       (change)="onPermissionChange('edit')"
                                       [disabled]="newPermission.CanDelete">
                                <span>
                                    <i class="fas fa-edit"></i> Edit
                                    <small>Modify configuration</small>
                                </span>
                            </label>

                            <label class="permission-checkbox">
                                <input type="checkbox"
                                       [(ngModel)]="newPermission.CanDelete"
                                       (change)="onPermissionChange('delete')">
                                <span>
                                    <i class="fas fa-trash"></i> Delete
                                    <small>Remove the agent</small>
                                </span>
                            </label>
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-field full-width">
                            <label>Comments (optional):</label>
                            <textarea kendoTextArea
                                      [(ngModel)]="newPermission.Comments"
                                      placeholder="Why is this permission being granted?"
                                      rows="2">
                            </textarea>
                        </div>
                    </div>

                    <div class="form-actions">
                        <button kendoButton (click)="cancelEdit()">Cancel</button>
                        <button kendoButton
                                themeColor="primary"
                                [disabled]="!canSavePermission()"
                                (click)="savePermission()">
                            {{ editingPermission ? 'Update' : 'Add' }}
                        </button>
                    </div>
                </div>

                <!-- Permissions Grid -->
                <kendo-grid
                    #grid
                    [data]="gridData"
                    [pageSize]="pageSize"
                    [skip]="skip"
                    [pageable]="true"
                    [sortable]="true"
                    [filterable]="false"
                    [loading]="loading"
                    (dataStateChange)="dataStateChange($event)"
                    [height]="400">

                    <kendo-grid-column field="GrantedTo" title="Granted To" [width]="200">
                        <ng-template kendoGridCellTemplate let-dataItem>
                            <div class="granted-to-cell">
                                <i class="fas" [class.fa-user]="dataItem.UserID" [class.fa-users]="dataItem.RoleID"></i>
                                <span>{{ dataItem.GrantedToName }}</span>
                            </div>
                        </ng-template>
                    </kendo-grid-column>

                    <kendo-grid-column field="Type" title="Type" [width]="80">
                        <ng-template kendoGridCellTemplate let-dataItem>
                            <span class="type-badge" [class.user]="dataItem.UserID" [class.role]="dataItem.RoleID">
                                {{ dataItem.UserID ? 'User' : 'Role' }}
                            </span>
                        </ng-template>
                    </kendo-grid-column>

                    <kendo-grid-column title="Permissions" [width]="300">
                        <ng-template kendoGridCellTemplate let-dataItem>
                            <div class="permission-badges">
                                <span class="permission-badge view" *ngIf="dataItem.EffectiveCanView">
                                    <i class="fas fa-eye"></i> View
                                </span>
                                <span class="permission-badge run" *ngIf="dataItem.EffectiveCanRun">
                                    <i class="fas fa-play"></i> Run
                                </span>
                                <span class="permission-badge edit" *ngIf="dataItem.EffectiveCanEdit">
                                    <i class="fas fa-edit"></i> Edit
                                </span>
                                <span class="permission-badge delete" *ngIf="dataItem.EffectiveCanDelete">
                                    <i class="fas fa-trash"></i> Delete
                                </span>
                            </div>
                        </ng-template>
                    </kendo-grid-column>

                    <kendo-grid-column field="Comments" title="Comments" [width]="150">
                        <ng-template kendoGridCellTemplate let-dataItem>
                            <span class="description-text">{{ dataItem.Comments || '-' }}</span>
                        </ng-template>
                    </kendo-grid-column>

                    <kendo-grid-column title="Actions" [width]="100">
                        <ng-template kendoGridCellTemplate let-dataItem>
                            <div class="grid-actions">
                                <button kendoButton
                                        fillMode="flat"
                                        size="small"
                                        title="Edit"
                                        (click)="editPermission(dataItem)">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button kendoButton
                                        fillMode="flat"
                                        themeColor="error"
                                        size="small"
                                        title="Delete"
                                        (click)="deletePermission(dataItem)">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </ng-template>
                    </kendo-grid-column>
                </kendo-grid>
            </div>

            <kendo-dialog-actions>
                <button kendoButton (click)="onCancel()">Close</button>
            </kendo-dialog-actions>
        </kendo-dialog>
    `,
    styles: [`
        .permissions-dialog-content {
            display: flex;
            flex-direction: column;
            gap: 20px;
            padding: 20px;
        }

        .dialog-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            padding-bottom: 15px;
            border-bottom: 1px solid #e0e0e0;
        }

        .agent-info h3 {
            margin: 0 0 8px 0;
            color: #333;
        }

        .agent-description {
            margin: 0 0 8px 0;
            color: #666;
            font-size: 13px;
        }

        .owner-info {
            display: flex;
            align-items: center;
            gap: 6px;
            color: #666;
            font-size: 12px;
        }

        .owner-info i {
            color: #fbbf24;
        }

        .permission-form {
            background: #f9fafb;
            padding: 16px;
            border-radius: 6px;
            border: 1px solid #e0e0e0;
        }

        .permission-form h4 {
            margin: 0 0 16px 0;
            color: #333;
        }

        .form-row {
            display: flex;
            gap: 16px;
            margin-bottom: 16px;
        }

        .form-field {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .form-field.full-width {
            flex: 1 1 100%;
        }

        .form-field label {
            font-weight: 500;
            font-size: 13px;
            color: #555;
        }

        .permissions-checkboxes {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
            width: 100%;
        }

        .permission-checkbox {
            display: flex;
            align-items: flex-start;
            gap: 8px;
            cursor: pointer;
            padding: 8px;
            border-radius: 4px;
            border: 1px solid #e0e0e0;
            background: white;
        }

        .permission-checkbox:hover {
            background: #f5f5f5;
        }

        .permission-checkbox input[type="checkbox"] {
            margin-top: 2px;
        }

        .permission-checkbox span {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }

        .permission-checkbox span i {
            margin-right: 4px;
        }

        .permission-checkbox small {
            color: #999;
            font-size: 11px;
        }

        .form-actions {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            margin-top: 8px;
        }

        .granted-to-cell {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .type-badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 500;
            text-transform: uppercase;
        }

        .type-badge.user {
            background: #dbeafe;
            color: #1e40af;
        }

        .type-badge.role {
            background: #f3e8ff;
            color: #6b21a8;
        }

        .permission-badges {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
        }

        .permission-badge {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 11px;
            font-weight: 500;
        }

        .permission-badge.view {
            background: #e0f2fe;
            color: #0369a1;
        }

        .permission-badge.run {
            background: #d1fae5;
            color: #065f46;
        }

        .permission-badge.edit {
            background: #fef3c7;
            color: #92400e;
        }

        .permission-badge.delete {
            background: #fee2e2;
            color: #991b1b;
        }

        .description-text {
            font-size: 12px;
            color: #666;
        }

        .grid-actions {
            display: flex;
            gap: 4px;
        }
    `]
})
export class AgentPermissionsDialogComponent implements OnInit {
    @ViewChild('grid') grid!: GridComponent;

    public agent!: AIAgentEntityExtended;
    public permissions: AIAgentPermissionEntity[] = [];
    public users: UserEntity[] = [];
    public roles: RoleInfo[] = [];

    public gridData: GridDataResult = { data: [], total: 0 };
    public pageSize = 10;
    public skip = 0;
    public loading = false;
    public loadingUsers = false;
    public loadingRoles = false;

    public isAddingPermission = false;
    public editingPermission: AIAgentPermissionEntity | null = null;
    public grantType: 'user' | 'role' = 'user';
    public selectedUserId: string | null = null;
    public selectedRoleId: string | null = null;
    public ownerName: string | null = null;

    public newPermission = {
        CanView: false,
        CanRun: false,
        CanEdit: false,
        CanDelete: false,
        Comments: ''
    };

    public get dialogTitle(): string {
        return `Manage Permissions: ${this.agent?.Name || 'Agent'}`;
    }

    constructor(
        public dialogRef: DialogRef,
        private sharedService: SharedService
    ) {}

    async ngOnInit() {
        await this.loadData();
    }

    private async loadData() {
        this.loading = true;
        try {
            await Promise.all([
                this.loadPermissions(),
                this.loadUsers(),
                this.loadRoles(),
                this.loadOwnerName()
            ]);
        } finally {
            this.loading = false;
        }
    }

    private async loadPermissions() {
        const rv = new RunView();
        const result = await rv.RunView<AIAgentPermissionEntity>({
            EntityName: 'MJ: AI Agent Permissions',
            ExtraFilter: `AgentID='${this.agent.ID}'`,
            ResultType: 'entity_object'
        });

        if (result.Success && result.Results) {
            this.permissions = result.Results;
            this.updateGridData();
        }
    }

    private async loadUsers() {
        this.loadingUsers = true;
        try {
            const rv = new RunView();
            const result = await rv.RunView<UserEntity>({
                EntityName: 'Users',
                ExtraFilter: 'IsActive=1',
                OrderBy: 'Name',
                ResultType: 'entity_object'
            });

            if (result.Success && result.Results) {
                this.users = result.Results;
            }
        } finally {
            this.loadingUsers = false;
        }
    }

    private async loadRoles() {
        this.loadingRoles = true;
        try {
            const md = new Metadata();

            this.roles = md.Roles;
        } finally {
            this.loadingRoles = false;
        }
    }

    private async loadOwnerName() {
        if (!this.agent.OwnerUserID) {
            this.ownerName = 'Not Set';
            return;
        }

        const user = this.users.find(u => u.ID === this.agent.OwnerUserID);
        if (user) {
            this.ownerName = user.Name;
        } else {
            // User might not be in the active users list, load separately
            const md = new Metadata();
            const userEntity = await md.GetEntityObject<UserEntity>('Users');
            const loaded = await userEntity.Load(this.agent.OwnerUserID);
            this.ownerName = loaded ? userEntity.Name : 'Unknown';
        }
    }

    private updateGridData() {
        // Enrich permissions with display data
        const enrichedData = this.permissions.map(p => {
            const grantedToName = p.UserID
                ? this.users.find(u => u.ID === p.UserID)?.Name || 'Unknown User'
                : this.roles.find(r => r.ID === p.RoleID)?.Name || 'Unknown Role';

            // Calculate effective permissions with hierarchy
            const effectiveCanDelete = p.CanDelete;
            const effectiveCanEdit = p.CanDelete || p.CanEdit;
            const effectiveCanRun = p.CanDelete || p.CanEdit || p.CanRun;
            const effectiveCanView = p.CanDelete || p.CanEdit || p.CanRun || p.CanView;

            return {
                ...p.GetAll(),
                GrantedToName: grantedToName,
                EffectiveCanView: effectiveCanView,
                EffectiveCanRun: effectiveCanRun,
                EffectiveCanEdit: effectiveCanEdit,
                EffectiveCanDelete: effectiveCanDelete
            };
        });

        this.gridData = {
            data: enrichedData.slice(this.skip, this.skip + this.pageSize),
            total: enrichedData.length
        };
    }

    public dataStateChange(state: DataStateChangeEvent) {
        this.skip = state.skip;
        this.pageSize = state.take;
        this.updateGridData();
    }

    public addPermission() {
        this.isAddingPermission = true;
        this.editingPermission = null;
        this.grantType = 'user';
        this.selectedUserId = null;
        this.selectedRoleId = null;
        this.newPermission = {
            CanView: false,
            CanRun: false,
            CanEdit: false,
            CanDelete: false,
            Comments: ''
        };
    }

    public editPermission(permission: any) {
        this.editingPermission = this.permissions.find(p => p.ID === permission.ID) || null;
        if (!this.editingPermission) return;

        this.isAddingPermission = true;
        this.grantType = this.editingPermission.UserID ? 'user' : 'role';
        this.selectedUserId = this.editingPermission.UserID || null;
        this.selectedRoleId = this.editingPermission.RoleID || null;
        this.newPermission = {
            CanView: this.editingPermission.CanView || false,
            CanRun: this.editingPermission.CanRun || false,
            CanEdit: this.editingPermission.CanEdit || false,
            CanDelete: this.editingPermission.CanDelete || false,
            Comments: this.editingPermission.Comments || ''
        };
    }

    public async deletePermission(permission: any) {
        if (!confirm('Are you sure you want to remove this permission?')) {
            return;
        }

        const entity = this.permissions.find(p => p.ID === permission.ID);
        if (!entity) return;

        const deleted = await entity.Delete();
        if (deleted) {
            await this.loadPermissions();
        }
    }

    public cancelEdit() {
        this.isAddingPermission = false;
        this.editingPermission = null;
    }

    public onPermissionChange(level: 'run' | 'edit' | 'delete') {
        // Apply hierarchical logic
        if (level === 'delete' && this.newPermission.CanDelete) {
            this.newPermission.CanEdit = true;
            this.newPermission.CanRun = true;
            this.newPermission.CanView = true;
        } else if (level === 'edit' && this.newPermission.CanEdit) {
            this.newPermission.CanRun = true;
            this.newPermission.CanView = true;
        } else if (level === 'run' && this.newPermission.CanRun) {
            this.newPermission.CanView = true;
        }
    }

    public canSavePermission(): boolean {
        // Must have selected user or role
        if (this.grantType === 'user' && !this.selectedUserId) return false;
        if (this.grantType === 'role' && !this.selectedRoleId) return false;

        // Must have at least one permission checked
        return this.newPermission.CanView || this.newPermission.CanRun ||
               this.newPermission.CanEdit || this.newPermission.CanDelete;
    }

    public async savePermission() {
        if (!this.canSavePermission()) return;

        try {
            const md = new Metadata();
            const entity = this.editingPermission ||
                await md.GetEntityObject<AIAgentPermissionEntity>('MJ: AI Agent Permissions');

            entity.AgentID = this.agent.ID;
            entity.UserID = this.grantType === 'user' ? this.selectedUserId : null;
            entity.RoleID = this.grantType === 'role' ? this.selectedRoleId : null;
            entity.CanView = this.newPermission.CanView;
            entity.CanRun = this.newPermission.CanRun;
            entity.CanEdit = this.newPermission.CanEdit;
            entity.CanDelete = this.newPermission.CanDelete;
            entity.Comments = this.newPermission.Comments || null;

            const saved = await entity.Save();
            if (saved) {
                this.isAddingPermission = false;
                this.editingPermission = null;
                await this.loadPermissions();
            } else {
                console.error('Failed to save permission');
                alert('Failed to save permission. Please try again.');
            }
        } catch (error) {
            console.error('Error saving permission:', error);
            alert('Error saving permission: ' + (error as Error).message);
        }
    }

    public onCancel() {
        this.dialogRef.close();
    }
}
