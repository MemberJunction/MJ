import { Component, EventEmitter, Input, Output } from '@angular/core';
import { DatePipe } from '@angular/common';
import {
  SessionCardDurationLabel,
  SessionCardMessageCountLabel,
  SessionCardSpeakerLabel,
  SessionCardStartedAt,
  SessionCardStatusChip,
  SessionCardTitle,
  type RealtimeSessionStatusChip,
  type RealtimeSessionTimelineGroup,
  type RealtimeSessionTimelineMeta
} from '@memberjunction/conversations-runtime';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';

/**
 * The ONE timeline element a realtime (voice) session collapses to in the standard conversation
 * message list (see `BuildConversationTimeline`).
 *
 * It is laid out like a chat message rather than a banner. The call icon sits in the avatar column,
 * "Voice call with Sage" and the start time fill the header line, and a bubble carries the status,
 * how long the call ran, how much was said and the last thing said. That keeps the conversation's
 * margins and rhythm, where the old full-width card cut across them.
 *
 * **Review call** (or clicking the bubble) emits {@link OpenRequested} with the session id. The
 * message list bubbles it up so the chat area can host the existing SESSION REVIEW overlay via
 * `ConversationChatAreaComponent.OpenRealtimeSessionReview` (Resume / Close live inside that
 * overlay, unchanged).
 *
 * Rendered DYNAMICALLY by `MessageListComponent` (same `createComponent` path the message items
 * use) — standalone by design, no module declaration needed.
 */
@Component({
  standalone: true,
  selector: 'mj-realtime-session-timeline-card',
  imports: [DatePipe, MJButtonDirective],
  templateUrl: './realtime-session-timeline-card.component.html',
  styleUrl: './realtime-session-timeline-card.component.css'
})
export class RealtimeSessionTimelineCardComponent {
  /** The collapsed session block computed from the conversation's stamped detail rows. */
  @Input({ required: true }) Group!: RealtimeSessionTimelineGroup;

  /** Optional session-row enrichment (agent, user, status, start and close); null degrades gracefully. */
  @Input() Meta: RealtimeSessionTimelineMeta | null = null;

  /**
   * The signed-in user's id. With it, the quoted line says "You" on the viewer's own call and names
   * the caller on anyone else's, which matters in a conversation several people share.
   */
  @Input() CurrentUserID: string | null = null;

  /**
   * Label for a user's line when the host passes no `CurrentUserID`, and so the card can't tell
   * whose call it was. With `CurrentUserID` set it isn't used: the line says "You", the caller's
   * name, or "Caller" when the session row doesn't say whose call it was.
   */
  @Input() UserName = 'You';

  /** Emitted with the `MJ: AI Agent Sessions.ID` when the user asks to open the session review. */
  @Output() OpenRequested = new EventEmitter<string>();

  /*
   * Every label below comes from `@memberjunction/conversations-runtime`, because the React Native
   * thread renders the same card and must not re-decide what "Timed out" or "12 min" means. These
   * getters are the Angular binding surface over those helpers, nothing more.
   */

  /** "Voice call with <agent>" when the agent name is known, else "Voice call". */
  public get Title(): string {
    return SessionCardTitle(this.Meta);
  }

  /** When the call started, shown in the header the way a message shows its time. */
  public get StartedAt(): Date | null {
    return SessionCardStartedAt(this.Group, this.Meta);
  }

  /** The status label ("Live", "Ended", "Timed out", …), or null to hide the status entirely. */
  public get StatusChip(): string | null {
    return this.status?.Label ?? null;
  }

  /** What the status means, for styling; null when there is no status to show. */
  public get StatusTone(): RealtimeSessionStatusChip['Tone'] | null {
    return this.status?.Tone ?? null;
  }

  /** Whether the call ended in an error (drives the error styling). */
  public get IsErrorChip(): boolean {
    return this.StatusTone === 'error';
  }

  /** Whether the call is still live (drives the live styling). */
  public get IsLiveChip(): boolean {
    return this.StatusTone === 'live';
  }

  /** How long the call ran ("Under a minute", "12 min"), or null while live or unmeasurable. */
  public get DurationLabel(): string | null {
    return SessionCardDurationLabel(this.Group, this.Meta);
  }

  /** "No messages", "1 message", "12 messages". */
  public get MessageCountLabel(): string {
    return SessionCardMessageCountLabel(this.Group);
  }

  /** Who said the quoted line: the agent by name, "You", or another caller by name. */
  public get SpeakerLabel(): string {
    return SessionCardSpeakerLabel(this.Group?.LastTurnRole ?? null, this.Meta, this.CurrentUserID, this.UserName);
  }

  /** The button's label. A live call is still going, so it is viewed rather than reviewed. */
  public get ActionLabel(): string {
    return this.IsLiveChip ? 'View call' : 'Review call';
  }

  /** One sentence a screen reader announces for the whole row. */
  public get AccessibleSummary(): string {
    return [this.Title, this.StatusChip, this.DurationLabel, this.MessageCountLabel].filter(Boolean).join(', ');
  }

  /** Emits {@link OpenRequested} for a click on the bubble or its button. */
  public Open(event?: Event): void {
    event?.stopPropagation();
    const sessionId = this.Group?.SessionID;
    if (sessionId) {
      this.OpenRequested.emit(sessionId);
    }
  }

  private get status(): RealtimeSessionStatusChip | null {
    return SessionCardStatusChip(this.Meta);
  }
}
