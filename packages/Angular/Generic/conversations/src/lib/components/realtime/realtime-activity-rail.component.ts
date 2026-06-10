import { Component, EventEmitter, Input, Output, OnInit, OnDestroy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import {
  RealtimeSessionState, RealtimeDelegationCardVM, FriendlyStepLabel, FormatElapsed
} from './realtime-session-state';
import { ParsedDelegationArtifact } from '../../services/delegation-result-parser';

/**
 * The "Session activity" RIGHT RAIL of the call overlay: a compact, newest-first list
 * of EVERY tool/agent call of the session — so parallel/multiple delegations live here
 * and the conversation thread stays clean.
 *
 * Each entry shows agent name, status (Running w/ spinner | Done | Failed), the latest
 * friendly step label, elapsed time for finished work, and a one-line result preview
 * for done items. Active items are emphasized; finished items are dimmed.
 *
 * Collapsible via the chevron in its header (collapses to a slim toggle strip).
 * Presentational over the same {@link RealtimeSessionState} the thread renders —
 * no subscriptions of its own beyond the state's change notifications.
 */
@Component({
  standalone: true,
  selector: 'mj-realtime-activity-rail',
  imports: [CommonModule],
  templateUrl: './realtime-activity-rail.component.html',
  styleUrl: './realtime-activity-rail.component.css'
})
export class RealtimeActivityRailComponent implements OnInit, OnDestroy {
  /** Maximum characters of the result preview in a done card. */
  private static readonly PreviewMaxChars = 90;

  /** Shared live-session state, owned by the overlay shell. */
  @Input({ required: true }) State!: RealtimeSessionState;

  /** Whether developer affordances ("Open run" links) are revealed (gear-gated). */
  @Input() DevMode = false;

  /**
   * EMBEDDED mode: the rail renders as the content of the surface panel's Activity tab —
   * its own header/collapse chrome is hidden (the panel's tab strip owns collapse) and it
   * stretches to the pane's full width. Default `false` keeps the original standalone
   * right-rail presentation for any other consumer.
   */
  @Input() Embedded = false;

  /** Emitted with the delegated run's ID when an entry's dev "Open run" link is clicked. */
  @Output() OpenRunRequested = new EventEmitter<string>();

  /** Emitted when an entry's "View" artifact chip is clicked (focuses the artifact's tab). */
  @Output() OpenArtifactRequested = new EventEmitter<ParsedDelegationArtifact>();

  /** Whether the rail is collapsed to its slim toggle strip. */
  public Collapsed = false;

  private changedSub?: Subscription;
  private cdr = inject(ChangeDetectorRef);

  ngOnInit(): void {
    this.changedSub = this.State.Changed$.subscribe(() => this.cdr.markForCheck());
  }

  ngOnDestroy(): void {
    this.changedSub?.unsubscribe();
  }

  /** Toggle the rail between expanded and slim-collapsed. */
  public Toggle(): void {
    this.Collapsed = !this.Collapsed;
  }

  /** track fn for the @for over cards. */
  public TrackCard(index: number, card: RealtimeDelegationCardVM): string {
    return card.CallID;
  }

  /** Friendly label of the card's latest step. */
  public StepLabel(card: RealtimeDelegationCardVM): string {
    return FriendlyStepLabel(card.LatestStep, card.LatestMessage);
  }

  /** Elapsed duration for finished work ("8s", "1m 04s"); null while running (kept cheap). */
  public Elapsed(card: RealtimeDelegationCardVM): string | null {
    if (card.FinishedAt == null) {
      return null;
    }
    return FormatElapsed(card.FinishedAt - card.StartedAt);
  }

  /** True when the dev "Open run" link should render for this card (gear on + run id known). */
  public ShowOpenRun(card: RealtimeDelegationCardVM): boolean {
    return this.DevMode && !!card.RunID;
  }

  /** Emits the open-run request for the card's delegated run. */
  public OpenRun(card: RealtimeDelegationCardVM): void {
    if (card.RunID) {
      this.OpenRunRequested.emit(card.RunID);
    }
  }

  /** The artifacts a done card carries (empty array when none — keeps the template simple). */
  public CardArtifacts(card: RealtimeDelegationCardVM): ParsedDelegationArtifact[] {
    return card.Done && card.Artifacts ? card.Artifacts : [];
  }

  /** Emits the open-artifact request for a card's produced artifact. */
  public OpenArtifact(artifact: ParsedDelegationArtifact): void {
    this.OpenArtifactRequested.emit(artifact);
  }

  /** One-line result preview for done items. */
  public Preview(card: RealtimeDelegationCardVM): string {
    const text = (card.Result || card.LatestMessage || '').replace(/\s+/g, ' ').trim();
    const max = RealtimeActivityRailComponent.PreviewMaxChars;
    return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
  }
}
