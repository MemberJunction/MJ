import {
  Component, EventEmitter, Input, Output, ElementRef, ViewChild, AfterViewChecked, OnInit, OnDestroy,
  ChangeDetectorRef, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { RealtimeSessionState, RealtimeThreadItem } from './realtime-session-state';
import { RealtimeDelegationCardComponent } from './realtime-delegation-card.component';
import { ParsedDelegationArtifact } from '../../services/delegation-result-parser';

/**
 * The unified, chronological live thread for the call overlay: caption bubbles
 * interleaved with delegation cards exactly where they happened.
 *
 * PURELY PRESENTATIONAL over {@link RealtimeSessionState} — the overlay shell owns the
 * state object (which merges the service streams once) and passes it here AND to the
 * activity rail, so there is exactly one copy of the per-CallID merge logic.
 *
 * Also renders the EPHEMERAL narration "live note": indented, muted, italic text under
 * the ACTIVE working card (latest narration only — replaced, never accumulated).
 */
@Component({
  standalone: true,
  selector: 'mj-realtime-session-thread',
  imports: [CommonModule, RealtimeDelegationCardComponent],
  templateUrl: './realtime-session-thread.component.html',
  styleUrl: './realtime-session-thread.component.css'
})
export class RealtimeSessionThreadComponent implements OnInit, AfterViewChecked, OnDestroy {
  @ViewChild('scrollAnchor') private scrollAnchor?: ElementRef<HTMLElement>;

  /** Display name of the agent (caption avatar / meta line). */
  @Input() AgentName = 'Sage';

  /** Shared live-session state, owned by the overlay shell. */
  @Input({ required: true }) State!: RealtimeSessionState;

  /** Whether to render caption bubbles (toggled by the controls' captions button). */
  @Input() ShowCaptions = true;

  /** Whether developer affordances on delegation cards are revealed (gear-gated). */
  @Input() DevMode = false;

  /** Re-emitted from a delegation card's dev "Open run" link (the delegated run's ID). */
  @Output() OpenRunRequested = new EventEmitter<string>();

  /** Re-emitted from a delegation card's "View" artifact chip (focuses the artifact's surface tab). */
  @Output() OpenArtifactRequested = new EventEmitter<ParsedDelegationArtifact>();

  /** Re-emitted from a WORKING delegation card's ✕ cancel affordance (the call's ID). */
  @Output() CancelRequested = new EventEmitter<string>();

  /** Item count at the last change notification, to auto-scroll only when the list grows. */
  private lastItemCount = 0;
  /** Drives auto-scroll: set whenever the list grows. */
  private pendingScroll = false;

  private changedSub?: Subscription;
  private cdr = inject(ChangeDetectorRef);

  ngOnInit(): void {
    this.changedSub = this.State.Changed$.subscribe(() => this.onStateChanged());
    this.lastItemCount = this.State.Items.length;
  }

  ngAfterViewChecked(): void {
    if (this.pendingScroll) {
      this.pendingScroll = false;
      this.scrollAnchor?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }

  ngOnDestroy(): void {
    this.changedSub?.unsubscribe();
  }

  /** track fn for the @for over thread items. */
  public TrackItem(index: number, item: RealtimeThreadItem): string {
    switch (item.Kind) {
      case 'delegation': return `d:${item.Card.CallID}`;
      case 'divider': return `s:${index}`;
      default: return `c:${index}`;
    }
  }

  /** True when the live narration note should render under THIS delegation item. */
  public ShowsLiveNote(item: RealtimeThreadItem): boolean {
    return item.Kind === 'delegation'
      && !item.Card.Done
      && this.State.Narration !== null
      && item.Card.CallID === this.State.ActiveCallId;
  }

  /** Marks for check on every state change; auto-scrolls when the thread grew. */
  private onStateChanged(): void {
    if (this.State.Items.length > this.lastItemCount) {
      this.pendingScroll = true;
    }
    this.lastItemCount = this.State.Items.length;
    this.cdr.markForCheck();
  }
}
