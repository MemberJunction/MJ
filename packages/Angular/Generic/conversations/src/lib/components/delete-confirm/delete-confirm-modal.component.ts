import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ConversationDetailEntity } from '@memberjunction/core-entities';

/**
 * Confirmation modal for deleting conversation messages.
 * Shows a preview of messages to be deleted and affected artifacts.
 * Uses custom CSS modal pattern (not Kendo) to match conversation UI.
 */
@Component({
  selector: 'mj-delete-confirm-modal',
  template: `
    @if (isVisible) {
      <div class="modal-overlay" (click)="onCancel()">
        <div class="modal-content delete-confirm-modal" (click)="$event.stopPropagation()">
          <!-- Header -->
          <div class="modal-header">
            <h3>
              <i class="fas fa-exclamation-triangle warning-icon"></i>
              {{ dialogTitle }}
            </h3>
            <button class="modal-close-btn" (click)="onCancel()" [disabled]="isDeleting">
              <i class="fas fa-times"></i>
            </button>
          </div>

          <!-- Body -->
          <div class="modal-body">
            <!-- Message count -->
            <p class="delete-summary">
              You are about to delete <strong>{{ messagesToDelete.length }}</strong>
              {{ messagesToDelete.length === 1 ? 'message' : 'messages' }}:
            </p>

            <!-- Message preview list -->
            <div class="message-preview-list">
              @for (message of messagesToDelete; track message.ID) {
                <div class="message-preview-item">
                  <i class="fa-solid" [ngClass]="getMessageIcon(message)"></i>
                  <span class="message-text">{{ truncateMessage(message.Message) }}</span>
                </div>
              }
            </div>

            <!-- Artifacts warning -->
            @if (artifactsAffected.length > 0) {
              <div class="artifacts-warning">
                <div class="warning-header">
                  <i class="fa-solid fa-exclamation-triangle"></i>
                  <span>This will also delete {{ artifactsAffected.length }} {{ artifactsAffected.length === 1 ? 'artifact' : 'artifacts' }}</span>
                </div>

                <label class="keep-artifacts-checkbox">
                  <input
                    type="checkbox"
                    [(ngModel)]="keepArtifacts"
                    [disabled]="isDeleting">
                  <span>Keep artifacts (unlink from conversation)</span>
                </label>
              </div>
            }

            <!-- Warning message -->
            <div class="warning-message">
              <i class="fa-solid fa-info-circle"></i>
              This action cannot be undone.
            </div>

            <!-- Loading indicator -->
            @if (isDeleting) {
              <div class="loading-indicator">
                <mj-loading text="Deleting messages..." size="small"></mj-loading>
              </div>
            }
          </div>

          <!-- Footer -->
          <div class="modal-footer">
            <button class="btn btn-secondary" [disabled]="isDeleting" (click)="onCancel()">
              Cancel
            </button>
            <button class="btn btn-danger"
                    [disabled]="isDeleting"
                    (click)="onConfirm()">
              <i class="fa-solid fa-trash"></i>
              Delete {{ messagesToDelete.length === 1 ? 'Message' : 'Messages' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    /* Modal overlay - matches conversation-chat-area pattern */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      animation: fadeIn 0.15s ease-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    /* Modal content container */
    .modal-content.delete-confirm-modal {
      background: white;
      border-radius: 8px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
      width: 500px;
      max-width: 90vw;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      animation: slideIn 0.2s ease-out;
    }

    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(-10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    /* Modal header */
    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid #E5E7EB;
    }

    .modal-header h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: #111827;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .modal-header .warning-icon {
      color: #F59E0B;
    }

    .modal-close-btn {
      background: none;
      border: none;
      padding: 8px;
      cursor: pointer;
      color: #6B7280;
      border-radius: 4px;
      transition: background 0.15s, color 0.15s;
    }

    .modal-close-btn:hover:not(:disabled) {
      background: #F3F4F6;
      color: #111827;
    }

    .modal-close-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Modal body */
    .modal-body {
      padding: 20px;
      overflow-y: auto;
    }

    .delete-summary {
      margin: 0 0 16px 0;
      font-size: 14px;
      color: #374151;
    }

    .delete-summary strong {
      color: #DC2626;
    }

    /* Message preview list */
    .message-preview-list {
      max-height: 200px;
      overflow-y: auto;
      border: 1px solid #E5E7EB;
      border-radius: 6px;
      margin-bottom: 16px;
    }

    .message-preview-item {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 10px 12px;
      border-bottom: 1px solid #F3F4F6;
      font-size: 13px;
    }

    .message-preview-item:last-child {
      border-bottom: none;
    }

    .message-preview-item i {
      flex-shrink: 0;
      width: 20px;
      text-align: center;
      margin-top: 2px;
    }

    .message-preview-item i.fa-user {
      color: #6366F1;
    }

    .message-preview-item i.fa-robot {
      color: #10B981;
    }

    .message-text {
      color: #6B7280;
      line-height: 1.4;
      word-break: break-word;
    }

    /* Artifacts warning section */
    .artifacts-warning {
      background: #FEF3C7;
      border: 1px solid #F59E0B;
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 16px;
    }

    .warning-header {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 500;
      color: #92400E;
      margin-bottom: 10px;
    }

    .warning-header i {
      color: #F59E0B;
    }

    .keep-artifacts-checkbox {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: #78350F;
      cursor: pointer;
      padding: 6px 8px;
      margin: -6px -8px;
      border-radius: 4px;
      transition: background 0.15s;
    }

    .keep-artifacts-checkbox:hover {
      background: rgba(245, 158, 11, 0.15);
    }

    .keep-artifacts-checkbox input[type="checkbox"] {
      cursor: pointer;
      width: 16px;
      height: 16px;
    }

    /* Warning message */
    .warning-message {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: #6B7280;
      padding: 10px 12px;
      background: #F9FAFB;
      border-radius: 4px;
    }

    .warning-message i {
      color: #9CA3AF;
    }

    /* Loading indicator */
    .loading-indicator {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 15px;
      padding: 12px;
      background: #f8f9fa;
      border-radius: 4px;
      color: #666;
    }

    /* Modal footer */
    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding: 16px 20px;
      border-top: 1px solid #E5E7EB;
      background: #F9FAFB;
      border-radius: 0 0 8px 8px;
    }

    /* Button styles */
    .btn {
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-secondary {
      background: white;
      border: 1px solid #D1D5DB;
      color: #374151;
    }

    .btn-secondary:hover:not(:disabled) {
      background: #F9FAFB;
      border-color: #9CA3AF;
    }

    .btn-danger {
      background: #DC2626;
      border: 1px solid #DC2626;
      color: white;
    }

    .btn-danger:hover:not(:disabled) {
      background: #B91C1C;
      border-color: #B91C1C;
    }
  `]
})
export class DeleteConfirmModalComponent {
  /** Whether the modal is visible */
  @Input() isVisible = false;

