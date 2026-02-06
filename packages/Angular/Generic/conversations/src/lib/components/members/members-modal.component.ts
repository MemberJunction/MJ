import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ConversationEntity } from '@memberjunction/core-entities';
import { UserInfo, RunView, Metadata } from '@memberjunction/core';
import { DialogService } from '../../services/dialog.service';

interface ConversationMember {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  role: 'owner' | 'member';
  addedAt: Date;
}

@Component({
  standalone: false,
  selector: 'mj-members-modal',
  template: `
    @if (isVisible) {
      <kendo-dialog
        [title]="modalTitle"
        [width]="600"
        [height]="500"
        (close)="onCancel()">
        <div class="members-modal-content">
          <div class="add-member-section">
            <h4>Add Member</h4>
            <div class="add-member-form">
              <kendo-textbox
                [(value)]="newMemberEmail"
                placeholder="Enter email address"
                [style.flex]="1">
              </kendo-textbox>
              <kendo-dropdownlist
                [(ngModel)]="newMemberRole"
                [data]="roleOptions"
                [textField]="'label'"
                [valueField]="'value'"
                [style.width.px]="120">
              </kendo-dropdownlist>
              <button kendoButton [primary]="true" [disabled]="isLoading" (click)="onAddMember()">
                Add
              </button>
            </div>
          </div>
          <div class="members-section">
            <h4>Current Members ({{ members.length }})</h4>
            @if (!isLoading) {
              <div class="members-list">
                @if (members.length === 0) {
                  <div class="empty-state">
                    <p>No additional members yet</p>
                  </div>
                }
                @for (member of members; track member) {
                  <div class="member-item">
                    <div class="member-info">
                      <i class="fas fa-user-circle"></i>
                      <div class="member-details">
                        <div class="member-name">{{ member.userName }}</div>
                        <div class="member-email">{{ member.userEmail }}</div>
                      </div>
                    </div>
                    <div class="member-controls">
                      <span class="member-role" [class.owner]="member.role === 'owner'">
                        {{ member.role === 'owner' ? 'Owner' : 'Member' }}
                      </span>
                      @if (member.role !== 'owner') {
                        <button
                          class="btn-remove"
                          (click)="onRemoveMember(member)"
                          title="Remove member">
                          <i class="fas fa-times"></i>
                        </button>
                      }
                    </div>
                  </div>
                }
              </div>
            }
            @if (isLoading) {
              <div class="loading-indicator">
                <mj-loading text="Loading members..." size="medium"></mj-loading>
              </div>
            }
          </div>
          @if (errorMessage) {
            <div class="error-message">
              {{ errorMessage }}
            </div>
          }
        </div>
        <kendo-dialog-actions>
          <button kendoButton (click)="onCancel()">Close</button>
        </kendo-dialog-actions>
      </kendo-dialog>
    }
    `,
  styles: [`
    .members-modal-content {
      padding: 20px;
    }

    h4 {
      margin: 0 0 12px 0;
      font-size: 14px;
      font-weight: 600;
    }

    .add-member-section {
      margin-bottom: 24px;
    }

    .add-member-form {
      display: flex;
      gap: 8px;
    }

    .members-list {
      border: 1px solid #d9d9d9;
      border-radius: 4px;
      max-height: 300px;
      overflow-y: auto;
    }

    .member-item {
      padding: 12px;
      border-bottom: 1px solid #e8e8e8;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .member-item:last-child {
      border-bottom: none;
    }

    .member-info {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 1;
    }

    .member-info i {
      font-size: 32px;
      color: #999;
    }

    .member-details {
      display: flex;
      flex-direction: column;
    }

    .member-name {
      font-size: 14px;
      font-weight: 500;
    }

    .member-email {
      font-size: 12px;
      color: #666;
    }

    .member-controls {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .member-role {
      padding: 4px 8px;
      border-radius: 3px;
      font-size: 12px;
      font-weight: 500;
      background: #e3f2fd;
      color: #1976d2;
    }

    .member-role.owner {
      background: #fff3e0;
      color: #f57c00;
    }

    .btn-remove {
      padding: 6px 8px;
      background: transparent;
      border: none;
      cursor: pointer;
      border-radius: 3px;
      color: #999;
    }

    .btn-remove:hover {
      background: #ffebee;
      color: #d32f2f;
    }

    .empty-state {
      padding: 24px;
      text-align: center;
      color: #999;
    }

    .empty-state p {
      margin: 0;
      font-size: 13px;
    }

    .loading-indicator {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 24px;
      color: #666;
    }

    .error-message {
      display: block;
      color: #d32f2f;
      font-size: 13px;
      margin-top: 12px;
      padding: 8px 12px;
      background: #ffebee;
      border-radius: 4px;
    }

    kendo-dialog-actions {
      display: flex;
      justify-content: flex-end;
      padding: 15px 20px;
      border-top: 1px solid #e0e0e0;
    }
  `]
})
export class MembersModalComponent {
  @Input() isVisible = false;
  @Input() conversation?: ConversationEntity;
  @Input() currentUser!: UserInfo;
  @Output() cancelled = new EventEmitter<void>();
  @Output() membersChanged = new EventEmitter<void>();

