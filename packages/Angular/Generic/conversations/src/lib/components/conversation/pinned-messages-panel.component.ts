import { Component, Input, Output, EventEmitter } from '@angular/core';
import { MJConversationDetailEntity } from '@memberjunction/core-entities';

@Component({
  standalone: false,
  selector: 'mj-pinned-messages-panel',
  templateUrl: './pinned-messages-panel.component.html',
  styleUrls: ['./pinned-messages-panel.component.css']
})
export class PinnedMessagesPanelComponent {
  /**
   * Readonly because the chat area hands over the window store's own pin array by reference —
   * a stable reference between real changes is what keeps this input from re-firing every
   * change detection cycle. The panel renders it; it never mutates it.
   */
  @Input() public PinnedMessages: readonly MJConversationDetailEntity[] = [];

  /** @deprecated Use {@link PinnedMessages}. */
  @Input() public set pinnedMessages(value: readonly MJConversationDetailEntity[]) {
    this.PinnedMessages = value;
  }
  /** @deprecated Use {@link PinnedMessages}. */
  public get pinnedMessages(): readonly MJConversationDetailEntity[] {
    return this.PinnedMessages;
  }

  /**
   * True during the panel's first open, while its rows are being fetched.
   *
   * Pins are no longer loaded during conversation open — the open path reads only a count —
   * so the panel can now render before its contents exist.
   */
  @Input() public IsLoading = false;

  /** @deprecated Use {@link IsLoading}. */
  @Input() public set isLoading(value: PinnedMessagesPanelComponent['IsLoading']) {
    this.IsLoading = value;
  }
  /** @deprecated Use {@link IsLoading}. */
  public get isLoading(): PinnedMessagesPanelComponent['IsLoading'] {
    return this.IsLoading;
  }

  @Output() public Closed = new EventEmitter<void>();

  /**
   * @deprecated Use {@link Closed}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (closed) keeps working. Must stay AFTER Closed: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() public closed = this.Closed;
  @Output() public JumpRequested = new EventEmitter<string>();

  /**
   * @deprecated Use {@link JumpRequested}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (jumpRequested) keeps working. Must stay AFTER JumpRequested: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() public jumpRequested = this.JumpRequested; // emits messageId
  @Output() public UnpinRequested = new EventEmitter<MJConversationDetailEntity>();

  /**
   * @deprecated Use {@link UnpinRequested}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (unpinRequested) keeps working. Must stay AFTER UnpinRequested: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() public unpinRequested = this.UnpinRequested;

  /** IDs currently being removed (for fade-out animation) */
  public UnpinningIds = new Set<string>();

  /** @deprecated Use {@link UnpinningIds}. */
  public get unpinningIds() {
    return this.UnpinningIds;
  }
  /** @deprecated Use {@link UnpinningIds}. */
  public set unpinningIds(value) {
    this.UnpinningIds = value;
  }

  public Close(): void {
    this.Closed.emit();
  }

  public OnJump(message: MJConversationDetailEntity): void {
    this.JumpRequested.emit(message.ID);
  }

  public OnUnpin(message: MJConversationDetailEntity): void {
    this.UnpinningIds.add(message.ID);
    // Let the card animate out before the parent removes it from the list
    setTimeout(() => {
      this.UnpinningIds.delete(message.ID);
      this.UnpinRequested.emit(message);
    }, 200);
  }

  public IsUnpinning(message: MJConversationDetailEntity): boolean {
    return this.UnpinningIds.has(message.ID);
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
