import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { ConversationEntity, ResourcePermissionEntity, UserEntity } from '@memberjunction/core-entities';
import { UserInfo, RunView, Metadata } from '@memberjunction/core';
import { DialogService } from '../../services/dialog.service';
import { ToastService } from '../../services/toast.service';

interface SharePermission {
  permissionId: string | null;
  userId: string;
  userEmail: string;
  userName: string;
  permissionLevel: 'View' | 'Edit' | 'Owner';
}

@Component({
  standalone: false,
  selector: 'mj-share-modal',
  template: `
    <kendo-dialog
      [title]="'Share: ' + (conversation.Name || '')"
      [width]="500"
      [height]="600"
      *ngIf="isOpen"
      (close)="onClose()">

      <div class="share-content">
        <div class="add-user-section">
          <h4>Add People</h4>
          <div class="add-user-form">
            <kendo-textbox
              [(value)]="newUserEmail"
              placeholder="Enter email address"
              [style.flex]="1">
            </kendo-textbox>
            <button kendoButton [primary]="true" (click)="onAddUser()">
              Add
            </button>
          </div>
        </div>

        <div class="permissions-section">
          <h4>People with Access</h4>

          <div class="permission-list">
            <div *ngIf="permissions.length === 0" class="empty-state">
              <p>No one has been given access yet</p>
            </div>

            <div *ngFor="let permission of permissions" class="permission-item">
              <div class="user-info">
                <i class="fas fa-user-circle"></i>
                <div class="user-details">
                  <div class="user-name">{{ permission.userName }}</div>
                  <div class="user-email">{{ permission.userEmail }}</div>
                </div>
              </div>

              <div class="permission-controls">
                <kendo-dropdownlist
                  [data]="accessLevels"
                  [textField]="'label'"
                  [valueField]="'value'"
                  [value]="getAccessLevel(permission)"
                  (valueChange)="onAccessLevelChange(permission, $event)"
                  [style.width.px]="120">
                </kendo-dropdownlist>

                <button
                  class="btn-remove"
                  (click)="onRemoveUser(permission)"
                  title="Remove access">
                  <i class="fas fa-times"></i>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="link-section">
          <h4>Share Link</h4>
          <div class="link-controls">
            <kendo-switch
              [(ngModel)]="isPublicLink"
              (valueChange)="onTogglePublicLink()">
            </kendo-switch>
            <label>Anyone with the link can view</label>
          </div>

          <div *ngIf="isPublicLink" class="link-display">
            <kendo-textbox
              [value]="shareLink"
              [readonly]="true"
              [style.flex]="1">
            </kendo-textbox>
            <button kendoButton (click)="onCopyLink()">
              <i class="fas fa-copy"></i> Copy
            </button>
          </div>
        </div>
      </div>

      <kendo-dialog-actions>
        <button kendoButton (click)="onClose()">Close</button>
      </kendo-dialog-actions>
    </kendo-dialog>
  `,
  styles: [`
    .share-content { display: flex; flex-direction: column; gap: 24px; }

    .add-user-section h4,
    .permissions-section h4,
    .link-section h4 { margin: 0 0 12px 0; font-size: 14px; font-weight: 600; }

    .add-user-form { display: flex; gap: 8px; }

    .permission-list { border: 1px solid #D9D9D9; border-radius: 4px; max-height: 300px; overflow-y: auto; }
    .permission-item { padding: 12px; border-bottom: 1px solid #E8E8E8; display: flex; justify-content: space-between; align-items: center; }
    .permission-item:last-child { border-bottom: none; }

    .user-info { display: flex; align-items: center; gap: 12px; flex: 1; }
    .user-info i { font-size: 32px; color: #999; }
    .user-details { display: flex; flex-direction: column; }
    .user-name { font-size: 14px; font-weight: 500; }
    .user-email { font-size: 12px; color: #666; }

    .permission-controls { display: flex; align-items: center; gap: 8px; }
    .btn-remove { padding: 6px 8px; background: transparent; border: none; cursor: pointer; border-radius: 3px; color: #999; }
    .btn-remove:hover { background: #FFEBEE; color: #D32F2F; }

    .empty-state { padding: 24px; text-align: center; color: #999; }
    .empty-state p { margin: 0; font-size: 13px; }

    .link-controls { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
    .link-controls label { font-size: 13px; }

    .link-display { display: flex; gap: 8px; }
  `]
})
export class ShareModalComponent implements OnInit {
  @Input() conversation!: ConversationEntity;
  @Input() currentUser!: UserInfo;
  @Input() isOpen: boolean = false;

  @Output() closed = new EventEmitter<void>();

  public permissions: SharePermission[] = [];
  public newUserEmail: string = '';
  public isPublicLink: boolean = false;
  public shareLink: string = '';

  public accessLevels = [
    { label: 'Can View', value: 'View' },
    { label: 'Can Edit', value: 'Edit' },
    { label: 'Owner', value: 'Owner' }
  ];

  private readonly CONVERSATIONS_RESOURCE_TYPE_ID = '81D4BC3D-9FEB-EF11-B01A-286B35C04427';

  constructor(
    private dialogService: DialogService,
    private toastService: ToastService
  ) {}

  ngOnInit() {
    if (this.conversation) {
      this.loadPermissions();
      this.updateShareLink();
    }
  }

