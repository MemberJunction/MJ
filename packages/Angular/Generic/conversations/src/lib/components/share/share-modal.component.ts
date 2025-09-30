import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { ConversationEntity } from '@memberjunction/core-entities';
import { UserInfo, RunView, Metadata } from '@memberjunction/core';

interface SharePermission {
  userEmail: string;
  userName: string;
  canView: boolean;
  canEdit: boolean;
  canShare: boolean;
}

@Component({
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
    { label: 'Can View', value: 'view' },
    { label: 'Can Edit', value: 'edit' },
    { label: 'Can Share', value: 'share' }
  ];

  ngOnInit() {
    if (this.conversation) {
      this.loadPermissions();
      this.updateShareLink();
    }
  }

  private async loadPermissions(): Promise<void> {
    // TODO: Load actual permissions from ConversationPermissions entity when available
    // For now, using mock data
    this.permissions = [];
  }

  getAccessLevel(permission: SharePermission): string {
    if (permission.canShare) return 'share';
    if (permission.canEdit) return 'edit';
    return 'view';
  }

  onAccessLevelChange(permission: SharePermission, level: string): void {
    permission.canView = true;
    permission.canEdit = level === 'edit' || level === 'share';
    permission.canShare = level === 'share';

    this.savePermission(permission);
  }

  async onAddUser(): Promise<void> {
    const email = this.newUserEmail.trim();
    if (!email) return;

    // Simple email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      alert('Please enter a valid email address');
      return;
    }

    // Check if user already has access
    if (this.permissions.some(p => p.userEmail === email)) {
      alert('This user already has access');
      return;
    }

    try {
      // TODO: Create ConversationPermission entity when available
      const newPermission: SharePermission = {
        userEmail: email,
        userName: email.split('@')[0],
        canView: true,
        canEdit: false,
        canShare: false
      };

      this.permissions.push(newPermission);
      this.newUserEmail = '';

      await this.savePermission(newPermission);
    } catch (error) {
      console.error('Failed to add user:', error);
      alert('Failed to add user');
    }
  }

  async onRemoveUser(permission: SharePermission): Promise<void> {
    if (!confirm(`Remove access for ${permission.userEmail}?`)) return;

    try {
      // TODO: Delete ConversationPermission entity when available
      this.permissions = this.permissions.filter(p => p.userEmail !== permission.userEmail);
    } catch (error) {
      console.error('Failed to remove user:', error);
      alert('Failed to remove user');
    }
  }

  private async savePermission(permission: SharePermission): Promise<void> {
    try {
      // TODO: Save to ConversationPermissions entity when available
      console.log('Saving permission:', permission);
    } catch (error) {
      console.error('Failed to save permission:', error);
      throw error;
    }
  }

  async onTogglePublicLink(): Promise<void> {
    try {
      // TODO: Update conversation PublicLink field when available
      this.updateShareLink();
    } catch (error) {
      console.error('Failed to toggle public link:', error);
      alert('Failed to update sharing settings');
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

  onCopyLink(): void {
    navigator.clipboard.writeText(this.shareLink).then(() => {
      alert('Link copied to clipboard');
    }).catch(err => {
      console.error('Failed to copy link:', err);
      alert('Failed to copy link');
    });
  }

  onClose(): void {
    this.closed.emit();
  }
}