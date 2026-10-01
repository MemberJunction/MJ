import { Component, Input, Output, EventEmitter, OnInit, ChangeDetectorRef } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJConversationEntity, MJResourcePermissionEntity, MJUserEntity } from '@memberjunction/core-entities';
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
    @if (isOpen) {
      <mj-dialog
        [Title]="'Share: ' + (conversation.Name || '')"
        [Width]="500"
        [Height]="600"
        [Visible]="true"
        (Close)="onClose()">
        <div class="share-content">
          <div class="add-user-section">
            <h4>Add People</h4>
            <div class="add-user-form">
              <input
                type="text"
                [(ngModel)]="newUserEmail"
                placeholder="Enter email address"
                class="mj-textbox"
                style="flex: 1;">
              <button mjButton variant="primary" (click)="onAddUser()">
                Add
              </button>
            </div>
          </div>
          <div class="permissions-section">
            <h4>People with Access</h4>
            <div class="permission-list">
              @if (permissions.length === 0) {
                <mj-empty-state
                  Icon="fa-solid fa-user-group"
                  Title="No one has been given access yet"
                  Size="compact" />
              }
              @for (permission of permissions; track permission) {
                <div class="permission-item">
                  <div class="user-info">
                    <i class="fas fa-user-circle"></i>
                    <div class="user-details">
                      <div class="user-name">{{ permission.userName }}</div>
                      <div class="user-email">{{ permission.userEmail }}</div>
                    </div>
                  </div>
                  <div class="permission-controls">
                    <select
                      [ngModel]="permission.permissionLevel"
                      (ngModelChange)="onAccessLevelChange(permission, $event)"
                      style="width: 120px;" class="mj-select">
                      @for (level of accessLevels; track level.value) {
                        <option [value]="level.value">{{ level.label }}</option>
                      }
                    </select>
                    <button
                      class="btn-remove"
                      (click)="onRemoveUser(permission)"
                      title="Remove access">
                      <i class="fas fa-times"></i>
                    </button>
                  </div>
                </div>
              }
            </div>
          </div>
          <div class="link-section">
            <h4>Share Link</h4>
            <div class="link-controls">
              <input
                type="checkbox"
                [(ngModel)]="isPublicLink"
                (ngModelChange)="onTogglePublicLink()">
              <label>Anyone with the link can view</label>
            </div>
            @if (isPublicLink) {
              <div class="link-display">
                <input
                  type="text"
                  [value]="shareLink"
                  readonly
                  class="mj-textbox"
                  style="flex: 1;">
                <button mjButton variant="flat" (click)="onCopyLink()">
                  <i class="fas fa-copy"></i> Copy
                </button>
              </div>
            }
          </div>
        </div>
        <mj-dialog-actions>
          <button mjButton (click)="onClose()">Close</button>
        </mj-dialog-actions>
      </mj-dialog>
    }
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

    .link-controls { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
    .link-controls label { font-size: 13px; }

    .link-display { display: flex; gap: 8px; }
  `]
})
export class ShareModalComponent extends BaseAngularComponent implements OnInit  {
  @Input() Conversation!: MJConversationEntity;

  /** @deprecated Use {@link Conversation}. */
  @Input() set conversation(value: MJConversationEntity) {
    this.Conversation = value;
  }
  /** @deprecated Use {@link Conversation}. */
  get conversation(): MJConversationEntity {
    return this.Conversation;
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
  @Input() IsOpen: boolean = false;

  /** @deprecated Use {@link IsOpen}. */
  @Input() set isOpen(value: boolean) {
    this.IsOpen = value;
  }
  /** @deprecated Use {@link IsOpen}. */
  get isOpen(): boolean {
    return this.IsOpen;
  }

  @Output() Closed = new EventEmitter<void>();

  /**
   * @deprecated Use {@link Closed}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (closed) keeps working. Must stay AFTER Closed: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() closed = this.Closed;

  public Permissions: SharePermission[] = [];

  /** @deprecated Use {@link Permissions}. */
  public get permissions(): SharePermission[] {
    return this.Permissions;
  }
  /** @deprecated Use {@link Permissions}. */
  public set permissions(value: SharePermission[]) {
    this.Permissions = value;
  }
  public NewUserEmail: string = '';

  /** @deprecated Use {@link NewUserEmail}. */
  public get newUserEmail(): string {
    return this.NewUserEmail;
  }
  /** @deprecated Use {@link NewUserEmail}. */
  public set newUserEmail(value: string) {
    this.NewUserEmail = value;
  }
  public IsPublicLink: boolean = false;

  /** @deprecated Use {@link IsPublicLink}. */
  public get isPublicLink(): boolean {
    return this.IsPublicLink;
  }
  /** @deprecated Use {@link IsPublicLink}. */
  public set isPublicLink(value: boolean) {
    this.IsPublicLink = value;
  }
  public ShareLink: string = '';

  /** @deprecated Use {@link ShareLink}. */
  public get shareLink(): string {
    return this.ShareLink;
  }
  /** @deprecated Use {@link ShareLink}. */
  public set shareLink(value: string) {
    this.ShareLink = value;
  }

  public AccessLevels = [
    { label: 'Can View', value: 'View' },
    { label: 'Can Edit', value: 'Edit' },
    { label: 'Owner', value: 'Owner' }
  ];

  /** @deprecated Use {@link AccessLevels}. */
  public get accessLevels() {
    return this.AccessLevels;
  }
  /** @deprecated Use {@link AccessLevels}. */
  public set accessLevels(value) {
    this.AccessLevels = value;
  }

  private readonly CONVERSATIONS_RESOURCE_TYPE_ID = '81D4BC3D-9FEB-EF11-B01A-286B35C04427';

  constructor(
    private dialogService: DialogService,
    private toastService: ToastService,
    private cdr: ChangeDetectorRef
  ) {
  super();}

  ngOnInit() {
    if (this.Conversation) {
      this.loadPermissions();
      this.updateShareLink();
    }
  }

  private async loadPermissions(): Promise<void> {
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const result = await rv.RunView<MJResourcePermissionEntity>({
        EntityName: 'MJ: Resource Permissions',
        ExtraFilter: `ResourceTypeID='${this.CONVERSATIONS_RESOURCE_TYPE_ID}' AND ResourceRecordID='${this.Conversation.ID}' AND Status='Approved'`,
        ResultType: 'entity_object'
      });

      if (result.Success && result.Results) {
        const permissionPromises = result.Results.map(async (perm) => {
          if (perm.UserID) {
            const userRv = RunView.FromMetadataProvider(this.ProviderToUse);
            const userResult = await userRv.RunView<MJUserEntity>({
              EntityName: 'MJ: Users',
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
        this.Permissions = resolvedPermissions.filter(p => p !== null) as SharePermission[];
      }
    } catch (error) {
      console.error('Failed to load permissions:', error);
    } finally {
      this.cdr.detectChanges();
    }
  }

  GetAccessLevel(permission: SharePermission): string {
    return permission.permissionLevel;
  }

  /** @deprecated Use {@link GetAccessLevel}. */
  getAccessLevel(permission: SharePermission): string {
    return this.GetAccessLevel(permission);
  }

  async OnAccessLevelChange(permission: SharePermission, level: 'View' | 'Edit' | 'Owner'): Promise<void> {
    permission.permissionLevel = level;
    await this.savePermission(permission);
  }

  /** @deprecated Use {@link OnAccessLevelChange}. */
  async onAccessLevelChange(permission: SharePermission, level: 'View' | 'Edit' | 'Owner'): Promise<void> {
    return this.OnAccessLevelChange(permission, level);
  }

  async OnAddUser(): Promise<void> {
    const email = this.NewUserEmail.trim();
    if (!email) return;

    // Simple email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      await this.dialogService.alert('Invalid Email', 'Please enter a valid email address');
      return;
    }

    // Check if user already has access
    if (this.Permissions.some(p => p.userEmail === email)) {
      await this.dialogService.alert('User Already Has Access', 'This user already has access');
      return;
    }

    try {
      // Look up user by email
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const userResult = await rv.RunView<MJUserEntity>({
        EntityName: 'MJ: Users',
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
      this.Permissions.push(newPermission);
      this.NewUserEmail = '';
      this.toastService.success(`Access granted to ${user.Email}`);
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Failed to add user:', error);
      this.toastService.error('Failed to add user');
    }
  }

  /** @deprecated Use {@link OnAddUser}. */
  async onAddUser(): Promise<void> {
    return this.OnAddUser();
  }

  async OnRemoveUser(permission: SharePermission): Promise<void> {
    const confirmed = await this.dialogService.confirm({
      title: 'Remove Access',
      message: `Remove access for ${permission.userEmail}?`,
      okText: 'Remove',
      cancelText: 'Cancel'
    });

    if (!confirmed) return;

    try {
      if (permission.permissionId) {
        const md = this.ProviderToUse;
        const permEntity = await md.GetEntityObject<MJResourcePermissionEntity>('MJ: Resource Permissions');
        await permEntity.Load(permission.permissionId);

        const deleteResult = await permEntity.Delete();
        if (!deleteResult) {
          throw new Error('Failed to delete permission');
        }
      }

      this.Permissions = this.Permissions.filter(p => p.userId !== permission.userId);
      this.toastService.success(`Access removed for ${permission.userEmail}`);
    } catch (error) {
      console.error('Failed to remove user:', error);
      this.toastService.error('Failed to remove user');
    }
  }

  /** @deprecated Use {@link OnRemoveUser}. */
  async onRemoveUser(permission: SharePermission): Promise<void> {
    return this.OnRemoveUser(permission);
  }

  private async savePermission(permission: SharePermission): Promise<void> {
    try {
      const md = this.ProviderToUse;
      const permEntity = await md.GetEntityObject<MJResourcePermissionEntity>('MJ: Resource Permissions');

      if (permission.permissionId) {
        // Update existing permission
        await permEntity.Load(permission.permissionId);
        permEntity.PermissionLevel = permission.permissionLevel;
      } else {
        // Create new permission
        permEntity.ResourceTypeID = this.CONVERSATIONS_RESOURCE_TYPE_ID;
        permEntity.ResourceRecordID = this.Conversation.ID;
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

  async OnTogglePublicLink(): Promise<void> {
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

  /** @deprecated Use {@link OnTogglePublicLink}. */
  async onTogglePublicLink(): Promise<void> {
    return this.OnTogglePublicLink();
  }

  private updateShareLink(): void {
    if (this.IsPublicLink && this.Conversation) {
      // Generate shareable link
      const baseUrl = window.location.origin;
      this.ShareLink = `${baseUrl}/chat/${this.Conversation.ID}`;
    } else {
      this.ShareLink = '';
    }
  }

  async OnCopyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.ShareLink);
      this.toastService.success('Link copied to clipboard');
    } catch (err) {
      console.error('Failed to copy link:', err);
      this.toastService.error('Failed to copy link');
    }
  }

  /** @deprecated Use {@link OnCopyLink}. */
  async onCopyLink(): Promise<void> {
    return this.OnCopyLink();
  }

  OnClose(): void {
    this.Closed.emit();
  }

  /** @deprecated Use {@link OnClose}. */
  onClose(): void {
    return this.OnClose();
  }
}