  /** Custom title for the dialog */
  @Input() title = 'Delete Messages';

  /** List of messages that will be deleted */
  @Input() messagesToDelete: ConversationDetailEntity[] = [];

  /** List of artifacts affected by the deletion */
  @Input() artifactsAffected: { artifactId: string; name: string }[] = [];

  /** Whether a delete operation is in progress */
  @Input() isDeleting = false;

  /** Emitted when user cancels the delete */
  @Output() cancelled = new EventEmitter<void>();

  /** Emitted when user confirms the delete */
  @Output() confirmed = new EventEmitter<{ keepArtifacts: boolean }>();

  /** Whether to keep artifacts when deleting messages */
  keepArtifacts = false;

  /** Computed dialog title */
  get dialogTitle(): string {
    return this.title;
  }

  /**
   * Get icon class for a message based on sender type
   */
  getMessageIcon(message: ConversationDetailEntity): string {
    // Check if message is from user (Role lowercase === 'user')
    const isUser = message.Role?.trim().toLowerCase() === 'user';
    return isUser ? 'fa-user' : 'fa-robot';
  }

  /**
   * Truncate message text for preview
   */
  truncateMessage(text: string | null): string {
    if (!text) return '(empty message)';
    const maxLength = 60;
    const cleaned = text.replace(/\n/g, ' ').trim();
    if (cleaned.length <= maxLength) {
      return `"${cleaned}"`;
    }
    return `"${cleaned.substring(0, maxLength)}..."`;
  }

  /**
   * Handle cancel button click
   */
  onCancel(): void {
    this.keepArtifacts = false;
    this.cancelled.emit();
  }

  /**
   * Handle confirm delete button click
   */
  onConfirm(): void {
    this.confirmed.emit({ keepArtifacts: this.keepArtifacts });
  }
}
