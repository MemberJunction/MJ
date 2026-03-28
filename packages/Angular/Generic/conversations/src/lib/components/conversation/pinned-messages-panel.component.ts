import { Component, Input, Output, EventEmitter } from '@angular/core';
import { MJConversationDetailEntity } from '@memberjunction/core-entities';

@Component({
  standalone: false,
  selector: 'mj-pinned-messages-panel',
  templateUrl: './pinned-messages-panel.component.html',
  styleUrls: ['./pinned-messages-panel.component.css']
})
export class PinnedMessagesPanelComponent {
  @Input() public pinnedMessages: MJConversationDetailEntity[] = [];

  @Output() public closed = new EventEmitter<void>();
  @Output() public jumpRequested = new EventEmitter<string>(); // emits messageId
  @Output() public unpinRequested = new EventEmitter<MJConversationDetailEntity>();

  /** IDs currently being removed (for fade-out animation) */
  public unpinningIds = new Set<string>();

  public Close(): void {
    this.closed.emit();
  }

  public OnJump(message: MJConversationDetailEntity): void {
    this.jumpRequested.emit(message.ID);
  }

  public OnUnpin(message: MJConversationDetailEntity): void {
    this.unpinningIds.add(message.ID);
    // Let the card animate out before the parent removes it from the list
    setTimeout(() => {
      this.unpinningIds.delete(message.ID);
      this.unpinRequested.emit(message);
    }, 200);
  }

  public IsUnpinning(message: MJConversationDetailEntity): boolean {
    return this.unpinningIds.has(message.ID);
  }

  /** Strip markdown to plain prose for card preview */
  public GetPreviewText(message: MJConversationDetailEntity): string {
    const raw = message.Message || '';
    const stripped = raw
      .replace(/```[\s\S]*?```/g, '[code]')   // fenced code blocks
      .replace(/`[^`]*`/g, '[code]')           // inline code
      .replace(/#{1,6}\s+/g, '')               // headings
      .replace(/\*\*(.+?)\*\*/g, '$1')         // bold
      .replace(/\*(.+?)\*/g, '$1')             // italic
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')  // images
      .replace(/>\s+/g, '')                    // blockquotes
      .replace(/\n+/g, ' ')                    // newlines → spaces
      .trim();
    return stripped.length > 200 ? stripped.substring(0, 197) + '…' : stripped;
  }

  /** Human-readable relative timestamp */
  public GetRelativeTime(message: MJConversationDetailEntity): string {
    const created = message.__mj_CreatedAt;
    if (!created) return '';
    const diffMs = Date.now() - new Date(created).getTime();
    const mins = Math.floor(diffMs / 60_000);
    const hours = Math.floor(diffMs / 3_600_000);
    const days = Math.floor(diffMs / 86_400_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return new Date(created).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  /** Display name for the message sender */
  public GetSenderName(message: MJConversationDetailEntity): string {
    if (message.Role === 'User') return 'You';
    return 'AI Response';
  }
}
