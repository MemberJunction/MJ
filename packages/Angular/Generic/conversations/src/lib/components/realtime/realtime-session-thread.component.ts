import {
  Component, Input, ElementRef, ViewChild, AfterViewChecked, OnDestroy, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import {
  VoiceSessionService, VoiceCaption, VoiceDelegationProgress, VoiceDelegationResult
} from '../../services/voice-session.service';
import {
  RealtimeDelegationCardComponent, RealtimeDelegationCardVM
} from './realtime-delegation-card.component';

/** A caption turn (user or assistant) in the unified thread. */
interface ThreadCaptionItem {
  Kind: 'caption';
  Role: 'User' | 'Assistant';
  Text: string;
}

/** A delegation card in the unified thread (working → done). */
interface ThreadDelegationItem {
  Kind: 'delegation';
  Card: RealtimeDelegationCardVM;
}

/** One entry in the chronological thread: either a caption bubble or a delegation card. */
export type RealtimeThreadItem = ThreadCaptionItem | ThreadDelegationItem;

/**
 * The unified, chronological live thread for the call overlay (mirrors `.call-thread`
 * in live-session.html + the interleaved delegation cards of delegation-flow.html).
 *
 * It merges TWO reactive streams from {@link VoiceSessionService} into one ordered list,
 * in arrival order — so a delegation card appears exactly where it happened relative to
 * the surrounding voice turns:
 *  - `Captions$` — the full user/assistant caption list (replaced wholesale on each turn).
 *  - `DelegationProgress$` — individual progress events, correlated by `CallID`. The first
 *    event for a `CallID` inserts a "working" card at the current tail; subsequent events
 *    for that same `CallID` update the existing card in place (latest step/message/percent).
 *
 * Because captions arrive as a growing array and delegation events arrive interleaved, we
 * track how many captions we've already placed and append only the new ones, preserving the
 * real chronological order against any delegation cards inserted between caption turns.
 *
 * Completion: the stream is progress-only (no terminal "done" event today). We mark a card
 * `Done` heuristically when an assistant caption arrives AFTER the card was created — i.e.
 * the co-agent has narrated the result back. See REPORT for the structured-result gap.
 */
@Component({
  standalone: true,
  selector: 'mj-realtime-session-thread',
  imports: [CommonModule, RealtimeDelegationCardComponent],
  templateUrl: './realtime-session-thread.component.html',
  styleUrl: './realtime-session-thread.component.css'
})
export class RealtimeSessionThreadComponent implements AfterViewChecked, OnDestroy {
  @ViewChild('scrollAnchor') private scrollAnchor?: ElementRef<HTMLElement>;

  /** Display name of the delegated agent (shown in delegation cards). Defaults to "Sage". */
  @Input() AgentName = 'Sage';

  /** The merged, ordered thread items rendered by the template. */
  public Items: RealtimeThreadItem[] = [];

  /** Whether to render caption bubbles (toggled by the controls' captions button). */
  private _showCaptions = true;
  @Input()
  set ShowCaptions(value: boolean) {
    this._showCaptions = value;
  }
  get ShowCaptions(): boolean {
    return this._showCaptions;
  }

  /** Number of captions already merged into {@link Items} (so we append only new ones). */
  private placedCaptionCount = 0;
  /** Live delegation cards by CallID, for in-place progress updates. */
  private cardsByCallId = new Map<string, ThreadDelegationItem>();
  /** Drives auto-scroll: set whenever the list grows. */
  private pendingScroll = false;

  private captionsSub?: Subscription;
  private delegationSub?: Subscription;
  private resultSub?: Subscription;

  private voice = inject(VoiceSessionService);

  constructor() {
    this.captionsSub = this.voice.Captions$.subscribe(captions => this.onCaptions(captions));
    this.delegationSub = this.voice.DelegationProgress$.subscribe(p => this.onDelegation(p));
    this.resultSub = this.voice.DelegationResult$.subscribe(r => this.onDelegationResult(r));
  }

  ngAfterViewChecked(): void {
    if (this.pendingScroll) {
      this.pendingScroll = false;
      this.scrollAnchor?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }

  ngOnDestroy(): void {
    this.captionsSub?.unsubscribe();
    this.delegationSub?.unsubscribe();
    this.resultSub?.unsubscribe();
  }

  /** track fn for the @for over thread items. */
  public TrackItem(index: number, item: RealtimeThreadItem): string {
    return item.Kind === 'delegation' ? `d:${item.Card.CallID}` : `c:${index}`;
  }

  /** Appends any newly-arrived captions, keeping their order relative to delegation cards. */
  private onCaptions(captions: VoiceCaption[]): void {
    if (captions.length <= this.placedCaptionCount) {
      // Captions can be cleared on a new session — reset our merge state.
      if (captions.length < this.placedCaptionCount) {
        this.resetMerge();
      }
      return;
    }
    for (let i = this.placedCaptionCount; i < captions.length; i++) {
      const c = captions[i];
      this.Items.push({ Kind: 'caption', Role: c.Role, Text: c.Text });
    }
    this.placedCaptionCount = captions.length;
    this.Items = [...this.Items];
    this.pendingScroll = true;
  }

  /** Inserts a new working card or updates an existing one in place. */
  private onDelegation(progress: VoiceDelegationProgress): void {
    const existing = this.cardsByCallId.get(progress.CallID);
    if (existing) {
      existing.Card.LatestStep = progress.Step;
      existing.Card.LatestMessage = progress.Message;
      existing.Card.Percentage = progress.Percentage;
      this.Items = [...this.Items];
      return;
    }
    const item: ThreadDelegationItem = {
      Kind: 'delegation',
      Card: {
        CallID: progress.CallID,
        AgentName: this.AgentName,
        LatestStep: progress.Step,
        LatestMessage: progress.Message,
        Percentage: progress.Percentage,
        Done: false,
        RunRef: this.shortRunRef(progress.CallID)
      }
    };
    this.cardsByCallId.set(progress.CallID, item);
    this.Items.push(item);
    this.Items = [...this.Items];
    this.pendingScroll = true;
  }

  /**
   * Marks any still-working cards done. Called when the assistant narrates a turn after
   * delegation — the only completion signal the progress-only stream gives us today.
   */
  /** Completes the working card for a finished delegation with its real result + provenance. */
  private onDelegationResult(result: VoiceDelegationResult): void {
    const item = this.cardsByCallId.get(result.CallID);
    if (!item) {
      return;
    }
    item.Card.Done = true;
    item.Card.Result = result.Output;
    this.Items = [...this.Items];
    this.pendingScroll = true;
  }

  /** Derives a short, stable run reference (e.g. "#a3f1") from the call id for the provenance badge. */
  private shortRunRef(callId: string): string {
    const compact = callId.replace(/[^a-z0-9]/gi, '');
    return compact.length >= 4 ? `#${compact.slice(-4).toLowerCase()}` : `#${compact.toLowerCase()}`;
  }

  /** Resets merge bookkeeping when a fresh session clears captions. */
  private resetMerge(): void {
    this.Items = [];
    this.placedCaptionCount = 0;
    this.cardsByCallId.clear();
  }
}