  private async loadPermissions(): Promise<void> {
    try {
      const rv = new RunView();
      const result = await rv.RunView<ResourcePermissionEntity>({
        EntityName: 'Resource Permissions',
        ExtraFilter: `ResourceTypeID='${this.CONVERSATIONS_RESOURCE_TYPE_ID}' AND ResourceRecordID='${this.conversation.ID}' AND Status='Approved'`,
        ResultType: 'entity_object'
      });

      if (result.Success && result.Results) {
        const permissionPromises = result.Results.map(async (perm) => {
          if (perm.UserID) {
            const userRv = new RunView();
            const userResult = await userRv.RunView<UserEntity>({
              EntityName: 'Users',
              ExtraFilter: `ID='${perm.UserID}'`,
              ResultType: 'entity_object'
            });

            if (userResult.Success && userResult.Results && userResult.Results.length > 0) {
              const user = userResult.Results[0];
              return {
                permissionId: perm.ID,
                userId: perm.UserID,
                userEmail: user.Email,
                userName: user.Name,
                permissionLevel: perm.PermissionLevel || 'View'
              } as SharePermission;
            }
          }
          return null;
        });

        const resolvedPermissions = await Promise.all(permissionPromises);
        this.permissions = resolvedPermissions.filter(p => p !== null) as SharePermission[];
      }
    } catch (error) {
      console.error('Failed to load permissions:', error);
    }
  }

  getAccessLevel(permission: SharePermission): string {
    return permission.permissionLevel;
  }

  async onAccessLevelChange(permission: SharePermission, level: 'View' | 'Edit' | 'Owner'): Promise<void> {
    permission.permissionLevel = level;
    await this.savePermission(permission);
  }

  async onAddUser(): Promise<void> {
    const email = this.newUserEmail.trim();
    if (!email) return;

    // Simple email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      await this.dialogService.alert('Invalid Email', 'Please enter a valid email address');
      return;
    }

    // Check if user already has access
    if (this.permissions.some(p => p.userEmail === email)) {
      await this.dialogService.alert('User Already Has Access', 'This user already has access');
      return;
    }

    try {
      // Look up user by email
      const rv = new RunView();
      const userResult = await rv.RunView<UserEntity>({
        EntityName: 'Users',
        ExtraFilter: `Email='${email}'`,
        ResultType: 'entity_object'
      });

      if (!userResult.Success || !userResult.Results || userResult.Results.length === 0) {
        await this.dialogService.alert('User Not Found', 'No user found with that email address');
        return;
      }

      const user = userResult.Results[0];
      const newPermission: SharePermission = {
        permissionId: null,
        userId: user.ID,
        userEmail: user.Email,
        userName: user.Name,
        permissionLevel: 'View'
      };

      await this.savePermission(newPermission);
      this.permissions.push(newPermission);
      this.newUserEmail = '';
      this.toastService.success(`Access granted to ${user.Email}`);
    } catch (error) {
      console.error('Failed to add user:', error);
      this.toastService.error('Failed to add user');
    }
  }

  async onRemoveUser(permission: SharePermission): Promise<void> {
    const confirmed = await this.dialogService.confirm({
      title: 'Remove Access',
      message: `Remove access for ${permission.userEmail}?`,
      okText: 'Remove',
      cancelText: 'Cancel'
    });

    if (!confirmed) return;

    try {
      if (permission.permissionId) {
        const md = new Metadata();
        const permEntity = await md.GetEntityObject<ResourcePermissionEntity>('Resource Permissions');
        await permEntity.Load(permission.permissionId);

        const deleteResult = await permEntity.Delete();
        if (!deleteResult) {
          throw new Error('Failed to delete permission');
        }
      }

      this.permissions = this.permissions.filter(p => p.userId !== permission.userId);
      this.toastService.success(`Access removed for ${permission.userEmail}`);
    } catch (error) {
      console.error('Failed to remove user:', error);
      this.toastService.error('Failed to remove user');
    }
  }

  private async savePermission(permission: SharePermission): Promise<void> {
    try {
      const md = new Metadata();
      const permEntity = await md.GetEntityObject<ResourcePermissionEntity>('Resource Permissions');

      if (permission.permissionId) {
        // Update existing permission
        await permEntity.Load(permission.permissionId);
        permEntity.PermissionLevel = permission.permissionLevel;
      } else {
        // Create new permission
        permEntity.ResourceTypeID = this.CONVERSATIONS_RESOURCE_TYPE_ID;
        permEntity.ResourceRecordID = this.conversation.ID;
        permEntity.Type = 'User';
        permEntity.UserID = permission.userId;
        permEntity.PermissionLevel = permission.permissionLevel;
        permEntity.Status = 'Approved';
      }

      const saveResult = await permEntity.Save();
      if (!saveResult) {
        throw new Error('Failed to save permission');
      }

      // Update the permission ID if it was a new permission
      if (!permission.permissionId) {
        permission.permissionId = permEntity.ID;
      }
    } catch (error) {
      console.error('Failed to save permission:', error);
      throw error;
    }
  }

  async onTogglePublicLink(): Promise<void> {
    try {
      // Note: Public link functionality uses the conversation ID directly.
      // For enhanced security with unique tokens, password protection, and expiration,
      // future migration should add: PublicAccessToken, PublicAccessPassword, PublicAccessExpiresAt fields
      this.updateShareLink();
    } catch (error) {
      console.error('Failed to toggle public link:', error);
      await this.dialogService.alert('Error', 'Failed to update sharing settings');
    }
  }

  private updateShareLink(): void {
    if (this.isPublicLink && this.conversation) {
      // Generate shareable link
      const baseUrl = window.location.origin;
      this.shareLink = `${baseUrl}/chat/${this.conversation.ID}`;
    } else {
      this.shareLink = '';
    }
  }

  async onCopyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.shareLink);
      this.toastService.success('Link copied to clipboard');
    } catch (err) {
      console.error('Failed to copy link:', err);
      this.toastService.error('Failed to copy link');
    }
  }

  onClose(): void {
    this.closed.emit();
  }
}