  members: ConversationMember[] = [];
  newMemberEmail = '';
  newMemberRole: 'member' | 'owner' = 'member';
  isLoading = false;
  errorMessage = '';

  get modalTitle(): string {
    return `Manage Members: ${this.conversation?.Name || 'Conversation'}`;
  }

  roleOptions = [
    { value: 'member', label: 'Member' },
    { value: 'owner', label: 'Owner' }
  ];

  constructor(private dialogService: DialogService) {}

  ngOnChanges(): void {
    if (this.isVisible && this.conversation) {
      this.loadMembers();
    }
  }

  private async loadMembers(): Promise<void> {
    if (!this.conversation) return;

    this.isLoading = true;
    this.errorMessage = '';

    try {
      // TODO: Load from ConversationMembers entity when available
      // For now, show the owner
      this.members = [
        {
          id: 'owner-' + this.conversation.ID,
          userId: this.conversation.UserID || '',
          userName: 'Owner',
          userEmail: this.currentUser.Email,
          role: 'owner',
          addedAt: this.conversation.__mj_CreatedAt
        }
      ];
    } catch (error) {
      console.error('Error loading members:', error);
      this.errorMessage = 'Failed to load members';
    } finally {
      this.isLoading = false;
    }
  }

  async onAddMember(): Promise<void> {
    const email = this.newMemberEmail.trim();
    if (!email) return;

    // Simple email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      await this.dialogService.alert('Invalid Email', 'Please enter a valid email address');
      return;
    }

    // Check if already a member
    if (this.members.some(m => m.userEmail === email)) {
      await this.dialogService.alert('Already a Member', 'This user is already a member');
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    try {
      // TODO: Create ConversationMember entity when available
      const newMember: ConversationMember = {
        id: 'temp-' + Date.now(),
        userId: 'unknown',
        userName: email.split('@')[0],
        userEmail: email,
        role: this.newMemberRole,
        addedAt: new Date()
      };

      this.members.push(newMember);
      this.newMemberEmail = '';
      this.newMemberRole = 'member';
      this.membersChanged.emit();
    } catch (error) {
      console.error('Error adding member:', error);
      this.errorMessage = 'Failed to add member';
    } finally {
      this.isLoading = false;
    }
  }

  async onRemoveMember(member: ConversationMember): Promise<void> {
    const confirmed = await this.dialogService.confirm({
      title: 'Remove Member',
      message: `Remove ${member.userEmail} from this conversation?`,
      okText: 'Remove',
      cancelText: 'Cancel'
    });

    if (!confirmed) return;

    this.isLoading = true;
    this.errorMessage = '';

    try {
      // TODO: Delete ConversationMember entity when available
      this.members = this.members.filter(m => m.id !== member.id);
      this.membersChanged.emit();
    } catch (error) {
      console.error('Error removing member:', error);
      this.errorMessage = 'Failed to remove member';
    } finally {
      this.isLoading = false;
    }
  }

  onCancel(): void {
    this.cancelled.emit();
    this.resetForm();
  }

  private resetForm(): void {
    this.newMemberEmail = '';
    this.newMemberRole = 'member';
    this.errorMessage = '';
    this.isVisible = false;
  }
}
