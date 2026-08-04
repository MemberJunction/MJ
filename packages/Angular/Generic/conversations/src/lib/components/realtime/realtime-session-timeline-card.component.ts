import { Component, EventEmitter, Input, Output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RealtimeSessionTimelineGroup, RealtimeSessionTimelineMeta } from '../../utils/realtime-session-timeline';

/**
 * The ONE timeline element a realtime session collapses to in the standard conversation
 * message list (see `BuildConversationTimeline`): a visually distinct card at the
 * session's chronological position carrying the session identity (broadcast icon +
 * "Realtime session · <agent>"), its time range, a status / close-reason chip when
 * known, the visible-turn count, and a one-line preview of the last turn.
 *
 * The card's **Open** button emits {@link OpenRequested} with the session id; the
 * message list bubbles it up so the chat area can host the existing SESSION REVIEW
 * overlay via `ConversationChatAreaComponent.OpenRealtimeSessionReview` (Resume /
 * Close live inside that overlay, unchanged).
 *
 * Rendered DYNAMICALLY by `MessageListComponent` (same `createComponent` path the
 * message items use) — standalone by design, no module declaration needed.
 */
@Component({
  standalone: true,
  selector: 'mj-realtime-session-timeline-card',
  imports: [DatePipe],
  templateUrl: './realtime-session-timeline-card.component.html',
  styleUrl: './realtime-session-timeline-card.component.css'
})
export class RealtimeSessionTimelineCardComponent {
  /** The collapsed session block computed from the conversation's stamped detail rows. */
  @Input({ required: true }) Group!: RealtimeSessionTimelineGroup;

  /** Optional session-row enrichment (agent name / status / close reason); null degrades gracefully. */
  @Input() Meta: RealtimeSessionTimelineMeta | null = null;

  /** Display name of the signed-in user for the last-turn preview (matches the chat's sender names). */
  @Input() UserName = 'You';

  /** Emitted with the `MJ: AI Agent Sessions.ID` when the user asks to open the session review. */
  @Output() OpenRequested = new EventEmitter<string>();

  /** Card title: "Realtime session · <agent>" when the agent name is known, else the generic label. */
  public get Title(): string {
    const agent = this.Meta?.AgentName?.trim();
    return agent ? `Realtime session · ${agent}` : 'Realtime session';
  }

  /** Whether the start and end fall on the same calendar day (drives the end-time format). */
  public get SameDayRange(): boolean {
    const start = this.Group?.StartedAt;
    const end = this.Group?.EndedAt;
    if (!start || !end) {
      return true;
    }
    return start.toDateString() === end.toDateString();
  }

  /**
   * The status chip label, or null to hide the chip entirely:
   *  - Closed sessions show the close reason (`Error` / `Explicit` / `Janitor` / `Shutdown`)
   *    humanized, falling back to "Closed" for legacy rows without one;
   *  - Active sessions show "Live"; Idle shows "Idle";
   *  - no meta (lookup unavailable) → no chip.
   */
  public get StatusChip(): string | null {
    switch (this.Meta?.Status) {
      case 'Closed':
        return this.closeReasonLabel();
      case 'Active':
        return 'Live';
      case 'Idle':
        return 'Idle';
      default:
        return null;
    }
  }

  /** Whether the chip represents an error close (drives the error chip styling). */
  public get IsErrorChip(): boolean {
    return this.Meta?.Status === 'Closed' && this.Meta?.CloseReason === 'Error';
  }

  /** Whether the chip represents a live session (drives the live chip styling). */
  public get IsLiveChip(): boolean {
    return this.Meta?.Status === 'Active';
  }

  /** Emits {@link OpenRequested} for the whole-card / Open-button click. */
  public Open(event?: MouseEvent): void {
    event?.stopPropagation();
    const sessionId = this.Group?.SessionID;
    if (sessionId) {
      this.OpenRequested.emit(sessionId);
    }
  }

  /** Human label for the session's close reason ("Closed" when the column is null/unknown). */
  private closeReasonLabel(): string {
    switch (this.Meta?.CloseReason) {
      case 'Explicit':
        return 'Ended';
      case 'Error':
        return 'Error';
      case 'Janitor':
        return 'Timed out';
      case 'Shutdown':
        return 'Server shutdown';
      default:
        return 'Closed';
    }
  }
}
