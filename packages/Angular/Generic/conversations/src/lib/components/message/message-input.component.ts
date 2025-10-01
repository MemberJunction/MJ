import { Component, Input, Output, EventEmitter, ViewChild, ElementRef } from '@angular/core';
import { UserInfo, Metadata } from '@memberjunction/core';
import { ConversationDetailEntity } from '@memberjunction/core-entities';
import { DialogService } from '../../services/dialog.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'mj-message-input',
  template: `
    <div class="message-input-container">
      <textarea
        #messageTextarea
        class="message-input"
        [(ngModel)]="messageText"
        [placeholder]="placeholder"
        [disabled]="disabled || isSending"
        (keydown.control.enter)="onSend()"
        (keydown.meta.enter)="onSend()"
        rows="3">
      </textarea>
      <div class="input-actions">
        <button
          class="btn-attach"
          [disabled]="disabled"
          title="Attach file (coming soon)">
          <i class="fas fa-paperclip"></i>
        </button>
        <button
          class="btn-send"
          [disabled]="!canSend"
          (click)="onSend()">
          <i class="fas fa-paper-plane"></i>
          <span>{{ isSending ? 'Sending...' : 'Send' }}</span>
        </button>
      </div>
    </div>
  `,
  styles: [`
    .message-input-container {
      padding: 16px 24px;
      border-top: 1px solid #D9D9D9;
      background: #FFF;
    }
    .message-input {
      width: 100%;
      padding: 12px;
      border: 1px solid #D9D9D9;
      border-radius: 6px;
      resize: vertical;
      font-family: inherit;
      font-size: 14px;
      min-height: 80px;
    }
    .message-input:focus {
      outline: none;
      border-color: #0076B6;
      box-shadow: 0 0 0 2px rgba(0, 118, 182, 0.1);
    }
    .message-input:disabled {
      background: #F4F4F4;
      cursor: not-allowed;
    }
    .input-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 12px;
    }
    .btn-attach {
      padding: 8px 16px;
      background: transparent;
      border: 1px solid #D9D9D9;
      border-radius: 6px;
      cursor: pointer;
      color: #333;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .btn-attach:hover:not(:disabled) {
      background: #F4F4F4;
      border-color: #AAA;
    }
    .btn-attach:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .btn-send {
      padding: 10px 24px;
      background: #0076B6;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      transition: background 150ms ease;
    }
    .btn-send:hover:not(:disabled) {
      background: #005A8C;
    }
    .btn-send:disabled {
      background: #D9D9D9;
      cursor: not-allowed;
    }
  `]
})
export class MessageInputComponent {
  @Input() conversationId!: string;
  @Input() currentUser!: UserInfo;
  @Input() disabled: boolean = false;
  @Input() placeholder: string = 'Type a message... (Ctrl+Enter to send)';
  @Input() parentMessageId?: string; // Optional: for replying in threads

  @Output() messageSent = new EventEmitter<ConversationDetailEntity>();

  @ViewChild('messageTextarea') messageTextarea!: ElementRef;

  public messageText: string = '';
  public isSending: boolean = false;

  constructor(
    private dialogService: DialogService,
    private toastService: ToastService
  ) {}

  get canSend(): boolean {
    return !this.disabled && !this.isSending && this.messageText.trim().length > 0;
  }

  async onSend(): Promise<void> {
    if (!this.canSend) return;

    this.isSending = true;
    try {
      const md = new Metadata();
      const detail = await md.GetEntityObject<ConversationDetailEntity>('Conversation Details', this.currentUser);

      detail.ConversationID = this.conversationId;
      detail.Message = this.messageText.trim();
      detail.Role = 'User';

      // Set ParentID if this is a thread reply
      if (this.parentMessageId) {
        detail.ParentID = this.parentMessageId;
      }

      const saved = await detail.Save();
      if (saved) {
        this.messageSent.emit(detail);
        this.messageText = '';

        // Focus back on textarea
        setTimeout(() => {
          if (this.messageTextarea && this.messageTextarea.nativeElement) {
            this.messageTextarea.nativeElement.focus();
          }
        }, 100);
      } else {
        console.error('Failed to send message:', detail.LatestResult?.Message);
        this.toastService.error('Failed to send message. Please try again.');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      this.toastService.error('Error sending message. Please try again.');
    } finally {
      this.isSending = false;
    }
  }
}